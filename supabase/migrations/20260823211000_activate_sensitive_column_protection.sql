-- Activate protected HR-field column grants after the centralized frontend is live.
-- This is additive and safely rerunnable.

select pg_advisory_xact_lock(hashtext('tng-hris-sensitive-column-protection-v1'));

do $$
begin
  if to_regprocedure('public.get_accessible_hris_users()') is null
     or to_regprocedure('public.get_my_effective_rbac()') is null then
    raise exception 'Sensitive-field activation blocked: centralized RBAC RPCs are missing.';
  end if;
end;
$$;

-- Direct reads expose directory/workflow-routing fields only. The auth UUID is
-- retained for existing notification routing and is not a credential. Protected
-- HR content remains available solely through the masking RPC.
revoke select on public.hris_users from authenticated;
grant select (
  id,email,first_name,last_name,full_name,role,status,is_photo_enrolled,auth_user_id,
  business_unit,department,position,date_hired,created_at,
  business_unit_id,department_id,leave_quota_vacation,leave_quota_sick,
  leave_last_credit_date,employment_status,data_access_scope,
  reports_to,employee_id,leave_quota_offset,dashboard_type,
  permission_diagnostic,permission_updated_at,permission_updated_by
) on public.hris_users to authenticated;

do $$
begin
  if has_column_privilege('authenticated','public.hris_users','sss_no','SELECT')
     or has_column_privilege('authenticated','public.hris_users','tin','SELECT')
     or has_column_privilege('authenticated','public.hris_users','pagibig_no','SELECT')
     or has_column_privilege('authenticated','public.hris_users','philhealth_no','SELECT')
     or has_column_privilege('authenticated','public.hris_users','bank_account_number','SELECT')
     or has_column_privilege('authenticated','public.hris_users','salary_basic','SELECT')
     or has_column_privilege('authenticated','public.hris_users','birth_date','SELECT')
     or has_column_privilege('authenticated','public.hris_users','emergency_contact_phone','SELECT') then
    raise exception 'Sensitive-field activation failed: a protected HR column remains directly readable.';
  end if;
  if not has_column_privilege('authenticated','public.hris_users','auth_user_id','SELECT') then
    raise exception 'Sensitive-field activation failed: notification routing compatibility was lost.';
  end if;
end;
$$;
