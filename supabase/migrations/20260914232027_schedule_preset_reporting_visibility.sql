-- Presets belong to their creator's current reporting line. Historical schedule
-- rows/publication snapshots are untouched; no creator is guessed for legacy rows.
create or replace function private.schedule_preset_support() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.payroll_actor_id() is not null and
 (public.has_active_role('Admin') or public.has_active_role('HR Manager') or public.has_active_role('HR Staff'))
$$;
create or replace function private.schedule_preset_visible(p_creator uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.payroll_actor_id() is not null and
 (private.schedule_preset_support() or exists(select 1 from public.hris_users a
  where a.auth_user_id=auth.uid() and (a.id=p_creator or a.reports_to=p_creator::text)))
$$;
create or replace function private.schedule_preset_manage(p_creator uuid,p_bu uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.payroll_actor_id() is not null and
 (private.schedule_preset_support() or (p_creator=public.current_hris_user_id() and private.schedule_team_can_use_bu(p_bu)))
$$;
revoke all on function private.schedule_preset_support(),private.schedule_preset_visible(uuid),private.schedule_preset_manage(uuid,uuid) from public,anon;
grant execute on function private.schedule_preset_support(),private.schedule_preset_visible(uuid),private.schedule_preset_manage(uuid,uuid) to authenticated;

alter table public.shift_templates enable row level security;
-- Permissive policies combine with OR: replace the global read/write policies,
-- rather than adding a narrow policy beside an existing global grant.
do $$declare p record;begin
 for p in select policyname from pg_policies where schemaname='public' and tablename='shift_templates' loop
  execute format('drop policy %I on public.shift_templates',p.policyname);
 end loop;
end $$;
create policy preset_reporting_read on public.shift_templates for select to authenticated
 using(private.schedule_preset_visible(created_by));
create policy preset_creator_insert on public.shift_templates for insert to authenticated
 with check(created_by=public.current_hris_user_id() and private.schedule_preset_manage(created_by,business_unit_id));
create policy preset_creator_update on public.shift_templates for update to authenticated
 using(private.schedule_preset_manage(created_by,business_unit_id))
 with check(private.schedule_preset_manage(created_by,business_unit_id));
create policy preset_creator_delete on public.shift_templates for delete to authenticated
 using(private.schedule_preset_manage(created_by,business_unit_id));

create or replace function private.schedule_preset_bu_guard() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if tg_op='INSERT' or new.business_unit_id is distinct from old.business_unit_id then
  if new.business_unit_id is null then raise exception 'Choose a business unit for this preset. Shared presets are retired from new scheduling.';end if;
 end if;
 if auth.uid() is not null then
  if tg_op='INSERT' then new.created_by:=public.current_hris_user_id();
  elsif new.created_by is distinct from old.created_by then
   raise exception 'The preset creator cannot be reassigned.' using errcode='42501';
  end if;
 end if;
 return new;
end $$;
create or replace function private.schedule_assignment_preset_guard() returns trigger
language plpgsql security definer set search_path='' as $$declare t public.shift_templates;begin
 -- Editing unrelated assignment fields never reauthorizes or rewrites history.
 if tg_op='UPDATE' then
  if new.employee_id=old.employee_id and new.date=old.date and new.shift_template_id=old.shift_template_id and new.business_unit_id is not distinct from old.business_unit_id then return new;end if;
 end if;
 select * into t from public.shift_templates where id=new.shift_template_id;
 if t.business_unit_id is null or t.business_unit_id is distinct from new.business_unit_id then
  raise exception 'Choose a preset created for this business unit. Existing shared presets cannot be assigned or copied into a new schedule.';
 end if;
 -- Also covers existing SECURITY DEFINER copy/approval APIs, which bypass RLS.
 if auth.uid() is not null and not private.schedule_preset_visible(t.created_by) then
  raise exception 'This preset is not available to your current reporting line. Refresh and choose an accessible preset.' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function private.schedule_preset_bu_guard(),private.schedule_assignment_preset_guard() from public,anon,authenticated;

-- Narrow edits preserve the current workflow and its existing authorization.
-- Fail the migration if those entry points have changed unexpectedly.
do $$declare ddl text;needle text;replacement text;begin
 ddl:=pg_get_functiondef('public.get_bod_schedule_workflow(date)'::regprocedure);
 needle:='from public.shift_templates t where t.business_unit_id=(select business_unit_id from public.hris_users where id=actor);';
 if strpos(ddl,needle)=0 then raise exception 'Review changed BOD preset listing before migration';end if;
 execute replace(ddl,needle,replace(needle,'where t.business_unit_id','where private.schedule_preset_visible(t.created_by) and t.business_unit_id'));
 ddl:=pg_get_functiondef('public.submit_my_bod_schedule(date,jsonb,text)'::regprocedure);
 needle:='select * into t from public.shift_templates where id=(x->>''templateId'')::uuid and business_unit_id=bu;';
 if strpos(ddl,needle)=0 then raise exception 'Review changed employee preset submission before migration';end if;
 execute replace(ddl,needle,'select * into t from public.shift_templates where id=(x->>''templateId'')::uuid and business_unit_id=bu and private.schedule_preset_visible(created_by);');
 ddl:=pg_get_functiondef('public.preview_payroll_time(uuid,date,date)'::regprocedure);
 needle:='where s.id=p_scope_id)';
 if strpos(ddl,needle)=0 then raise exception 'Review changed payroll preset listing before migration';end if;
 execute replace(ddl,needle,'where s.id=p_scope_id and private.schedule_preset_visible(t.created_by))');

 -- Retain display details only for assignments already in the authorized roster
 -- and date window. These are not reusable choices when current access is lost.
 ddl:=pg_get_functiondef('public.get_schedule_builder_data(text,date)'::regprocedure);
 needle:='return jsonb_build_object(''people'',people,';
 if strpos(ddl,needle)=0 then raise exception 'Review changed schedule roster before migration';end if;
 replacement:=$fragment$return jsonb_build_object('people',people,
 'templates',(select coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object(
 'can_use',private.schedule_preset_visible(t.created_by),
 'can_manage',private.schedule_preset_manage(t.created_by,t.business_unit_id)) order by t.name),'[]')
 from public.shift_templates t where private.schedule_preset_visible(t.created_by)
 or exists(select 1 from public.shift_assignments a where a.shift_template_id=t.id and a.employee_id=any(ids) and a.date between p_week-7 and p_week+13)), $fragment$;
 execute replace(ddl,needle,replacement);
end $$;
notify pgrst,'reload schema';
