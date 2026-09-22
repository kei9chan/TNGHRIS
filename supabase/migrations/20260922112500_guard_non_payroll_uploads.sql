-- PostgreSQL may evaluate permissive storage policies in an order that is not
-- source-order short-circuited. CASE guarantees that payroll table predicates
-- are not evaluated for an unrelated bucket such as recruitment-uploads.
-- The authorization predicates for payroll buckets are otherwise unchanged.

drop policy if exists payroll_debt_document_insert on storage.objects;
create policy payroll_debt_document_insert
on storage.objects
for insert
to authenticated
with check (
  case when bucket_id = 'payroll-debt-documents' then
    exists (
      select 1
      from public.payroll_debts debt
      where debt.id = (storage.foldername(name))[1]::uuid
        and debt.created_by = public.current_hris_user_id()
        and private.payroll_debt_manager(debt.scope_id)
    )
  else false end
);

drop policy if exists payroll_debt_document_upload_insert on storage.objects;
create policy payroll_debt_document_upload_insert
on storage.objects
for insert
to authenticated
with check (
  case when bucket_id = 'payroll-debt-documents' then
    exists (
      select 1
      from public.payroll_debts debt
      where debt.id = (storage.foldername(name))[1]::uuid
        and private.payroll_debt_creator(debt.scope_id)
    )
  else false end
);

drop policy if exists payroll_nte_atd_insert on storage.objects;
create policy payroll_nte_atd_insert
on storage.objects
for insert
to authenticated
with check (
  case when bucket_id = 'payroll-nte-atd' then
    exists (
      select 1
      from public.payroll_debts debt
      join public.payroll_nte_atd_versions version
        on version.debt_id = debt.id
       and version.version_no = debt.current_atd_version
      where debt.id = (storage.foldername(name))[1]::uuid
        and (
          public.current_hris_user_id() = debt.employee_id
          or private.payroll_nte_finance(debt.scope_id)
        )
    )
  else false end
);

notify pgrst, 'reload schema';
