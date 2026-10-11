-- Narrow the candidate pool before applying the unchanged reviewer eligibility predicate.
-- Materialize eligibility once per review for both the list and missing-reviewer flag.
CREATE OR REPLACE FUNCTION operations_private.review_json_before_deadlines(rid uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$

