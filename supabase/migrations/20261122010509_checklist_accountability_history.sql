alter table public.ops_assignments add column accountability_trial boolean not null default false;
CREATE OR REPLACE FUNCTION operations_private.assign_individual(p_unit uuid, p_version uuid, p_selection jsonb, p_due timestamp with time zone, p_priority text, p_instructions text, p_attachments jsonb, p_verify boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=operations_private.actor();v public.ops_template_versions;t public.ops_templates;person record; batch uuid:=gen_random_uuid();aid uuid; n integer:=0;begin
 if p_due is null or p_priority not in ('Low','Normal','High','Urgent') then raise exception 'Due date and valid priority required';end if;
 if jsonb_typeof(p_attachments) is distinct from 'array' or jsonb_array_length(p_attachments)>20 or exists(select 1 from jsonb_array_elements(p_attachments) x where coalesce(x->>'url','') !~ '^https?://' or length(coalesce(x->>'name',''))=0) then raise exception 'Attachments require a name and http/https link';end if;
 select * into v from public.ops_template_versions where id=p_version;
 select * into t from public.ops_templates where id=v.template_id for share;
 if t.id is null or t.status<>'Published' or t.latest_version<>v.version or (t.business_unit_id is not null and t.business_unit_id<>p_unit) or not operations_private.can_view_template(t.id) then raise exception 'Choose a current published template from this unit or master library' using errcode='42501';end if;
 if p_selection->>'mode' not in ('individual','department','position','role','bum') then raise exception 'Choose an assignment audience';end if;
 for person in select h.id from public.hris_users h where lower(h.status)='active' and operations_private.member(h.id,p_unit) and (p_selection->>'mode' in ('individual','bum') or operations_private.can_assign(p_unit,h.id)) and
 ((p_selection->>'mode'='individual' and coalesce(p_selection->'ids','[]'::jsonb) ? h.id::text) or
 (p_selection->>'mode'='department' and h.department_id::text=p_selection->>'value') or
 (p_selection->>'mode'='position' and h.position=p_selection->>'value') or
 (p_selection->>'mode'='role' and exists(select 1 from public.user_roles rr join public.roles rrr on rrr.id=rr.role_id and rrr.is_active where rr.user_id=h.id and rr.is_active and rr.role_id=p_selection->>'value')) or
 (p_selection->>'mode'='bum' and coalesce(p_selection->'ids','[]'::jsonb) ? h.id::text and operations_private.role_unit(h.id,p_unit,array['Business Unit Manager','GeneralManager']))) loop
 if not operations_private.can_assign(p_unit,person.id) then raise exception 'An assignee is outside your authorized team' using errcode='42501';end if;
 insert into public.ops_assignments(accountability_trial,batch_id,business_unit_id,template_version_id,assignee_id,created_by,due_at,priority,instructions,attachments,requires_verification,verification_status)
 values(coalesce((p_selection->>'test_mode')::boolean,false),batch,p_unit,p_version,person.id,actor,p_due,p_priority,coalesce(p_instructions,''),p_attachments,p_verify,case when p_verify then 'Not yet implemented' else 'Not required' end) returning id into aid;
 insert into public.ops_audit_log(business_unit_id,assignment_id,actor_id,action,detail) values(p_unit,aid,actor,'Assigned',jsonb_build_object('assignee',person.id,'due_at',p_due));n:=n+1;
 end loop;
 if n=0 then raise exception 'No eligible assignees. Refresh your team selection.';end if;
 if p_selection->>'mode' in ('individual','bum') and n<>(select count(distinct value) from jsonb_array_elements_text(p_selection->'ids')) then raise exception 'Some selected employees are no longer eligible' using errcode='42501';end if;
 return batch;
end $function$
;
CREATE OR REPLACE FUNCTION phone_push_private.assignment_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not new.accountability_trial and new.status in('Assigned','In Progress') then
 insert into public.notifications(user_id,type,title,message,link,related_entity_id,dedupe_key)
 values(new.assignee_id::text,'info','New task assigned','Open Operations Station to view your instructions and due date.','/operations?view=Tasks&assignment='||new.id,new.id::text,'ops-phone-assignment:'||new.id) on conflict(user_id,dedupe_key) do nothing;
 end if;return new;
end$function$
;
CREATE OR REPLACE FUNCTION operations_private.capture_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.ops_assignments;r operations_private.reviews;rid uuid;by_user uuid;begin
 select * into a from public.ops_assignments where id=new.id;if a.accountability_trial or exists(select from operations_private.checklist_cases c where c.work_id=coalesce(a.checklist_run_id,a.id) and c.test) then return new;end if;rid:=operations_private.ensure_review(a.id);select * into r from operations_private.reviews where id=rid for update;
 -- Explicit rescheduling updates the live deadline/day; the original deadline stays in history.
 update operations_private.reviews set execution_due=a.due_at,operating_date=case when submission=0 and state='Executing' then coalesce((select operating_date from public.ops_occurrences where id=a.occurrence_id),(a.due_at at time zone 'Asia/Manila')::date) else operating_date end,
 review_due=case when submission=0 and state='Executing' then case when exists(select 1 from public.ops_occurrences where id=a.occurrence_id and config ? 'event_window') then a.due_at else a.due_at+make_interval(hours=>coalesce((select review_hours from operations_private.review_settings where business_unit_id=a.business_unit_id),24)) end else review_due end,revision=revision+1,updated_at=now()
 where id=rid and (execution_due is distinct from a.due_at or (submission=0 and state='Executing' and operating_date is distinct from coalesce((select operating_date from public.ops_occurrences where id=a.occurrence_id),(a.due_at at time zone 'Asia/Manila')::date)));
 select * into r from operations_private.reviews where id=rid;

 if not exists(select 1 from public.ops_assignments x where (x.id=r.assignment_id or x.checklist_run_id=r.run_id) and x.status<>'Cancelled') then update operations_private.reviews set state='Cancelled',revision=revision+1,updated_at=now() where id=rid and state<>'Cancelled';return null;end if;
 if a.status='Completed' and r.state in('Executing','Needs correction') and not exists(select 1 from public.ops_assignments x where (x.id=r.assignment_id or x.checklist_run_id=r.run_id) and x.status not in('Completed','Cancelled')) then
 select submitted_by into by_user from public.ops_checklist_runs where id=r.run_id;by_user:=coalesce(by_user,public.current_hris_user_id(),a.assignee_id);
 insert into operations_private.review_submissions(review_id,number,actor_id,snapshot) values(rid,r.submission+1,by_user,operations_private.review_snapshot(rid));
 update operations_private.reviews set submission=submission+1,state=case when mode='Daily Summary' then 'Confirmed' else 'Awaiting verification' end,first_reviewer=null,equipment_condition=null,revision=revision+1,updated_at=now() where id=rid returning * into r;
 if exists(select 1 from public.ops_responses x join public.ops_run_items y on y.id=x.item_id where y.run_id=r.run_id and x.issue) then
 perform operations_private.new_review_issue(rid,(select string_agg((y.snapshot->>'title')||': '||coalesce(nullif(x.remarks,''),'Issue flagged by employee'),E'\n') from public.ops_responses x join public.ops_run_items y on y.id=x.item_id where y.run_id=r.run_id and x.issue),case when r.critical then 'Critical' else 'Important' end,'Other',null,now()+interval '24 hours');
 end if;
 end if;return null;
end$function$
;
CREATE OR REPLACE FUNCTION operations_private.submit_run(p_run uuid, p_revision integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare o uuid;begin
 perform 1 from operations_private.checklist_cases where work_id=p_run for update;
 perform operations_private.submit_run_before_events(p_run,p_revision);
 select x.id into o from public.ops_occurrences x join public.ops_assignments a on a.occurrence_id=x.id where a.checklist_run_id=p_run and x.config ? 'event_window' limit 1;
 update operations_private.checklist_cases c set submitted_at=r.submitted_at from public.ops_checklist_runs r where r.id=p_run and c.work_id=p_run;
 if o is not null then perform operations_private.evaluate_occurrence(o,now());end if;
end $function$
;
CREATE OR REPLACE FUNCTION operations_private.workspace(p_unit uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w jsonb:=operations_private.workspace_before_review(p_unit);
begin
 return w||jsonb_build_object(
 'units',(select coalesce(jsonb_agg(u||jsonb_build_object('review',operations_private.review_manager((u->>'id')::uuid),'bod',operations_private.admin((u->>'id')::uuid))),'[]') from jsonb_array_elements(w->'units') u),
 'assignments',(
  with source as materialized (
   select a||jsonb_build_object('accountability_test',coalesce(cc.test,false),'accountability_state',operations_private.case_state(cc),'accountability_active',operations_private.case_active(coalesce((a->>'checklist_run_id')::uuid,(a->>'id')::uuid))) a, r.id as review_id, r.state
   from jsonb_array_elements(w->'assignments') a
   left join operations_private.reviews r on r.assignment_id=(a->>'id')::uuid or (r.run_id is not null and r.run_id=(a->>'checklist_run_id')::uuid)
   left join operations_private.checklist_cases cc on cc.work_id=coalesce((a->>'checklist_run_id')::uuid,(a->>'id')::uuid) where cc.discarded_at is null
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
$function$
;
CREATE OR REPLACE FUNCTION public.ops_my_dashboard_tasks()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.due_at nulls last,x.id),'[]') from (
    select distinct on (coalesce(a.checklist_run_id,a.id)) a.id,a.due_at,a.status,
      case when exists(select from operations_private.checklist_cases c where c.work_id=coalesce(a.checklist_run_id,a.id) and c.test) then 'Test · ' else '' end || (v.content->>'title') title,b.name unit,t.kind
    from public.ops_assignments a
    join public.ops_template_versions v on v.id=a.template_version_id
    join public.ops_templates t on t.id=v.template_id
    join public.business_units b on b.id=a.business_unit_id
    left join public.ops_checklist_runs r on r.id=a.checklist_run_id
    where a.assignee_id=operations_private.actor() and a.status in ('Assigned','In Progress')
      and operations_private.case_active(coalesce(a.checklist_run_id,a.id)) and r.submitted_at is null and operations_private.can_view_assignment(a.id)
    order by coalesce(a.checklist_run_id,a.id),a.due_at,a.id
  ) x
$function$
;
CREATE OR REPLACE FUNCTION public.ops_checklist_decide(p_ids uuid[], p_action text, p_reason text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c operations_private.checklist_cases; actor uuid:=operations_private.actor(); ir uuid; bu text; emp text;
begin
 if p_ids is null or cardinality(p_ids)=0 or cardinality(p_ids)>500 or p_action is null or p_action not in ('Request','Close','Excuse','Discard','Refer') then raise exception 'Invalid checklist action';end if;
 if p_action in ('Close','Excuse') and length(trim(coalesce(p_reason,'')))<3 then raise exception 'Add a short reason';end if;
 for c in select * from operations_private.checklist_cases where work_id=any(p_ids) order by work_id for update loop
 if not operations_private.manager(c.unit_id) then raise exception 'Manager access required';end if;
 if p_action='Discard' then
 if not operations_private.role_unit(actor,c.unit_id,array['Admin']) then raise exception 'Admin access required';end if;
 if c.discarded_at is not null then continue;end if;
 update operations_private.checklist_cases set discarded_at=now(),discarded_by=actor,test=true where work_id=c.work_id;
 elsif p_action='Refer' then
 if c.incident_id is not null then continue;end if;
 if operations_private.case_state(c)<>'Missed' or c.test then raise exception 'Only a reviewed, confirmed miss can be referred';end if;
 select name into bu from public.business_units where id=c.unit_id;select full_name into emp from public.hris_users where id=c.owner_id;
 insert into public.incident_reports(category,description,location,date_time,reported_by,involved_employee_ids,involved_employee_names,witness_ids,witness_names,status,pipeline_stage,nte_ids,business_unit_id,business_unit_name,chat_thread)
 values('Operations review',concat('Checklist: ',c.title,E'\nOriginal deadline (Manila): ',c.due_at at time zone 'Asia/Manila',E'\nManager review: ',c.reason,E'\nChecklist record: ',c.work_id),bu,now(),actor,array_remove(array[c.owner_id],null),array_remove(array[emp],null),'{}','{}','Submitted','ir-review','{}',c.unit_id,bu,'[]') returning id into ir;
 update operations_private.checklist_cases set incident_id=ir where work_id=c.work_id;
 else
 if exists(select from public.ops_checklist_runs r where r.id=c.work_id and r.submitted_at is not null) or operations_private.case_state(c) not in ('Missed — needs review','Overdue','Completion requested') then raise exception 'Checklist changed. Refresh the review.';end if;
 if p_action='Close' and now()<c.shift_end then raise exception 'Wait until the shift ends before confirming a miss';end if;
 update operations_private.checklist_cases set decision=p_action,reason=trim(p_reason) where work_id=c.work_id;
 end if;
 if p_action='Request' and not c.test and c.owner_id is not null then
 perform operations_private.review_notice(c.owner_id,'request-completion:'||c.work_id,'Your manager requested completion of '||c.title||'.','/operations?view=Checklist%20history&unit='||c.unit_id);
 end if;
 insert into operations_private.checklist_case_events(work_id,action,reason,actor) values(c.work_id,p_action,trim(p_reason),actor);
 end loop;
end $function$
;
CREATE OR REPLACE FUNCTION public.ops_checklist_cases(p_unit uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(to_jsonb(x) order by due_at desc),'[]') from (
 select c.work_id,c.unit_id,b.name unit,c.title,c.due_at,c.shift_end,c.submitted_at,c.test,c.discarded_at,c.reason,c.incident_id,
 (select jsonb_agg(jsonb_build_object('action',e.action,'at',e.recorded_at,'reason',e.reason,'actor',h.full_name) order by e.recorded_at) from operations_private.checklist_case_events e left join public.hris_users h on h.id=e.actor where e.work_id=c.work_id) events,
 operations_private.case_state(c) state,h.full_name owner, operations_private.manager(c.unit_id) manage,
 operations_private.role_unit(operations_private.actor(),c.unit_id,array['Admin']) admin,
 (select a.id from public.ops_assignments a where coalesce(a.checklist_run_id,a.id)=c.work_id and a.assignee_id=operations_private.actor() limit 1) assignment,
 (select string_agg(h2.full_name,', ' order by h2.full_name) from public.ops_assignments a join public.hris_users h2 on h2.id=a.assignee_id where coalesce(a.checklist_run_id,a.id)=c.work_id and a.assignee_id is distinct from c.owner_id and a.status<>'Cancelled') contributors
 from operations_private.checklist_cases c join public.business_units b on b.id=c.unit_id left join public.hris_users h on h.id=c.owner_id
 where not c.cancelled and (p_unit is null or c.unit_id=p_unit) and (operations_private.manager(c.unit_id)
 or exists(select from operations_private.checklist_result_units(operations_private.actor()) u where u.id=c.unit_id)
 or exists(select from public.ops_assignments a where coalesce(a.checklist_run_id,a.id)=c.work_id and a.assignee_id=operations_private.actor() and a.status<>'Cancelled'))
 and (c.discarded_at is null or operations_private.role_unit(operations_private.actor(),c.unit_id,array['Admin']))) x $function$
;
