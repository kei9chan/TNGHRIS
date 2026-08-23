-- Trigger functions are internal implementation details. PostgreSQL grants
-- EXECUTE to PUBLIC by default, so revoke direct invocation while preserving
-- their normal execution through table triggers.
revoke all on function public.audit_employee_employment_change() from public, anon, authenticated;
revoke all on function public.audit_user_document_change() from public, anon, authenticated;
revoke all on function public.set_user_document_audit_fields() from public, anon, authenticated;
revoke all on function public.guard_employee_employment_details() from public, anon, authenticated;
