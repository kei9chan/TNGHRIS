-- Moving an employee draft into its first approval stage is a submit action,
-- not a reviewer action. Keep all later workflow transitions unchanged.

create or replace function public.guard_workflow_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  workflow_key text := tg_argv[0];
  requested_action text;
  old_status text := lower(coalesce(old.status::text, ''));
  new_status text := lower(coalesce(new.status::text, ''));
begin
  if new.status::text is not distinct from old.status::text then return new; end if;

  requested_action := case
    when old_status in ('draft', 'wfh_pending_submission')
      and new_status in (
        'submitted',
        'pending',
        'pendinggm',
        'wfh_pending_dept_head_approval',
        'wfh_pending_gm_approval'
      ) then 'submit'
    when new_status in ('approved', 'wfh_approved', 'wfh_for_timekeeping') then 'approve'
    when new_status in ('rejected', 'wfh_rejected') then 'reject'
    when new_status in ('cancelled', 'canceled') then 'cancel'
    when new_status in ('finalized', 'completed') then 'finalize'
    when new_status in ('pending', 'submitted', 'wfh_pending_submission') then 'submit'
    else 'review'
  end;

  if not public.has_workflow_permission(workflow_key, requested_action) then
    raise exception 'Workflow action % is not authorized for %.', requested_action, workflow_key using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_workflow_status_transition() from public, anon, authenticated;

comment on function public.guard_workflow_status_transition() is
  'Classifies employee draft-to-first-approval transitions as submit and enforces the canonical workflow permission resolver.';
