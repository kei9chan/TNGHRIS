-- Staging-only payroll test fixture.
--
-- This migration creates synthetic, non-login employee records and normalized
-- payroll inputs for testing. It must never be merged into production.
-- No real employee, salary, bank, statutory, or payroll-register data is used.

create table if not exists public.payroll_test_employee_fixtures (
  id uuid primary key,
  fixture_code text not null unique,
  employee_id uuid not null references public.hris_users(id) on delete restrict,
  scenario_order smallint not null,
  scenario_name text not null,
  employment_package text not null,
  payroll_streams text[] not null,
  expected_checks jsonb not null default '{}'::jsonb,
  is_staging_only boolean not null default true,
  created_at timestamptz not null default now(),
  constraint payroll_test_employee_fixtures_code_check check (
    fixture_code like 'PAYROLL-TEST-%'
  ),
  constraint payroll_test_employee_fixtures_order_check check (scenario_order > 0),
  constraint payroll_test_employee_fixtures_streams_check check (
    cardinality(payroll_streams) > 0
    and payroll_streams <@ array['employee_payroll', 'professional_fee', 'other']::text[]
  ),
  constraint payroll_test_employee_fixtures_expected_object_check check (
    jsonb_typeof(expected_checks) = 'object'
  ),
  constraint payroll_test_employee_fixtures_staging_only_check check (is_staging_only)
);

create index if not exists payroll_test_employee_fixtures_employee_idx
  on public.payroll_test_employee_fixtures (employee_id, scenario_order);

alter table public.payroll_test_employee_fixtures enable row level security;

drop policy if exists payroll_test_employee_fixtures_authorized_read
  on public.payroll_test_employee_fixtures;
create policy payroll_test_employee_fixtures_authorized_read
on public.payroll_test_employee_fixtures
for select to authenticated
using (private.payroll_configuration_access());

revoke all on table public.payroll_test_employee_fixtures from public, anon, authenticated;
grant select on table public.payroll_test_employee_fixtures to authenticated;
grant all on table public.payroll_test_employee_fixtures to service_role;

comment on table public.payroll_test_employee_fixtures is
  'Synthetic payroll-staging test fixtures only. Never merge this data migration into production.';

do $phase1mock$
declare
  v_actor uuid;
