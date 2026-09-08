-- Preserve existing AuditLog permission policies; add only self-owned decisions.
create policy audit_logs_own_decisions_select
on public.audit_logs for select to authenticated
using (
  user_id = (select public.current_hris_user_id())::text
  and action in ('APPROVE', 'REJECT')
);

create index if not exists audit_logs_own_decisions_recent_idx
on public.audit_logs (user_id, created_at desc, id desc)
where action in ('APPROVE', 'REJECT');
