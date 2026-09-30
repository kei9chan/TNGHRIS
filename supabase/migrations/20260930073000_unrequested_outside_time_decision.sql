-- A manager can attest that the published shift stands. Verified punches stay
-- in the record, but unrequested outside-shift time is not payable OT.
set local lock_timeout='5s';
set local statement_timeout='30s';
alter table private.payroll_shift_variance_reviews add column decision_kind text not null default 'moved' check(decision_kind in('moved','original'));

create function public.submit_payroll_original_shift(p_scope uuid,p_employee uuid,p_date date,p_fingerprint text,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare context jsonb;shift jsonb;manager uuid;actor uuid:=public.current_hris_user_id();new_id uuid;begin
 if auth.uid() is null or actor is null or not private.actual_attendance_access(p_scope) then raise exception 'Scoped payroll attendance access required.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('shift-variance:'||p_employee||':'||p_date,0));
 context:=public.get_payroll_shift_variance(p_scope,p_employee,p_date);shift:=context->'shift';
 if context->>'fingerprint' is distinct from p_fingerprint then raise exception 'The roster or punches changed. Refresh the date.';end if;
 if (context->>'locked')::boolean then raise exception 'Payroll is locked; use an authorized correction.';end if;
 if shift is null or shift='null'::jsonb or shift->>'publicationId' is null or shift->>'start' is null or shift->>'end' is null then raise exception 'Publish the roster for this date first.';end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'Explain why the original shift should stand.';end if;
 manager:=private.resolve_direct_manager_id(p_employee);
 if manager is null or manager in(actor,p_employee) then raise exception 'An independent direct manager must decide.' using errcode='42501';end if;
 if exists(select 1 from private.payroll_shift_variance_reviews where scope_id=p_scope and employee_id=p_employee and work_date=p_date and status='pending') then raise exception 'A shift decision is already pending on this date.';end if;
 insert into private.payroll_shift_variance_reviews(scope_id,employee_id,work_date,original_shift,source_fingerprint,proposed_start,proposed_end,reason,manager_id,submitted_by,status,decision_kind)
 values(p_scope,p_employee,p_date,shift,p_fingerprint,(shift->>'start')::time,(shift->>'end')::time,btrim(p_reason),manager,actor,'pending','original') returning id into new_id;
 return new_id;
end $$;
revoke all on function public.submit_payroll_original_shift(uuid,uuid,date,text,text) from public,anon;
grant execute on function public.submit_payroll_original_shift(uuid,uuid,date,text,text) to authenticated;

-- The existing source wrapper applies moved-shift approvals. This wrapper
-- carries original-shift decisions into readiness and gross reconciliation.
alter function private.payroll_time_sources(uuid,date,date) rename to payroll_time_sources_before_original_decision;
create function private.payroll_time_sources(p_scope uuid,p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare src jsonb;raw jsonb;approved jsonb;begin
 src:=private.payroll_time_sources_before_original_decision(p_scope,p_from,p_to);
 raw:=private.payroll_time_sources_before_shift_variance(p_scope,p_from,p_to);
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'employeeId',r.employee_id,'date',r.work_date,'managerId',r.decided_by,'at',r.decided_at) order by r.work_date,r.employee_id),'[]') into approved
 from private.payroll_shift_variance_reviews r where r.scope_id=p_scope and r.work_date between p_from and p_to and r.status='approved' and r.decision_kind='original'
 and r.source_fingerprint=private.payroll_shift_variance_fingerprint(raw,r.employee_id,r.work_date)
 and not exists(select 1 from public.payroll_schedule_freezes f where f.employee_id=r.employee_id and r.work_date between f.date_from and f.date_to);
 return src||jsonb_build_object('approvedOriginalShifts',approved);
end $$;
revoke all on function private.payroll_time_sources(uuid,date,date),private.payroll_time_sources_before_original_decision(uuid,date,date) from public,anon,authenticated;

alter function private.interpret_payroll_time(jsonb,date,date) rename to interpret_payroll_time_before_original_decision;
create function private.interpret_payroll_time(p_source jsonb,p_from date,p_to date) returns jsonb
language plpgsql immutable set search_path='' as $$
declare result jsonb;rows jsonb:='[]';r jsonb;issues jsonb;begin
 result:=private.interpret_payroll_time_before_original_decision(p_source,p_from,p_to);
 for r in select value from jsonb_array_elements(result->'rows') loop
  if exists(select 1 from jsonb_array_elements(coalesce(p_source->'approvedOriginalShifts','[]')) x where x->>'employeeId'=r->>'employeeId' and x->>'date'=r->>'date') then
   select coalesce(jsonb_agg(i),'[]') into issues from jsonb_array_elements(r->'issues') i where i#>>'{}'<>'Worked time outside the reviewed schedule / OT needs reconciliation';
   r:=r||jsonb_build_object('issues',issues,'ready',jsonb_array_length(issues)=0,'originalShiftReviewed',true);
  end if;
  rows:=rows||jsonb_build_array(r);
 end loop;
 return result||jsonb_build_object('rows',rows,'blockedDays',(select count(*) from jsonb_array_elements(rows) x where not(x->>'ready')::boolean));
end $$;
revoke all on function private.interpret_payroll_time(jsonb,date,date),private.interpret_payroll_time_before_original_decision(jsonb,date,date) from public,anon,authenticated;

-- Gross reconciliation ignores only the outside-schedule portion of a day
-- explicitly confirmed by its direct manager. Original punches stay visible.
do $$declare ddl text;needle text:=$old$else raise exception 'Worked interval has no reviewed schedule or OT.';end if;$old$;begin
 ddl:=pg_get_functiondef('private.payroll_gross_intervals_before_manual_ot(jsonb,jsonb,jsonb)'::regprocedure);
 if strpos(ddl,needle)=0 then raise exception 'Gross interval reconciliation changed. Review original-shift integration.';end if;
 ddl:=replace(ddl,needle,$new$elsif coalesce((r->>'originalShiftReviewed')::boolean,false) then continue;
 else raise exception 'Worked interval has no reviewed schedule or OT.';end if;$new$);
 execute ddl;
end $$;
