-- Attendance requests are approved by the employee's active direct manager.
-- HR/Admin may review escalated cases through the HR case workflow, but must
-- not receive a manager approval action for someone else's direct report.

create or replace function attendance_issues.can_review(p_id uuid)
returns boolean
language sql stable security definer set search_path=''
as $$
  select private.payroll_actor_id() is not null
    and exists (
      select 1
      from attendance_issues.requests r
      where r.id=p_id
        and r.employee_id<>public.current_hris_user_id()
        and private.punch_direct_manager(r.employee_id)=public.current_hris_user_id()
    );
$$;

create or replace function public.review_attendance_issue(
  p_id uuid,
  p_action text,
  p_reason text,
  p_revision integer
) returns void
language plpgsql security definer set search_path=''
as $$
declare
  r attendance_issues.requests;
  actor uuid:=public.current_hris_user_id();
  next_status text;
  aid uuid;
begin
  select * into r from attendance_issues.requests where id=p_id for update;
  if r.id is null or private.payroll_actor_id() is null then
    raise exception 'Request unavailable' using errcode='42501';
  end if;
  if r.revision is distinct from p_revision then
    raise exception 'Request changed. Refresh before reviewing.' using errcode='40001';
  end if;
  if p_action not in ('withdraw','cancel','approve','reject','details') then
    raise exception 'Unknown attendance action';
  end if;
  if p_action in ('reject','details') and length(trim(coalesce(p_reason,''))) not between 3 and 1000 then
    raise exception 'Enter a reason for this action';
  end if;
  if p_action='withdraw' then
    if r.employee_id<>actor or r.status not in('pending','details','hr_review') then
      raise exception 'Only your pending request can be withdrawn' using errcode='42501';
    end if;
    next_status:='withdrawn';
  elsif p_action='cancel' then
    if not private.attendance_admin() or not public.can_access_hris_user(r.employee_id) or r.status<>'approved' or r.kind='punch' then
      raise exception 'Scoped HR review required. Applied punch corrections need a separate HR correction.' using errcode='42501';
    end if;
    next_status:='cancelled';
  else
    if not attendance_issues.can_review(p_id) or r.status<>'pending' then
      raise exception 'Only the employee''s active direct manager may approve this attendance request' using errcode='42501';
    end if;
    next_status:=case p_action when 'approve' then 'approved' when 'reject' then 'rejected' else 'details' end;
  end if;
  if next_status='approved' then
    perform pg_advisory_xact_lock(hashtextextended('attendance-issue-day:'||r.employee_id||':'||r.work_date,0));
    if r.kind='absence' and exists(select 1 from public.attendance_clock_sessions where employee_id=r.employee_id and work_date=r.work_date and state<>'not_started') then
      raise exception 'Attendance exists for this day. Ask for details or use early out; HR must review the conflict.';
    end if;
    if exists(select 1 from attendance_issues.requests x where x.employee_id=r.employee_id and x.work_date=r.work_date and x.status='approved' and x.id<>r.id and (x.kind='absence' or r.kind='absence')) then
      raise exception 'An approved attendance exception conflicts with this request';
    end if;
    if r.kind='punch' then aid:=attendance_issues.apply_punch(p_id); end if;
    insert into attendance_issues.exceptions(request_id,employee_id,work_date,kind,requested_time,schedule,session_id,adjustment_id,actor)
      values(r.id,r.employee_id,r.work_date,r.kind,r.requested_time,r.schedule,(select id from public.attendance_clock_sessions where employee_id=r.employee_id and work_date=r.work_date),aid,actor);
    insert into attendance_issues.audit(request_id,actor,action,new_value,reason)
      values(p_id,actor,case when aid is null then 'schedule exception created' else 'punch correction applied' end,jsonb_build_object('adjustmentId',aid,'schedule',r.schedule),nullif(trim(p_reason),''));
  end if;
  update attendance_issues.requests set status=next_status,revision=revision+1,updated_at=clock_timestamp(),reviewed_by=actor,reviewed_at=clock_timestamp() where id=p_id;
  insert into attendance_issues.audit(request_id,actor,action,previous,new_value,reason)
    values(p_id,actor,p_action,to_jsonb(r),(select to_jsonb(x) from attendance_issues.requests x where id=p_id),nullif(trim(p_reason),''));
  perform attendance_issues.notify(p_id,r.employee_id,case next_status when 'details' then 'Returned for more information' else initcap(next_status) end,p_id||':decision:'||(r.revision+1));
  if next_status in('withdrawn','cancelled') then perform attendance_issues.notify(p_id,private.punch_direct_manager(r.employee_id),initcap(next_status),p_id||':manager-decision:'||(r.revision+1)); end if;
end;
$$;

notify pgrst,'reload schema';
