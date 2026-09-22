-- Relation privileges are checked while a policy is planned, even when CASE
-- excludes that policy's bucket. Move only the remaining INSERT lookups behind
-- narrow SECURITY DEFINER checks while preserving their authorization rules.

create or replace function public.payroll_debt_document_insert_allowed(
  p_path text,
  p_owner_only boolean
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  debt_id uuid;
  debt public.payroll_debts;
begin
  begin
    debt_id := nullif(split_part(coalesce(p_path, ''), '/', 1), '')::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  if debt_id is null then return false; end if;

  select * into debt from public.payroll_debts where id = debt_id;
  if debt.id is null then return false; end if;

  if p_owner_only then
    return debt.created_by = public.current_hris_user_id()
      and private.payroll_debt_manager(debt.scope_id);
  end if;
  return private.payroll_debt_creator(debt.scope_id);
end;
$$;

create or replace function public.payroll_nte_atd_insert_allowed(p_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  debt_id uuid;
begin
  begin
    debt_id := nullif(split_part(coalesce(p_path, ''), '/', 1), '')::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  if debt_id is null then return false; end if;

  return exists (
    select 1
    from public.payroll_debts debt
    join public.payroll_nte_atd_versions version
      on version.debt_id = debt.id
     and version.version_no = debt.current_atd_version
    where debt.id = debt_id
      and (
        public.current_hris_user_id() = debt.employee_id
        or private.payroll_nte_finance(debt.scope_id)
      )
  );
end;
$$;

revoke all on function public.payroll_debt_document_insert_allowed(text, boolean) from public, anon, authenticated;
revoke all on function public.payroll_nte_atd_insert_allowed(text) from public, anon, authenticated;
grant execute on function public.payroll_debt_document_insert_allowed(text, boolean) to authenticated, service_role;
grant execute on function public.payroll_nte_atd_insert_allowed(text) to authenticated, service_role;

drop policy if exists payroll_debt_document_insert on storage.objects;
create policy payroll_debt_document_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'payroll-debt-documents'
  and public.payroll_debt_document_insert_allowed(name, true)
);

drop policy if exists payroll_debt_document_upload_insert on storage.objects;
create policy payroll_debt_document_upload_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'payroll-debt-documents'
  and public.payroll_debt_document_insert_allowed(name, false)
);

drop policy if exists payroll_nte_atd_insert on storage.objects;
create policy payroll_nte_atd_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'payroll-nte-atd'
  and public.payroll_nte_atd_insert_allowed(name)
);

notify pgrst, 'reload schema';
