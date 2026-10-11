-- Cache execution plans for frequently called permission predicates without changing their rules.
CREATE OR REPLACE FUNCTION operations_private.role_unit(p_actor uuid, p_unit uuid, p_roles text[])
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$

BEGIN
 RETURN (
select exists(select 1 from public.user_roles r join public.roles rr on rr.id=r.role_id and rr.is_active
 join public.hris_users h on h.id=r.user_id and lower(h.status)='active'
 where r.user_id=p_actor and r.is_active and r.role_id=any(p_roles) and
 (r.scope_type='GLOBAL' or (p_unit is not null and
 ((r.scope_type='SPECIFIC' and p_unit=any(r.allowed_business_unit_ids)) or
 (r.scope_type='HOME_ONLY' and h.business_unit_id=p_unit)))))
 );
END
$function$;

CREATE OR REPLACE FUNCTION operations_private.review_eligible(rid uuid, bod boolean DEFAULT false, who uuid DEFAULT public.current_hris_user_id())
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$

BEGIN
 RETURN (
select exists(select 1 from operations_private.reviews r where r.id=rid and exists(select 1 from public.hris_users where id=who and lower(status)='active')
 and (case when bod then operations_private.role_unit(who,r.business_unit_id,array['Admin','Board of Director']) and r.first_reviewer is distinct from who
 else (operations_private.role_unit(who,r.business_unit_id,array['Admin','Board of Director','Business Unit Manager','GeneralManager']) or (operations_private.member(who,r.business_unit_id) and exists(select 1 from public.ops_permissions p where p.user_id=who and p.business_unit_id=r.business_unit_id and p.can_review) and not exists(select 1 from public.ops_assignments a where (a.id=r.assignment_id or a.checklist_run_id=r.run_id) and not private.is_direct_reporting_manager(who,a.assignee_id)))) end)
 and not exists(select 1 from public.ops_assignments a where (a.id=r.assignment_id or a.checklist_run_id=r.run_id) and a.assignee_id=who)
 and not exists(select 1 from public.ops_responses s join public.ops_run_items i on i.id=s.item_id where i.run_id=r.run_id and s.actor_id=who)
 and not exists(select 1 from public.ops_item_checks c where c.run_id=r.run_id and c.actor_id=who)
 and not exists(select 1 from public.ops_evidence e join public.ops_run_items i on i.id=e.item_id where i.run_id=r.run_id and e.uploader_id=who)
 and not exists(select 1 from operations_private.review_submissions s where s.review_id=r.id and (s.actor_id=who or s.snapshot->'actors' ? who::text)))
 );
END
$function$;

