-- Extend the existing employee proposal/manager review workflow to GM direct
-- reports. Keep legacy RPC names and all validation, publication and RLS guards.
set local lock_timeout='5s';
set local statement_timeout='30s';
create or replace function schedule_compliance.bod_manager(p_employee uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select b.id from public.hris_users e join public.hris_users b on b.id::text=e.reports_to
 where e.id=p_employee and e.id<>b.id and lower(e.status::text)='active'
 and lower(b.status::text)='active'
 and (private.workflow_user_has_role(b.id,'Board of Director') or private.workflow_user_has_role(b.id,'GeneralManager'));
$$;
revoke all on function schedule_compliance.bod_manager(uuid) from public,anon,authenticated;

do $$declare ddl text;needle text;begin
 ddl:=pg_get_functiondef('public.get_bod_schedule_workflow(date)'::regprocedure);
 needle:='''eligible'',m is not null,';
 if strpos(ddl,needle)=0 then raise exception 'Review changed schedule workflow metadata before migration';end if;
 ddl:=replace(ddl,needle,$patch$'isGm',private.workflow_user_has_role(actor,'GeneralManager'),
 'managerRole',case when private.workflow_user_has_role(m,'Board of Director') then 'BOD' when private.workflow_user_has_role(m,'GeneralManager') then 'GM' else null end,
 'needsResubmission',own->>'status'='Pending' and own->>'manager_id' is distinct from m::text,
 'eligible',m is not null,$patch$);
 execute ddl;
 ddl:=pg_get_functiondef('public.submit_my_bod_schedule(date,jsonb,text)'::regprocedure);
 needle:='Only active employees reporting directly to a BOD can submit their own schedule here';
 if strpos(ddl,needle)=0 then raise exception 'Review changed schedule submission before migration';end if;
 execute replace(ddl,needle,'Only active employees reporting directly to a BOD or GM can submit their own schedule here');
 ddl:=pg_get_functiondef('public.review_bod_schedule_submission(uuid,integer,boolean,text)'::regprocedure);
 needle:='Only the assigned BOD may review this schedule';
 if strpos(ddl,needle)=0 then raise exception 'Review changed schedule approval before migration';end if;
 ddl:=replace(ddl,needle,'Only the current assigned BOD or GM may review this schedule');
 ddl:=replace(ddl,'BOD approved employee','Manager approved employee');
 ddl:=replace(ddl,'BOD approval: ','Schedule approval: ');
 execute ddl;
end $$;
notify pgrst,'reload schema';
