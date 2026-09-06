-- Preserve existing schedules and policies; scope new preset choices and grant
-- the requested BU-manager/direct-team scheduling operations additively.
create function private.schedule_team_can_manage(p_employee uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.payroll_actor_id() is not null and exists(select 1 from public.hris_users a join public.hris_users t on t.id=p_employee where a.id=public.current_hris_user_id() and ((public.has_active_role('Business Unit Manager') and a.business_unit_id=t.business_unit_id) or (public.has_active_role('Manager') and (t.reports_to=a.id::text or t.id=a.id))))
$$;
create function private.schedule_team_can_use_bu(p_bu uuid) returns boolean language sql stable security definer set search_path='' as $$
 select p_bu is not null and private.payroll_actor_id() is not null and exists(select 1 from public.hris_users t where t.business_unit_id=p_bu and private.schedule_team_can_manage(t.id))
$$;
revoke all on function private.schedule_team_can_manage(uuid),private.schedule_team_can_use_bu(uuid) from public,anon;
grant execute on function private.schedule_team_can_manage(uuid),private.schedule_team_can_use_bu(uuid) to authenticated;
create policy schedule_team_assignments on public.shift_assignments for all to authenticated using(private.schedule_team_can_manage(employee_id)) with check(private.schedule_team_can_manage(employee_id) and business_unit_id=(select business_unit_id from public.hris_users where id=shift_assignments.employee_id));
create policy schedule_team_preset_create on public.shift_templates for insert to authenticated with check(private.schedule_team_can_use_bu(business_unit_id) and created_by=public.current_hris_user_id());
create policy schedule_team_preset_update on public.shift_templates for update to authenticated using(private.schedule_team_can_use_bu(business_unit_id) and created_by=public.current_hris_user_id()) with check(private.schedule_team_can_use_bu(business_unit_id) and created_by=public.current_hris_user_id());
create policy schedule_team_preset_delete on public.shift_templates for delete to authenticated using(private.schedule_team_can_use_bu(business_unit_id) and created_by=public.current_hris_user_id());
do $$declare ddl text;begin ddl:=pg_get_functiondef('private.payroll_schedule_can_edit(uuid)'::regprocedure);execute replace(ddl,'(public.is_hr_or_admin() or','(public.is_hr_or_admin() or private.schedule_team_can_manage(p_employee) or');end $$;
create function private.schedule_preset_bu_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='INSERT' or new.business_unit_id is distinct from old.business_unit_id then
 if new.business_unit_id is null then raise exception 'Choose a business unit for this preset. Shared presets are retired from new scheduling.';end if;end if;
 if tg_op='INSERT' and auth.uid() is not null then new.created_by:=public.current_hris_user_id();end if;return new;end $$;
create trigger schedule_preset_bu before insert or update on public.shift_templates for each row execute function private.schedule_preset_bu_guard();
create function private.schedule_assignment_preset_guard() returns trigger language plpgsql security definer set search_path='' as $$declare bu uuid;begin
 if tg_op='UPDATE' then if new.employee_id=old.employee_id and new.date=old.date and new.shift_template_id=old.shift_template_id and new.business_unit_id is not distinct from old.business_unit_id then return new;end if;end if;
 select business_unit_id into bu from public.shift_templates where id=new.shift_template_id;
 if bu is null or bu is distinct from new.business_unit_id then raise exception 'Choose a preset created for this business unit. Existing shared presets cannot be assigned or copied into a new schedule.';end if;return new;end $$;
create trigger schedule_assignment_preset before insert or update on public.shift_assignments for each row execute function private.schedule_assignment_preset_guard();
revoke all on function private.schedule_preset_bu_guard(),private.schedule_assignment_preset_guard() from public,anon,authenticated;
notify pgrst,'reload schema';
