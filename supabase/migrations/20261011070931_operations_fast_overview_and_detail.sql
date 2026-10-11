-- Enrich authorized assignment rows once instead of rebuilding the full workspace at every phase.
-- workspace_base still enforces the original unit and assignment access checks.
CREATE OR REPLACE FUNCTION operations_private.enrich_workspace(w jsonb, p_unit uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
begin
 return w||jsonb_build_object(
 'assets',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name) order by a.name,a.id),'[]')
  from public.assets a join public.business_units b on b.id=p_unit
  where operations_private.can_use_library(p_unit) and a.requires_maintenance
  and a.business_unit_id in(b.id::text,b.name) and a.status::text<>'Retired'),
 'assignments',(
  with source as materialized (
   select entry as payload, a.*, o.asset_context, o.owner_id, o.config as occurrence_config,
    o.window_start, o.window_end, o.due_at as occurrence_due, o.coverage, o.coverage_reason,
    o.revision as occurrence_revision, o.status as occurrence_status,
    s as snooze_record
   from jsonb_array_elements(w->'assignments') entry
   join public.ops_assignments a on a.id=(entry->>'id')::uuid
   left join public.ops_occurrences o on o.id=a.occurrence_id
   left join operations_private.ops_snoozes s on s.assignment_id=a.id
  ), runs as materialized (
   select r.id, to_jsonb(r)||jsonb_build_object(
    'can_write',operations_private.can_write_run(r.id),
    'can_reopen',r.submitted_at is not null and (operations_private.manager(r.business_unit_id) or exists(
     select 1 from public.ops_assignments x where x.checklist_run_id=r.id and x.assignee_id=operations_private.actor() and operations_private.member(x.assignee_id,x.business_unit_id))),
    'items',(select coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object(
     'response',to_jsonb(response),'error',operations_private.response_error(i.id,response.value,response.remarks,true),
     'evidence',(select coalesce(jsonb_agg((to_jsonb(e)-'last_error'-'next_attempt_at')||jsonb_build_object(
      'accessible',e.state='Ready' and e.expires_at>now() and e.deleted_at is null) order by e.created_at),'[]')
      from public.ops_evidence e where e.item_id=i.id)) order by i.ordinal),'[]')
     from public.ops_run_items i join public.ops_responses response on response.item_id=i.id where i.run_id=r.id)
   ) as execution
   from public.ops_checklist_runs r
   where r.execution_phase=2 and r.id in(select checklist_run_id from source)
  )
  select coalesce(jsonb_agg(source.payload||jsonb_build_object(
   'members',case when source.checklist_run_id is null then '[]'::jsonb else (
    select coalesce(jsonb_agg(jsonb_build_object('id',x.assignee_id,'name',h.full_name) order by h.full_name),'[]')
    from public.ops_assignments x join public.hris_users h on h.id=x.assignee_id where x.checklist_run_id=source.checklist_run_id) end,
   'checks',case when source.checklist_run_id is null then '[]'::jsonb else (
    select coalesce(jsonb_agg(to_jsonb(c)),'[]') from public.ops_item_checks c where c.run_id=source.checklist_run_id) end,
   'can_check',source.checklist_run_id is not null and exists(
    select 1 from public.ops_assignments x where x.checklist_run_id=source.checklist_run_id and x.assignee_id=operations_private.actor() and x.status<>'Cancelled' and operations_private.member(x.assignee_id,x.business_unit_id)),
   'history',(select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('actor_name',coalesce(e.detail->>'actor_name',h.full_name)) order by e.created_at,e.id),'[]')
    from public.ops_audit_log e left join public.hris_users h on h.id=e.actor_id where e.assignment_id=source.id
    or (source.checklist_run_id is not null and e.assignment_id in(select id from public.ops_assignments x where x.checklist_run_id=source.checklist_run_id))),
   'execution',runs.execution,
   'occurrence_id',source.occurrence_id,
   'can_cancel',case when source.occurrence_id is null then (source.payload->>'can_cancel')::bool else false end,
   'maintenance',source.asset_context,
   'maintenance_owner',(select full_name from public.hris_users where id=source.owner_id),
   'can_snooze',operations_private.can_snooze(source.id),
   'snooze',case when source.assignee_id=public.current_hris_user_id() then to_jsonb(source.snooze_record) else null end,
   'event',case when source.occurrence_config ? 'event_window' then source.occurrence_config->'event_window'||jsonb_build_object(
    'start',source.window_start,'end',source.window_end,'due',source.occurrence_due,
    'owner_name',(select full_name from public.hris_users where id=source.owner_id),
    'coverage',source.coverage,'coverage_reason',source.coverage_reason,'occurrence_revision',source.occurrence_revision,
    'can_claim',source.occurrence_status='Open' and source.owner_id is null and source.occurrence_config->>'execution'='shared' and exists(
     select 1 from public.ops_occurrence_staff z where z.occurrence_id=source.occurrence_id and z.employee_id=public.current_hris_user_id() and z.active)) else null end
  ) order by source.due_at),'[]')
  from source left join runs on runs.id=source.checklist_run_id
 ));
end
$function$;