begin
  select u.id
    into v_actor
  from public.hris_users u
  where lower(u.email) = 'kay@thenextperience.com'
    and lower(u.status) = 'active'
  limit 1;

  if v_actor is null then
    select u.id
      into v_actor
    from public.hris_users u
    where lower(u.status) = 'active'
    order by u.created_at, u.id
    limit 1;
  end if;

  if v_actor is null then
    raise exception 'A staging HRIS user is required to record the test-fixture approval evidence.'
      using errcode = '23514';
  end if;

  -- These are synthetic records with reserved IDs and .invalid email addresses.
  -- auth_user_id is intentionally not linked to auth.users, so these rows cannot log in.
  insert into public.hris_users (
    id,
    email,
    first_name,
    last_name,
    full_name,
    role,
    status,
    business_unit,
    department,
    position,
    date_hired,
    auth_user_id,
    leave_quota_vacation,
    leave_quota_sick,
    leave_last_credit_date,
    employment_status,
    rate_type,
    rate_amount,
    tax_status,
    salary_basic,
    salary_deminimis,
    salary_reimbursable,
    data_access_scope,
    employee_id,
    leave_quota_offset,
    end_date
  ) values
    ('a1000000-0000-0000-0000-000000000001', 'payroll.test.01@example.invalid', 'PAYROLL', 'TEST 01', 'PAYROLL TEST 01', 'Employee', 'Active', 'PAYROLL TEST LAB (STAGING)', 'PAYROLL QA', 'Regular Staff', '2025-01-06', 'f1000000-0000-0000-0000-000000000001', 5, 5, '2026-01-01', 'Regular', 'Monthly', 30000, 'Test-only / not configured', 30000, 2000, 0, '{"type":"HOME_ONLY"}'::jsonb, 'TEST-PAY-001', 0, null),
    ('a1000000-0000-0000-0000-000000000002', 'payroll.test.02@example.invalid', 'PAYROLL', 'TEST 02', 'PAYROLL TEST 02', 'Employee', 'Active', 'PAYROLL TEST LAB (STAGING)', 'PAYROLL QA', 'Probationary Staff', '2025-03-03', 'f1000000-0000-0000-0000-000000000002', 5, 5, '2026-01-01', 'Probationary', 'Monthly', 26000, 'Test-only / not configured', 26000, 1500, 0, '{"type":"HOME_ONLY"}'::jsonb, 'TEST-PAY-002', 0, null),
    ('a1000000-0000-0000-0000-000000000003', 'payroll.test.03@example.invalid', 'PAYROLL', 'TEST 03', 'PAYROLL TEST 03', 'Employee', 'Active', 'PAYROLL TEST LAB (STAGING)', 'PAYROLL QA', 'Daily Staff', '2025-02-10', 'f1000000-0000-0000-0000-000000000003', 5, 5, '2026-01-01', 'Regular', 'Daily', 750, 'Test-only / not configured', null, 0, 0, '{"type":"HOME_ONLY"}'::jsonb, 'TEST-PAY-003', 0, null),
    ('a1000000-0000-0000-0000-000000000004', 'payroll.test.04@example.invalid', 'PAYROLL', 'TEST 04', 'PAYROLL TEST 04', 'Employee', 'Active', 'PAYROLL TEST LAB (STAGING)', 'PAYROLL QA', 'Part-time Staff', '2025-04-14', 'f1000000-0000-0000-0000-000000000004', 5, 5, '2026-01-01', 'Part-time', 'Hourly', 150, 'Test-only / not configured', null, 0, 0, '{"type":"HOME_ONLY"}'::jsonb, 'TEST-PAY-004', 0, null),
    ('a1000000-0000-0000-0000-000000000005', 'payroll.test.05@example.invalid', 'PAYROLL', 'TEST 05', 'PAYROLL TEST 05', 'Employee', 'Active', 'PAYROLL TEST LAB (STAGING)', 'PAYROLL QA', 'Project Staff', '2025-05-05', 'f1000000-0000-0000-0000-000000000005', 5, 5, '2026-01-01', 'Fixed-term', 'Monthly', 45000, 'Test-only / not configured', 45000, 3000, 0, '{"type":"HOME_ONLY"}'::jsonb, 'TEST-PAY-005', 0, '2026-12-31'),
    ('a1000000-0000-0000-0000-000000000006', 'payroll.test.06@example.invalid', 'PAYROLL', 'TEST 06', 'PAYROLL TEST 06', 'Employee', 'Active', 'PAYROLL TEST LAB (STAGING)', 'PAYROLL QA', 'Mid-period Hire', '2026-08-18', 'f1000000-0000-0000-0000-000000000006', 5, 5, '2026-08-18', 'Regular', 'Monthly', 32000, 'Test-only / not configured', 32000, 0, 0, '{"type":"HOME_ONLY"}'::jsonb, 'TEST-PAY-006', 0, null),
    ('a1000000-0000-0000-0000-000000000007', 'payroll.test.07@example.invalid', 'PAYROLL', 'TEST 07', 'PAYROLL TEST 07', 'Employee', 'Active', 'PAYROLL TEST LAB (STAGING)', 'PAYROLL QA', 'Salary Change Staff', '2025-06-02', 'f1000000-0000-0000-0000-000000000007', 5, 5, '2026-01-01', 'Regular', 'Monthly', 35000, 'Test-only / not configured', 35000, 0, 0, '{"type":"HOME_ONLY"}'::jsonb, 'TEST-PAY-007', 0, null),
    ('a1000000-0000-0000-0000-000000000008', 'payroll.test.08@example.invalid', 'PAYROLL', 'TEST 08', 'PAYROLL TEST 08', 'Employee', 'Active', 'PAYROLL TEST LAB (STAGING)', 'PAYROLL QA', 'Mid-period Separation', '2025-07-07', 'f1000000-0000-0000-0000-000000000008', 5, 5, '2026-01-01', 'Separated - Test', 'Monthly', 38000, 'Test-only / not configured', 38000, 0, 0, '{"type":"HOME_ONLY"}'::jsonb, 'TEST-PAY-008', 0, '2026-08-20'),
    ('a1000000-0000-0000-0000-000000000009', 'payroll.test.09@example.invalid', 'PAYROLL', 'TEST 09', 'PAYROLL TEST 09', 'Employee', 'Active', 'PAYROLL TEST LAB (STAGING)', 'PAYROLL QA', 'Hybrid Employee / Consultant', '2025-08-04', 'f1000000-0000-0000-0000-000000000009', 5, 5, '2026-01-01', 'Regular - Hybrid Test', 'Monthly + Professional Fee', 70000, 'Test-only / not configured', 70000, 0, 0, '{"type":"HOME_ONLY"}'::jsonb, 'TEST-PAY-009', 0, null),
    ('a1000000-0000-0000-0000-000000000010', 'payroll.test.10@example.invalid', 'PAYROLL', 'TEST 10', 'PAYROLL TEST 10', 'Employee', 'Active', 'PAYROLL TEST LAB (STAGING)', 'PAYROLL QA', 'Independent Contractor', '2025-09-01', 'f1000000-0000-0000-0000-000000000010', 0, 0, '2026-01-01', 'Independent Contractor - Test', 'Professional Fee', 90000, 'Test-only / not configured', null, 0, 0, '{"type":"HOME_ONLY"}'::jsonb, 'TEST-PAY-010', 0, null);

  insert into public.payroll_test_employee_fixtures (
    id, fixture_code, employee_id, scenario_order, scenario_name,
    employment_package, payroll_streams, expected_checks
  ) values
    ('c1000000-0000-0000-0000-000000000001', 'PAYROLL-TEST-01', 'a1000000-0000-0000-0000-000000000001', 1, 'Monthly regular employee', 'Monthly-paid regular employee with basic salary, allowance, and deduction component', array['employee_payroll']::text[], jsonb_build_object('case', 'monthly_regular', 'basic_amount', 30000, 'allowance_amount', 2000, 'deduction_amount', 3000, 'expected_attendance', 'present')),
    ('c1000000-0000-0000-0000-000000000002', 'PAYROLL-TEST-02', 'a1000000-0000-0000-0000-000000000002', 2, 'Probationary employee and grace boundary', 'Monthly-paid probationary employee clocking in exactly five minutes after schedule start', array['employee_payroll']::text[], jsonb_build_object('case', 'grace_boundary', 'grace_minutes', 5, 'clock_in', '09:05', 'expected', 'not_late_if_test_rule_applies', 'duplicate_event_count', 1)),
    ('c1000000-0000-0000-0000-000000000003', 'PAYROLL-TEST-03', 'a1000000-0000-0000-0000-000000000003', 3, 'Daily-paid employee', 'Daily-paid regular employee with a late arrival and early departure', array['employee_payroll']::text[], jsonb_build_object('case', 'daily_rate_late_undertime', 'daily_rate', 750, 'expected', 'late_and_undertime_review')),
    ('c1000000-0000-0000-0000-000000000004', 'PAYROLL-TEST-04', 'a1000000-0000-0000-0000-000000000004', 4, 'Hourly part-time employee', 'Hourly part-time employee with a partial work period and work-from-home context', array['employee_payroll']::text[], jsonb_build_object('case', 'hourly_partial_shift', 'hourly_rate', 150, 'work_context', 'work_from_home', 'expected', 'partial_or_undertime_review')),
    ('c1000000-0000-0000-0000-000000000005', 'PAYROLL-TEST-05', 'a1000000-0000-0000-0000-000000000005', 5, 'Fixed-term employee on rest-day schedule', 'Monthly-paid fixed-term project employee scheduled on a rest-day preset', array['employee_payroll']::text[], jsonb_build_object('case', 'fixed_term_rest_day', 'assignment_end', '2026-12-31', 'shift_kind', 'rest_day')),
    ('c1000000-0000-0000-0000-000000000006', 'PAYROLL-TEST-06', 'a1000000-0000-0000-0000-000000000006', 6, 'Mid-period hire with offline sync', 'Monthly-paid employee hired on August 18 with a synchronized offline punch', array['employee_payroll']::text[], jsonb_build_object('case', 'mid_period_hire', 'hire_date', '2026-08-18', 'submission_mode', 'sync')),
    ('c1000000-0000-0000-0000-000000000007', 'PAYROLL-TEST-07', 'a1000000-0000-0000-0000-000000000007', 7, 'Effective-dated salary increase on split shift', 'Monthly-paid employee with an old and new salary version effective August 15', array['employee_payroll']::text[], jsonb_build_object('case', 'effective_dated_salary_change', 'old_monthly_rate', 28000, 'new_monthly_rate', 35000, 'effective_date', '2026-08-15', 'shift_kind', 'split')),
    ('c1000000-0000-0000-0000-000000000008', 'PAYROLL-TEST-08', 'a1000000-0000-0000-0000-000000000008', 8, 'Mid-period separation on overnight shift', 'Monthly-paid employee whose normalized assignment ends August 20', array['employee_payroll']::text[], jsonb_build_object('case', 'mid_period_separation', 'assignment_end', '2026-08-20', 'shift_kind', 'overnight')),
    ('c1000000-0000-0000-0000-000000000009', 'PAYROLL-TEST-09', 'a1000000-0000-0000-0000-000000000009', 9, 'Split employee and consultant stream', 'Employee payroll assignment plus a separate professional-fee expectation', array['employee_payroll', 'professional_fee']::text[], jsonb_build_object('case', 'hybrid_employee_plus_consultant', 'employee_basic_monthly', 70000, 'professional_fee_monthly', 25000, 'professional_fee_handling', 'separate payable stream; never employee compensation history')),
    ('c1000000-0000-0000-0000-000000000010', 'PAYROLL-TEST-10', 'a1000000-0000-0000-0000-000000000010', 10, 'Independent contractor stream', 'Professional-fee worker with no employee-payroll assignment', array['professional_fee']::text[], jsonb_build_object('case', 'independent_contractor', 'professional_fee_monthly', 90000, 'employee_payroll_assignment_expected', false));

  insert into public.payroll_legal_entities (
    id, code, legal_name, currency_code, default_timezone, is_active, created_by_user_id
  ) values (
    'b1000000-0000-0000-0000-000000000001',
    'PAYROLL-TEST-ENTITY',
    'TNG HRIS Payroll Test Entity - STAGING ONLY',
    'PHP',
    'Asia/Manila',
    true,
    v_actor
  );

  insert into public.payroll_groups (
    id, legal_entity_id, code, name, pay_frequency, timezone, currency_code,
    effective_start_date, is_active, created_by_user_id
  ) values (
    'b2000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000001',
    'PAYROLL-TEST-SEMI-MONTHLY',
    'Payroll Test Semi-Monthly - STAGING ONLY',
    'semi_monthly',
    'Asia/Manila',
    'PHP',
    '2026-01-01',
    true,
    v_actor
  );

  insert into public.payroll_calendar_rules (
    id, payroll_group_id, calendar_code, version, frequency, timezone,
    cutoff_rule, pay_date_rule, attendance_close_rule, adjustment_deadline_rule,
    rounding_rule, effective_start_date, approval_status, source_document_ref,
    source_version, approved_by_user_id, approved_at, approval_note,
    test_scenario_version, impact_review
  ) values (
    'b3000000-0000-0000-0000-000000000001',
    'b2000000-0000-0000-0000-000000000001',
    'PAYROLL-TEST-CALENDAR',
    1,
    'semi_monthly',
    'Asia/Manila',
    jsonb_build_object(
      'cutoffs', jsonb_build_array(
        jsonb_build_object('start_day', 11, 'end_day', 25, 'pay_day', 5),
        jsonb_build_object('start_day', 26, 'end_day', 10, 'pay_day', 20)
      )
    ),
    jsonb_build_object('pay_dates', jsonb_build_array(5, 20)),
    jsonb_build_object('close_after_period_days', 2),
    jsonb_build_object('adjustment_deadline_days_after_close', 3),
    jsonb_build_object('money', 'half_up', 'minutes', 'exact'),
    '2026-01-01',
    'active',
    'PAYROLL-STAGING-TEST-FIXTURE-v1',
    'fixture-v1',
    v_actor,
    '2026-09-05 09:00:00+08',
    'Staging-only fixture approval; not an approved production policy.',
    'payroll-test-scenarios-v1',
    jsonb_build_object('review_type', 'staging_fixture', 'production_use', false)
  );

  insert into public.payroll_periods (
    id, payroll_group_id, calendar_rule_id, period_type,
    period_start_date, period_end_date, attendance_close_date,
    adjustment_deadline_date, pay_date, timezone, status, status_reason,
    created_by_user_id
  ) values (
    'b4000000-0000-0000-0000-000000000001',
    'b2000000-0000-0000-0000-000000000001',
    'b3000000-0000-0000-0000-000000000001',
    'regular',
    '2026-08-11',
    '2026-08-25',
    '2026-08-27',
    '2026-08-30',
    '2026-09-05',
    'Asia/Manila',
    'draft',
    'Staging-only payroll test fixture; not a live payroll run.',
    v_actor
  );

  insert into public.payroll_worker_classifications (
    id, code, name, description, approval_status, is_active,
    source_document_ref, source_version, approved_by_user_id, approved_at,
    approval_note, created_by_user_id
  ) values
    ('c2000000-0000-0000-0000-000000000001', 'TEST-REGULAR', 'Regular employee', 'Synthetic regular employee classification.', 'draft', true, 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture value.', v_actor),
    ('c2000000-0000-0000-0000-000000000002', 'TEST-PROBATIONARY', 'Probationary employee', 'Synthetic probationary employee classification.', 'draft', true, 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture value.', v_actor),
    ('c2000000-0000-0000-0000-000000000003', 'TEST-DAILY', 'Daily-paid employee', 'Synthetic daily-paid employee classification.', 'draft', true, 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture value.', v_actor),
    ('c2000000-0000-0000-0000-000000000004', 'TEST-PART-TIME', 'Part-time employee', 'Synthetic hourly part-time employee classification.', 'draft', true, 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture value.', v_actor),
    ('c2000000-0000-0000-0000-000000000005', 'TEST-PROJECT', 'Project or fixed-term employee', 'Synthetic fixed-term project classification.', 'draft', true, 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture value.', v_actor),
    ('c2000000-0000-0000-0000-000000000006', 'TEST-MANAGERIAL', 'Managerial employee', 'Synthetic managerial employee classification.', 'draft', true, 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture value.', v_actor);

  insert into public.payroll_legal_engagements (
    id, code, name, description, payment_stream, is_employee,
    is_independent_contractor, approval_status, is_active, source_document_ref,
    source_version, approved_by_user_id, approved_at, approval_note, created_by_user_id
  ) values
    ('c3000000-0000-0000-0000-000000000001', 'TEST-EMPLOYEE-PAYROLL', 'Employee payroll engagement', 'Synthetic employee engagement for the payroll test fixtures.', 'employee_payroll', true, false, 'draft', true, 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture value.', v_actor),
    ('c3000000-0000-0000-0000-000000000002', 'TEST-INDEPENDENT-CONTRACTOR', 'Independent contractor engagement', 'Synthetic professional-fee engagement; never assigned to employee payroll.', 'professional_fee', false, true, 'draft', true, 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture value.', v_actor);

  insert into public.payroll_employment_statuses (
    id, code, name, description, approval_status, is_active,
    source_document_ref, source_version, approved_by_user_id, approved_at,
    approval_note, created_by_user_id
  ) values
    ('c4000000-0000-0000-0000-000000000001', 'TEST-REGULAR', 'Regular', 'Synthetic regular status.', 'draft', true, 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture value.', v_actor),
    ('c4000000-0000-0000-0000-000000000002', 'TEST-PROBATIONARY', 'Probationary', 'Synthetic probationary status.', 'draft', true, 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture value.', v_actor),
    ('c4000000-0000-0000-0000-000000000003', 'TEST-FIXED-TERM', 'Fixed-term', 'Synthetic fixed-term status.', 'draft', true, 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture value.', v_actor),
    ('c4000000-0000-0000-0000-000000000004', 'TEST-PART-TIME', 'Part-time', 'Synthetic part-time status.', 'draft', true, 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture value.', v_actor),
    ('c4000000-0000-0000-0000-000000000005', 'TEST-SEPARATED', 'Separated', 'Synthetic mid-period separation status.', 'draft', true, 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture value.', v_actor),
    ('c4000000-0000-0000-0000-000000000006', 'TEST-CONTRACTOR', 'Independent contractor', 'Synthetic contractor status for the separate fee stream.', 'draft', true, 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture value.', v_actor);

  insert into public.payroll_pay_bases (
    id, code, name, unit, description, approval_status, is_active,
    source_document_ref, source_version, approved_by_user_id, approved_at,
    approval_note, created_by_user_id
  ) values
    ('c5000000-0000-0000-0000-000000000001', 'TEST-MONTHLY', 'Monthly rate', 'monthly', 'Synthetic monthly pay basis.', 'draft', true, 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture value.', v_actor),
    ('c5000000-0000-0000-0000-000000000002', 'TEST-DAILY', 'Daily rate', 'daily', 'Synthetic daily pay basis.', 'draft', true, 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture value.', v_actor),
    ('c5000000-0000-0000-0000-000000000003', 'TEST-HOURLY', 'Hourly rate', 'hourly', 'Synthetic hourly pay basis.', 'draft', true, 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture value.', v_actor);

  update public.payroll_worker_classifications
  set approval_status = 'approved'
  where id in (
    'c2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000002',
    'c2000000-0000-0000-0000-000000000003', 'c2000000-0000-0000-0000-000000000004',
    'c2000000-0000-0000-0000-000000000005', 'c2000000-0000-0000-0000-000000000006'
  );
  update public.payroll_worker_classifications
  set approval_status = 'active'
  where id in (
    'c2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000002',
    'c2000000-0000-0000-0000-000000000003', 'c2000000-0000-0000-0000-000000000004',
    'c2000000-0000-0000-0000-000000000005', 'c2000000-0000-0000-0000-000000000006'
  );

  update public.payroll_legal_engagements
  set approval_status = 'approved'
  where id in ('c3000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000002');
  update public.payroll_legal_engagements
  set approval_status = 'active'
  where id in ('c3000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000002');

  update public.payroll_employment_statuses
  set approval_status = 'approved'
  where id in (
    'c4000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000002',
    'c4000000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000004',
    'c4000000-0000-0000-0000-000000000005', 'c4000000-0000-0000-0000-000000000006'
  );
  update public.payroll_employment_statuses
  set approval_status = 'active'
  where id in (
    'c4000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000002',
    'c4000000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000004',
    'c4000000-0000-0000-0000-000000000005', 'c4000000-0000-0000-0000-000000000006'
  );

  update public.payroll_pay_bases
  set approval_status = 'approved'
  where id in (
    'c5000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000002',
    'c5000000-0000-0000-0000-000000000003'
  );
  update public.payroll_pay_bases
  set approval_status = 'active'
  where id in (
    'c5000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000002',
    'c5000000-0000-0000-0000-000000000003'
  );

  insert into public.payroll_pay_components (
    id, component_code, component_name, description, component_type,
    payroll_stream, calculation_method, value_unit, tax_treatment,
    thirteenth_month_treatment, statutory_base_codes, payer_scope,
    recurrence_type, proration_method, deduction_priority,
    insufficient_net_pay_treatment, gl_expense_account_code,
    gl_liability_account_code, default_cost_center_code, legal_entity_id,
    payroll_group_id, effective_start_date, version, approval_status,
    is_active, source_document_ref, source_version, approved_by_user_id,
    approved_at, approval_note, created_by_user_id
  ) values
    ('c6000000-0000-0000-0000-000000000001', 'TEST-BASIC-MONTHLY', 'Test basic monthly pay', 'Synthetic monthly basic-pay component.', 'earning', 'employee_payroll', 'fixed_amount', 'currency_amount', 'rule_defined', 'included', array['basic_salary']::text[], 'employee', 'recurring', 'policy_defined', null, 'not_applicable', 'TEST-PAYROLL-EXPENSE', 'TEST-PAYROLL-LIABILITY', 'PAYROLL-QA', 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', '2026-01-01', 1, 'draft', true, 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture value.', v_actor),
    ('c6000000-0000-0000-0000-000000000002', 'TEST-BASIC-DAILY', 'Test basic daily pay', 'Synthetic daily basic-pay component.', 'earning', 'employee_payroll', 'unit_rate', 'rate', 'rule_defined', 'included', array['basic_salary']::text[], 'employee', 'recurring', 'policy_defined', null, 'not_applicable', 'TEST-PAYROLL-EXPENSE', 'TEST-PAYROLL-LIABILITY', 'PAYROLL-QA', 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', '2026-01-01', 1, 'draft', true, 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture value.', v_actor),
    ('c6000000-0000-0000-0000-000000000003', 'TEST-BASIC-HOURLY', 'Test basic hourly pay', 'Synthetic hourly basic-pay component.', 'earning', 'employee_payroll', 'unit_rate', 'rate', 'rule_defined', 'included', array['basic_salary']::text[], 'employee', 'recurring', 'policy_defined', null, 'not_applicable', 'TEST-PAYROLL-EXPENSE', 'TEST-PAYROLL-LIABILITY', 'PAYROLL-QA', 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', '2026-01-01', 1, 'draft', true, 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture value.', v_actor),
    ('c6000000-0000-0000-0000-000000000004', 'TEST-ALLOWANCE', 'Test allowance', 'Synthetic allowance component.', 'earning', 'employee_payroll', 'fixed_amount', 'currency_amount', 'rule_defined', 'excluded', array[]::text[], 'employee', 'recurring', 'policy_defined', null, 'not_applicable', 'TEST-PAYROLL-EXPENSE', 'TEST-PAYROLL-LIABILITY', 'PAYROLL-QA', 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', '2026-01-01', 1, 'draft', true, 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture value.', v_actor),
    ('c6000000-0000-0000-0000-000000000005', 'TEST-LOAN-DEDUCTION', 'Test loan deduction', 'Synthetic deduction component for insufficient-net-pay and final-balance tests.', 'employee_deduction', 'employee_payroll', 'fixed_amount', 'currency_amount', 'not_applicable', 'not_applicable', array[]::text[], 'employee', 'recurring', 'do_not_prorate', 50, 'carry_forward', 'TEST-PAYROLL-EXPENSE', 'TEST-PAYROLL-LIABILITY', 'PAYROLL-QA', 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', '2026-01-01', 1, 'draft', true, 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture value.', v_actor),
    ('c6000000-0000-0000-0000-000000000006', 'TEST-CONSULTING-FEE', 'Test professional consulting fee', 'Synthetic professional-fee component. It must remain outside employee compensation history.', 'earning', 'professional_fee', 'fixed_amount', 'currency_amount', 'rule_defined', 'not_applicable', array[]::text[], 'employee', 'recurring', 'policy_defined', null, 'not_applicable', 'TEST-PROFESSIONAL-FEE-EXPENSE', 'TEST-PROFESSIONAL-FEE-LIABILITY', 'PAYROLL-QA', 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', '2026-01-01', 1, 'draft', true, 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture value.', v_actor);

  update public.payroll_pay_components
  set approval_status = 'approved'
  where id in (
    'c6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000002',
    'c6000000-0000-0000-0000-000000000003', 'c6000000-0000-0000-0000-000000000004',
    'c6000000-0000-0000-0000-000000000005', 'c6000000-0000-0000-0000-000000000006'
  );
  update public.payroll_pay_components
  set approval_status = 'active'
  where id in (
    'c6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000002',
    'c6000000-0000-0000-0000-000000000003', 'c6000000-0000-0000-0000-000000000004',
    'c6000000-0000-0000-0000-000000000005', 'c6000000-0000-0000-0000-000000000006'
  );

  insert into public.payroll_worker_assignments (
    id, employee_id, payroll_group_id, worker_classification_id,
    legal_engagement_id, employment_status_id, pay_basis_id,
    position_title, effective_start_date, effective_end_date, version,
    record_status, source_document_ref, source_version, change_reason,
    approved_by_user_id, approved_at, approval_note
  ) values
    ('d1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000001', 'Regular Staff', '2026-01-01', null, 1, 'draft', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Create staging test worker assignment.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.'),
    ('d1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000002', 'c3000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000002', 'c5000000-0000-0000-0000-000000000001', 'Probationary Staff', '2026-01-01', null, 1, 'draft', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Create staging test worker assignment.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.'),
    ('d1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000003', 'b2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000002', 'Daily Staff', '2026-01-01', null, 1, 'draft', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Create staging test worker assignment.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.'),
    ('d1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000004', 'b2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000004', 'c3000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000004', 'c5000000-0000-0000-0000-000000000003', 'Part-time Staff', '2026-01-01', null, 1, 'draft', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Create staging test worker assignment.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.'),
    ('d1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000005', 'b2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000005', 'c3000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000003', 'c5000000-0000-0000-0000-000000000001', 'Project Staff', '2026-01-01', '2026-12-31', 1, 'draft', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Create staging test worker assignment.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.'),
    ('d1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000006', 'b2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000001', 'Mid-period Hire', '2026-08-18', null, 1, 'draft', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Create staging test worker assignment.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.'),
    ('d1000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000000007', 'b2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000001', 'Salary Change Staff', '2026-01-01', null, 1, 'draft', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Create staging test worker assignment.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.'),
    ('d1000000-0000-0000-0000-000000000008', 'a1000000-0000-0000-0000-000000000008', 'b2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000005', 'c5000000-0000-0000-0000-000000000001', 'Mid-period Separation', '2026-01-01', '2026-08-20', 1, 'draft', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Create staging test worker assignment.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.'),
    ('d1000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-000000000009', 'b2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000006', 'c3000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000001', 'Hybrid Employee / Consultant', '2026-01-01', null, 1, 'draft', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Create staging test worker assignment.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.');

  update public.payroll_worker_assignments
  set record_status = 'approved'
  where id in (
    'd1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002',
    'd1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000004',
    'd1000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000006',
    'd1000000-0000-0000-0000-000000000007', 'd1000000-0000-0000-0000-000000000008',
    'd1000000-0000-0000-0000-000000000009'
  );
  update public.payroll_worker_assignments
  set record_status = 'active'
  where id in (
    'd1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002',
    'd1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000004',
    'd1000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000006',
    'd1000000-0000-0000-0000-000000000007', 'd1000000-0000-0000-0000-000000000008',
    'd1000000-0000-0000-0000-000000000009'
  );

  insert into public.payroll_compensation_history (
    id, employee_id, worker_assignment_id, pay_component_id, amount,
    amount_unit, currency_code, effective_start_date, effective_end_date,
    version, record_status, change_type, is_retroactive, retro_pay_status,
    source_document_ref, source_version, change_reason, approved_by_user_id,
    approved_at, approval_note, created_by_user_id
  ) values
    ('d2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', 30000, 'monthly_rate', 'PHP', '2026-01-01', null, 1, 'draft', 'new_assignment', false, 'not_applicable', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Seed staging monthly basic pay.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.', v_actor),
    ('d2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000004', 2000, 'monthly_rate', 'PHP', '2026-01-01', null, 1, 'draft', 'component_change', false, 'not_applicable', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Seed staging allowance.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.', v_actor),
    ('d2000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000005', 3000, 'monthly_rate', 'PHP', '2026-01-01', null, 1, 'draft', 'component_change', false, 'not_applicable', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Seed staging loan deduction.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.', v_actor),
    ('d2000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000002', 'c6000000-0000-0000-0000-000000000001', 26000, 'monthly_rate', 'PHP', '2026-01-01', null, 1, 'draft', 'new_assignment', false, 'not_applicable', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Seed staging probationary basic pay.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.', v_actor),
    ('d2000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000002', 'c6000000-0000-0000-0000-000000000004', 1500, 'monthly_rate', 'PHP', '2026-01-01', null, 1, 'draft', 'component_change', false, 'not_applicable', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Seed staging allowance.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.', v_actor),
    ('d2000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000003', 'c6000000-0000-0000-0000-000000000002', 750, 'daily_rate', 'PHP', '2026-01-01', null, 1, 'draft', 'new_assignment', false, 'not_applicable', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Seed staging daily rate.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.', v_actor),
    ('d2000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000004', 'c6000000-0000-0000-0000-000000000003', 150, 'hourly_rate', 'PHP', '2026-01-01', null, 1, 'draft', 'new_assignment', false, 'not_applicable', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Seed staging hourly rate.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.', v_actor),
    ('d2000000-0000-0000-0000-000000000008', 'a1000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000005', 'c6000000-0000-0000-0000-000000000001', 45000, 'monthly_rate', 'PHP', '2026-01-01', '2026-12-31', 1, 'draft', 'new_assignment', false, 'not_applicable', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Seed staging fixed-term basic pay.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.', v_actor),
    ('d2000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000005', 'c6000000-0000-0000-0000-000000000004', 3000, 'monthly_rate', 'PHP', '2026-01-01', '2026-12-31', 1, 'draft', 'component_change', false, 'not_applicable', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Seed staging allowance.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.', v_actor),
    ('d2000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000006', 'd1000000-0000-0000-0000-000000000006', 'c6000000-0000-0000-0000-000000000001', 32000, 'monthly_rate', 'PHP', '2026-08-18', null, 1, 'draft', 'new_assignment', false, 'not_applicable', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Seed staging mid-period hire basic pay.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.', v_actor),
    ('d2000000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000007', 'd1000000-0000-0000-0000-000000000007', 'c6000000-0000-0000-0000-000000000001', 28000, 'monthly_rate', 'PHP', '2026-01-01', '2026-08-15', 1, 'draft', 'salary_change', false, 'not_applicable', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Seed pre-increase salary version.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.', v_actor),
    ('d2000000-0000-0000-0000-000000000012', 'a1000000-0000-0000-0000-000000000007', 'd1000000-0000-0000-0000-000000000007', 'c6000000-0000-0000-0000-000000000001', 35000, 'monthly_rate', 'PHP', '2026-08-15', null, 2, 'draft', 'salary_change', false, 'not_applicable', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Seed post-increase salary version.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.', v_actor),
    ('d2000000-0000-0000-0000-000000000013', 'a1000000-0000-0000-0000-000000000008', 'd1000000-0000-0000-0000-000000000008', 'c6000000-0000-0000-0000-000000000001', 38000, 'monthly_rate', 'PHP', '2026-01-01', '2026-08-20', 1, 'draft', 'termination', false, 'not_applicable', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Seed staging separated employee basic pay.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.', v_actor),
    ('d2000000-0000-0000-0000-000000000014', 'a1000000-0000-0000-0000-000000000009', 'd1000000-0000-0000-0000-000000000009', 'c6000000-0000-0000-0000-000000000001', 70000, 'monthly_rate', 'PHP', '2026-01-01', null, 1, 'draft', 'new_assignment', false, 'not_applicable', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Seed staging employee side of hybrid worker.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.', v_actor);

  update public.payroll_compensation_history
  set record_status = 'approved'
  where id in (
    'd2000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000002',
    'd2000000-0000-0000-0000-000000000003', 'd2000000-0000-0000-0000-000000000004',
    'd2000000-0000-0000-0000-000000000005', 'd2000000-0000-0000-0000-000000000006',
    'd2000000-0000-0000-0000-000000000007', 'd2000000-0000-0000-0000-000000000008',
    'd2000000-0000-0000-0000-000000000009', 'd2000000-0000-0000-0000-000000000010',
    'd2000000-0000-0000-0000-000000000011', 'd2000000-0000-0000-0000-000000000012',
    'd2000000-0000-0000-0000-000000000013', 'd2000000-0000-0000-0000-000000000014'
  );
  update public.payroll_compensation_history
  set record_status = 'active'
  where id in (
    'd2000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000002',
    'd2000000-0000-0000-0000-000000000003', 'd2000000-0000-0000-0000-000000000004',
    'd2000000-0000-0000-0000-000000000005', 'd2000000-0000-0000-0000-000000000006',
    'd2000000-0000-0000-0000-000000000007', 'd2000000-0000-0000-0000-000000000008',
    'd2000000-0000-0000-0000-000000000009', 'd2000000-0000-0000-0000-000000000010',
    'd2000000-0000-0000-0000-000000000011', 'd2000000-0000-0000-0000-000000000012',
    'd2000000-0000-0000-0000-000000000013', 'd2000000-0000-0000-0000-000000000014'
  );

  insert into public.payroll_shift_presets (
    id, preset_code, preset_name, description, shift_kind, timezone,
    scheduled_minutes, break_minutes, break_policy, legal_entity_id,
    payroll_group_id, effective_start_date, version, approval_status, is_active,
    source_document_ref, source_version, approved_by_user_id, approved_at,
    approval_note, created_by_user_id
  ) values
    ('c7000000-0000-0000-0000-000000000001', 'TEST-DAY-0900', 'Test day shift 09:00-18:00', 'Synthetic regular shift.', 'regular', 'Asia/Manila', 540, 60, '{"type":"moveable","minutes":60}'::jsonb, 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', '2026-01-01', 1, 'draft', true, 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture value.', v_actor),
    ('c7000000-0000-0000-0000-000000000002', 'TEST-NIGHT-2200', 'Test overnight shift 22:00-07:00', 'Synthetic overnight shift.', 'overnight', 'Asia/Manila', 540, 60, '{"type":"moveable","minutes":60}'::jsonb, 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', '2026-01-01', 1, 'draft', true, 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture value.', v_actor),
    ('c7000000-0000-0000-0000-000000000003', 'TEST-PART-1000', 'Test part-time shift 10:00-14:00', 'Synthetic part-time shift.', 'regular', 'Asia/Manila', 240, 0, '{"type":"none","minutes":0}'::jsonb, 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', '2026-01-01', 1, 'draft', true, 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture value.', v_actor),
    ('c7000000-0000-0000-0000-000000000004', 'TEST-SPLIT-0900', 'Test split shift 09:00-13:00 / 14:00-18:00', 'Synthetic split shift with a one-hour gap.', 'split', 'Asia/Manila', 480, 60, '{"type":"moveable","minutes":60}'::jsonb, 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', '2026-01-01', 1, 'draft', true, 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture value.', v_actor),
    ('c7000000-0000-0000-0000-000000000005', 'TEST-REST-1000', 'Test rest-day shift 10:00-14:00', 'Synthetic rest-day work shift.', 'rest_day', 'Asia/Manila', 240, 0, '{"type":"none","minutes":0}'::jsonb, 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', '2026-01-01', 1, 'draft', true, 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture value.', v_actor),
    ('c7000000-0000-0000-0000-000000000006', 'TEST-FLEX-0800', 'Test flexible shift 08:00-17:00', 'Synthetic flexible shift.', 'flexible', 'Asia/Manila', 540, 60, '{"type":"moveable","minutes":60}'::jsonb, 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', '2026-01-01', 1, 'draft', true, 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture value.', v_actor);

  insert into public.payroll_shift_preset_segments (
    id, shift_preset_id, segment_number, start_time, end_time,
    crosses_midnight, scheduled_minutes
  ) values
    ('c8000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000001', 1, '09:00'::time, '18:00'::time, false, 540),
    ('c8000000-0000-0000-0000-000000000002', 'c7000000-0000-0000-0000-000000000002', 1, '22:00'::time, '07:00'::time, true, 540),
    ('c8000000-0000-0000-0000-000000000003', 'c7000000-0000-0000-0000-000000000003', 1, '10:00'::time, '14:00'::time, false, 240),
    ('c8000000-0000-0000-0000-000000000004', 'c7000000-0000-0000-0000-000000000004', 1, '09:00'::time, '13:00'::time, false, 240),
    ('c8000000-0000-0000-0000-000000000005', 'c7000000-0000-0000-0000-000000000004', 2, '14:00'::time, '18:00'::time, false, 240),
    ('c8000000-0000-0000-0000-000000000006', 'c7000000-0000-0000-0000-000000000005', 1, '10:00'::time, '14:00'::time, false, 240),
    ('c8000000-0000-0000-0000-000000000007', 'c7000000-0000-0000-0000-000000000006', 1, '08:00'::time, '17:00'::time, false, 540);

  update public.payroll_shift_presets
  set approval_status = 'approved'
  where id in (
    'c7000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000002',
    'c7000000-0000-0000-0000-000000000003', 'c7000000-0000-0000-0000-000000000004',
    'c7000000-0000-0000-0000-000000000005', 'c7000000-0000-0000-0000-000000000006'
  );
  update public.payroll_shift_presets
  set approval_status = 'active'
  where id in (
    'c7000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000002',
    'c7000000-0000-0000-0000-000000000003', 'c7000000-0000-0000-0000-000000000004',
    'c7000000-0000-0000-0000-000000000005', 'c7000000-0000-0000-0000-000000000006'
  );

  insert into public.payroll_recurring_schedule_rules (
    id, employee_id, worker_assignment_id, shift_preset_id, day_of_week,
    effective_start_date, effective_end_date, version, record_status,
    source_document_ref, source_version, change_reason, approved_by_user_id,
    approved_at, approval_note, created_by_user_id
  ) values
    ('d3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000001', 2, '2026-01-01', null, 1, 'draft', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Seed staging Tuesday schedule rule.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.', v_actor),
    ('d3000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000002', 'c7000000-0000-0000-0000-000000000001', 3, '2026-01-01', null, 1, 'draft', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Seed staging Wednesday schedule rule.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.', v_actor),
    ('d3000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000003', 'c7000000-0000-0000-0000-000000000001', 4, '2026-01-01', null, 1, 'draft', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Seed staging Thursday schedule rule.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.', v_actor),
    ('d3000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000004', 'c7000000-0000-0000-0000-000000000003', 5, '2026-01-01', null, 1, 'draft', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Seed staging Friday schedule rule.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.', v_actor),
    ('d3000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000005', 'c7000000-0000-0000-0000-000000000005', 6, '2026-01-01', '2026-12-31', 1, 'draft', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Seed staging Saturday rest-day rule.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.', v_actor),
    ('d3000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000006', 'd1000000-0000-0000-0000-000000000006', 'c7000000-0000-0000-0000-000000000001', 2, '2026-08-18', null, 1, 'draft', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Seed staging Tuesday hire-date schedule rule.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.', v_actor),
    ('d3000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000000007', 'd1000000-0000-0000-0000-000000000007', 'c7000000-0000-0000-0000-000000000004', 5, '2026-01-01', null, 1, 'draft', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Seed staging Friday split-shift rule.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.', v_actor),
    ('d3000000-0000-0000-0000-000000000008', 'a1000000-0000-0000-0000-000000000008', 'd1000000-0000-0000-0000-000000000008', 'c7000000-0000-0000-0000-000000000002', 3, '2026-01-01', '2026-08-20', 1, 'draft', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Seed staging Wednesday overnight rule.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.', v_actor),
    ('d3000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-000000000009', 'd1000000-0000-0000-0000-000000000009', 'c7000000-0000-0000-0000-000000000006', 2, '2026-01-01', null, 1, 'draft', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Seed staging Tuesday no-show schedule rule.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.', v_actor);

  update public.payroll_recurring_schedule_rules
  set record_status = 'approved'
  where id in (
    'd3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000002',
    'd3000000-0000-0000-0000-000000000003', 'd3000000-0000-0000-0000-000000000004',
    'd3000000-0000-0000-0000-000000000005', 'd3000000-0000-0000-0000-000000000006',
    'd3000000-0000-0000-0000-000000000007', 'd3000000-0000-0000-0000-000000000008',
    'd3000000-0000-0000-0000-000000000009'
  );
  update public.payroll_recurring_schedule_rules
  set record_status = 'active'
  where id in (
    'd3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000002',
    'd3000000-0000-0000-0000-000000000003', 'd3000000-0000-0000-0000-000000000004',
    'd3000000-0000-0000-0000-000000000005', 'd3000000-0000-0000-0000-000000000006',
    'd3000000-0000-0000-0000-000000000007', 'd3000000-0000-0000-0000-000000000008',
    'd3000000-0000-0000-0000-000000000009'
  );

  insert into public.payroll_employee_schedules (
    id, employee_id, worker_assignment_id, shift_preset_id, shift_date,
    recurring_rule_id, schedule_source, is_override, version, record_status,
    source_document_ref, source_version, change_reason, approved_by_user_id,
    approved_at, approval_note, created_by_user_id
  ) values
    ('d4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000001', '2026-08-11', 'd3000000-0000-0000-0000-000000000001', 'recurring', false, 1, 'draft', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Seed staging attendance schedule.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.', v_actor),
    ('d4000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000002', 'c7000000-0000-0000-0000-000000000001', '2026-08-12', 'd3000000-0000-0000-0000-000000000002', 'recurring', false, 1, 'draft', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Seed staging attendance schedule.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.', v_actor),
    ('d4000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000003', 'c7000000-0000-0000-0000-000000000001', '2026-08-13', 'd3000000-0000-0000-0000-000000000003', 'recurring', false, 1, 'draft', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Seed staging attendance schedule.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.', v_actor),
    ('d4000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000004', 'c7000000-0000-0000-0000-000000000003', '2026-08-14', 'd3000000-0000-0000-0000-000000000004', 'recurring', false, 1, 'draft', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Seed staging attendance schedule.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.', v_actor),
    ('d4000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000005', 'c7000000-0000-0000-0000-000000000005', '2026-08-15', 'd3000000-0000-0000-0000-000000000005', 'recurring', false, 1, 'draft', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Seed staging attendance schedule.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.', v_actor),
    ('d4000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000006', 'd1000000-0000-0000-0000-000000000006', 'c7000000-0000-0000-0000-000000000001', '2026-08-18', 'd3000000-0000-0000-0000-000000000006', 'recurring', false, 1, 'draft', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Seed staging attendance schedule.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.', v_actor),
    ('d4000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000000007', 'd1000000-0000-0000-0000-000000000007', 'c7000000-0000-0000-0000-000000000004', '2026-08-14', 'd3000000-0000-0000-0000-000000000007', 'recurring', false, 1, 'draft', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Seed staging attendance schedule.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.', v_actor),
    ('d4000000-0000-0000-0000-000000000008', 'a1000000-0000-0000-0000-000000000008', 'd1000000-0000-0000-0000-000000000008', 'c7000000-0000-0000-0000-000000000002', '2026-08-19', 'd3000000-0000-0000-0000-000000000008', 'recurring', false, 1, 'draft', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Seed staging attendance schedule.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.', v_actor),
    ('d4000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-000000000009', 'd1000000-0000-0000-0000-000000000009', 'c7000000-0000-0000-0000-000000000006', '2026-08-11', 'd3000000-0000-0000-0000-000000000009', 'recurring', false, 1, 'draft', 'PAYROLL-STAGING-TEST-FIXTURE-v1', 'fixture-v1', 'Seed staging attendance schedule for no-show test.', v_actor, '2026-09-05 09:00:00+08', 'Staging-only fixture approval.', v_actor);

  update public.payroll_employee_schedules
  set record_status = 'approved'
  where id in (
    'd4000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000002',
    'd4000000-0000-0000-0000-000000000003', 'd4000000-0000-0000-0000-000000000004',
    'd4000000-0000-0000-0000-000000000005', 'd4000000-0000-0000-0000-000000000006',
    'd4000000-0000-0000-0000-000000000007', 'd4000000-0000-0000-0000-000000000008',
    'd4000000-0000-0000-0000-000000000009'
  );
  update public.payroll_employee_schedules
  set record_status = 'active'
  where id in (
    'd4000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000002',
    'd4000000-0000-0000-0000-000000000003', 'd4000000-0000-0000-0000-000000000004',
    'd4000000-0000-0000-0000-000000000005', 'd4000000-0000-0000-0000-000000000006',
    'd4000000-0000-0000-0000-000000000007', 'd4000000-0000-0000-0000-000000000008',
    'd4000000-0000-0000-0000-000000000009'
  );

  insert into public.payroll_attendance_rule_sets (
    id, rule_code, rule_name, description, timezone, legal_entity_id,
    payroll_group_id, effective_start_date, version, approval_status, is_active,
    grace_period_minutes, no_show_buffer_minutes, meal_break_minutes,
    meal_break_policy, rounding_policy, early_clock_in_policy,
    late_clock_out_policy, missing_punch_policy, source_document_ref,
    source_version, test_scenario_version, approved_by_user_id, approved_at,
    approval_note, created_by_user_id
  ) values (
    'b5000000-0000-0000-0000-000000000001',
    'PAYROLL-TEST-ATTENDANCE',
    'Staging attendance rule - test only',
    'Synthetic test rule using the requested five-minute grace period and one-hour moveable meal break. Not a production policy.',
    'Asia/Manila',
    'b1000000-0000-0000-0000-000000000001',
    'b2000000-0000-0000-0000-000000000001',
    '2026-01-01',
    1,
    'draft',
    true,
    5,
    15,
    60,
    '{"type":"moveable","anchor":"half_shift","paid":false}'::jsonb,
    '{"money":"half_up","minutes":"exact"}'::jsonb,
    'review',
    'review',
    'needs_review',
    'PAYROLL-STAGING-TEST-FIXTURE-v1',
    'fixture-v1',
    'attendance-fixture-v1',
    v_actor,
    '2026-09-05 09:00:00+08',
    'Staging-only fixture approval; not an approved production policy.',
    v_actor
  );

  update public.payroll_attendance_rule_sets
  set approval_status = 'approved'
  where id = 'b5000000-0000-0000-0000-000000000001';
  update public.payroll_attendance_rule_sets
  set approval_status = 'active'
  where id = 'b5000000-0000-0000-0000-000000000001';

  insert into public.payroll_time_ingestion_batches (
    id, source_type, source_system, source_batch_key, source_timezone,
    status, total_received, total_accepted, total_rejected, total_duplicates,
    manifest
  ) values (
    'e1000000-0000-0000-0000-000000000001',
    'import',
    'PAYROLL_TEST_FIXTURE',
    'PAYROLL-TEST-ATTENDANCE-2026-08-11-25',
    'Asia/Manila',
    'received',
    19,
    18,
    0,
    1,
    jsonb_build_object('fixture_version', 'v1', 'purpose', 'attendance-engine-test', 'production_data', false)
  );

  insert into public.payroll_raw_time_events (
    id, ingestion_batch_id, employee_id, source_employee_ref, source_type,
    source_system, source_event_id, idempotency_key, event_kind, work_context,
    submission_mode, event_occurred_at, source_timestamp_text, event_timezone,
    device_clock_offset_seconds, device_id, raw_payload, location_capture_mode,
    event_status, is_duplicate, duplicate_of_event_id
  ) values
    ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'TEST-PAY-001', 'import', 'PAYROLL_TEST_FIXTURE', 'TEST-001-IN', 'PAYROLL-TEST-001-IN', 'clock_in', 'onsite', 'batch', '2026-08-11 09:00:00+08', '2026-08-11 09:00:00', 'Asia/Manila', 0, 'TEST-DEVICE-01', jsonb_build_object('fixture_code', 'PAYROLL-TEST-01', 'synthetic', true), 'none', 'received', false, null),
    ('e2000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'TEST-PAY-001', 'import', 'PAYROLL_TEST_FIXTURE', 'TEST-001-OUT', 'PAYROLL-TEST-001-OUT', 'clock_out', 'onsite', 'batch', '2026-08-11 18:00:00+08', '2026-08-11 18:00:00', 'Asia/Manila', 0, 'TEST-DEVICE-01', jsonb_build_object('fixture_code', 'PAYROLL-TEST-01', 'synthetic', true), 'none', 'received', false, null),
    ('e2000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'TEST-PAY-002', 'import', 'PAYROLL_TEST_FIXTURE', 'TEST-002-IN', 'PAYROLL-TEST-002-IN', 'clock_in', 'onsite', 'batch', '2026-08-12 09:05:00+08', '2026-08-12 09:05:00', 'Asia/Manila', 0, 'TEST-DEVICE-01', jsonb_build_object('fixture_code', 'PAYROLL-TEST-02', 'synthetic', true, 'expected', 'grace_boundary'), 'none', 'received', false, null),
    ('e2000000-0000-0000-0000-000000000004', 'e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'TEST-PAY-002', 'import', 'PAYROLL_TEST_FIXTURE', 'TEST-002-IN-DUP', 'PAYROLL-TEST-002-IN-DUP', 'clock_in', 'onsite', 'batch', '2026-08-12 09:05:02+08', '2026-08-12 09:05:02', 'Asia/Manila', 0, 'TEST-DEVICE-01', jsonb_build_object('fixture_code', 'PAYROLL-TEST-02', 'synthetic', true, 'expected', 'duplicate'), 'none', 'duplicate', true, 'e2000000-0000-0000-0000-000000000003'),
    ('e2000000-0000-0000-0000-000000000005', 'e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'TEST-PAY-002', 'import', 'PAYROLL_TEST_FIXTURE', 'TEST-002-OUT', 'PAYROLL-TEST-002-OUT', 'clock_out', 'onsite', 'batch', '2026-08-12 18:00:00+08', '2026-08-12 18:00:00', 'Asia/Manila', 0, 'TEST-DEVICE-01', jsonb_build_object('fixture_code', 'PAYROLL-TEST-02', 'synthetic', true), 'none', 'received', false, null),
    ('e2000000-0000-0000-0000-000000000006', 'e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 'TEST-PAY-003', 'import', 'PAYROLL_TEST_FIXTURE', 'TEST-003-IN', 'PAYROLL-TEST-003-IN', 'clock_in', 'onsite', 'batch', '2026-08-13 09:20:00+08', '2026-08-13 09:20:00', 'Asia/Manila', 0, 'TEST-DEVICE-01', jsonb_build_object('fixture_code', 'PAYROLL-TEST-03', 'synthetic', true), 'none', 'received', false, null),
    ('e2000000-0000-0000-0000-000000000007', 'e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 'TEST-PAY-003', 'import', 'PAYROLL_TEST_FIXTURE', 'TEST-003-OUT', 'PAYROLL-TEST-003-OUT', 'clock_out', 'onsite', 'batch', '2026-08-13 17:50:00+08', '2026-08-13 17:50:00', 'Asia/Manila', 0, 'TEST-DEVICE-01', jsonb_build_object('fixture_code', 'PAYROLL-TEST-03', 'synthetic', true), 'none', 'received', false, null),
    ('e2000000-0000-0000-0000-000000000008', 'e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000004', 'TEST-PAY-004', 'import', 'PAYROLL_TEST_FIXTURE', 'TEST-004-IN', 'PAYROLL-TEST-004-IN', 'clock_in', 'work_from_home', 'batch', '2026-08-14 10:00:00+08', '2026-08-14 10:00:00', 'Asia/Manila', 0, 'TEST-DEVICE-02', jsonb_build_object('fixture_code', 'PAYROLL-TEST-04', 'synthetic', true, 'work_context', 'work_from_home'), 'none', 'received', false, null),
    ('e2000000-0000-0000-0000-000000000009', 'e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000004', 'TEST-PAY-004', 'import', 'PAYROLL_TEST_FIXTURE', 'TEST-004-OUT', 'PAYROLL-TEST-004-OUT', 'clock_out', 'work_from_home', 'batch', '2026-08-14 13:00:00+08', '2026-08-14 13:00:00', 'Asia/Manila', 0, 'TEST-DEVICE-02', jsonb_build_object('fixture_code', 'PAYROLL-TEST-04', 'synthetic', true, 'work_context', 'work_from_home'), 'none', 'received', false, null),
    ('e2000000-0000-0000-0000-000000000010', 'e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000005', 'TEST-PAY-005', 'import', 'PAYROLL_TEST_FIXTURE', 'TEST-005-IN', 'PAYROLL-TEST-005-IN', 'clock_in', 'onsite', 'batch', '2026-08-15 10:00:00+08', '2026-08-15 10:00:00', 'Asia/Manila', 0, 'TEST-DEVICE-02', jsonb_build_object('fixture_code', 'PAYROLL-TEST-05', 'synthetic', true, 'shift_kind', 'rest_day'), 'none', 'received', false, null),
    ('e2000000-0000-0000-0000-000000000011', 'e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000005', 'TEST-PAY-005', 'import', 'PAYROLL_TEST_FIXTURE', 'TEST-005-OUT', 'PAYROLL-TEST-005-OUT', 'clock_out', 'onsite', 'batch', '2026-08-15 14:00:00+08', '2026-08-15 14:00:00', 'Asia/Manila', 0, 'TEST-DEVICE-02', jsonb_build_object('fixture_code', 'PAYROLL-TEST-05', 'synthetic', true, 'shift_kind', 'rest_day'), 'none', 'received', false, null),
    ('e2000000-0000-0000-0000-000000000012', 'e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000006', 'TEST-PAY-006', 'import', 'PAYROLL_TEST_FIXTURE', 'TEST-006-IN', 'PAYROLL-TEST-006-IN', 'clock_in', 'onsite', 'sync', '2026-08-18 09:07:00+08', '2026-08-18 09:07:00', 'Asia/Manila', 120, 'TEST-OFFLINE-01', jsonb_build_object('fixture_code', 'PAYROLL-TEST-06', 'synthetic', true, 'submission_mode', 'sync'), 'none', 'received', false, null),
    ('e2000000-0000-0000-0000-000000000013', 'e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000006', 'TEST-PAY-006', 'import', 'PAYROLL_TEST_FIXTURE', 'TEST-006-OUT', 'PAYROLL-TEST-006-OUT', 'clock_out', 'onsite', 'sync', '2026-08-18 18:15:00+08', '2026-08-18 18:15:00', 'Asia/Manila', 120, 'TEST-OFFLINE-01', jsonb_build_object('fixture_code', 'PAYROLL-TEST-06', 'synthetic', true, 'submission_mode', 'sync'), 'none', 'received', false, null),
    ('e2000000-0000-0000-0000-000000000014', 'e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000007', 'TEST-PAY-007', 'import', 'PAYROLL_TEST_FIXTURE', 'TEST-007-IN', 'PAYROLL-TEST-007-IN', 'clock_in', 'onsite', 'batch', '2026-08-14 09:00:00+08', '2026-08-14 09:00:00', 'Asia/Manila', 0, 'TEST-DEVICE-03', jsonb_build_object('fixture_code', 'PAYROLL-TEST-07', 'synthetic', true, 'shift_kind', 'split'), 'none', 'received', false, null),
    ('e2000000-0000-0000-0000-000000000015', 'e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000007', 'TEST-PAY-007', 'import', 'PAYROLL_TEST_FIXTURE', 'TEST-007-BREAK-START', 'PAYROLL-TEST-007-BREAK-START', 'break_start', 'onsite', 'batch', '2026-08-14 13:00:00+08', '2026-08-14 13:00:00', 'Asia/Manila', 0, 'TEST-DEVICE-03', jsonb_build_object('fixture_code', 'PAYROLL-TEST-07', 'synthetic', true, 'shift_kind', 'split'), 'none', 'received', false, null),
    ('e2000000-0000-0000-0000-000000000016', 'e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000007', 'TEST-PAY-007', 'import', 'PAYROLL_TEST_FIXTURE', 'TEST-007-BREAK-END', 'PAYROLL-TEST-007-BREAK-END', 'break_end', 'onsite', 'batch', '2026-08-14 14:00:00+08', '2026-08-14 14:00:00', 'Asia/Manila', 0, 'TEST-DEVICE-03', jsonb_build_object('fixture_code', 'PAYROLL-TEST-07', 'synthetic', true, 'shift_kind', 'split'), 'none', 'received', false, null),
    ('e2000000-0000-0000-0000-000000000017', 'e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000007', 'TEST-PAY-007', 'import', 'PAYROLL_TEST_FIXTURE', 'TEST-007-OUT', 'PAYROLL-TEST-007-OUT', 'clock_out', 'onsite', 'batch', '2026-08-14 18:00:00+08', '2026-08-14 18:00:00', 'Asia/Manila', 0, 'TEST-DEVICE-03', jsonb_build_object('fixture_code', 'PAYROLL-TEST-07', 'synthetic', true, 'shift_kind', 'split'), 'none', 'received', false, null),
    ('e2000000-0000-0000-0000-000000000018', 'e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000008', 'TEST-PAY-008', 'import', 'PAYROLL_TEST_FIXTURE', 'TEST-008-IN', 'PAYROLL-TEST-008-IN', 'clock_in', 'onsite', 'batch', '2026-08-19 22:00:00+08', '2026-08-19 22:00:00', 'Asia/Manila', 0, 'TEST-NIGHT-01', jsonb_build_object('fixture_code', 'PAYROLL-TEST-08', 'synthetic', true, 'shift_kind', 'overnight'), 'none', 'received', false, null),
    ('e2000000-0000-0000-0000-000000000019', 'e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000008', 'TEST-PAY-008', 'import', 'PAYROLL_TEST_FIXTURE', 'TEST-008-OUT', 'PAYROLL-TEST-008-OUT', 'clock_out', 'onsite', 'batch', '2026-08-20 07:00:00+08', '2026-08-20 07:00:00', 'Asia/Manila', 0, 'TEST-NIGHT-01', jsonb_build_object('fixture_code', 'PAYROLL-TEST-08', 'synthetic', true, 'shift_kind', 'overnight'), 'none', 'received', false, null);

  update public.payroll_time_ingestion_batches
  set status = 'processed'
  where id = 'e1000000-0000-0000-0000-000000000001';

  if (select count(*) from public.payroll_test_employee_fixtures) <> 10 then
    raise exception 'The payroll staging fixture must contain exactly 10 scenario rows.' using errcode = '23514';
  end if;

  if (select count(*) from public.payroll_worker_assignments where id::text like 'd1000000-%') <> 9 then
    raise exception 'The payroll staging fixture must contain nine employee-payroll assignments.' using errcode = '23514';
  end if;

  if (select count(*) from public.payroll_compensation_history where id::text like 'd2000000-%') <> 14 then
    raise exception 'The payroll staging fixture must contain fourteen employee compensation rows.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.payroll_compensation_history ch
    join public.payroll_pay_components pc on pc.id = ch.pay_component_id
    where ch.id::text like 'd2000000-%'
      and pc.payroll_stream <> 'employee_payroll'
  ) then
    raise exception 'Professional-fee components must not be inserted into employee compensation history.' using errcode = '23514';
  end if;

  if (select count(*) from public.payroll_raw_time_events where id::text like 'e2000000-%') <> 19 then
    raise exception 'The payroll staging fixture must contain nineteen raw attendance events.' using errcode = '23514';
  end if;
end;
$phase1mock$;
