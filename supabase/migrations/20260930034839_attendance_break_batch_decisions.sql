-- Accept verified recorded break durations without inventing punches or granting OT.
set local lock_timeout='5s';
set local statement_timeout='30s';
create table private.payroll_break_reviews(
 id uuid primary key default gen_random_uuid(),scope_id uuid not null references public.payroll_access_scopes(id),
 date_from date not null,date_to date not null,source_hash text not null,items jsonb not null,
 status text not null check(status in('pending_hr_manager','pending_bod','approved','returned','rejected')),
 submitted_by uuid not null,submitted_at timestamptz not null default now(),
 hr_by uuid,hr_at timestamptz,bod_by uuid,bod_at timestamptz,note text,
 check(jsonb_array_length(items)>0)
);
create index payroll_break_review_scope on private.payroll_break_reviews(scope_id,date_from,date_to);
alter table private.payroll_break_reviews enable row level security;
revoke all on private.payroll_break_reviews from public,anon,authenticated;
create table private.payroll_break_review_audit(id uuid primary key default gen_random_uuid(),review_id uuid not null references private.payroll_break_reviews(id),actor uuid not null,action text not null,note text,at timestamptz not null default clock_timestamp());
alter table private.payroll_break_review_audit enable row level security;
revoke all on private.payroll_break_review_audit from public,anon,authenticated;

alter function private.payroll_time_sources(uuid,date,date) rename to payroll_time_sources_before_break_review;
alter function private.interpret_payroll_time(jsonb,date,date) rename to interpret_payroll_time_before_break_review;
create function private.payroll_time_sources(p_scope uuid,p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare src jsonb;reviews jsonb;
begin
 src:=private.payroll_time_sources_before_break_review(p_scope,p_from,p_to);
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'items',items,'approvedBy',bod_by,'approvedAt',bod_at) order by id),'[]') into reviews
 from private.payroll_break_reviews where scope_id=p_scope and date_from=p_from and date_to=p_to and status='approved' and source_hash=md5(src::text);
 return src||jsonb_build_object('approvedRecordedBreaks',reviews);
end $$;
create function private.interpret_payroll_time(p_source jsonb,p_from date,p_to date) returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb;rows jsonb:='[]';r jsonb;issues jsonb;
begin
 result:=private.interpret_payroll_time_before_break_review(p_source,p_from,p_to);
 for r in select value from jsonb_array_elements(result->'rows') loop
  if exists(select 1 from jsonb_array_elements(coalesce(p_source->'approvedRecordedBreaks','[]')) b cross join lateral jsonb_array_elements(b->'items') i where i->>'employeeId'=r->>'employeeId' and i->>'date'=r->>'date' and i->'breakMinutes'=r->'breakMinutes') then
   select coalesce(jsonb_agg(x),'[]') into issues from jsonb_array_elements(r->'issues') x where x#>>'{}'<>'One unpaid movable lunch hour needs logs or direct-manager approved worked-lunch OT';
   r:=r||jsonb_build_object('issues',issues,'ready',jsonb_array_length(issues)=0,'recordedBreakAccepted',true);
  end if;
  rows:=rows||jsonb_build_array(r);
 end loop;
 return result||jsonb_build_object('rows',rows,'blockedDays',(select count(*) from jsonb_array_elements(rows) x where not(x->>'ready')::boolean));
end $$;

