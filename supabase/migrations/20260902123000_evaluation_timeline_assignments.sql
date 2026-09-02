-- Connect calendar-backed evaluation timelines to evaluation creation and
-- materialize one durable assignment per selected employee. Existing cycles,
-- submissions, timelines, and audit history remain in place.

alter table public.evaluation_timelines
  drop constraint if exists evaluation_timelines_type_check;

alter table public.evaluation_timelines
  add constraint evaluation_timelines_type_check
  check (type in ('Monthly', 'Quarterly', 'Onboarding', 'Annual', 'Custom'));

-- Repair the known monthly review timeline without replacing its id or dates.
update public.evaluation_timelines
set type = 'Monthly'
where type = 'Onboarding'
  and lower(name) ~ '(monthly.*performance|performance.*monthly)';

create unique index if not exists evaluation_timelines_calendar_period_uidx
  on public.evaluation_timelines (lower(type), rollout_date, end_date)
  where type in ('Monthly', 'Quarterly', 'Annual', 'Onboarding');

create or replace function public.ensure_evaluation_calendar_periods(p_year integer)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  month_number integer;
  period_start date;
  period_end date;
  current_year integer := extract(year from current_date)::integer;
begin
  if not (select public.is_hr_or_admin()) then
    raise exception 'You do not have permission to manage evaluation timelines.';
  end if;

  if p_year < current_year - 25 or p_year > current_year + 5 then
    raise exception 'Evaluation year is outside the supported range.';
  end if;

  perform pg_advisory_xact_lock(hashtext('evaluation-calendar-periods'), p_year);

  for month_number in 1..12 loop
    period_start := make_date(p_year, month_number, 1);
    period_end := (period_start + interval '1 month - 1 day')::date;

    insert into public.evaluation_timelines(name, type, rollout_date, end_date, status)
    select to_char(period_start, 'FMMonth YYYY'), 'Monthly', period_start, period_end, 'Active'
    where not exists (
      select 1
      from public.evaluation_timelines timeline
      where lower(timeline.type) = 'monthly'
        and timeline.rollout_date = period_start
        and timeline.end_date = period_end
    );
  end loop;

  for month_number in 0..3 loop
    period_start := make_date(p_year, 1 + (month_number * 3), 1);
    period_end := (period_start + interval '3 months - 1 day')::date;

    insert into public.evaluation_timelines(name, type, rollout_date, end_date, status)
    select format('Q%s %s', month_number + 1, p_year), 'Quarterly', period_start, period_end, 'Active'
    where not exists (
      select 1
      from public.evaluation_timelines timeline
      where lower(timeline.type) = 'quarterly'
        and timeline.rollout_date = period_start
        and timeline.end_date = period_end
    );
  end loop;

  period_start := make_date(p_year, 1, 1);
  period_end := make_date(p_year, 12, 31);

  insert into public.evaluation_timelines(name, type, rollout_date, end_date, status)
  select format('Annual Review %s', p_year), 'Annual', period_start, period_end, 'Active'
  where not exists (
    select 1
    from public.evaluation_timelines timeline
    where lower(timeline.type) = 'annual'
      and timeline.rollout_date = period_start
      and timeline.end_date = period_end
  );

  insert into public.evaluation_timelines(name, type, rollout_date, end_date, status)
  select format('Onboarding %s', p_year), 'Onboarding', period_start, period_end, 'Active'
  where not exists (
    select 1
    from public.evaluation_timelines timeline
    where lower(timeline.type) = 'onboarding'
      and timeline.rollout_date = period_start
      and timeline.end_date = period_end
  );
end;
$$;

revoke all on function public.ensure_evaluation_calendar_periods(integer) from public, anon;
grant execute on function public.ensure_evaluation_calendar_periods(integer) to authenticated;

alter table public.evaluations
  add column if not exists request_key text;

create unique index if not exists evaluations_creator_request_key_uidx
  on public.evaluations(created_by, request_key)
  where request_key is not null;

