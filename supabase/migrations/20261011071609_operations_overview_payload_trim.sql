-- Transfer only fields used by the task lists. Full instructions and review data load on opening a task.
CREATE OR REPLACE FUNCTION public.ops_workspace_overview(p_unit uuid default null)
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
  'kind',t.kind,'content',jsonb_build_object('title',v.content->'title','category',v.content->'category','flexible_timing',v.content->'flexible_timing'),'version',v.version,'assignee_name',h.full_name,
  'assignee_is_bum',operations_private.role_unit(h.id,a.business_unit_id,array['Business Unit Manager','GeneralManager']),
  'unit_name',b.name,'can_cancel',false,'items','[]'::jsonb,'history','[]'::jsonb,'instructions','',
  'members',case when a.checklist_run_id is null then '[]'::jsonb else (
   select coalesce(jsonb_agg(jsonb_build_object('id',x.assignee_id,'name',person.full_name) order by person.full_name),'[]')
   from public.ops_assignments x join public.hris_users person on person.id=x.assignee_id where x.checklist_run_id=a.checklist_run_id) end,
  'execution',case when run.execution_phase=2 then jsonb_build_object('id',run.id,'shared',run.shared,'outcome',run.outcome,'revision',run.revision,'submitted_at',run.submitted_at,'execution_phase',run.execution_phase,'items','[]'::jsonb,'can_write',false,'can_reopen',false) else null end,
  'review',case when review.id is not null then jsonb_build_object('id',review.id,'mode',review.mode,'state',review.state,'revision',review.revision,'critical',review.critical,'issues','[]'::jsonb,'eligible_reviewers','[]'::jsonb,'can_review',false,'can_manage',false) else null end,
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
