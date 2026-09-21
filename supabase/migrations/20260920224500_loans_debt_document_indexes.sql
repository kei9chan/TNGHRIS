-- Cover document audit foreign keys reported by the database advisor.
set local lock_timeout='5s';
set local statement_timeout='30s';
create index if not exists payroll_debt_documents_added_by on public.payroll_debt_documents(added_by);
create index if not exists payroll_debt_documents_reviewed_by on public.payroll_debt_documents(reviewed_by) where reviewed_by is not null;
