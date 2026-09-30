-- A BOD still reviews their own direct reports, including BU managers.
create or replace function private.is_business_unit_ot_manager(p_actor uuid,p_employee uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select p_actor=public.current_hris_user_id() and p_actor<>p_employee
 and exists(select 1 from public.hris_users actor where actor.id=p_actor and lower(actor.status)='active')
 and (
  (public.has_active_role('Business Unit Manager') and exists(
   select 1 from public.hris_users manager join public.hris_users employee
    on employee.id=p_employee and employee.business_unit_id=manager.business_unit_id
   where manager.id=p_actor))
  or (public.has_active_role('Board of Director') and private.is_direct_reporting_manager(p_actor,p_employee))
 );
$$;
revoke all on function private.is_business_unit_ot_manager(uuid,uuid) from public,anon,authenticated;
