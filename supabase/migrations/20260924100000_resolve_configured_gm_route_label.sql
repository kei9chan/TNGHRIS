-- Keep the persisted rule label aligned when an explicitly configured General
-- Manager review is added between the Business Unit Manager and final BOD.
create or replace function private.resolve_manpower_approval_route(p_requester_id uuid, p_business_unit_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  requester_is_bum boolean := false;
  direct_manager uuid;
  bum uuid;
  gm uuid;
  bod uuid;
  route jsonb := '[]'::jsonb;
  rule text;
  gm_review_required boolean := false;
begin
  if p_requester_id is null or p_business_unit_id is null then
    return jsonb_build_object('valid', false, 'message', 'Select a valid Business Unit.', 'route', route);
  end if;

  select a.reports_to_user_id into direct_manager
  from public.org_chart_assignments a
  where a.user_id = p_requester_id
    and a.business_unit_id = p_business_unit_id
    and a.is_approved
    and current_date between a.effective_from and coalesce(a.effective_until, 'infinity'::date)
  order by a.effective_from desc
  limit 1;

  requester_is_bum := private.workflow_user_has_role(p_requester_id, 'Business Unit Manager')
    and exists (
      select 1 from public.org_chart_assignments a
      where a.user_id = p_requester_id
        and a.business_unit_id = p_business_unit_id
        and a.is_approved
        and a.organizational_level = 'BUSINESS_UNIT_HEAD'
        and current_date between a.effective_from and coalesce(a.effective_until, 'infinity'::date)
    );

  if direct_manager is not null
     and direct_manager <> p_requester_id
     and private.workflow_user_has_role(direct_manager, 'Board of Director')
     and exists (
       select 1 from public.hris_users u
       where u.id = direct_manager and lower(u.status::text) = 'active' and u.auth_user_id is not null
     ) then
    bod := direct_manager;
    rule := 'DIRECT_BOD_REPORT';
  elsif requester_is_bum then
    select u.id into bod
    from public.hris_users u
    where lower(u.status::text) = 'active'
      and u.auth_user_id is not null
      and u.id <> p_requester_id
      and private.workflow_user_has_role(u.id, 'Board of Director')
    order by u.full_name, u.id
    limit 1;
    rule := 'BUM_REQUESTER';
  else
    select a.user_id into bum
    from public.org_chart_assignments a
    join public.hris_users u on u.id = a.user_id
    where a.business_unit_id = p_business_unit_id
      and a.is_approved
      and a.organizational_level = 'BUSINESS_UNIT_HEAD'
      and current_date between a.effective_from and coalesce(a.effective_until, 'infinity'::date)
      and lower(u.status::text) = 'active'
      and u.auth_user_id is not null
      and a.user_id <> p_requester_id
      and private.workflow_user_has_role(a.user_id, 'Business Unit Manager')
    order by a.effective_from desc, u.full_name, u.id
    limit 1;

    if bum is null then
      return jsonb_build_object(
        'valid', false,
        'rule', 'BUM_THEN_BOD',
        'message', 'A Business Unit Manager must be assigned before this request can be submitted.',
        'route', route
      );
    end if;
    select exists (
      select 1 from public.approval_authority_matrix m
      where m.request_type = 'Manpower'
        and m.organizational_level = 'GENERAL_MANAGER'
        and m.authority_kind = 'REVIEW'
        and m.higher_approval_required
        and m.is_active
        and current_date between m.effective_from and coalesce(m.effective_until, 'infinity'::date)
    ) into gm_review_required;
    if gm_review_required then
      select u.id into gm
      from public.hris_users u
      where lower(u.status::text) = 'active'
        and u.auth_user_id is not null
        and u.id not in (p_requester_id, bum)
        and private.workflow_user_has_role(u.id, 'GeneralManager')
      order by u.full_name, u.id
      limit 1;
      if gm is null then
        return jsonb_build_object('valid', false, 'rule', 'BUM_THEN_GM_THEN_BOD', 'message', 'An active General Manager must be assigned for the configured approval rule.', 'route', route);
      end if;
    end if;
    select u.id into bod
    from public.hris_users u
    where lower(u.status::text) = 'active'
      and u.auth_user_id is not null
      and u.id <> p_requester_id
      and private.workflow_user_has_role(u.id, 'Board of Director')
    order by u.full_name, u.id
    limit 1;
    rule := case when gm is not null then 'BUM_THEN_GM_THEN_BOD' else 'BUM_THEN_BOD' end;
  end if;

  if bod is null then
    return jsonb_build_object('valid', false, 'rule', rule, 'message', 'An active Board of Director must be assigned before this request can be submitted.', 'route', route);
  end if;

  if bum is not null then
    route := route || jsonb_build_array(jsonb_build_object(
      'stepIndex', 0,
      'sequence', 10,
      'approverUserId', bum,
      'principalUserId', bum,
      'approverName', (select u.full_name from public.hris_users u where u.id = bum),
      'organizationalLevel', 'BUSINESS_UNIT_HEAD',
      'authorityKind', 'REVIEW',
      'delegated', false,
      'businessUnitId', p_business_unit_id,
      'configurationFallback', false
    ));
  end if;

  if gm is not null then
    route := route || jsonb_build_array(jsonb_build_object(
      'stepIndex', jsonb_array_length(route),
      'sequence', 15,
      'approverUserId', gm,
      'principalUserId', gm,
      'approverName', (select u.full_name from public.hris_users u where u.id = gm),
      'organizationalLevel', 'GENERAL_MANAGER',
      'authorityKind', 'REVIEW',
      'delegated', false,
      'businessUnitId', p_business_unit_id,
      'configurationFallback', false
    ));
  end if;

  route := route || jsonb_build_array(jsonb_build_object(
    'stepIndex', jsonb_array_length(route),
    'sequence', 20,
    'approverUserId', bod,
    'principalUserId', bod,
    'approverName', (select u.full_name from public.hris_users u where u.id = bod),
    'organizationalLevel', 'BOARD_OF_DIRECTORS',
    'authorityKind', 'FINAL_APPROVAL',
    'delegated', false,
    'businessUnitId', p_business_unit_id,
    'configurationFallback', false
  ));

  return jsonb_build_object('valid', true, 'rule', rule, 'message', null, 'route', route);
end
$$;
revoke all on function private.resolve_manpower_approval_route(uuid,uuid) from public, anon, authenticated;
