create function private.pan_parallel_bod_steps(p_steps jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare steps jsonb:=coalesce(p_steps,'[]');b record;step jsonb;outp jsonb:='[]';ready boolean;first_waiting boolean:=false;i integer:=0;begin
 -- Preserve recorded approvals and configured earlier approvers. All active BODs
 -- share the final stage; no employee or approver is granted a new role.
 for b in select h.id,h.full_name from public.hris_users h where private.pan_user_is_bod(h.id::text) order by h.id loop
 if not exists(select 1 from jsonb_array_elements(steps) s where s->>'userId'=b.id::text) then
 steps:=steps||jsonb_build_array(jsonb_build_object('id','bod-'||b.id,'userId',b.id,'name',b.full_name,'role','Board of Director','status','Waiting'));
 end if;end loop;
 ready:=not exists(select 1 from jsonb_array_elements(steps) s where not private.pan_user_is_bod(s->>'userId') and s->>'status' is distinct from 'Approved');
 for step in select value from jsonb_array_elements(steps) loop
 if private.pan_user_is_bod(step->>'userId') then
 step:=step||jsonb_build_object('role','Board of Director');
 if step->>'status' in('Pending','Waiting') then step:=step||jsonb_build_object('status',case when ready then 'Pending' else 'Waiting' end);end if;
 elsif step->>'status' in('Pending','Waiting') and not first_waiting then
 step:=step||jsonb_build_object('status','Pending');first_waiting:=true;
 end if;
 outp:=outp||jsonb_build_array(step||jsonb_build_object('order',i));i:=i+1;
 end loop;return outp;
end $$;
revoke all on function private.pan_parallel_bod_steps(jsonb) from public,anon,authenticated;
create function private.pan_parallel_bod_route_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.status::text='Pending Approval' then new.routing_steps:=private.pan_parallel_bod_steps(new.routing_steps);end if;
 return new;
end $$;
create trigger pan_parallel_bod_route before insert or update of routing_steps,status on public.pans for each row execute function private.pan_parallel_bod_route_guard();
create function private.pan_parallel_bod_route_audit() returns trigger language plpgsql security definer set search_path='' as $$declare s jsonb;begin
 if new.status::text='Pending Approval' and (tg_op='INSERT' or new.routing_steps is distinct from old.routing_steps) then
 perform private.pan_audit('ROUTING_UPDATED',new.id,jsonb_build_object('previous',case when tg_op='UPDATE' then old.routing_steps end,'new',new.routing_steps,'reason','Parallel final BOD approval routing'));
 for s in select value from jsonb_array_elements(new.routing_steps) loop
 if s->>'status'='Pending' and (tg_op='INSERT' or not exists(select 1 from jsonb_array_elements(coalesce(old.routing_steps,'[]')) p where p->>'userId'=s->>'userId' and p->>'status'='Pending')) then
 perform private.pan_notify((s->>'userId')::uuid,'PAN_APPROVAL_REQUEST','PAN Approval Required',format('PAN %s for %s is awaiting your approval.',new.id,new.employee_name),format('/approvals?type=pan&item=%s',new.id),new.id,format('pan:%s:approval:%s',new.id,s->>'id'));
 end if;end loop;end if;return new;
end $$;
create trigger pan_parallel_bod_audit after insert or update of routing_steps,status on public.pans for each row execute function private.pan_parallel_bod_route_audit();
revoke all on function private.pan_parallel_bod_route_guard(),private.pan_parallel_bod_route_audit() from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.submit_pan(p_pan_id uuid)
 RETURNS pans
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := public.current_hris_user_id();
  pan_row public.pans;
  step_row jsonb;
  normalized_steps jsonb := '[]'::jsonb;
  step_number integer := 0;
  first_step jsonb;
  bod_count integer := 0;
begin
  if actor_id is null or not private.pan_actor_can_create() then
    raise exception 'Forbidden: PAN submission permission is required.' using errcode = '42501';
  end if;

  select * into pan_row from public.pans where id = p_pan_id for update;
  if pan_row.id is null then raise exception 'PAN record not found.'; end if;
  if pan_row.status::text not in ('Draft', 'Declined', 'Returned for Edits') then
    raise exception 'Only a draft, rejected, or returned PAN can be submitted.';
  end if;
  if pan_row.created_by_user_id is distinct from actor_id and not private.pan_actor_can_create() then
    raise exception 'You are not authorized to submit this PAN.' using errcode = '42501';
  end if;
  if jsonb_array_length(coalesce(pan_row.routing_steps, '[]'::jsonb)) = 0 then
    raise exception 'Add at least one approver before submitting the PAN.';
  end if;

  pan_row.routing_steps := private.pan_parallel_bod_steps(pan_row.routing_steps);
  select count(*) into bod_count
  from jsonb_array_elements(coalesce(pan_row.routing_steps, '[]'::jsonb)) step
  where private.pan_user_is_bod(step->>'userId');
  if bod_count = 0 then
    raise exception 'Every PAN requires at least one active Board of Director approver.';
  end if;

  for step_row in
    select value from jsonb_array_elements(pan_row.routing_steps) with ordinality as route(value, ordinality)
    order by ordinality
  loop
    if nullif(step_row->>'userId', '') is null then
      raise exception 'Every PAN routing step must identify an approver.';
    end if;
    normalized_steps := normalized_steps || jsonb_build_array(
      (step_row - 'timestamp' - 'notes') || jsonb_build_object(
        'order', step_number,
        'status', case when step_number = 0 then 'Pending' else 'Waiting' end,
        'role', case when private.pan_user_is_bod(step_row->>'userId') then 'Board of Director' else coalesce(nullif(step_row->>'role',''), 'Approver') end
      )
    );
    step_number := step_number + 1;
  end loop;

  normalized_steps := private.pan_parallel_bod_steps(normalized_steps);
  update public.pans
  set status = 'Pending Approval',
      workflow_version = 2,
      routing_steps = normalized_steps,
      rejection_reason = null,
      approval_completed_at = null,
      updated_at = now()
  where id = p_pan_id
  returning * into pan_row;

  first_step := normalized_steps->0;
  perform private.pan_notify(
    (first_step->>'userId')::uuid,
    'PAN_APPROVAL_REQUEST',
    'PAN Approval Required',
    format('PAN %s for %s is awaiting your approval.', p_pan_id, pan_row.employee_name),
    format('/approvals?type=pan&item=%s', p_pan_id),
    p_pan_id,
    format('pan:%s:approval:%s', p_pan_id, coalesce(first_step->>'id', '0'))
  );
  perform private.pan_audit('SUBMIT', p_pan_id, jsonb_build_object(
    'status', 'Pending Approval', 'workflowVersion', 2,
    'routingStepCount', jsonb_array_length(normalized_steps), 'requiredBodSteps', bod_count
  ));
  return pan_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.approve_pan(p_pan_id uuid, p_comment text DEFAULT NULL::text)
 RETURNS pans
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := public.current_hris_user_id();
  pan_row public.pans;
  step_row jsonb;
  rebuilt jsonb := '[]'::jsonb;
  actor_step_found boolean := false;
  next_step_index integer;
  step_index integer := 0;
  next_step jsonb;
  all_approved boolean;
  bod_approved boolean;
begin
  if actor_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  select * into pan_row from public.pans where id = p_pan_id for update;
  if pan_row.id is null then raise exception 'PAN record not found.'; end if;
  if pan_row.status::text <> 'Pending Approval' then raise exception 'This PAN is not pending approval.'; end if;

  for step_row in select value from jsonb_array_elements(pan_row.routing_steps) with ordinality route(value, ordinality) order by ordinality
  loop
    if step_row->>'userId' = actor_id::text and step_row->>'status' = 'Pending' and not actor_step_found then
      step_row := step_row || jsonb_build_object('status','Approved','timestamp',now(),'notes',nullif(trim(coalesce(p_comment,'')),''));
      actor_step_found := true;
    end if;
    rebuilt := rebuilt || jsonb_build_array(step_row);
  end loop;
  if not actor_step_found then
    raise exception 'You are not the current assigned approver for this PAN.' using errcode = '42501';
  end if;

  rebuilt := private.pan_parallel_bod_steps(rebuilt);
  select not exists(select 1 from jsonb_array_elements(rebuilt) step where step->>'status' <> 'Approved') into all_approved;
  select exists(select 1 from jsonb_array_elements(rebuilt) step where step->>'status' = 'Approved' and private.pan_user_is_bod(step->>'userId')) into bod_approved;

  if all_approved then
    if pan_row.workflow_version >= 2 and not bod_approved then
      raise exception 'A Board of Director approval is required before employee acknowledgement.';
    end if;
    update public.pans set routing_steps=rebuilt, status='Pending Employee', approval_completed_at=now(), updated_at=now()
    where id=p_pan_id returning * into pan_row;
    perform private.pan_notify(
      pan_row.employee_id, 'PAN_UPDATE', 'PAN for Acknowledgement',
      format('PAN %s is approved and ready for your acknowledgement and acceptance.', p_pan_id),
      format('/employees/pan?item=%s', p_pan_id), p_pan_id,
      format('pan:%s:employee-acknowledgement', p_pan_id)
    );
  else
    update public.pans set routing_steps=rebuilt, updated_at=now() where id=p_pan_id returning * into pan_row;
    if next_step is not null then
      perform private.pan_notify(
        (next_step->>'userId')::uuid, 'PAN_APPROVAL_REQUEST', 'PAN Approval Required',
        format('PAN %s for %s is awaiting your approval.', p_pan_id, pan_row.employee_name),
        format('/approvals?type=pan&item=%s', p_pan_id), p_pan_id,
        format('pan:%s:approval:%s', p_pan_id, coalesce(next_step->>'id', next_step_index::text))
      );
    end if;
  end if;
  perform private.pan_audit('APPROVE', p_pan_id, jsonb_build_object('comment',nullif(trim(coalesce(p_comment,'')),''),'status',pan_row.status::text));
  return pan_row;
end;
$function$;


-- Repair only still-pending routes, preserving every existing decision.
update public.pans set routing_steps=private.pan_parallel_bod_steps(routing_steps),updated_at=clock_timestamp()
where status::text='Pending Approval' and routing_steps is distinct from private.pan_parallel_bod_steps(routing_steps);
notify pgrst,'reload schema';
