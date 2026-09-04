-- Match the live-main security posture when a clean branch is initialized
-- from the foundational schema baseline before table-specific policies run.

do $migration$
declare
  table_record record;
begin
  for table_record in
    select namespace.nspname as schema_name, relation.relname as table_name
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
      and not relation.relrowsecurity
  loop
    execute format(
      'alter table %I.%I enable row level security',
      table_record.schema_name,
      table_record.table_name
    );
  end loop;
end
$migration$;
