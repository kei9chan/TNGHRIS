-- Retain exact delivery payloads across retries and serialize approval with clocks.
alter table attendance_issues.deliveries add column payload jsonb;
do $$declare ddl text;begin
 ddl:=pg_get_functiondef('public.claim_attendance_issue_email()'::regprocedure);
 ddl:=replace(ddl,'update attendance_issues.deliveries set status=''sending''','payload:=coalesce(d.payload,payload); update attendance_issues.deliveries set payload=payload,status=''sending''');
 ddl:=replace(ddl,'declare d attendance_issues.deliveries;','#variable_conflict use_variable'||chr(10)||'declare d attendance_issues.deliveries;');execute ddl;
 ddl:=pg_get_functiondef('public.review_attendance_issue(uuid,text,text,integer)'::regprocedure);
 ddl:=replace(ddl,'if next_status=''approved'' then','if next_status=''approved'' then
 perform pg_advisory_xact_lock(hashtextextended(''attendance-clock:''||r.employee_id,0));
 if not coalesce((r.schedule->>''published'')::boolean,false) then
 r.schedule:=private.attendance_schedule(r.employee_id,r.work_date);
 if not coalesce((r.schedule->>''published'')::boolean,false) then raise exception ''Publish or verify the employee schedule before approval. The request remains available for HR review.'';end if;
 update attendance_issues.requests set schedule=r.schedule where id=r.id;
 end if;
 if not exists(select 1 from jsonb_array_elements(r.schedule->''entries'') x where x->>''kind''=''work'') then raise exception ''No working shift is scheduled. Ask for details or refer the request to HR.'';end if;');execute ddl;
end $$;
-- Read only the authorized request's corrected evidence; no unrelated day exposed.
create function public.get_attendance_issue_punches(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare r attendance_issues.requests;begin
 if not attendance_issues.can_read(p_id) then raise exception 'Request unavailable' using errcode='42501';end if;
 select * into r from attendance_issues.requests where id=p_id;
 return jsonb_build_object('effective',private.attendance_session_events((select id from public.attendance_clock_sessions where employee_id=r.employee_id and work_date=r.work_date)),
 'original',(select coalesce(jsonb_agg(jsonb_build_object('type',action,'timestamp',occurred_at) order by revision),'[]') from public.attendance_clock_events where employee_id=r.employee_id and session_id in(select id from public.attendance_clock_sessions where employee_id=r.employee_id and work_date=r.work_date)));
end $$;
revoke all on function public.get_attendance_issue_punches(uuid) from public,anon;
grant execute on function public.get_attendance_issue_punches(uuid) to authenticated;
notify pgrst,'reload schema';