create table if not exists public.evaluation_assignments (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  employee_id uuid not null references public.hris_users(id),
  timeline_id uuid references public.evaluation_timelines(id) on delete set null,
  question_set_ids uuid[] not null default '{}'::uuid[],
  evaluator_config jsonb not null default '[]'::jsonb,
  evaluator_user_ids uuid[] not null default '{}'::uuid[],
  due_date date,
  status text not null default 'Pending' check (status in ('Pending', 'Completed', 'Cancelled')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (evaluation_id, employee_id)
);

create index if not exists evaluation_assignments_employee_status_idx
  on public.evaluation_assignments(employee_id, status, due_date);

create index if not exists evaluation_assignments_evaluator_users_idx
  on public.evaluation_assignments using gin(evaluator_user_ids);

alter table public.evaluation_assignments enable row level security;
grant select, insert, update, delete on public.evaluation_assignments to authenticated;

drop policy if exists evaluation_assignments_scoped_select on public.evaluation_assignments;
create policy evaluation_assignments_scoped_select
  on public.evaluation_assignments
  for select to authenticated
  using (
    (select public.is_hr_or_admin())
    or employee_id = (select public.current_hris_user_id())
    or evaluator_user_ids @> array[(select public.current_hris_user_id())]
  );

drop policy if exists evaluation_assignments_hr_insert on public.evaluation_assignments;
create policy evaluation_assignments_hr_insert
  on public.evaluation_assignments
  for insert to authenticated
  with check ((select public.is_hr_or_admin()));

drop policy if exists evaluation_assignments_hr_update on public.evaluation_assignments;
create policy evaluation_assignments_hr_update
  on public.evaluation_assignments
  for update to authenticated
  using ((select public.is_hr_or_admin()))
  with check ((select public.is_hr_or_admin()));

drop policy if exists evaluation_assignments_hr_delete on public.evaluation_assignments;
create policy evaluation_assignments_hr_delete
  on public.evaluation_assignments
  for delete to authenticated
  using ((select public.is_hr_or_admin()));

-- Targets must be able to see an in-progress cycle and its evaluator
-- configuration, but result visibility remains controlled by
-- evaluations.is_employee_visible in the result page.
create or replace function private.is_current_user_evaluation_target(p_evaluation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.evaluations evaluation
    where evaluation.id = p_evaluation_id
      and (select public.current_hris_user_id()) = any(evaluation.target_employee_ids)
  );
$$;

revoke all on function private.is_current_user_evaluation_target(uuid) from public, anon, authenticated;
grant execute on function private.is_current_user_evaluation_target(uuid) to authenticated;

create or replace function private.can_current_user_access_evaluation(p_evaluation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select public.is_hr_or_admin())
    or (select public.is_manager_or_above())
    or exists (
      select 1
      from public.evaluations evaluation
      where evaluation.id = p_evaluation_id
        and (select public.current_hris_user_id()) = any(evaluation.target_employee_ids)
    )
    or exists (
      select 1
      from public.evaluation_evaluators assignment
      left join public.hris_users current_user_profile
        on current_user_profile.id = (select public.current_hris_user_id())
       and lower(current_user_profile.status) = 'active'
      where assignment.evaluation_id = p_evaluation_id
        and (
          (lower(assignment.type) = 'individual' and assignment.user_id = current_user_profile.id)
          or (
            lower(assignment.type) = 'group'
            and (assignment.business_unit_id is null or assignment.business_unit_id = current_user_profile.business_unit_id)
            and (assignment.department_id is null or assignment.department_id = current_user_profile.department_id)
          )
        )
    );
$$;

revoke all on function private.can_current_user_access_evaluation(uuid) from public, anon, authenticated;
grant execute on function private.can_current_user_access_evaluation(uuid) to authenticated;

drop policy if exists evaluations_scoped_select on public.evaluations;
create policy evaluations_scoped_select
  on public.evaluations
  for select to authenticated
  using ((select private.can_current_user_access_evaluation(id)));

drop policy if exists evaluation_evaluators_scoped_select on public.evaluation_evaluators;
create policy evaluation_evaluators_scoped_select
  on public.evaluation_evaluators
  for select to authenticated
  using (
    (select public.is_hr_or_admin())
    or user_id = (select public.current_hris_user_id())
    or (select private.is_current_user_evaluation_target(evaluation_id))
    or (
      lower(type) = 'group'
      and exists (
        select 1
        from public.hris_users current_user_profile
        where current_user_profile.id = (select public.current_hris_user_id())
          and lower(current_user_profile.status) = 'active'
          and (evaluation_evaluators.business_unit_id is null or evaluation_evaluators.business_unit_id = current_user_profile.business_unit_id)
          and (evaluation_evaluators.department_id is null or evaluation_evaluators.department_id = current_user_profile.department_id)
      )
    )
  );

-- Backfill one assignment for every employee in every existing cycle.
with evaluator_snapshots as (
  select
    evaluation.id as evaluation_id,
    subject.id as employee_id,
    coalesce(jsonb_agg(jsonb_build_object(
      'type', evaluator.type,
      'weight', evaluator.weight,
      'user_id', evaluator.user_id,
      'business_unit_id', evaluator.business_unit_id,
      'department_id', evaluator.department_id,
      'is_anonymous', evaluator.is_anonymous,
      'exclude_subject', evaluator.exclude_subject
    )) filter (where evaluator.evaluation_id is not null), '[]'::jsonb) as evaluator_config,
    coalesce(array_agg(distinct eligible_user.id) filter (where eligible_user.id is not null), '{}'::uuid[]) as evaluator_user_ids
  from public.evaluations evaluation
  cross join lateral unnest(evaluation.target_employee_ids) subject(id)
  left join public.evaluation_evaluators evaluator on evaluator.evaluation_id = evaluation.id
  left join public.hris_users eligible_user
    on lower(eligible_user.status) = 'active'
   and (
     (lower(evaluator.type) = 'individual' and eligible_user.id = evaluator.user_id)
     or (
       lower(evaluator.type) = 'group'
       and (evaluator.business_unit_id is null or eligible_user.business_unit_id = evaluator.business_unit_id)
       and (evaluator.department_id is null or eligible_user.department_id = evaluator.department_id)
       and not (coalesce(evaluator.exclude_subject, true) and eligible_user.id = subject.id)
     )
   )
  group by evaluation.id, subject.id
)
insert into public.evaluation_assignments(
  evaluation_id, employee_id, timeline_id, question_set_ids,
  evaluator_config, evaluator_user_ids, due_date, status, completed_at, created_at
)
select
  evaluation.id,
  snapshot.employee_id,
  evaluation.timeline_id,
  evaluation.question_set_ids,
  snapshot.evaluator_config,
  snapshot.evaluator_user_ids,
  evaluation.due_date,
  case when self_submission.submitted_at is null then 'Pending' else 'Completed' end,
  self_submission.submitted_at,
  evaluation.created_at
from public.evaluations evaluation
join evaluator_snapshots snapshot on snapshot.evaluation_id = evaluation.id
left join lateral (
  select max(submission.submitted_at) as submitted_at
  from public.evaluation_submissions submission
  where submission.evaluation_id = evaluation.id
    and submission.subject_employee_id = snapshot.employee_id
    and submission.rater_id = snapshot.employee_id
) self_submission on true
on conflict (evaluation_id, employee_id) do nothing;

create or replace function private.sync_evaluation_assignment_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.rater_id = new.subject_employee_id then
    update public.evaluation_assignments
    set status = 'Completed', completed_at = coalesce(new.submitted_at, now())
    where evaluation_id = new.evaluation_id
      and employee_id = new.subject_employee_id
      and status = 'Pending';
  end if;
  return new;
end;
$$;

revoke all on function private.sync_evaluation_assignment_completion() from public, anon, authenticated;
drop trigger if exists sync_evaluation_assignment_completion on public.evaluation_submissions;
create trigger sync_evaluation_assignment_completion
after insert or update of submitted_at on public.evaluation_submissions
for each row execute function private.sync_evaluation_assignment_completion();

-- Replace the cycle creator with an idempotent version that creates subject
-- assignments and both subject/evaluator notifications in one transaction.
drop function if exists public.create_evaluation_cycle(text, uuid, uuid[], uuid[], uuid[], date, jsonb);

create or replace function public.create_evaluation_cycle(
  p_name text,
  p_timeline_id uuid,
  p_target_business_unit_ids uuid[],
  p_target_employee_ids uuid[],
  p_question_set_ids uuid[],
  p_due_date date,
  p_evaluators jsonb,
  p_request_key text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created_evaluation_id uuid;
  existing_evaluation_id uuid;
  normalized_target_ids uuid[];
  evaluator jsonb;
  evaluator_type text;
  evaluator_weight integer;
  evaluator_user_id uuid;
  evaluator_business_unit_id uuid;
  evaluator_department_id uuid;
  evaluator_count integer;
  total_weight integer;
  creator_id uuid := (select public.current_hris_user_id());
begin
  if creator_id is null then
    raise exception 'An active HRIS account is required.';
  end if;

  if not (select public.is_hr_or_admin()) then
    raise exception 'You do not have permission to create evaluations.';
  end if;

  if nullif(btrim(p_request_key), '') is not null then
    select evaluation.id into existing_evaluation_id
    from public.evaluations evaluation
    where evaluation.created_by = creator_id
      and evaluation.request_key = btrim(p_request_key);
    if existing_evaluation_id is not null then
      return existing_evaluation_id;
    end if;
  end if;

  if nullif(btrim(p_name), '') is null then raise exception 'Evaluation name is required.'; end if;
  if p_due_date is null then raise exception 'Evaluation deadline is required.'; end if;
  if p_timeline_id is null or not exists (select 1 from public.evaluation_timelines where id = p_timeline_id) then
    raise exception 'A valid evaluation timeline is required.';
  end if;

  select array_agg(distinct target_id order by target_id)
  into normalized_target_ids
  from unnest(coalesce(p_target_employee_ids, '{}'::uuid[])) target(target_id)
  where exists (
    select 1 from public.hris_users employee
    where employee.id = target.target_id and lower(employee.status) = 'active'
  );

  if coalesce(cardinality(normalized_target_ids), 0) = 0 then
    raise exception 'At least one active target employee is required.';
  end if;

  if jsonb_typeof(coalesce(p_evaluators, '[]'::jsonb)) <> 'array' then
    raise exception 'Evaluator configuration must be an array.';
  end if;

  select count(*), coalesce(sum((item.value->>'weight')::integer), 0)
  into evaluator_count, total_weight
  from jsonb_array_elements(coalesce(p_evaluators, '[]'::jsonb)) item(value);

  if evaluator_count = 0 then raise exception 'At least one evaluator is required.'; end if;
  if total_weight <> 100 then raise exception 'Evaluator weights must total exactly 100.'; end if;

  insert into public.evaluations(
    name, timeline_id, target_business_unit_ids, target_employee_ids,
    question_set_ids, status, due_date, is_employee_visible,
    acknowledged_by, created_by, request_key
  ) values (
    btrim(p_name), p_timeline_id, coalesce(p_target_business_unit_ids, '{}'::uuid[]),
    normalized_target_ids, coalesce(p_question_set_ids, '{}'::uuid[]), 'InProgress',
    p_due_date, false, '{}'::uuid[], creator_id, nullif(btrim(p_request_key), '')
  ) returning id into created_evaluation_id;

  for evaluator in select value from jsonb_array_elements(p_evaluators) loop
    evaluator_type := upper(coalesce(evaluator->>'type', ''));
    evaluator_weight := (evaluator->>'weight')::integer;
    evaluator_user_id := nullif(evaluator->>'user_id', '')::uuid;
    evaluator_business_unit_id := nullif(evaluator->>'business_unit_id', '')::uuid;
    evaluator_department_id := nullif(evaluator->>'department_id', '')::uuid;

    if evaluator_type not in ('INDIVIDUAL', 'GROUP') then raise exception 'Evaluator type must be INDIVIDUAL or GROUP.'; end if;
    if evaluator_type = 'INDIVIDUAL' then
      if evaluator_user_id is null or not exists (
        select 1 from public.hris_users active_user
        where active_user.id = evaluator_user_id and lower(active_user.status) = 'active'
      ) then raise exception 'Individual evaluator must be an active HRIS user.'; end if;
    elsif evaluator_business_unit_id is null and evaluator_department_id is null then
      raise exception 'Group evaluator must have a business unit or department.';
    end if;

    insert into public.evaluation_evaluators(
      evaluation_id, type, weight, user_id, business_unit_id,
      department_id, is_anonymous, exclude_subject
    ) values (
      created_evaluation_id,
      case when evaluator_type = 'INDIVIDUAL' then 'Individual' else 'Group' end,
      evaluator_weight,
      case when evaluator_type = 'INDIVIDUAL' then evaluator_user_id end,
      case when evaluator_type = 'GROUP' then evaluator_business_unit_id end,
      case when evaluator_type = 'GROUP' then evaluator_department_id end,
      coalesce((evaluator->>'is_anonymous')::boolean, false),
      coalesce((evaluator->>'exclude_subject')::boolean, true)
    );
  end loop;

  insert into public.evaluation_assignments(
    evaluation_id, employee_id, timeline_id, question_set_ids,
    evaluator_config, evaluator_user_ids, due_date, status
  )
  select
    created_evaluation_id,
    subject.id,
    p_timeline_id,
    coalesce(p_question_set_ids, '{}'::uuid[]),
    p_evaluators,
    coalesce(array_agg(distinct eligible_user.id) filter (where eligible_user.id is not null), '{}'::uuid[]),
    p_due_date,
    'Pending'
  from unnest(normalized_target_ids) subject(id)
  left join public.evaluation_evaluators assignment on assignment.evaluation_id = created_evaluation_id
  left join public.hris_users eligible_user
    on lower(eligible_user.status) = 'active'
   and (
     (lower(assignment.type) = 'individual' and eligible_user.id = assignment.user_id)
     or (
       lower(assignment.type) = 'group'
       and (assignment.business_unit_id is null or eligible_user.business_unit_id = assignment.business_unit_id)
       and (assignment.department_id is null or eligible_user.department_id = assignment.department_id)
       and not (coalesce(assignment.exclude_subject, true) and eligible_user.id = subject.id)
     )
   )
  group by subject.id
  on conflict (evaluation_id, employee_id) do nothing;

  insert into public.notifications(user_id, type, title, message, link, related_entity_id, is_read, dedupe_key)
  select
    assignment.employee_id::text,
    'EVALUATION_PENDING',
    'Evaluation Pending',
    format('%s has been assigned to you and is pending completion.', btrim(p_name)),
    '/evaluation/reviews',
    created_evaluation_id::text,
    false,
    format('evaluation:%s:subject:%s', created_evaluation_id, assignment.employee_id)
  from public.evaluation_assignments assignment
  where assignment.evaluation_id = created_evaluation_id
  on conflict (user_id, dedupe_key) do nothing;

  insert into public.notifications(user_id, type, title, message, link, related_entity_id, is_read, dedupe_key)
  select distinct
    evaluator_id::text,
    'EVALUATION_ASSIGNED',
    'Evaluation Assigned',
    format('You have been assigned to complete %s.', btrim(p_name)),
    format('/evaluation/perform/%s', created_evaluation_id),
    created_evaluation_id::text,
    false,
    format('evaluation:%s:evaluator', created_evaluation_id)
  from public.evaluation_assignments assignment
  cross join lateral unnest(assignment.evaluator_user_ids) evaluator_id
  where assignment.evaluation_id = created_evaluation_id
  on conflict (user_id, dedupe_key) do nothing;

  return created_evaluation_id;
end;
$$;

revoke all on function public.create_evaluation_cycle(text, uuid, uuid[], uuid[], uuid[], date, jsonb, text) from public, anon;
grant execute on function public.create_evaluation_cycle(text, uuid, uuid[], uuid[], uuid[], date, jsonb, text) to authenticated;

-- Repair missing employee notifications for all current cycles. Stable keys
-- keep this idempotent and preserve existing notification history.
insert into public.notifications(user_id, type, title, message, link, related_entity_id, is_read, dedupe_key)
select
  assignment.employee_id::text,
  'EVALUATION_PENDING',
  'Evaluation Pending',
  format('%s has been assigned to you and is pending completion.', evaluation.name),
  '/evaluation/reviews',
  evaluation.id::text,
  false,
  format('evaluation:%s:subject:%s', evaluation.id, assignment.employee_id)
from public.evaluation_assignments assignment
join public.evaluations evaluation on evaluation.id = assignment.evaluation_id
where assignment.status = 'Pending'
  and evaluation.status = 'InProgress'
on conflict (user_id, dedupe_key) do nothing;
