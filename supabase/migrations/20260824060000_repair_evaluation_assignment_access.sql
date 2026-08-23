-- Focused repair for Evaluation assignment persistence, scoped access,
-- notification deep links, and loading performance.
-- Existing evaluations, submissions, notifications, and audit history are
-- preserved. No historical evaluator is reassigned by this migration.

-- ---------------------------------------------------------------------------
-- Query-path indexes
-- ---------------------------------------------------------------------------

create index if not exists evaluation_evaluators_user_evaluation_idx
  on public.evaluation_evaluators(user_id, evaluation_id)
  where user_id is not null;

create index if not exists evaluation_evaluators_group_scope_idx
  on public.evaluation_evaluators(business_unit_id, department_id, evaluation_id)
  where lower(type) = 'group';

create index if not exists evaluation_evaluators_department_evaluation_idx
  on public.evaluation_evaluators(department_id, evaluation_id)
  where lower(type) = 'group' and department_id is not null;

create index if not exists evaluation_submissions_eval_rater_idx
  on public.evaluation_submissions(evaluation_id, rater_id);

create index if not exists evaluations_created_at_idx
  on public.evaluations(created_at desc);

create index if not exists evaluations_created_by_idx
  on public.evaluations(created_by)
  where created_by is not null;

-- ---------------------------------------------------------------------------
-- Assignment-scoped RLS
-- ---------------------------------------------------------------------------

drop policy if exists eval_ev_hr_admin_all on public.evaluation_evaluators;
drop policy if exists eval_ev_own on public.evaluation_evaluators;
drop policy if exists evaluation_evaluators_scoped_select on public.evaluation_evaluators;
drop policy if exists evaluation_evaluators_hr_insert on public.evaluation_evaluators;
drop policy if exists evaluation_evaluators_hr_update on public.evaluation_evaluators;
drop policy if exists evaluation_evaluators_hr_delete on public.evaluation_evaluators;

create policy evaluation_evaluators_scoped_select
  on public.evaluation_evaluators
  for select to authenticated
  using (
    (select public.is_hr_or_admin())
    or user_id = (select public.current_hris_user_id())
    or (
      lower(type) = 'group'
      and exists (
        select 1
        from public.hris_users current_user_profile
        where current_user_profile.id = (select public.current_hris_user_id())
          and lower(current_user_profile.status) = 'active'
          and (
            evaluation_evaluators.business_unit_id is null
            or evaluation_evaluators.business_unit_id = current_user_profile.business_unit_id
          )
          and (
            evaluation_evaluators.department_id is null
            or evaluation_evaluators.department_id = current_user_profile.department_id
          )
      )
    )
  );

create policy evaluation_evaluators_hr_insert
  on public.evaluation_evaluators
  for insert to authenticated
  with check ((select public.is_hr_or_admin()));

create policy evaluation_evaluators_hr_update
  on public.evaluation_evaluators
  for update to authenticated
  using ((select public.is_hr_or_admin()))
  with check ((select public.is_hr_or_admin()));

create policy evaluation_evaluators_hr_delete
  on public.evaluation_evaluators
  for delete to authenticated
  using ((select public.is_hr_or_admin()));

drop policy if exists eval_hr_admin_all on public.evaluations;
drop policy if exists eval_read_mgr_above on public.evaluations;
drop policy if exists evaluations_scoped_select on public.evaluations;
drop policy if exists evaluations_hr_insert on public.evaluations;
drop policy if exists evaluations_hr_update on public.evaluations;
drop policy if exists evaluations_hr_delete on public.evaluations;

create policy evaluations_scoped_select
  on public.evaluations
  for select to authenticated
  using (
    (select public.is_hr_or_admin())
    or (select public.is_manager_or_above())
    or (
      is_employee_visible
      and (select public.current_hris_user_id()) = any(target_employee_ids)
    )
    or exists (
      select 1
      from public.evaluation_evaluators assignment
      where assignment.evaluation_id = evaluations.id
    )
  );

create policy evaluations_hr_insert
  on public.evaluations
  for insert to authenticated
  with check ((select public.is_hr_or_admin()));

create policy evaluations_hr_update
  on public.evaluations
  for update to authenticated
  using ((select public.is_hr_or_admin()))
  with check ((select public.is_hr_or_admin()));

create policy evaluations_hr_delete
  on public.evaluations
  for delete to authenticated
  using ((select public.is_hr_or_admin()));

-- A submission remains visible to HR, its rater, and its subject. Writes are
-- now additionally checked against a live evaluator assignment and target.
drop policy if exists eval_sub_hr_admin_all on public.evaluation_submissions;
drop policy if exists eval_sub_own on public.evaluation_submissions;
drop policy if exists evaluation_submissions_scoped_select on public.evaluation_submissions;
drop policy if exists evaluation_submissions_assigned_insert on public.evaluation_submissions;
drop policy if exists evaluation_submissions_assigned_update on public.evaluation_submissions;
drop policy if exists evaluation_submissions_scoped_delete on public.evaluation_submissions;

