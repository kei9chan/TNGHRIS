-- Record the exact decimal hours approved at either the manager or BOD stage.
-- The existing generic approval function authorizes and advances the request;
-- this typed wrapper keeps the approval decision and approved quantity atomic.
create or replace function public.process_overtime_request_approval(
  p_request_id uuid,
  p_decision text,
  p_note text default null,
  p_approved_hours numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  stored_hours numeric;
begin
  if lower(p_decision) not in ('approve', 'reject', 'return') then
    raise exception 'Unsupported approval decision.' using errcode = '22023';
  end if;

  if lower(p_decision) = 'approve'
     and (p_approved_hours is null or p_approved_hours <= 0 or p_approved_hours > 24) then
    raise exception 'Approved Hours must be a positive decimal number no greater than 24.' using errcode = '22023';
  end if;

  select approved_hours into stored_hours
  from public.ot_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Overtime request not found.' using errcode = '22023';
  end if;

  result := public.process_time_request_approval(
    'overtime', p_request_id, lower(p_decision), p_note
  );

  if coalesce((result ->> 'alreadyDecided')::boolean, false) then
    return result || jsonb_build_object('approvedHours', stored_hours);
  end if;

  if lower(p_decision) = 'approve' then
    update public.ot_requests
    set approved_hours = p_approved_hours,
        updated_at = clock_timestamp(),
        history_log = coalesce(history_log, '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object(
            'action', 'Approved hours recorded',
            'by', public.current_hris_user_id(),
            'date', clock_timestamp(),
            'approvedHours', p_approved_hours
          ))
    where id = p_request_id;

    insert into public.audit_logs(user_id, action, entity, entity_id, details)
    values (
      public.current_hris_user_id()::text,
      'RECORD_APPROVED_HOURS',
      'Overtime',
      p_request_id::text,
      jsonb_build_object('approvedHours', p_approved_hours, 'decision', lower(p_decision))::text
    );
    stored_hours := p_approved_hours;
  end if;

  return result || jsonb_build_object('approvedHours', stored_hours);
end;
$$;

revoke all on function public.process_overtime_request_approval(uuid,text,text,numeric) from public, anon;
grant execute on function public.process_overtime_request_approval(uuid,text,text,numeric) to authenticated;
