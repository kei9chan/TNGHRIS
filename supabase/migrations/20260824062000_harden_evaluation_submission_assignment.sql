-- Require an active, exact evaluator assignment for Evaluation submissions.
-- This preserves existing submissions while preventing unrelated, expired, or
-- closed evaluation writes through direct API calls.

drop policy if exists evaluation_submissions_assigned_insert on public.evaluation_submissions;
drop policy if exists evaluation_submissions_assigned_update on public.evaluation_submissions;

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
                  and (assignment.business_unit_id is null or assignment.business_unit_id = current_user_profile.business_unit_id)
                  and (assignment.department_id is null or assignment.department_id = current_user_profile.department_id)
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
                  and (assignment.business_unit_id is null or assignment.business_unit_id = current_user_profile.business_unit_id)
                  and (assignment.department_id is null or assignment.department_id = current_user_profile.department_id)
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
