-- Preserve the existing policy predicates. Cache only the request-constant
-- auth UID so PostgreSQL can use hris_users_auth_user_id_idx before evaluating
-- the directory RLS predicate. The old plan scanned the directory repeatedly
-- for each statement inside a single shift save.
do $$
declare p record;
begin
  for p in
    select policyname, qual, with_check from pg_policies
    where schemaname='public' and tablename='shift_assignments'
      and policyname in ('shift_assign_bum_all','shift_assign_manager_all')
  loop
    execute format('alter policy %I on public.shift_assignments using (%s) with check (%s)',
      p.policyname,
      replace(p.qual,'auth.uid()','(select auth.uid())'),
      replace(p.with_check,'auth.uid()','(select auth.uid())'));
  end loop;
end $$;
