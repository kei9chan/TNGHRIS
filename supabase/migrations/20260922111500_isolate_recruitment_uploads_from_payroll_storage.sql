-- Storage evaluates every applicable permissive policy for the active role.
-- Keep payroll table access behind SECURITY DEFINER helpers so an unrelated
-- upload (for example an applicant resume) never needs payroll table grants.

create or replace function public.payroll_pay_package_document_insert_allowed(p_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  package_id uuid;
  package_row public.payroll_pay_packages;
begin
  if p_path is null or p_path !~ '^[0-9a-fA-F-]{36}/[^/]+$' then
    return false;
  end if;

  begin
    package_id := split_part(p_path, '/', 1)::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  select * into package_row
  from public.payroll_pay_packages
  where id = package_id;

  return package_row.id is not null
    and package_row.status = 'draft'
    and private.payroll_package_scope_permission(
      package_row.employee_id,
      package_row.scope_id,
      'edit',
      package_row.stream
    );
end;
$$;

create or replace function public.payroll_pay_package_document_read_allowed(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.payroll_pay_package_documents document
    join public.payroll_pay_packages package
      on package.id = document.package_id
    where document.storage_path = p_path
      and (
        package.employee_id = public.current_hris_user_id()
        or private.payroll_package_scope_permission(
          package.employee_id,
          package.scope_id,
          'view',
          package.stream
        )
      )
  );
$$;

revoke all on function public.payroll_pay_package_document_insert_allowed(text) from public, anon, authenticated;
revoke all on function public.payroll_pay_package_document_read_allowed(text) from public, anon, authenticated;
grant execute on function public.payroll_pay_package_document_insert_allowed(text) to authenticated, service_role;
grant execute on function public.payroll_pay_package_document_read_allowed(text) to authenticated, service_role;

drop policy if exists payroll_pay_package_document_insert on storage.objects;
create policy payroll_pay_package_document_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'payroll-pay-package-documents'
  and public.payroll_pay_package_document_insert_allowed(name)
);

drop policy if exists payroll_pay_package_document_read on storage.objects;
create policy payroll_pay_package_document_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'payroll-pay-package-documents'
  and public.payroll_pay_package_document_read_allowed(name)
);

notify pgrst, 'reload schema';
