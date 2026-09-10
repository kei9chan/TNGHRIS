set local lock_timeout='5s';
-- Idempotent retries for employee revisions after a lost network response.
alter table attendance_issues.requests add column last_submission_key uuid;
alter table attendance_issues.requests add column last_submission_hash text;
create or replace function public.submit_attendance_issue(p_data jsonb,p_key uuid,p_id uuid default null,p_revision integer default null) returns uuid language plpgsql security definer set search_path='' as $$declare rid uuid;r attendance_issues.requests;begin
 if p_id is not null then
 select * into r from attendance_issues.requests where id=p_id for update;
 if r.employee_id is distinct from public.current_hris_user_id() or private.payroll_actor_id() is null then raise exception 'Only your returned request can be updated' using errcode='42501';end if;
 if r.last_submission_key=p_key then
 if r.last_submission_hash is distinct from md5(p_data::text) then raise exception 'This revision was already submitted with different values. Refresh the original request.';end if;return p_id;end if;
 if not coalesce((p_data->>'changesConfirmed')::boolean,false) or exists(select 1 from attendance_issues.hr_cases where request_id=p_id) then raise exception 'Confirm changes before resubmitting the original request';end if;
 end if;
 rid:=attendance_issues.submit_before_hr(p_data,p_key,p_id,p_revision);
 if p_id is not null then
 update attendance_issues.requests set last_submission_key=p_key,last_submission_hash=md5(p_data::text) where id=rid;
 perform attendance_issues.notify(rid,private.punch_direct_manager(public.current_hris_user_id()),'Attendance request resubmitted',rid||':resubmission:'||p_revision);
 end if;return rid;end $$;

-- Deny-only guard for attendance-linked records; grants and existing policies unchanged.
create function attendance_issues.incident_guard() returns trigger language plpgsql security definer set search_path='' as $$declare rid uuid;begin
 select request_id into rid from attendance_issues.hr_cases where incident_id=old.id;
 if rid is null then return case when tg_op='DELETE' then old else new end;end if;
 if tg_op='DELETE' then raise exception 'Attendance-linked incident records must be retained' using errcode='42501';end if;
 if (new.category,new.description,new.date_time,new.reported_by,new.involved_employee_ids,new.status) is distinct from (old.category,old.description,old.date_time,old.reported_by,old.involved_employee_ids,old.status) and not attendance_issues.hr_access(rid) then raise exception 'Only authorized HR can change attendance incident findings' using errcode='42501';end if;
 return new;end $$;
create trigger attendance_incident_guard before update or delete on public.incident_reports for each row execute function attendance_issues.incident_guard();

alter table attendance_issues.hr_cases drop constraint hr_cases_state_check;
alter table attendance_issues.hr_cases add constraint hr_cases_state_check check(state in('draft','employee_clarification','response_received','nte_draft','nte_approval','nte_ready','nte_sent','nte_response_received','closed_no_violation','closed_confirmed'));
do $$declare ddl text;begin
 ddl:=pg_get_functiondef('attendance_issues.nte_audit()'::regprocedure);
 ddl:=replace(ddl,'when ''Approved'' then ''nte_ready''','when ''Response Submitted'' then ''nte_response_received'' when ''Approved'' then ''nte_ready''');execute ddl;
 ddl:=pg_get_functiondef('public.act_attendance_hr_case(uuid,text,integer,jsonb)'::regprocedure);
 ddl:=replace(ddl,'''closed_confirmed'',''nte_sent''','''closed_confirmed'',''nte_sent'',''nte_response_received''');execute ddl;
 ddl:=pg_get_functiondef('public.get_attendance_case(uuid)'::regprocedure);
 ddl:=replace(ddl,'c.state<>''nte_sent''','c.state not in(''nte_sent'',''nte_response_received'')');execute ddl;
 ddl:=pg_get_functiondef('public.get_attendance_issues(uuid)'::regprocedure);
 ddl:=replace(ddl,'c.state<>''nte_sent''','c.state not in(''nte_sent'',''nte_response_received'')');execute ddl;
 ddl:=pg_get_functiondef('attendance_issues.nte_guard()'::regprocedure);
 ddl:=replace(ddl,'if new.status=''Issued''','if new.status=''PendingApproval'' and (cardinality(new.memo_ids)=0 or exists(select 1 from unnest(new.memo_ids) p where not exists(select 1 from public.memos m where m.id::text=p))) then raise exception ''An existing policy is required for an attendance NTE'';end if;
 if new.status=''Issued''');execute ddl;
end $$;
revoke all on function attendance_issues.incident_guard() from public,anon,authenticated;
notify pgrst,'reload schema';
