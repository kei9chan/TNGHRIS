-- Staging-only visibility repair for the synthetic payroll fixture.
--
-- The legacy Phase 4A screen resolves accessible employees through the
-- public.business_units catalog and compares the employee's legacy
-- business_unit name. The fixture initially populated the name but did not
-- create the matching legacy catalog row, so the UI filtered out all ten
-- synthetic workers. This migration creates the catalog row and links the
-- fixture users to it. It must never be merged into production.

do $phase1mockbu$
declare
  v_business_unit_id uuid;
begin
  select bu.id
    into v_business_unit_id
  from public.business_units bu
  where bu.code = 'PAYROLL-TEST-LAB'
     or bu.name = 'PAYROLL TEST LAB (STAGING)'
  order by (bu.code = 'PAYROLL-TEST-LAB') desc, bu.id
  limit 1;

  if v_business_unit_id is null then
    v_business_unit_id := 'b6000000-0000-0000-0000-000000000001'::uuid;
    insert into public.business_units (id, name, code, color)
    values (
      v_business_unit_id,
      'PAYROLL TEST LAB (STAGING)',
      'PAYROLL-TEST-LAB',
      '#7c3aed'
    );
  else
    update public.business_units
    set name = 'PAYROLL TEST LAB (STAGING)',
        code = 'PAYROLL-TEST-LAB',
        color = coalesce(color, '#7c3aed')
    where id = v_business_unit_id;
  end if;

  update public.hris_users
  set business_unit_id = v_business_unit_id
  where id::text like 'a1000000-%'
    and business_unit = 'PAYROLL TEST LAB (STAGING)'
    and business_unit_id is distinct from v_business_unit_id;

  if (select count(*)
      from public.business_units
      where id = v_business_unit_id
        and name = 'PAYROLL TEST LAB (STAGING)'
        and code = 'PAYROLL-TEST-LAB') <> 1 then
    raise exception 'The staging payroll test business unit was not created.'
      using errcode = '23514';
  end if;

  if (select count(*)
      from public.hris_users
      where id::text like 'a1000000-%'
        and business_unit_id = v_business_unit_id) <> 10 then
    raise exception 'All ten staging payroll test users must be linked to the test business unit.'
      using errcode = '23514';
  end if;
end
$phase1mockbu$;

comment on table public.business_units is
  'Business-unit catalog. PAYROLL-TEST-LAB is reserved for synthetic payroll-staging fixtures only.';