create policy evaluation_submissions_scoped_select
  on public.evaluation_submissions
  for select to authenticated
  using (
    (select public.is_hr_or_admin())
    or rater_id = (select public.current_hris_user_id())
    or subject_employee_id = (select public.current_hris_user_id())
  );

create policy evaluation_submissions_assigned_insert
  on public.evaluation_submissions
  for insert to authenticated
  with check (
    (select public.is_hr_or_admin())
    or (
      rater_id = (select public.current_hris_user_id())
      and exists (
        select 1
        from public.evaluation_evaluators assignment
        where assignment.evaluation_id = evaluation_submissions.evaluation_id
          and (
            (
              lower(assignment.type) = 'individual'
              and assignment.user_id = (select public.current_hris_user_id())
            )
            or (
              lower(assignment.type) = 'group'
              and exists (
                select 1
                from public.hris_users current_user_profile
                where current_user_profile.id = (select public.current_hris_user_id())
                  and lower(current_user_profile.status) = 'active'
                  and (
                    assignment.business_unit_id is null
                    or assignment.business_unit_id = current_user_profile.business_unit_id
                  )
                  and (
                    assignment.department_id is null
                    or assignment.department_id = current_user_profile.department_id
                  )
                  and not (
                    assignment.exclude_subject
                    and evaluation_submissions.subject_employee_id = current_user_profile.id
                  )
              )
            )
          )
      )
      and exists (
        select 1
        from public.evaluations evaluation
        where evaluation.id = evaluation_submissions.evaluation_id
          and evaluation_submissions.subject_employee_id = any(evaluation.target_employee_ids)
          and lower(evaluation.status) = 'inprogress'
          and (evaluation.due_date is null or evaluation.due_date >= current_date)
      )
    )
  );

create policy evaluation_submissions_assigned_update
  on public.evaluation_submissions
  for update to authenticated
  using (
    (select public.is_hr_or_admin())
    or rater_id = (select public.current_hris_user_id())
  )
  with check (
    (select public.is_hr_or_admin())
    or (
      rater_id = (select public.current_hris_user_id())
      and exists (
        select 1
        from public.evaluation_evaluators assignment
        where assignment.evaluation_id = evaluation_submissions.evaluation_id
          and (
            (
              lower(assignment.type) = 'individual'
              and assignment.user_id = (select public.current_hris_user_id())
            )
            or (
              lower(assignment.type) = 'group'
              and exists (
                select 1
                from public.hris_users current_user_profile
                where current_user_profile.id = (select public.current_hris_user_id())
                  and lower(current_user_profile.status) = 'active'
                  and (
                    assignment.business_unit_id is null
                    or assignment.business_unit_id = current_user_profile.business_unit_id
                  )
                  and (
                    assignment.department_id is null
                    or assignment.department_id = current_user_profile.department_id
                  )
                  and not (
                    assignment.exclude_subject
                    and evaluation_submissions.subject_employee_id = current_user_profile.id
                  )
              )
            )
          )
      )
      and exists (
        select 1
        from public.evaluations evaluation
        where evaluation.id = evaluation_submissions.evaluation_id
          and evaluation_submissions.subject_employee_id = any(evaluation.target_employee_ids)
          and lower(evaluation.status) = 'inprogress'
          and (evaluation.due_date is null or evaluation.due_date >= current_date)
      )
    )
  );

create policy evaluation_submissions_scoped_delete
  on public.evaluation_submissions
  for delete to authenticated
  using (
    (select public.is_hr_or_admin())
    or rater_id = (select public.current_hris_user_id())
  );

-- ---------------------------------------------------------------------------
-- Notification policies: preserve behavior while avoiding per-row auth.uid()
-- calls and ensuring only the owner's HRIS user id can mark a row as read.
-- ---------------------------------------------------------------------------

drop policy if exists notifications_insert on public.notifications;
drop policy if exists notifications_update on public.notifications;
drop policy if exists notifications_delete on public.notifications;
drop policy if exists notifications_scoped_select on public.notifications;

create policy notifications_insert
  on public.notifications
  for insert to authenticated
  with check ((select auth.uid()) is not null);

create policy notifications_scoped_select
  on public.notifications
  for select to authenticated
  using (
    user_id = (select public.current_hris_user_id())::text
    or (
      (select public.has_feature_permission('Notifications', 'view'))
      and (select public.is_hr_or_admin())
    )
  );

