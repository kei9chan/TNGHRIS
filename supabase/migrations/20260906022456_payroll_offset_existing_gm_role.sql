-- Reuse the existing GeneralManager role ID; do not add or change HRIS roles.
create or replace function private.payroll_offset_role(p_auth uuid,p_role text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.hris_users h join public.user_roles ur on ur.user_id=h.id join public.roles r on r.id=ur.role_id
 where h.auth_user_id=p_auth and lower(h.status)='active' and not coalesce(h.is_duplicate,false) and ur.is_active and r.is_active
 and r.id=case when p_role='General Manager' then 'GeneralManager' else p_role end)
$$;
revoke all on function private.payroll_offset_role(uuid,text) from public,anon,authenticated;
notify pgrst,'reload schema';
