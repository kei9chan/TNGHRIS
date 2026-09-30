-- A retrospective shift move is confirmed by the employee's direct manager.
-- Keep the published roster and imported punches as original evidence.
set local lock_timeout='5s';
set local statement_timeout='30s';
create table private.payroll_shift_variance_reviews(
 id uuid primary key default gen_random_uuid(),scope_id uuid not null references public.payroll_access_scopes(id),
 employee_id uuid not null references public.hris_users(id),work_date date not null,
 original_shift jsonb not null,source_fingerprint text not null,
 proposed_start time not null,proposed_end time not null,reason text not null,
 manager_id uuid not null references public.hris_users(id),submitted_by uuid not null references public.hris_users(id),submitted_at timestamptz not null default now(),
 status text not null check(status in('pending','approved','returned','rejected')),
 decided_by uuid references public.hris_users(id),decided_at timestamptz,decision_note text
);
create index payroll_shift_variance_lookup on private.payroll_shift_variance_reviews(scope_id,employee_id,work_date,status);
alter table private.payroll_shift_variance_reviews enable row level security;
revoke all on private.payroll_shift_variance_reviews from public,anon,authenticated;

create function private.payroll_shift_variance_fingerprint(p_src jsonb,p_employee uuid,p_date date) returns text
language sql immutable set search_path='' as $$
 select md5(jsonb_build_object('shifts',(select coalesce(jsonb_agg(x order by x->>'id'),'[]') from jsonb_array_elements(coalesce(p_src->'shifts','[]')) x where x->>'employeeId'=p_employee::text and x->>'date'=p_date::text),
 'events',(select coalesce(jsonb_agg(x order by x->>'timestamp',x->>'id'),'[]') from jsonb_array_elements(coalesce(p_src->'events','[]')) x where x->>'employeeId'=p_employee::text and x->>'importWorkDate'=p_date::text))::text)
$$;
revoke all on function private.payroll_shift_variance_fingerprint(jsonb,uuid,date) from public,anon,authenticated;

alter function private.payroll_time_sources(uuid,date,date) rename to payroll_time_sources_before_shift_variance;
create function private.payroll_time_sources(p_scope uuid,p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare src jsonb;adjusted jsonb;begin
 src:=private.payroll_time_sources_before_shift_variance(p_scope,p_from,p_to);
 select coalesce(jsonb_agg(case when v.id is null then x else x||jsonb_build_object('originalStart',x->'start','originalEnd',x->'end','start',to_char(v.proposed_start,'HH24:MI:SS'),'end',to_char(v.proposed_end,'HH24:MI:SS'),'varianceReviewId',v.id,'varianceApprovedBy',v.decided_by,'varianceApprovedAt',v.decided_at) end order by ord),'[]') into adjusted
 from jsonb_array_elements(coalesce(src->'shifts','[]')) with ordinality s(x,ord)
 left join lateral (
  select r.* from private.payroll_shift_variance_reviews r
  where r.scope_id=p_scope and r.employee_id=(x->>'employeeId')::uuid and r.work_date=(x->>'date')::date and r.status='approved'
   and r.original_shift->>'id'=x->>'id' and r.source_fingerprint=private.payroll_shift_variance_fingerprint(src,r.employee_id,r.work_date)
   and not exists(select 1 from public.payroll_schedule_freezes f where f.employee_id=r.employee_id and r.work_date between f.date_from and f.date_to)
  order by r.decided_at desc,r.id desc limit 1
 ) v on true;
 return src||jsonb_build_object('shifts',adjusted);
end $$;
revoke all on function private.payroll_time_sources(uuid,date,date),private.payroll_time_sources_before_shift_variance(uuid,date,date) from public,anon,authenticated;

create function public.get_payroll_shift_variance(p_scope uuid,p_employee uuid,p_date date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare src jsonb;shift jsonb;fingerprint text;actor uuid:=public.current_hris_user_id();manager uuid;reviews jsonb;begin
 if auth.uid() is null or p_date is null or (not private.actual_attendance_access(p_scope) and not private.is_direct_reporting_manager(actor,p_employee)) then raise exception 'Scoped payroll attendance access or direct-manager assignment required.' using errcode='42501';end if;
 if not exists(select 1 from public.hris_users u join public.payroll_access_scopes s on s.id=p_scope where u.id=p_employee and u.business_unit_id=s.business_unit_id) then raise exception 'Employee is outside this business unit.' using errcode='42501';end if;
 src:=private.payroll_time_sources_before_shift_variance(p_scope,p_date,p_date);
 select x into shift from jsonb_array_elements(coalesce(src->'shifts','[]')) x where x->>'employeeId'=p_employee::text and x->>'date'=p_date::text and coalesce(x->>'kind','work')='work' and x->>'start' is not null limit 1;
 fingerprint:=private.payroll_shift_variance_fingerprint(src,p_employee,p_date);manager:=private.resolve_direct_manager_id(p_employee);
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'status',r.status,'start',r.proposed_start,'end',r.proposed_end,'reason',r.reason,'manager',(select full_name from public.hris_users where id=r.manager_id),'submittedAt',r.submitted_at,'decidedAt',r.decided_at,'stale',r.source_fingerprint<>fingerprint,'canDecide',r.status='pending' and r.manager_id=actor and r.submitted_by<>actor) order by r.submitted_at desc),'[]') into reviews from private.payroll_shift_variance_reviews r where r.scope_id=p_scope and r.employee_id=p_employee and r.work_date=p_date;
 return jsonb_build_object('shift',shift,'manager',(select full_name from public.hris_users where id=manager),'fingerprint',fingerprint,'reviews',reviews,'locked',exists(select 1 from public.payroll_schedule_freezes f where f.employee_id=p_employee and p_date between f.date_from and f.date_to));
