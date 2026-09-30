create function private.resolve_ot_manager(p_employee uuid) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare direct uuid:=private.resolve_direct_manager_id(p_employee);unit uuid;candidates uuid[];begin
 select business_unit_id into unit from public.hris_users where id=p_employee;
 if direct<>p_employee and exists(select 1 from public.user_roles ur join public.hris_users u on u.id=ur.user_id where ur.user_id=direct and ur.is_active and ur.role_id='Board of Director' and lower(u.status)='active') then return direct;end if;
 select array_agg(distinct u.id) into candidates from public.hris_users u join public.user_roles ur on ur.user_id=u.id and ur.is_active and ur.role_id='Business Unit Manager'
 where u.id<>p_employee and lower(u.status)='active' and (u.business_unit_id=unit or (ur.scope_type='SPECIFIC' and unit=any(ur.allowed_business_unit_ids)));
 if direct=any(candidates) then return direct;end if;
 if cardinality(candidates)=1 then return candidates[1];end if;
 return null;
end $$;
revoke all on function private.resolve_ot_manager(uuid) from public,anon,authenticated;

create or replace function private.is_business_unit_ot_manager(p_actor uuid,p_employee uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select p_actor=public.current_hris_user_id() and p_actor<>p_employee and p_actor=private.resolve_ot_manager(p_employee);
$$;

do $$declare ddl text;begin
 ddl:=pg_get_functiondef('private.assign_direct_manager_snapshot()'::regprocedure);
 ddl:=replace(ddl,'resolved := private.resolve_direct_manager_id(new.employee_id);','resolved := case when tg_table_name=''ot_requests'' then private.resolve_ot_manager(new.employee_id) else private.resolve_direct_manager_id(new.employee_id) end;');
 execute ddl;
 ddl:=pg_get_functiondef('private.is_active_time_request_approver(uuid,text,uuid)'::regprocedure);
 ddl:=replace(ddl,'v_current_manager_id := private.resolve_direct_manager_id(v_employee_id);','if lower(p_request_type)=''overtime'' and v_manager_stage then return p_actor_id<>v_employee_id and p_actor_id=private.resolve_ot_manager(v_employee_id);end if; v_current_manager_id := private.resolve_direct_manager_id(v_employee_id);');
 execute ddl;
end $$;
-- No pay quantities or approval status change. The existing notification trigger
-- sends pending OT to its corrected reviewer when the stored assignment changes.
update public.ot_requests r set direct_manager_id=private.resolve_ot_manager(r.employee_id),approver_configuration_required=private.resolve_ot_manager(r.employee_id) is null,
 approval_configuration_note=case when private.resolve_ot_manager(r.employee_id) is null then 'Configure one active business unit manager for overtime review.' else null end
where r.status::text in('Submitted','PendingGM') and r.direct_manager_id is distinct from private.resolve_ot_manager(r.employee_id)
 and not exists(select 1 from public.payroll_schedule_freezes f where f.employee_id=r.employee_id and r.date between f.date_from and f.date_to);
notify pgrst,'reload schema';
