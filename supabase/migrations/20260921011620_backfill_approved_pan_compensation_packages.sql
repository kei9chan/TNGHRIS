-- Bring already-approved salary PANs under the same source-of-truth rule.
-- The selected actor is an actual recorded PAN approver with an active login;
-- no synthetic approver or hard-coded user identifier is introduced.
do $$
declare p record; actor uuid;
begin
 for p in
  select x.id,x.routing_steps
  from public.pans x
  where x.approval_completed_at is not null
    and x.status::text in ('Pending Employee','Completed')
    and coalesce((x.action_taken->>'salaryIncrease')::boolean,false)
    and not exists(select 1 from jsonb_array_elements(x.routing_steps) s where s->>'status' is distinct from 'Approved')
    and not exists(select 1 from public.payroll_pay_packages y where y.source_pan_id=x.id and y.source_kind='approved_pan')
  order by x.effective_date,x.id
 loop
  select u.auth_user_id into actor
  from jsonb_array_elements(p.routing_steps) with ordinality r(step,route_position)
  join public.hris_users u on u.id=(step->>'userId')::uuid
  where step->>'status'='Approved' and u.auth_user_id is not null and lower(u.status)='active'
    and not coalesce(u.is_duplicate,false)
    and exists(select 1 from public.user_roles ur join public.roles role on role.id=ur.role_id where ur.user_id=u.id and ur.is_active and role.is_active)
  order by route_position desc limit 1;
  if actor is null then raise exception 'Approved PAN % has no active recorded approver login for compensation backfill.',p.id;end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform private.apply_approved_pan_compensation(p.id);
 end loop;
 perform set_config('request.jwt.claim.sub','',true);
end $$;