-- Cache the review JSON query plan; fields and permission guards stay identical.
CREATE OR REPLACE FUNCTION operations_private.review_json_before_deadlines(rid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$

BEGIN
 RETURN (
with candidates as materialized (
 select distinct ur.user_id as id
 from operations_private.reviews target
 join public.user_roles ur on ur.is_active
 join public.roles roles on roles.id=ur.role_id and roles.is_active
 join public.hris_users person on person.id=ur.user_id and lower(person.status)='active'
 where target.id=rid
 and ur.role_id=any(case when target.state='Awaiting BOD review' then array['Admin','Board of Director'] else array['Admin','Board of Director','Business Unit Manager','GeneralManager'] end)
 and (ur.scope_type='GLOBAL' or (ur.scope_type='SPECIFIC' and target.business_unit_id=any(ur.allowed_business_unit_ids)) or (ur.scope_type='HOME_ONLY' and person.business_unit_id=target.business_unit_id))
 union
 select permission.user_id from operations_private.reviews target
 join public.ops_permissions permission on permission.business_unit_id=target.business_unit_id and permission.can_review
 where target.id=rid and target.state<>'Awaiting BOD review'
), eligible as materialized (
 select person.id,person.full_name from candidates candidate
 join public.hris_users person on person.id=candidate.id and lower(person.status)='active'
 join operations_private.reviews target on target.id=rid
 where operations_private.review_eligible(target.id,target.state='Awaiting BOD review',person.id)
)
select to_jsonb(r)||jsonb_build_object('title',coalesce(o.title,v.content->>'title'),'unit_name',b.name,'location',v.content->>'location','asset',o.asset_context,'event',o.config->'event_window','assignment_status',a.status,
 'participants',(select coalesce(jsonb_agg(jsonb_build_object('id',x.assignee_id,'name',h.full_name)),'[]') from public.ops_assignments x join public.hris_users h on h.id=x.assignee_id where x.id=r.assignment_id or x.checklist_run_id=r.run_id),
 'can_review',operations_private.review_eligible(r.id,r.state='Awaiting BOD review') and (r.state='Awaiting BOD review' or r.reviewer_id is null or r.reviewer_id=public.current_hris_user_id()),
 'can_manage',operations_private.manager(r.business_unit_id),
 'reviewer_needed',not exists(select 1 from eligible h where r.state='Awaiting BOD review' or r.reviewer_id is null or r.reviewer_id=h.id),
 'eligible_reviewers',(select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'name',h.full_name)),'[]') from eligible h),
 'reviewer_name',(select full_name from public.hris_users where id=r.reviewer_id),'first_reviewer_name',(select full_name from public.hris_users where id=r.first_reviewer),
 'issues',(select coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object('responsible_name',(select full_name from public.hris_users where id=i.responsible_id),'can_recheck',i.status='Awaiting recheck' and i.responsible_id is distinct from public.current_hris_user_id() and r.state<>'Needs correction' and (operations_private.review_eligible(r.id,false) or operations_private.review_eligible(r.id,true)),
 'incident_id',case when operations_private.manager(r.business_unit_id) then (select incident_id from operations_private.hr_review_referrals where issue_id=i.id) else null end,
 'repeat_count',case when operations_private.review_manager(r.business_unit_id) then (select count(distinct q.review_id) from operations_private.review_issues q join operations_private.reviews qr on qr.id=q.review_id where qr.business_unit_id=r.business_unit_id and q.responsible_id=i.responsible_id and q.confirmed_quality and q.cause='Execution quality' and q.created_at>=now()-make_interval(days=>coalesce((select repeat_days from operations_private.review_settings where business_unit_id=r.business_unit_id),30))) else 0 end) order by i.created_at desc),'[]') from operations_private.review_issues i where i.review_id=r.id))
 from operations_private.reviews r join public.ops_assignments a on a.id=r.assignment_id join public.ops_template_versions v on v.id=a.template_version_id join public.business_units b on b.id=r.business_unit_id left join public.ops_occurrences o on o.id=a.occurrence_id where r.id=rid and operations_private.review_view(r.id)
 );
END
$function$;

-- Build each shared review once per authorized workspace, rather than once per assignee.
CREATE OR REPLACE FUNCTION operations_private.workspace(p_unit uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
declare w jsonb:=operations_private.workspace_before_review(p_unit);
begin
 return w||jsonb_build_object(
 'units',(select coalesce(jsonb_agg(u||jsonb_build_object('review',operations_private.review_manager((u->>'id')::uuid),'bod',operations_private.admin((u->>'id')::uuid))),'[]') from jsonb_array_elements(w->'units') u),
 'assignments',(
  with source as materialized (
   select a, r.id as review_id, r.state
   from jsonb_array_elements(w->'assignments') a
   left join operations_private.reviews r on r.assignment_id=(a->>'id')::uuid or (r.run_id is not null and r.run_id=(a->>'checklist_run_id')::uuid)
  ), reviewed as materialized (
   select r.id, operations_private.review_json(r.id) as payload
   from operations_private.reviews r
   where r.id in (select review_id from source)
  )
  select coalesce(jsonb_agg(source.a||jsonb_build_object('review',reviewed.payload,'execution',
   case when source.a->'execution' is null or source.a->'execution'='null'::jsonb then source.a->'execution'
   else source.a->'execution'||jsonb_build_object('can_reopen',source.state='Historical' and (source.a->'execution'->>'can_reopen')::bool) end)),'[]')
  from source left join reviewed on reviewed.id=source.review_id
 ));
end
$function$;
