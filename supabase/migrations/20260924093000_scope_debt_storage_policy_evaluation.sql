-- A CASE guard ensures the payroll lookup helper is not evaluated for objects
-- in unrelated Storage buckets such as Incident Report evidence.
drop policy if exists payroll_debt_document_read on storage.objects;
create policy payroll_debt_document_read on storage.objects
for select to authenticated
using (
  case
    when bucket_id = 'payroll-debt-documents' then private.payroll_debt_document_read_allowed(name)
    else false
  end
);

drop policy if exists payroll_nte_atd_read on storage.objects;
create policy payroll_nte_atd_read on storage.objects
for select to authenticated
using (
  case
    when bucket_id = 'payroll-nte-atd' then private.payroll_nte_atd_read_allowed(name)
    else false
  end
);