create policy notifications_update
  on public.notifications
  for update to authenticated
  using (user_id = (select public.current_hris_user_id())::text)
  with check (user_id = (select public.current_hris_user_id())::text);

create policy notifications_delete
  on public.notifications
  for delete to authenticated
  using (user_id = (select public.current_hris_user_id())::text);

-- ---------------------------------------------------------------------------
-- Atomic evaluation creation
-- ---------------------------------------------------------------------------

create or replace function public.create_evaluation_cycle(
  p_name text,
  p_timeline_id uuid,
  p_target_business_unit_ids uuid[],
  p_target_employee_ids uuid[],
  p_question_set_ids uuid[],
  p_due_date date,
  p_evaluators jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created_evaluation_id uuid;
  evaluator jsonb;
  evaluator_type text;
  evaluator_weight integer;
  evaluator_user_id uuid;
  evaluator_business_unit_id uuid;
  evaluator_department_id uuid;
  evaluator_count integer;
  total_weight integer;
begin
  if (select public.current_hris_user_id()) is null then
    raise exception 'An active HRIS account is required.';
  end if;

  if not (select public.is_hr_or_admin()) then
    raise exception 'You do not have permission to create evaluations.';
  end if;

  if nullif(btrim(p_name), '') is null then
    raise exception 'Evaluation name is required.';
  end if;

  if p_due_date is null then
    raise exception 'Evaluation deadline is required.';
  end if;

  if coalesce(cardinality(p_target_employee_ids), 0) = 0 then
    raise exception 'At least one target employee is required.';
  end if;

  if jsonb_typeof(coalesce(p_evaluators, '[]'::jsonb)) <> 'array' then
    raise exception 'Evaluator configuration must be an array.';
  end if;

  select count(*), coalesce(sum((item.value->>'weight')::integer), 0)
    into evaluator_count, total_weight
  from jsonb_array_elements(coalesce(p_evaluators, '[]'::jsonb)) item(value);

  if evaluator_count = 0 then
    raise exception 'At least one evaluator is required.';
  end if;

  if total_weight <> 100 then
    raise exception 'Evaluator weights must total exactly 100.';
  end if;

  insert into public.evaluations(
    name,
    timeline_id,
    target_business_unit_ids,
    target_employee_ids,
    question_set_ids,
    status,
    due_date,
    is_employee_visible,
    acknowledged_by,
    created_by
  ) values (
    btrim(p_name),
    p_timeline_id,
    coalesce(p_target_business_unit_ids, '{}'::uuid[]),
    p_target_employee_ids,
    coalesce(p_question_set_ids, '{}'::uuid[]),
    'InProgress',
    p_due_date,
    false,
    '{}'::uuid[],
    (select public.current_hris_user_id())
  )
  returning id into created_evaluation_id;

  for evaluator in
    select value from jsonb_array_elements(p_evaluators)
  loop
    evaluator_type := upper(coalesce(evaluator->>'type', ''));
    evaluator_weight := (evaluator->>'weight')::integer;
    evaluator_user_id := nullif(evaluator->>'user_id', '')::uuid;
    evaluator_business_unit_id := nullif(evaluator->>'business_unit_id', '')::uuid;
    evaluator_department_id := nullif(evaluator->>'department_id', '')::uuid;

    if evaluator_type not in ('INDIVIDUAL', 'GROUP') then
      raise exception 'Evaluator type must be INDIVIDUAL or GROUP.';
    end if;

    if evaluator_type = 'INDIVIDUAL' then
      if evaluator_user_id is null or not exists (
        select 1 from public.hris_users u
        where u.id = evaluator_user_id and lower(u.status) = 'active'
      ) then
        raise exception 'Individual evaluator must be an active HRIS user.';
      end if;
    elsif evaluator_business_unit_id is null and evaluator_department_id is null then
      raise exception 'Group evaluator must have a business unit or department.';
    end if;

    insert into public.evaluation_evaluators(
      evaluation_id,
      type,
      weight,
      user_id,
      business_unit_id,
      department_id,
      is_anonymous,
      exclude_subject
    ) values (
      created_evaluation_id,
      case when evaluator_type = 'INDIVIDUAL' then 'Individual' else 'Group' end,
      evaluator_weight,
      case when evaluator_type = 'INDIVIDUAL' then evaluator_user_id else null end,
      case when evaluator_type = 'GROUP' then evaluator_business_unit_id else null end,
      case when evaluator_type = 'GROUP' then evaluator_department_id else null end,
      coalesce((evaluator->>'is_anonymous')::boolean, false),
      coalesce((evaluator->>'exclude_subject')::boolean, true)
    );
  end loop;

  with assigned_recipients as (
    select direct_assignment.user_id
    from public.evaluation_evaluators direct_assignment
    where direct_assignment.evaluation_id = created_evaluation_id
      and lower(direct_assignment.type) = 'individual'
      and direct_assignment.user_id is not null

    union

    select group_member.id
    from public.evaluation_evaluators group_assignment
    join public.hris_users group_member
      on lower(group_member.status) = 'active'
     and (
       group_assignment.business_unit_id is null
       or group_member.business_unit_id = group_assignment.business_unit_id
     )
     and (
       group_assignment.department_id is null
       or group_member.department_id = group_assignment.department_id
     )
    where group_assignment.evaluation_id = created_evaluation_id
      and lower(group_assignment.type) = 'group'
      and exists (
        select 1
        from unnest(p_target_employee_ids) target_employee_id(id)
        where not (
          group_assignment.exclude_subject
          and target_employee_id.id = group_member.id
        )
      )
  )
  insert into public.notifications(
    user_id,
    type,
    title,
    message,
    link,
    related_entity_id,
    is_read,
    dedupe_key
  )
  select
    assigned_recipients.user_id::text,
    'EVALUATION_ASSIGNED',
    'Evaluation Assigned',
    format('You have been assigned to complete %s.', btrim(p_name)),
    format('/evaluation/perform/%s', created_evaluation_id),
    created_evaluation_id::text,
    false,
    format('evaluation:%s:evaluator', created_evaluation_id)
  from assigned_recipients
  on conflict (user_id, dedupe_key) do nothing;

  return created_evaluation_id;
end;
$$;

revoke all on function public.create_evaluation_cycle(
  text, uuid, uuid[], uuid[], uuid[], date, jsonb
) from public, anon;
grant execute on function public.create_evaluation_cycle(
  text, uuid, uuid[], uuid[], uuid[], date, jsonb
) to authenticated;

comment on function public.create_evaluation_cycle(
  text, uuid, uuid[], uuid[], uuid[], date, jsonb
) is 'Atomically creates an evaluation, evaluator assignments, and assignment-scoped notifications.';

-- ---------------------------------------------------------------------------
-- Safe historical repair
-- ---------------------------------------------------------------------------

-- Old notifications were sent to evaluation subjects and linked only to the
-- module root. Keep those records, but route them to the stable workspace.
update public.notifications
set link = '/evaluation/reviews'
where type = 'EVALUATION_ASSIGNED'
  and related_entity_id is not null
  and coalesce(link, '') in ('', '/evaluation');

-- Create missing notifications for evaluator assignments that are already
-- saved. This does not add, remove, or reassign any evaluator.
with assigned_recipients as (
  select e.id as evaluation_id, e.name as evaluation_name, e.target_employee_ids,
         direct_assignment.user_id
  from public.evaluations e
  join public.evaluation_evaluators direct_assignment
    on direct_assignment.evaluation_id = e.id
   and lower(direct_assignment.type) = 'individual'
   and direct_assignment.user_id is not null
  where e.status = 'InProgress'

  union

  select e.id, e.name, e.target_employee_ids, group_member.id
  from public.evaluations e
  join public.evaluation_evaluators group_assignment
    on group_assignment.evaluation_id = e.id
   and lower(group_assignment.type) = 'group'
  join public.hris_users group_member
    on lower(group_member.status) = 'active'
   and (
     group_assignment.business_unit_id is null
     or group_member.business_unit_id = group_assignment.business_unit_id
   )
   and (
     group_assignment.department_id is null
     or group_member.department_id = group_assignment.department_id
   )
  where e.status = 'InProgress'
    and exists (
      select 1
      from unnest(e.target_employee_ids) target_employee_id(id)
      where not (
        group_assignment.exclude_subject
        and target_employee_id.id = group_member.id
      )
    )
), pending_recipients as (
  select distinct recipient.evaluation_id, recipient.evaluation_name, recipient.user_id
  from assigned_recipients recipient
  where exists (
    select 1
    from unnest(recipient.target_employee_ids) target_employee_id(id)
    where not exists (
      select 1
      from public.evaluation_submissions submission
      where submission.evaluation_id = recipient.evaluation_id
        and submission.rater_id = recipient.user_id
        and submission.subject_employee_id = target_employee_id.id
    )
  )
)
insert into public.notifications(
  user_id,
  type,
  title,
  message,
  link,
  related_entity_id,
  is_read,
  dedupe_key
)
select
  pending_recipients.user_id::text,
  'EVALUATION_ASSIGNED',
  'Evaluation Assigned',
  format('You have been assigned to complete %s.', pending_recipients.evaluation_name),
  format('/evaluation/perform/%s', pending_recipients.evaluation_id),
  pending_recipients.evaluation_id::text,
  false,
  format('evaluation:%s:evaluator', pending_recipients.evaluation_id)
from pending_recipients
on conflict (user_id, dedupe_key) do nothing;
