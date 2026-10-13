-- Restrict the RLS materialization to the selected evaluator configurations.
-- Individual raters use their primary keys; group raters keep the exact BU /
-- department match, active-user check and subject-exclusion rules.
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$declare ddl text;needle text;replacement text;begin
 ddl:=pg_get_functiondef('public.create_evaluation_cycle(text,uuid,uuid[],uuid[],uuid[],date,jsonb,text)'::regprocedure);
 needle:=$old$with eligible_profiles as materialized (
    select id,business_unit_id,department_id from public.hris_users
    where lower(status)='active'
  )$old$;
 replacement:=$new$with evaluator_configs as materialized (
    select type,user_id,business_unit_id,department_id
    from public.evaluation_evaluators where evaluation_id=created_evaluation_id
  ), eligible_profiles as materialized (
    select u.id,u.business_unit_id,u.department_id
    from evaluator_configs c join public.hris_users u on u.id=c.user_id
    where lower(c.type)='individual' and lower(u.status)='active'
    union
    select u.id,u.business_unit_id,u.department_id
    from evaluator_configs c join public.hris_users u
     on (c.business_unit_id is null or u.business_unit_id=c.business_unit_id)
     and (c.department_id is null or u.department_id=c.department_id)
    where lower(c.type)='group' and lower(u.status)='active'
  )$new$;
 if position(needle in ddl)=0 then raise exception 'Unexpected evaluation profile cache definition';end if;
 execute replace(ddl,needle,replacement);
end $$;
notify pgrst,'reload schema';
