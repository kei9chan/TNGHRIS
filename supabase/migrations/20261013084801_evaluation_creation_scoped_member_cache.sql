-- Keep the creation RPC SECURITY INVOKER and retain employee RLS. Materialize
-- its permitted active-user set once instead of reevaluating RLS for each
-- subject/evaluator/user combination in the assignment join.
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$declare ddl text;needle text;replacement text;begin
 ddl:=pg_get_functiondef('public.create_evaluation_cycle(text,uuid,uuid[],uuid[],uuid[],date,jsonb,text)'::regprocedure);
 needle:=$old$  insert into public.evaluation_assignments($old$;
 replacement:=$new$  with eligible_profiles as materialized (
    select id,business_unit_id,department_id from public.hris_users
    where lower(status)='active'
  )
  insert into public.evaluation_assignments($new$;
 if position(needle in ddl)=0 or position('left join public.hris_users eligible_user' in ddl)=0 then
  raise exception 'Unexpected evaluation creation definition';
 end if;
 ddl:=replace(ddl,needle,replacement);
 ddl:=replace(ddl,'left join public.hris_users eligible_user','left join eligible_profiles eligible_user');
 ddl:=replace(ddl,'on lower(eligible_user.status) = ''active''','on true');
 execute ddl;
end $$;
notify pgrst,'reload schema';