create function private.payroll_break_candidates(src jsonb,p_from date,p_to date) returns jsonb language plpgsql immutable set search_path='' as $$
declare r jsonb;items jsonb:='[]';events jsonb;blocked text;
begin
 for r in select value from jsonb_array_elements(private.interpret_payroll_time(src,p_from,p_to)->'rows') loop
  if not (r->'issues' ? 'One unpaid movable lunch hour needs logs or direct-manager approved worked-lunch OT') then continue;end if;
  select coalesce(jsonb_agg(e order by e->>'timestamp',e->>'id'),'[]') into events from jsonb_array_elements(coalesce(src->'events','[]')) e where e->>'employeeId'=r->>'employeeId' and e->>'importWorkDate'=r->>'date';
  blocked:=null;
  if jsonb_array_length(events)<>4 or not exists(select 1 from jsonb_array_elements(events)e where e->>'type'='START_BREAK') or not exists(select 1 from jsonb_array_elements(events)e where e->>'type'='END_BREAK') then blocked:='Upload or correct verified break start and end times first.';
  elsif (r->>'breakMinutes')::numeric<=0 then blocked:='No verified break duration. Worked-break OT needs its separate approval.';
  elsif exists(select 1 from jsonb_array_elements_text(r->'issues') x where x~*'missing.*punch|punch.*missing|unpaired|out.of.order|overlap|duplicate.*clock') then blocked:='Correct incomplete or conflicting punches first.';end if;
  items:=items||jsonb_build_array(jsonb_build_object('employeeId',r->'employeeId','employeeName',r->'employeeName','date',r->'date','breakMinutes',r->'breakMinutes','scheduledMinutes',r->'scheduledMinutes','actualMinutes',r->'actualMinutes','regularMinutes',r->'regularMinutes','approvedOtMinutes',r->'approvedOtMinutes','before','Break duration awaiting review','after','Accept recorded unpaid break duration','events',events,'remainingIssues',(select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(r->'issues') x where x#>>'{}'<>'One unpaid movable lunch hour needs logs or direct-manager approved worked-lunch OT'),'blocked',blocked));
 end loop;
 return items;
end $$;

create function public.get_payroll_break_review(p_scope uuid,p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare src jsonb;hash text;items jsonb;reviews jsonb;
begin
 if auth.uid() is null or not private.actual_attendance_access(p_scope) then raise exception 'Scoped attendance access required.' using errcode='42501';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>62 then raise exception 'Select a valid payroll cutoff.';end if;
 src:=private.payroll_time_sources(p_scope,p_from,p_to);hash:=md5((src-'approvedRecordedBreaks')::text);
 items:=private.payroll_break_candidates(src,p_from,p_to);
 select coalesce(jsonb_agg(to_jsonb(b)||jsonb_build_object('submitter',(select full_name from public.hris_users where auth_user_id=b.submitted_by limit 1),'hrName',(select full_name from public.hris_users where auth_user_id=b.hr_by limit 1),'bodName',(select full_name from public.hris_users where auth_user_id=b.bod_by limit 1),'stale',b.source_hash<>hash,'canAct',b.submitted_by<>auth.uid() and b.hr_by is distinct from auth.uid() and ((b.status='pending_hr_manager' and public.has_active_role('HR Manager')) or (b.status='pending_bod' and public.has_active_role('Board of Director')))) order by b.submitted_at desc),'[]') into reviews from private.payroll_break_reviews b where scope_id=p_scope and date_from=p_from and date_to=p_to;
 return jsonb_build_object('sourceHash',hash,'items',(select coalesce(jsonb_agg(i||jsonb_build_object('blocked',coalesce(i->>'blocked',case when exists(select 1 from public.payroll_schedule_freezes f where f.employee_id=(i->>'employeeId')::uuid and (i->>'date')::date between f.date_from and f.date_to) then 'Locked payroll: use the authorized correction path.' end,case when exists(select 1 from private.payroll_break_reviews b cross join lateral jsonb_array_elements(b.items) x where b.scope_id=p_scope and b.date_from=p_from and b.date_to=p_to and b.status in('pending_hr_manager','pending_bod') and x->>'employeeId'=i->>'employeeId' and x->>'date'=i->>'date') then 'Already submitted for approval.' end))),'[]') from jsonb_array_elements(items)i),'reviews',reviews,'route',case when public.has_active_role('HR Manager') and not public.has_active_role('Board of Director') then 'One independent BOD' else 'HR Manager → one independent BOD' end);
end $$;

create function public.submit_payroll_break_review(p_scope uuid,p_from date,p_to date,p_hash text,p_items jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare workspace jsonb;selected jsonb;id uuid;existing uuid;
begin
 if auth.uid() is null or not private.actual_attendance_access(p_scope) then raise exception 'Scoped attendance access required.' using errcode='42501';end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>1000 then raise exception 'Select eligible employee dates.';end if;
 perform pg_advisory_xact_lock(hashtextextended('break-review:'||p_scope::text,0));
 select b.id into existing from private.payroll_break_reviews b where b.scope_id=p_scope and b.date_from=p_from and b.date_to=p_to and b.source_hash=p_hash and b.submitted_by=auth.uid() and b.status in('pending_hr_manager','pending_bod','approved') and (select jsonb_agg(jsonb_build_object('employeeId',x->>'employeeId','date',x->>'date') order by x->>'employeeId',x->>'date') from jsonb_array_elements(b.items)x)=(select jsonb_agg(x order by x->>'employeeId',x->>'date') from jsonb_array_elements(p_items)x) limit 1;
 if existing is not null then return existing;end if;
 workspace:=public.get_payroll_break_review(p_scope,p_from,p_to);
 if workspace->>'sourceHash' is distinct from p_hash then raise exception 'Attendance changed. Refresh and check the proposed dates again.';end if;
 if (select count(distinct (x->>'employeeId',x->>'date')) from jsonb_array_elements(p_items)x)<>jsonb_array_length(p_items) then raise exception 'Duplicate selected dates.';end if;
 select coalesce(jsonb_agg(i order by i->>'employeeId',i->>'date'),'[]') into selected from jsonb_array_elements(workspace->'items') i where exists(select 1 from jsonb_array_elements(p_items)x where x->>'employeeId'=i->>'employeeId' and x->>'date'=i->>'date');
 if jsonb_array_length(selected)<>jsonb_array_length(p_items) then raise exception 'A selected date is no longer eligible. No dates were submitted.';end if;
 if exists(select 1 from jsonb_array_elements(selected)i where i->>'blocked' is not null) then raise exception 'A selected date is blocked. No dates were submitted.';end if;
 insert into private.payroll_break_reviews(scope_id,date_from,date_to,source_hash,items,status,submitted_by) values(p_scope,p_from,p_to,p_hash,selected,case when public.has_active_role('HR Manager') and not public.has_active_role('Board of Director') then 'pending_bod' else 'pending_hr_manager' end,auth.uid()) returning payroll_break_reviews.id into id;
 insert into private.payroll_break_review_audit(review_id,actor,action) values(id,auth.uid(),'submitted');return id;
end $$;

create function public.decide_payroll_break_review(p_id uuid,p_action text,p_note text default '') returns text language plpgsql security definer set search_path='' as $$
declare b private.payroll_break_reviews;next_status text;current_hash text;
begin
 select * into b from private.payroll_break_reviews where id=p_id for update;
 if auth.uid() is null or b.id is null or not private.actual_attendance_access(b.scope_id) then raise exception 'Scoped attendance approval access required.' using errcode='42501';end if;
 if b.submitted_by=auth.uid() or b.hr_by=auth.uid() then raise exception 'An independent reviewer is required. You cannot approve your own submission or both stages.' using errcode='42501';end if;
 if b.status='approved' and b.bod_by=auth.uid() and p_action='approve' then return b.status;end if;
 if b.status not in('pending_hr_manager','pending_bod') or p_action not in('approve','return','reject') then raise exception 'This decision is not available.';end if;
 if (b.status='pending_hr_manager' and not public.has_active_role('HR Manager')) or (b.status='pending_bod' and not public.has_active_role('Board of Director')) then raise exception 'You are not the approver for this stage.' using errcode='42501';end if;
 if p_action<>'approve' and length(btrim(coalesce(p_note,'')))<3 then raise exception 'Enter a specific reason for returning or rejecting.';end if;
 if p_action='approve' then
  perform pg_advisory_xact_lock(hashtextextended('break-review:'||b.scope_id::text,0));
  current_hash:=md5(private.payroll_time_sources_before_break_review(b.scope_id,b.date_from,b.date_to)::text);
  if current_hash<>b.source_hash then raise exception 'Source evidence changed. Return this batch and prepare it again.';end if;
  if exists(select 1 from jsonb_array_elements(b.items)i join public.payroll_schedule_freezes f on f.employee_id=(i->>'employeeId')::uuid and (i->>'date')::date between f.date_from and f.date_to) then raise exception 'Payroll was locked. Use the authorized correction path.';end if;
  next_status:=case when b.status='pending_hr_manager' then 'pending_bod' else 'approved' end;
 else next_status:=case p_action when 'return' then 'returned' else 'rejected' end;end if;
 update private.payroll_break_reviews set status=next_status,note=nullif(btrim(p_note),''),hr_by=case when next_status='pending_bod' then auth.uid() else hr_by end,hr_at=case when next_status='pending_bod' then clock_timestamp() else hr_at end,bod_by=case when next_status='approved' then auth.uid() else bod_by end,bod_at=case when next_status='approved' then clock_timestamp() else bod_at end where id=b.id;
 insert into private.payroll_break_review_audit(review_id,actor,action,note) values(b.id,auth.uid(),p_action||':'||b.status,nullif(btrim(p_note),''));
 return next_status;
end $$;

-- Do not allow legacy shortcuts to manufacture noon breaks or a scheduled clock-out.
do $$declare ddl text;begin
 ddl:=pg_get_functiondef('public.apply_payroll_attendance_preset(uuid,uuid,date,text,text)'::regprocedure);
 ddl:=replace(ddl,' if p_preset not in (',E' if p_preset in (''use_scheduled_break'',''mark_break_compliant'',''use_scheduled_end'') then raise exception ''Use verified attendance or submit recorded breaks for HR Manager and BOD approval. Scheduled times must not replace missing punches.'';end if;\n if p_preset not in (');
 execute ddl;
end $$;
revoke all on function private.payroll_time_sources_before_break_review(uuid,date,date),private.interpret_payroll_time_before_break_review(jsonb,date,date),private.payroll_time_sources(uuid,date,date),private.interpret_payroll_time(jsonb,date,date),private.payroll_break_candidates(jsonb,date,date) from public,anon,authenticated;
revoke all on function public.get_payroll_break_review(uuid,date,date),public.submit_payroll_break_review(uuid,date,date,text,jsonb),public.decide_payroll_break_review(uuid,text,text) from public,anon;
grant execute on function public.get_payroll_break_review(uuid,date,date),public.submit_payroll_break_review(uuid,date,date,text,jsonb),public.decide_payroll_break_review(uuid,text,text) to authenticated;
notify pgrst,'reload schema';
