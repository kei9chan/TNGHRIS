-- BU affiliation alone does not assign Sales/Finance scheduling to an operations BUM.
create function private.schedule_bum_can_manage(p_employee uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.payroll_actor_id() is not null and public.has_active_role('Business Unit Manager') and exists(
 select 1 from public.hris_users a join public.hris_users t on t.id=p_employee
 where a.id=public.current_hris_user_id() and a.business_unit_id=t.business_unit_id
 and (t.id=a.id or lower(trim(coalesce(t.department,''))) ~ '^operations([[:space:]]*-|$)'
 or lower(trim(coalesce(t.department,''))) in ('general operations','lifeguard')));
$$;
revoke all on function private.schedule_bum_can_manage(uuid) from public,anon;
grant execute on function private.schedule_bum_can_manage(uuid) to authenticated;

create or replace function private.schedule_team_can_manage(p_employee uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.payroll_actor_id() is not null and exists(
 select 1 from public.hris_users a join public.hris_users t on t.id=p_employee
 where a.id=public.current_hris_user_id() and (
 (lower(t.status::text)='active' and t.reports_to in (a.id::text,a.auth_user_id::text) and t.id<>a.id)
 or private.schedule_bum_can_manage(p_employee)
 or (public.has_active_role('Manager') and (t.reports_to in (a.id::text,a.auth_user_id::text) or t.id=a.id))))
$$;
create or replace function private.payroll_schedule_can_edit(p_employee uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.payroll_actor_id() is not null and exists(
 select 1 from public.hris_users target join public.hris_users actor on actor.auth_user_id=auth.uid()
 where target.id=p_employee and (
 public.is_hr_or_admin() or private.schedule_team_can_manage(p_employee)
 or (public.has_active_role('Manager') and (target.department=actor.department
 or target.reports_to in (actor.id::text,actor.auth_user_id::text)))));
$$;
-- Preserve historical employment, preset visibility, and existing global-view authorization.
do $$
declare ddl text; old_clause text:='where private.schedule_employee_in_week(h.id,p_week) and (';
begin
 ddl:=pg_get_functiondef('public.get_schedule_builder_data(text,date)'::regprocedure);
 if position(old_clause in ddl)=0 then raise exception 'Schedule builder definition changed; review scope patch';end if;
 execute replace(ddl,old_clause,old_clause||E'\n   (broad or not public.has_active_role(''Business Unit Manager'') or private.schedule_team_can_manage(h.id))\n ) and (');
end $$;
