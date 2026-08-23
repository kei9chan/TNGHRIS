-- Consolidate approval alerts around the existing module record.
-- Historical notifications remain untouched. New workflow notifications may
-- provide a stable dedupe key so retries cannot create duplicate alerts.

alter table public.notifications
  add column if not exists dedupe_key text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'notifications_user_dedupe_key_unique'
      and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications
      add constraint notifications_user_dedupe_key_unique unique (user_id, dedupe_key);
  end if;
end;
$$;

create index if not exists notifications_related_entity_idx
  on public.notifications(user_id, related_entity_id, created_at desc)
  where related_entity_id is not null;

comment on column public.notifications.dedupe_key is
  'Stable workflow-step key used to make approval notification creation idempotent.';
