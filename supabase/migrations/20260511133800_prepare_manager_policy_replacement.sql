-- Preserve the intended policy replacement during clean migration replay.
--
-- The production ledger creates hris_users_read_own_manager at 20260511133658,
-- then creates the same policy again at 20260511133934 without first dropping
-- it. On an existing database both ledger versions are already present, so
-- this migration is deliberately a no-op. During a clean replay it removes
-- only the earlier policy immediately before the safe replacement is created.

do $migration$
begin
  if exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = '20260511133658'
  ) and not exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = '20260511133934'
  ) then
    drop policy if exists hris_users_read_own_manager on public.hris_users;
  end if;
end
$migration$;