-- Retain the full workspace API for editors, libraries and existing integrations.
CREATE OR REPLACE FUNCTION operations_private.workspace_before_review(p_unit uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$ select operations_private.enrich_workspace(operations_private.workspace_base(p_unit),p_unit) $function$;

-- Lists need status and ownership, not all responses, evidence and audit history.
CREATE FUNCTION public.ops_workspace_overview(p_unit uuid default null)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
declare actor uuid:=operations_private.actor();
begin
 if p_unit is not null and not (operations_private.member(actor,p_unit) or operations_private.manager(p_unit) or exists(
  select 1 from public.ops_assignments where assignee_id=actor and business_unit_id=p_unit))
 then raise exception 'Business unit is not authorized' using errcode='42501';end if;
 return jsonb_build_object('actor',actor,'masterAdmin',operations_private.admin(null),'summary',true,
 'units',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,
  'manage',operations_private.manager(b.id),'edit',operations_private.can_edit(b.id),
  'assign',operations_private.manager(b.id) or exists(select 1 from public.ops_permissions p where p.user_id=actor and p.business_unit_id=b.id and p.can_assign and operations_private.member(actor,b.id)),
  'review',operations_private.review_manager(b.id),'bod',operations_private.admin(b.id)) order by b.name),'[]')
  from public.business_units b where operations_private.member(actor,b.id) or operations_private.manager(b.id) or exists(select 1 from public.ops_assignments where assignee_id=actor and business_unit_id=b.id)),
 'departments','[]'::jsonb,'people','[]'::jsonb,'assets','[]'::jsonb,'templates','[]'::jsonb,'permissions','[]'::jsonb,
 'assignments',(select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object(
  'kind',t.kind,'content',v.content-'items','version',v.version,'assignee_name',h.full_name,
  'assignee_is_bum',operations_private.role_unit(h.id,a.business_unit_id,array['Business Unit Manager','GeneralManager']),
  'unit_name',b.name,'can_cancel',false,'items','[]'::jsonb,'history','[]'::jsonb,
  'members',case when a.checklist_run_id is null then '[]'::jsonb else (
   select coalesce(jsonb_agg(jsonb_build_object('id',x.assignee_id,'name',person.full_name) order by person.full_name),'[]')
   from public.ops_assignments x join public.hris_users person on person.id=x.assignee_id where x.checklist_run_id=a.checklist_run_id) end,
  'execution',case when run.execution_phase=2 then to_jsonb(run)||jsonb_build_object('items','[]'::jsonb,'can_write',false,'can_reopen',false) else null end,
  'review',case when review.id is not null then to_jsonb(review)||jsonb_build_object('issues','[]'::jsonb,'eligible_reviewers','[]'::jsonb,'can_review',false,'can_manage',false) else null end,
  'maintenance',o.asset_context,'maintenance_owner',(select full_name from public.hris_users where id=o.owner_id),
  'snooze',case when a.assignee_id=actor then to_jsonb(s) else null end,
  'event',case when o.config ? 'event_window' then o.config->'event_window'||jsonb_build_object(
   'start',o.window_start,'end',o.window_end,'due',o.due_at,'owner_name',(select full_name from public.hris_users where id=o.owner_id),
   'coverage',o.coverage,'coverage_reason',o.coverage_reason,'occurrence_revision',o.revision,'can_claim',false) else null end
 ) order by a.due_at),'[]')
 from public.ops_assignments a
 join public.ops_template_versions v on v.id=a.template_version_id join public.ops_templates t on t.id=v.template_id
 join public.hris_users h on h.id=a.assignee_id join public.business_units b on b.id=a.business_unit_id
 left join public.ops_checklist_runs run on run.id=a.checklist_run_id
 left join public.ops_occurrences o on o.id=a.occurrence_id
 left join operations_private.ops_snoozes s on s.assignment_id=a.id
 left join operations_private.reviews review on review.assignment_id=a.id or (review.run_id is not null and review.run_id=a.checklist_run_id)
 where (p_unit is null or a.business_unit_id=p_unit) and operations_private.can_view_assignment(a.id)));
end
$function$;

CREATE FUNCTION public.ops_assignment_detail(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
declare actor uuid:=operations_private.actor(); row_json jsonb; enriched jsonb; review operations_private.reviews;
begin
 select to_jsonb(a)||jsonb_build_object('kind',t.kind,'content',v.content,'version',v.version,
  'assignee_name',h.full_name,'assignee_is_bum',operations_private.role_unit(h.id,a.business_unit_id,array['Business Unit Manager','GeneralManager']),
  'unit_name',b.name,'can_cancel',operations_private.manager(a.business_unit_id) or (a.created_by=actor and operations_private.can_assign(a.business_unit_id,a.assignee_id)),
  'items',(select coalesce(jsonb_agg(to_jsonb(i) order by i.ordinal),'[]') from public.ops_checklist_items i where i.checklist_version_id=v.id),
  'history','[]'::jsonb) into row_json
 from public.ops_assignments a join public.ops_template_versions v on v.id=a.template_version_id join public.ops_templates t on t.id=v.template_id
 join public.hris_users h on h.id=a.assignee_id join public.business_units b on b.id=a.business_unit_id
 where a.id=p_id and operations_private.can_view_assignment(a.id);
 if row_json is null then raise exception 'Assignment is unavailable' using errcode='42501';end if;
 enriched:=operations_private.enrich_workspace(jsonb_build_object('assignments',jsonb_build_array(row_json)),null)->'assignments'->0;
 select r.* into review from operations_private.reviews r where r.assignment_id=p_id or (r.run_id is not null and r.run_id=(row_json->>'checklist_run_id')::uuid);
 return enriched||jsonb_build_object('review',operations_private.review_json(review.id),
 'execution',case when enriched->'execution' is null or enriched->'execution'='null'::jsonb then enriched->'execution'
  else enriched->'execution'||jsonb_build_object('can_reopen',review.state='Historical' and (enriched->'execution'->>'can_reopen')::bool) end);
end
$function$;

REVOKE ALL ON FUNCTION operations_private.enrich_workspace(jsonb,uuid) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.ops_workspace_overview(uuid),public.ops_assignment_detail(uuid) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.ops_workspace_overview(uuid),public.ops_assignment_detail(uuid) TO authenticated;
