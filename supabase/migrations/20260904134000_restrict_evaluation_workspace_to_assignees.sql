-- Keep the evaluator form assignment-scoped even for HR/Admin/BOD oversight
-- accounts. Oversight users retain evaluation metadata for the read-only report
-- link, but only materialized assignment members receive employee/question data.

create or replace function public.get_my_evaluation_workspace(p_evaluation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select public.current_hris_user_id());
  actor_profile public.hris_users%rowtype;
  evaluation_row public.evaluations%rowtype;
  eligible_target_ids uuid[];
  has_oversight boolean;
begin
  if actor_id is null then
    raise exception 'An active HRIS account is required' using errcode = '42501';
  end if;

  select * into actor_profile
  from public.hris_users
  where id = actor_id and lower(status) = 'active';
  if not found then
    raise exception 'An active HRIS profile is required' using errcode = '42501';
  end if;

  select * into evaluation_row
  from public.evaluations
  where id = p_evaluation_id;
  if not found then
    raise exception 'Evaluation was not found' using errcode = '22023';
  end if;

  has_oversight := (select public.is_hr_or_admin()) or (select public.is_system_admin());

  -- evaluation_assignments is the canonical, materialized assignment record
  -- shared by the HR screen, evaluator dashboard, form, and compliance report.
  select coalesce(array_agg(assignment.employee_id order by assignment.employee_id), '{}'::uuid[])
  into eligible_target_ids
  from public.evaluation_assignments assignment
  where assignment.evaluation_id = evaluation_row.id
    and coalesce(assignment.status, 'Pending') <> 'Cancelled'
    and actor_id = any(coalesce(assignment.evaluator_user_ids, '{}'::uuid[]));

  if cardinality(eligible_target_ids) = 0 and not has_oversight then
    raise exception 'This evaluation is not assigned to your account' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'raterProfileId', actor_id,
    'evaluation', jsonb_build_object(
      'id', evaluation_row.id,
      'name', evaluation_row.name,
      'timeline_id', evaluation_row.timeline_id,
      'target_business_unit_ids', evaluation_row.target_business_unit_ids,
      'target_employee_ids', eligible_target_ids,
      'question_set_ids', evaluation_row.question_set_ids,
      'status', evaluation_row.status,
      'created_at', evaluation_row.created_at,
      'updated_at', evaluation_row.updated_at,
      'due_date', evaluation_row.due_date,
      'is_employee_visible', evaluation_row.is_employee_visible,
      'acknowledged_by', evaluation_row.acknowledged_by
    ),
    'evaluators', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', evaluator.id,
        'evaluation_id', evaluator.evaluation_id,
        'type', evaluator.type,
        'user_id', evaluator.user_id,
        'weight', evaluator.weight,
        'business_unit_id', evaluator.business_unit_id,
        'department_id', evaluator.department_id,
        'is_anonymous', evaluator.is_anonymous,
        'exclude_subject', evaluator.exclude_subject
      ) order by evaluator.id)
      from public.evaluation_evaluators evaluator
      where evaluator.evaluation_id = evaluation_row.id
        and cardinality(eligible_target_ids) > 0
        and (
          (evaluator.type = 'Individual' and evaluator.user_id = actor_id)
          or (
            evaluator.type = 'Group'
            and (evaluator.business_unit_id is null or evaluator.business_unit_id = actor_profile.business_unit_id)
            and (evaluator.department_id is null or evaluator.department_id = actor_profile.department_id)
          )
        )
    ), '[]'::jsonb),
    'targetUsers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', employee.id,
        'full_name', employee.full_name,
        'role', employee.role,
        'status', employee.status,
        'business_unit', employee.business_unit,
        'business_unit_id', employee.business_unit_id,
        'department', employee.department,
        'department_id', employee.department_id,
        'position', employee.position
      ) order by employee.full_name)
      from public.hris_users employee
      where employee.id = any(eligible_target_ids)
    ), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(to_jsonb(question) order by question.title, question.id)
      from public.evaluation_questions question
      where cardinality(eligible_target_ids) > 0
        and question.question_set_id = any(evaluation_row.question_set_ids)
        and not question.is_archived
    ), '[]'::jsonb),
    'submissions', coalesce((
      select jsonb_agg(to_jsonb(submission) order by submission.submitted_at desc)
      from public.evaluation_submissions submission
      where submission.evaluation_id = evaluation_row.id
        and submission.rater_id = actor_id
        and submission.subject_employee_id = any(eligible_target_ids)
    ), '[]'::jsonb),
    'assignmentRecords', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', assignment.id,
        'evaluation_id', assignment.evaluation_id,
        'employee_id', assignment.employee_id,
        'timeline_id', assignment.timeline_id,
        'due_date', assignment.due_date,
        'status', assignment.status
      ) order by assignment.employee_id)
      from public.evaluation_assignments assignment
      where assignment.evaluation_id = evaluation_row.id
        and assignment.employee_id = any(eligible_target_ids)
        and actor_id = any(coalesce(assignment.evaluator_user_ids, '{}'::uuid[]))
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_my_evaluation_workspace(uuid) from public, anon;
grant execute on function public.get_my_evaluation_workspace(uuid) to authenticated;

comment on function public.get_my_evaluation_workspace(uuid) is
  'Returns assignment-scoped evaluator data; unassigned oversight users receive metadata only for read-only reporting.';
