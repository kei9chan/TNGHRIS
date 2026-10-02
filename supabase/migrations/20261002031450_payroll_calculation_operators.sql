-- Explicitly authorized draft payroll operators. Preserve approval and release duties.
create function private.payroll_calculation_operator() returns boolean
language sql stable security definer set search_path='' as $$
 select private.payroll_actor_id() is not null and (
 private.payroll_offset_role(auth.uid(),'Admin') or private.payroll_offset_role(auth.uid(),'Board of Director')
 or (public.current_hris_user_id()='ca37dbaf-2282-49e1-9aed-e977c316bd26'::uuid
 and private.payroll_offset_role(auth.uid(),'Finance Staff')))
$$;
revoke all on function private.payroll_calculation_operator() from public,anon,authenticated;
create or replace function private.payroll_has_access(p_permission text,p_scope_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select case when p_permission='prepare_pr' then private.payroll_calculation_operator()
 and exists(select 1 from public.payroll_access_scopes where id=p_scope_id)
 else exists(select 1 from public.payroll_access_grants g
 where g.auth_user_id=private.payroll_actor_id() and g.revoked_at is null
 and g.permission=p_permission and private.payroll_scope_covers(g.scope_id,p_scope_id)) end
$$;
create or replace function private.payroll_net_can_review(p_scope uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.payroll_calculation_operator() and private.payroll_gross_permission(p_scope,'view')
 and public.has_sensitive_permission('salary_compensation','edit')
$$;
-- Normal payroll already uses this approved, effective-dated shared calendar.
-- Retain legacy BU settings where present; otherwise resolve the same shared calendar.
do $migration$
declare definition text;needle text;replacement text;
begin
 definition:=pg_get_functiondef('private.payroll_gross_snapshot_without_service_charge_phase3(uuid)'::regprocedure);
 needle:='if calendar_row is null then raise exception ''Record the approved BU payday calendar in Pay Packages.'';end if;';
 replacement:='if calendar_row is null then
 select to_jsonb(c) into calendar_row from public.payroll_calendar_rules c
 where (c.scope_id is null or c.scope_id=t.scope_id) and c.effective_from<=t.date_from
 order by c.scope_id nulls last,c.effective_from desc,c.created_at desc limit 1;
 if exists(select 1 from public.payroll_calendar_rules c where (c.scope_id is null or c.scope_id=t.scope_id)
 and c.effective_from>t.date_from and c.effective_from<=t.date_to) then
 raise exception ''Calendar changes inside the cutoff require reconciliation.'';end if;
 end if;
 if calendar_row is null then raise exception ''Record the approved payday calendar before calculating.'';end if;';
 if position(needle in definition)=0 then raise exception 'Expected calendar guard not found';end if;
 definition:=replace(definition,needle,replacement);
 definition:=replace(definition,
 'raise exception ''Current HRIS pay differs from the latest reviewed package. Reconcile Pay Packages before calculating.'';',
 'raise exception ''Current HRIS pay differs from the approved pay package for %. Reconcile Pay Packages before calculating.'',coalesce(emp->>''name'',emp->>''id'');');
 execute definition;
end $migration$;
