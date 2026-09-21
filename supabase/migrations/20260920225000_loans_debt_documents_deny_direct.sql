-- Documents are exposed only through scoped SECURITY DEFINER RPCs.
create policy payroll_debt_documents_deny_direct
on public.payroll_debt_documents for all to authenticated
using(false) with check(false);
