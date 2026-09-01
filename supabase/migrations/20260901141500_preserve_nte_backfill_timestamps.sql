-- Follow-up for environments that applied the normalization before its
-- compatibility snapshot stopped touching updated_at. This restores the
-- historical timestamps generically from the NTE's actual action history.

create or replace function private.sync_nte_approval_snapshot(p_nte_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids uuid[];
  names text[];
  log_value jsonb;
begin
  select
    coalesce(array_agg(a.approver_user_id order by a.assigned_at, a.id), '{}'::uuid[]),
    coalesce(array_agg(u.full_name order by a.assigned_at, a.id), '{}'::text[]),
    coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'approvalId', a.id,
      'userId', a.approver_user_id,
      'userName', u.full_name,
      'roleId', a.selection_role_id,
      'role', a.role_snapshot,
      'roleSnapshot', a.role_snapshot,
      'isBod', a.is_bod_role,
      'required', a.is_required,
      'status', a.status,
      'assignedAt', a.assigned_at,
      'timestamp', a.actioned_at,
      'comments', a.comments,
      'selectionReason', a.selection_reason,
      'rejectionReason', case when a.status in ('Rejected', 'Returned for Revision') then a.comments end
    )) order by a.assigned_at, a.id), '[]'::jsonb)
  into ids, names, log_value
  from public.nte_approvals a
  join public.hris_users u on u.id = a.approver_user_id
  where a.nte_id = p_nte_id;

  update public.ntes
  set approver_ids = ids,
      approver_names = names,
      approval_log = log_value
  where id = p_nte_id;
end;
$$;

with restored as (
  select
    n.id,
    greatest(
      n.created_at,
      coalesce(max(a.actioned_at), n.created_at),
      coalesce(max(nullif(history.entry->>'timestamp', '')::timestamptz), n.created_at)
    ) restored_at
  from public.ntes n
  join public.nte_approvals a on a.nte_id = n.id and a.selection_source = 'historical-backfill'
  left join lateral jsonb_array_elements(coalesce(n.workflow_history, '[]'::jsonb)) history(entry) on true
  group by n.id, n.created_at
)
update public.ntes n
set updated_at = restored.restored_at
from restored
where n.id = restored.id;

with restored as (
  select
    ir.id,
    greatest(
      ir.created_at,
      coalesce(max(n.updated_at), ir.created_at),
      coalesce(max(a.created_at), ir.created_at)
    ) restored_at
  from public.incident_reports ir
  join public.ntes n on n.incident_report_id = ir.id
  left join public.audit_logs a on a.entity_id = ir.id::text
  group by ir.id, ir.created_at
)
update public.incident_reports ir
set updated_at = restored.restored_at
from restored
where ir.id = restored.id;