end $$;

create function public.submit_payroll_shift_variance(p_scope uuid,p_employee uuid,p_date date,p_fingerprint text,p_start time,p_end time,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare context jsonb;shift jsonb;manager uuid;actor uuid:=public.current_hris_user_id();prior uuid;new_id uuid;begin
 if auth.uid() is null or actor is null or not private.actual_attendance_access(p_scope) then raise exception 'Scoped payroll attendance access required.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('shift-variance:'||p_employee||':'||p_date,0));
 context:=public.get_payroll_shift_variance(p_scope,p_employee,p_date);shift:=context->'shift';
 if context->>'fingerprint' is distinct from p_fingerprint then raise exception 'The published shift or imported attendance changed. Refresh and review it again.';end if;
 if (context->>'locked')::boolean then raise exception 'Payroll is locked; use the authorized correction path.';end if;
 if shift is null or shift='null'::jsonb or shift->>'publicationId' is null or shift->>'endDayOffset' is not null and (shift->>'endDayOffset')::integer<>0 then raise exception 'This date needs a published single-day work shift. Resolve complex or overnight shifts in Schedule Builder.';end if;
 if p_start is null or p_end is null or p_end<=p_start or (p_end-p_start)<>(shift->>'end')::time-(shift->>'start')::time then raise exception 'Enter a moved shift with the same scheduled duration. A longer shift is not automatically overtime.';end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'Explain who changed this shift and why.';end if;
 manager:=private.resolve_direct_manager_id(p_employee);
 if manager is null or manager in(actor,p_employee) then raise exception 'An independent direct manager must confirm this shift. Fix the reporting line or use an authorized reviewer.' using errcode='42501';end if;
 select id into prior from private.payroll_shift_variance_reviews where scope_id=p_scope and employee_id=p_employee and work_date=p_date and status='pending' order by submitted_at desc limit 1;
 if prior is not null then raise exception 'This shift change is already waiting for manager review.';end if;
 insert into private.payroll_shift_variance_reviews(scope_id,employee_id,work_date,original_shift,source_fingerprint,proposed_start,proposed_end,reason,manager_id,submitted_by,status)
 values(p_scope,p_employee,p_date,shift,p_fingerprint,p_start,p_end,btrim(p_reason),manager,actor,'pending') returning id into new_id;
 return new_id;
end $$;

create function public.decide_payroll_shift_variance(p_id uuid,p_approve boolean,p_note text default null) returns void
language plpgsql security definer set search_path='' as $$
declare r private.payroll_shift_variance_reviews;src jsonb;actor uuid:=public.current_hris_user_id();begin
 if auth.uid() is null or p_approve is null then raise exception 'Sign in and select a decision.' using errcode='42501';end if;
 select * into r from private.payroll_shift_variance_reviews where id=p_id for update;
 if r.id is null or r.status<>'pending' or r.manager_id<>actor or r.submitted_by=actor or r.employee_id=actor or not private.is_direct_reporting_manager(actor,r.employee_id) then raise exception 'This review is not assigned to the current direct manager.' using errcode='42501';end if;
 if not p_approve and nullif(btrim(p_note),'') is null then raise exception 'A specific return reason is required.';end if;
 if exists(select 1 from public.payroll_schedule_freezes f where f.employee_id=r.employee_id and r.work_date between f.date_from and f.date_to) then raise exception 'Payroll is locked; use the authorized correction path.';end if;
 src:=private.payroll_time_sources_before_shift_variance(r.scope_id,r.work_date,r.work_date);
 if r.source_fingerprint<>private.payroll_shift_variance_fingerprint(src,r.employee_id,r.work_date) then raise exception 'The roster or punches changed. Submit a fresh review.';end if;
 update private.payroll_shift_variance_reviews set status=case when p_approve then 'approved' else 'returned' end,decided_by=actor,decided_at=now(),decision_note=nullif(btrim(p_note),'') where id=p_id;
end $$;
revoke all on function public.get_payroll_shift_variance(uuid,uuid,date),public.submit_payroll_shift_variance(uuid,uuid,date,text,time,time,text),public.decide_payroll_shift_variance(uuid,boolean,text) from public,anon;
grant execute on function public.get_payroll_shift_variance(uuid,uuid,date),public.submit_payroll_shift_variance(uuid,uuid,date,text,time,time,text),public.decide_payroll_shift_variance(uuid,boolean,text) to authenticated;
