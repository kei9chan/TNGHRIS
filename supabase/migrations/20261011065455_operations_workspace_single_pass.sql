-- Enrich authorized assignment rows once instead of rebuilding the full workspace at every phase.
-- workspace_base still enforces the original unit and assignment access checks.
CREATE OR REPLACE FUNCTION operations_private.workspace_before_review(p_unit uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
declare w jsonb:=operations_private.workspace_base(p_unit);
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
