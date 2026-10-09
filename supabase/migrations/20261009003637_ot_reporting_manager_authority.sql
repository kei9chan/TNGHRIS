-- Direct reporting authority applies to every active reporting manager, regardless of role label.
create or replace function private.resolve_ot_manager(p_employee uuid) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare direct uuid:=private.resolve_direct_manager_id(p_employee);unit uuid;candidates uuid[];
begin
 if direct is not null and direct<>p_employee and exists (select 1 from public.hris_users u where u.id=direct and lower(u.status)='active') then return direct;end if;
 select business_unit_id into unit from public.hris_users where id=p_employee;
 select array_agg(distinct u.id) into candidates
 from public.hris_users u
 join public.user_roles ur on ur.user_id=u.id and ur.is_active and ur.role_id='Business Unit Manager'
 where u.id<>p_employee and lower(u.status)='active'
  and (u.business_unit_id=unit or (ur.scope_type='SPECIFIC' and unit=any(ur.allowed_business_unit_ids)));
 if cardinality(candidates)=1 then return candidates[1];end if;
 return null;
end $$;
revoke all on function private.resolve_ot_manager(uuid) from public,anon,authenticated;

-- Reassign only unlocked requests awaiting a manager decision. The existing
-- direct-manager trigger sends the corrected reviewer a notification.
with changed as (
 update public.ot_requests r
 set direct_manager_id=private.resolve_ot_manager(r.employee_id),
     approver_configuration_required=false,
     approval_configuration_note=null
 where r.status::text in ('Submitted','PendingGM')
   and private.resolve_ot_manager(r.employee_id) is not null
   and (r.direct_manager_id is distinct from private.resolve_ot_manager(r.employee_id)
        or r.approver_configuration_required)
   and not exists (
     select 1 from public.payroll_schedule_freezes f
     where f.employee_id=r.employee_id and r.date between f.date_from and f.date_to
   )
 returning r.id,r.employee_id,r.direct_manager_id
)
insert into public.audit_logs(user_id,action,entity,entity_id,details)
select employee_id::text,'REASSIGN_OT_MANAGER','Overtime',id::text,
       jsonb_build_object('manager',direct_manager_id,'reason','Active direct reporting manager restored')::text
from changed;

notify pgrst,'reload schema';
