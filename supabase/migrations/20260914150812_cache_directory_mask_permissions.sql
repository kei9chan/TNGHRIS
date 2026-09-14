-- Preserve the existing row-access filter, masking, owner, grants and security mode.
set local lock_timeout = '2s';
set local statement_timeout = '15s';
create or replace function public.get_accessible_hris_users()
returns setof public.hris_users
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  row_value public.hris_users;
  own_row boolean;
  viewer_id uuid := public.current_hris_user_id();
  permissions_loaded boolean := false;
  personal_allowed boolean;
  sss_allowed boolean;
  tin_allowed boolean;
  pagibig_allowed boolean;
  philhealth_allowed boolean;
  bank_allowed boolean;
  salary_allowed boolean;
begin
  for row_value in select u.* from public.hris_users u where public.can_access_hris_user(u.id) loop
    own_row := row_value.id = viewer_id;
    -- Viewer-only STABLE checks share the statement snapshot. Resolve once,
    -- lazily, so self-only and empty results do not add permission queries.
    if not own_row and not permissions_loaded then
      personal_allowed := public.has_feature_permission('PersonalInformation','view');
      sss_allowed := public.has_sensitive_permission('sss');
      tin_allowed := public.has_sensitive_permission('tin');
      pagibig_allowed := public.has_sensitive_permission('pagibig');
      philhealth_allowed := public.has_sensitive_permission('philhealth');
      bank_allowed := public.has_sensitive_permission('bank_information');
      salary_allowed := public.has_sensitive_permission('salary_compensation');
      permissions_loaded := true;
    end if;
    if not own_row then row_value.auth_user_id := null; end if;
    if not own_row and not personal_allowed then
      row_value.birth_date := null;
      row_value.emergency_contact_name := null;
      row_value.emergency_contact_relationship := null;
      row_value.emergency_contact_phone := null;
      row_value.tax_status := null;
    end if;
    if not own_row and not sss_allowed then row_value.sss_no := null; end if;
    if not own_row and not tin_allowed then row_value.tin := null; end if;
    if not own_row and not pagibig_allowed then row_value.pagibig_no := null; end if;
    if not own_row and not philhealth_allowed then row_value.philhealth_no := null; end if;
    if not own_row and not bank_allowed then
      row_value.bank_name := null; row_value.bank_account_number := null; row_value.bank_account_type := null;
    end if;
    if not own_row and not salary_allowed then
      row_value.rate_amount := null; row_value.salary_basic := null; row_value.salary_deminimis := null; row_value.salary_reimbursable := null;
    end if;
    return next row_value;
  end loop;
end;
$$;
