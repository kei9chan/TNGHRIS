-- Read-only queue repair: no attendance, payroll or approval decisions are changed.
set local lock_timeout='5s';
set local statement_timeout='30s';

create function private.payroll_break_batch_resolved(p_items jsonb,p_source jsonb,p_result jsonb)
returns boolean language sql immutable security invoker set search_path='' as $$
 select coalesce(jsonb_array_length(p_items)>0 and not exists(
  select 1 from jsonb_array_elements(p_items) i
  where not exists(
   select 1 from jsonb_array_elements(coalesce(p_result->'rows','[]')) r
   where r->>'employeeId'=i->>'employeeId' and r->>'date'=i->>'date'
    and r->'breakMinutes'=i->'breakMinutes'
    and r->>'ready'='true' and jsonb_typeof(r->'issues')='array' and jsonb_array_length(r->'issues')=0
    and i->'events'=(select coalesce(jsonb_agg(e order by e->>'timestamp',e->>'id'),'[]')
     from jsonb_array_elements(coalesce(p_source->'events','[]')) e
     where e->>'employeeId'=i->>'employeeId' and e->>'importWorkDate'=i->>'date')
  )
 ),false);
$$;
revoke all on function private.payroll_break_batch_resolved(jsonb,jsonb,jsonb) from public,anon,authenticated;

create or replace function public.get_payroll_break_review_inbox() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare answer jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in to view approvals.' using errcode='42501';end if;
 with actionable as materialized (
  select b.* from private.payroll_break_reviews b
  where b.submitted_by<>auth.uid() and b.hr_by is distinct from auth.uid()
   and ((b.status='pending_hr_manager' and public.has_active_role('HR Manager')) or (b.status='pending_bod' and public.has_active_role('Board of Director')))
   and private.actual_attendance_access(b.scope_id)
 ), scopes as materialized (select distinct scope_id,date_from,date_to from actionable),
 sources as materialized (select s.*,private.payroll_time_sources(scope_id,date_from,date_to) src,
  md5(private.payroll_time_sources_before_break_review(scope_id,date_from,date_to)::text) hash from scopes s),
 evaluated as materialized (select s.*,private.interpret_payroll_time(src,date_from,date_to) result from sources s)
 select coalesce(jsonb_agg(to_jsonb(b)||jsonb_build_object('scopeName',s.name,'submitter',u.full_name,'hrName',h.full_name,'canAct',true,'stale',b.source_hash<>v.hash) order by b.submitted_at),'[]') into answer
 from actionable b join evaluated v using(scope_id,date_from,date_to)
 join public.payroll_access_scopes s on s.id=b.scope_id
 left join public.hris_users u on u.auth_user_id=b.submitted_by
 left join public.hris_users h on h.auth_user_id=b.hr_by
 where not private.payroll_break_batch_resolved(b.items,v.src,v.result);
 return answer;
end $$;
revoke all on function public.get_payroll_break_review_inbox() from public,anon;
grant execute on function public.get_payroll_break_review_inbox() to authenticated;

-- Keep the old batch in the source workspace's history with its original
-- identity and evidence; mark it resolved only in the read response.
do $$declare ddl text;needle text:=' return jsonb_build_object(''sourceHash'',hash,''items''';begin
 ddl:=pg_get_functiondef('public.get_payroll_break_review(uuid,date,date)'::regprocedure);
 if position(needle in ddl)=0 then raise exception 'Unexpected break workspace definition';end if;
 execute replace(ddl,needle,$patch$
 select coalesce(jsonb_agg(case when r->>'status' in('pending_hr_manager','pending_bod')
  and private.payroll_break_batch_resolved(r->'items',src,private.interpret_payroll_time(src,p_from,p_to))
  then r||jsonb_build_object('status','resolved','canAct',false) else r end order by r->>'submitted_at' desc),'[]')
 into reviews from jsonb_array_elements(reviews) r;
 return jsonb_build_object('sourceHash',hash,'items'$patch$);
end $$;
notify pgrst,'reload schema';
