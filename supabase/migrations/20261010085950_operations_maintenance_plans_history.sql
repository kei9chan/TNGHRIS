-- Maintenance plans extend the existing recurring-rule engine. No duplicate assets or workers.
alter table public.ops_rules add column asset_id uuid references public.assets(id), add column maintenance_blocked text, add column maintenance_blocked_at timestamptz;
alter table public.ops_rules drop constraint ops_rules_status_check;
alter table public.ops_rules add constraint ops_rules_status_check check(status in('Draft','Active','Paused','Archived'));
create index ops_rules_asset on public.ops_rules(asset_id) where asset_id is not null;
alter table public.ops_occurrences add column asset_context jsonb;
create index ops_maintenance_history on public.ops_occurrences(business_unit_id,operating_date desc,id) where asset_context is not null;
create index ops_occurrences_asset on public.ops_occurrences((asset_context->>'id'),operating_date desc) where asset_context is not null;

create function operations_private.maintenance_asset_reason(p_asset uuid,p_unit uuid) returns text language sql stable security definer set search_path='' as $$
 select case when a.id is null then 'Asset is unavailable' when a.business_unit_id is distinct from p_unit::text and a.business_unit_id is distinct from u.name then 'Asset transferred to another business unit' when a.status::text='Retired' then 'Asset retired' when not a.requires_maintenance then 'Requires maintenance disabled' else null end from (select 1) x left join public.assets a on a.id=p_asset left join public.business_units u on u.id=p_unit
$$;

alter function operations_private.validate_rule(uuid,uuid,jsonb) rename to validate_rule_phase3;
create function operations_private.validate_rule(u uuid,v uuid,c jsonb) returns void language plpgsql security definer set search_path='' as $$
declare freq text:=c->>'frequency';d text;m jsonb;asset uuid;reason text;begin
 perform operations_private.validate_rule_phase3(u,v,c||jsonb_build_object('frequency',case when freq in('yearly','dates','annual_dates') then 'once' else freq end,'interval',1));
 if (c->>'interval')::int not between 1 and 366 then raise exception 'Repeat interval must be 1 to 366';end if;
 if freq not in('once','daily','weekly','monthly','yearly','dates','annual_dates') then raise exception 'Invalid frequency';end if;
 if freq='dates' then
 if jsonb_typeof(c->'service_dates') is distinct from 'array' or jsonb_array_length(c->'service_dates') not between 1 and 366 then raise exception 'Choose explicit service dates';end if;
 for d in select value from jsonb_array_elements_text(c->'service_dates') loop if d !~ '^\d{4}-\d{2}-\d{2}$' or d::date::text<>d then raise exception 'Invalid service date';end if;end loop;
 if (select count(distinct value) from jsonb_array_elements_text(c->'service_dates'))<>jsonb_array_length(c->'service_dates') then raise exception 'Service dates must be unique';end if;
 end if;
 if freq in('yearly','annual_dates') and (c->>'short_month' is null or c->>'short_month' not in('last','skip')) then raise exception 'Select leap/short-month behavior';end if;
 if freq='annual_dates' then
 if jsonb_typeof(c->'annual_dates') is distinct from 'array' or jsonb_array_length(c->'annual_dates') not between 1 and 366 or (c->>'times_per_year')::int is distinct from jsonb_array_length(c->'annual_dates') then raise exception 'Times per year must match explicit month/day dates';end if;
 for m in select value from jsonb_array_elements(c->'annual_dates') loop if (m->>'month')::int not between 1 and 12 or (m->>'day')::int not between 1 and 31 or m->>'month' is null or m->>'day' is null then raise exception 'Invalid annual service date';end if;perform make_date(2028,(m->>'month')::int,(m->>'day')::int);end loop;
 if (select count(distinct value) from jsonb_array_elements(c->'annual_dates'))<>jsonb_array_length(c->'annual_dates') then raise exception 'Annual dates must be unique';end if;
 end if;
 if c ? 'maintenance' then
 m:=c->'maintenance';asset:=nullif(m->>'asset_id','')::uuid;
 if asset is null then raise exception 'Maintenance asset is required';end if;
 reason:=operations_private.maintenance_asset_reason(asset,u);if reason is not null then raise exception '%',reason;end if;
 if m->>'category' not in('Cleaning','Inspection','Preventive Maintenance','Servicing','Other') or m->>'category' is null then raise exception 'Choose a maintenance category';end if;
 if nullif(m->>'sop_url','') is not null and m->>'sop_url' !~ '^https?://' then raise exception 'Manual link must use http or https';end if;
 if coalesce((m->>'estimated_minutes')::int,0) not between 0 and 10080 then raise exception 'Invalid estimated duration';end if;
 if nullif(m->>'responsible_manager_id','') is null or not operations_private.role_unit((m->>'responsible_manager_id')::uuid,u,array['Business Unit Manager','GeneralManager','Admin','Board of Director']) then raise exception 'Responsible manager must manage this business unit';end if;
 if c->>'mode'<>'shift' or c->>'execution'<>'shared' or c->>'anchor'<>'fixed' then raise exception 'Maintenance uses published-shift staffing, shared execution and fixed calendar windows';end if;
 if exists(select 1 from public.ops_template_versions z where z.id=v and nullif(z.content->>'asset_id','') is not null and z.content->>'asset_id'<>asset::text) or exists(select 1 from public.ops_checklist_items i where i.checklist_version_id=v and nullif(i.snapshot->>'asset_id','') is not null and i.snapshot->>'asset_id'<>asset::text) then raise exception 'Published template references a different asset';end if;
 end if;
end $$;

alter function operations_private.recurrence_due(jsonb,date) rename to recurrence_due_phase3;
create function operations_private.recurrence_due(c jsonb,d date) returns boolean language plpgsql immutable set search_path='' as $$
declare start_d date:=(c->>'start_date')::date;freq text:=c->>'frequency';n int:=(c->>'interval')::int;months int;day_target int;month_target int;x jsonb;last_day int;begin
 if freq not in('yearly','dates','annual_dates') then return operations_private.recurrence_due_phase3(c,d);end if;
 if d<start_d or (nullif(c->>'end_date','') is not null and d>(c->>'end_date')::date) or coalesce(c->'excluded_dates','[]') ? d::text then return false;end if;
 if freq='dates' then return coalesce(c->'service_dates','[]') ? d::text;end if;
 last_day:=extract(day from(date_trunc('month',d)+interval '1 month - 1 day'))::int;
 if freq='yearly' then
 if (extract(year from d)::int-extract(year from start_d)::int)%n<>0 then return false;end if;
 month_target:=extract(month from start_d)::int;day_target:=extract(day from start_d)::int;
 if c->>'short_month'='last' then day_target:=least(day_target,last_day);end if;
 return extract(month from d)::int=month_target and extract(day from d)::int=day_target;
 end if;
 for x in select value from jsonb_array_elements(c->'annual_dates') loop
 day_target:=(x->>'day')::int;if c->>'short_month'='last' then day_target:=least(day_target,last_day);end if;
 if extract(month from d)::int=(x->>'month')::int and extract(day from d)::int=day_target then return true;end if;end loop;return false;
end $$;

-- Plan writes use existing role scope, versions and optimistic locking. Nonactive state changes
-- remain possible after an asset becomes ineligible; activation always requires fresh review.
alter function operations_private.save_rule(uuid,uuid,text,uuid,jsonb,text,integer,text) rename to save_rule_phase3;
create function operations_private.save_rule(p_id uuid,p_unit uuid,p_title text,p_version uuid,p_config jsonb,p_status text,p_revision int,p_note text) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.ops_rules;result uuid;draft bool:=p_status='Draft';asset uuid;begin
 perform operations_private.actor();
 if p_id is not null then select * into r from public.ops_rules where id=p_id for update;
 if not found or not operations_private.rule_manage(p_id) or r.business_unit_id<>p_unit then raise exception 'Plan is not authorized' using errcode='42501';end if;
 if r.asset_id is not null and (not p_config ? 'maintenance' or p_config->'maintenance'->>'asset_id' is distinct from r.asset_id::text) then raise exception 'Plan asset and original unit cannot change; create a new plan';end if;end if;
 if draft and not p_config ? 'maintenance' then raise exception 'Draft status is reserved for maintenance plans';end if;
 if p_config ? 'maintenance' and (p_id is null or p_status='Active' or p_config is distinct from r.config or p_version is distinct from r.template_version_id) then perform operations_private.validate_rule(p_unit,p_version,p_config);end if;
 result:=operations_private.save_rule_phase3(p_id,p_unit,p_title,p_version,p_config,case when draft then 'Paused' else p_status end,p_revision,p_note);
 if p_config ? 'maintenance' then
 asset:=(p_config->'maintenance'->>'asset_id')::uuid;
 update public.ops_rules set asset_id=asset,status=case when draft then 'Draft' else p_status end,maintenance_blocked=case when p_status='Active' then null else maintenance_blocked end,maintenance_blocked_at=case when p_status='Active' then null else maintenance_blocked_at end where id=result;
 perform operations_private.auto_audit(result,null,'Maintenance plan saved',jsonb_build_object('asset_id',asset,'status',p_status,'reason',p_note));
 end if;return result;
end $$;

create function operations_private.maintenance_capture() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.ops_rules;a public.assets;begin
 select * into r from public.ops_rules where id=new.rule_id;
 if r.asset_id is not null then
 if r.maintenance_blocked is not null or operations_private.maintenance_asset_reason(r.asset_id,r.business_unit_id) is not null then raise exception 'Maintenance plan blocked; review asset eligibility';end if;
 select * into a from public.assets where id=r.asset_id;
 new.asset_context:=jsonb_build_object('id',a.id,'name',a.name,'asset_tag',a.asset_tag,'type',a.type,'brand',a.brand,'model',a.model,'serial_number',a.serial_number,'business_unit_id',r.business_unit_id,'unit_name',(select name from public.business_units where id=r.business_unit_id),'plan_id',r.id,'activity',r.title,'maintenance',r.config->'maintenance');
 end if;return new;
end $$;
create trigger ops_maintenance_capture before insert on public.ops_occurrences for each row execute function operations_private.maintenance_capture();

create function operations_private.maintenance_asset_changed() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.ops_rules;reason text;begin
 for r in select * from public.ops_rules where asset_id=new.id and status<>'Archived' order by id for update loop
 reason:=operations_private.maintenance_asset_reason(new.id,r.business_unit_id);
 if reason is null or r.maintenance_blocked is not distinct from reason then continue;end if;
 update public.ops_rules set maintenance_blocked=reason,maintenance_blocked_at=now(),status=case when status='Active' then 'Paused' else status end,revision=revision+1,updated_at=now() where id=r.id;
 insert into public.ops_rule_versions(rule_id,revision,title,template_version_id,config,actor_id) values(r.id,r.revision+1,r.title,r.template_version_id,r.config,r.updated_by);
 perform operations_private.auto_audit(r.id,null,'Maintenance generation blocked',jsonb_build_object('reason',reason,'asset_id',new.id),true);
 insert into public.notifications(user_id,type,title,message,link,related_entity_id,dedupe_key)
 select h.id::text,'info','Maintenance plan needs review',r.title||': '||reason,'/operations?view=Maintenance',r.id::text,'ops-maintenance:'||r.id||':'||(r.revision+1)::text from public.hris_users h where lower(h.status)='active' and h.id in(r.updated_by,nullif(r.config->'maintenance'->>'responsible_manager_id','')::uuid) and (operations_private.member(h.id,r.business_unit_id) or operations_private.role_unit(h.id,r.business_unit_id,array['Admin','Board of Director'])) on conflict(user_id,dedupe_key) do nothing;
 end loop;return new;
end $$;
create trigger ops_maintenance_asset_changed after update of requires_maintenance,status,business_unit_id on public.assets for each row execute function operations_private.maintenance_asset_changed();

create or replace function operations_private.generate_rule(p_id uuid,p_now timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare r public.ops_rules;rv public.ops_rule_versions;d date;w jsonb;o uuid;today date:=(p_now at time zone 'Asia/Manila')::date;begin
 select * into r from public.ops_rules where id=p_id for update;
 perform operations_private.validate_rule(r.business_unit_id,r.template_version_id,case when r.asset_id is not null and (r.maintenance_blocked is not null or operations_private.maintenance_asset_reason(r.asset_id,r.business_unit_id) is not null) then r.config-'maintenance' else r.config end);
 update public.ops_rules set last_attempt_at=p_now where id=r.id;
 if r.status='Active' and (r.asset_id is null or (r.maintenance_blocked is null and operations_private.maintenance_asset_reason(r.asset_id,r.business_unit_id) is null)) then
 select * into rv from public.ops_rule_versions where rule_id=r.id and revision=r.revision;
 for d in select x::date from generate_series(greatest(today-1,r.resume_from)::timestamp,(today+coalesce((r.config->>'horizon_days')::int,7))::timestamp,interval '1 day') x loop
 if not operations_private.recurrence_due(r.config,d) then continue;end if;
 w:=operations_private.rule_window(r.config,d,r.business_unit_id);
 if (w->>'end')::timestamptz<=p_now and d<today then continue;end if;
 insert into public.ops_occurrences(rule_id,rule_version_id,business_unit_id,operating_date,title,config,template_version_id,window_start,window_end,due_at) values(r.id,rv.id,r.business_unit_id,d,r.title,r.config||case when w ? 'warning' then jsonb_build_object('timing_warning',w->>'warning') else '{}'::jsonb end,r.template_version_id,(w->>'start')::timestamptz,(w->>'end')::timestamptz,(w->>'due')::timestamptz) on conflict(rule_id,operating_date) do nothing returning id into o;
 if o is not null then perform operations_private.auto_audit(r.id,o,'Occurrence generated',jsonb_build_object('rule_revision',r.revision,'operating_date',d),true);end if;end loop;end if;
 for o in select id from public.ops_occurrences where rule_id=r.id and (status='Open' or operating_date>=today-1) and operating_date<=today+31 order by coalesce(evaluated_at,'epoch'),due_at limit 200 loop
 perform operations_private.reconcile(o,p_now);perform operations_private.queue_notices(o,p_now);end loop;
 update public.ops_rules set last_success_at=p_now,last_error=null where id=r.id;
end $$;

create or replace function operations_private.reconcile(p_occ uuid,p_now timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare o public.ops_occurrences;r public.ops_rules;rv public.ops_rule_versions;w jsonb;p record;av jsonb;ids uuid[]:='{}';preferred uuid;did_start bool;begin
 select * into o from public.ops_occurrences where id=p_occ for update;select * into r from public.ops_rules where id=o.rule_id;
 if o.status<>'Open' then return;end if;perform 1 from public.ops_checklist_runs z where z.id in(select checklist_run_id from public.ops_assignments where occurrence_id=o.id) order by z.id for update;did_start:=operations_private.started(o.id);
 -- Once a rule is paused, future generation stops; existing assignments remain actionable.
 if not did_start and not o.override and r.status='Active' and o.asset_context is null then
 select * into rv from public.ops_rule_versions where rule_id=r.id and revision=r.revision;
 if not operations_private.recurrence_due(r.config,o.operating_date) then
 for p in select employee_id id from public.ops_occurrence_staff where occurrence_id=o.id and active loop perform operations_private.remove_staff(o.id,p.id,'Recurrence changed before execution');end loop;
 update public.ops_occurrences set status='Skipped',coverage='Skipped',coverage_reason='Recurrence changed before execution',revision=revision+1 where id=o.id;perform operations_private.auto_audit(r.id,o.id,'Occurrence skipped',jsonb_build_object('reason','Recurrence changed'),true);return;end if;
 -- Existing frozen executions are never rewritten; template changes apply to newly generated dates.
 w:=operations_private.rule_window(r.config,o.operating_date,r.business_unit_id);
 update public.ops_occurrences set window_start=(w->>'start')::timestamptz,window_end=(w->>'end')::timestamptz,due_at=(w->>'due')::timestamptz,config=r.config||jsonb_build_object('execution',o.config->>'execution')||case when w ? 'warning' then jsonb_build_object('timing_warning',w->>'warning') else '{}'::jsonb end,rule_version_id=rv.id where id=o.id returning * into o;
 update public.ops_assignments set due_at=o.due_at,updated_at=p_now,revision=revision+1 where occurrence_id=o.id and due_at is distinct from o.due_at;
 end if;
 for p in select * from operations_private.rule_people(o.business_unit_id,o.config) loop
 av:=operations_private.availability(p.id,o.business_unit_id,o.operating_date,o.window_start,o.window_end,p_now);
 if o.config->>'mode'='fixed' or (av->>'eligible')::bool then ids:=array_append(ids,p.id);end if;end loop;
 if not did_start and not o.override then
 for p in select employee_id id from public.ops_occurrence_staff where occurrence_id=o.id and active and not(employee_id=any(ids)) loop perform operations_private.remove_staff(o.id,p.id,'Published staffing changed before execution');perform operations_private.auto_audit(r.id,o.id,'Staff removed',jsonb_build_object('employee_id',p.id,'reason','Published staffing changed'),true);end loop;
 foreach preferred in array ids loop if not exists(select 1 from public.ops_occurrence_staff where occurrence_id=o.id and employee_id=preferred and active) then perform operations_private.add_staff(o.id,preferred);perform operations_private.auto_audit(r.id,o.id,'Staff assigned',jsonb_build_object('employee_id',preferred),true);end if;end loop;
 preferred:=nullif(o.config->>'preferred_owner','')::uuid;
 if o.owner_id is null or not(o.owner_id=any(ids)) then
 if preferred=any(ids) then null;
 elsif coalesce((o.config->>'auto_backup')::bool,false) then select x::uuid into preferred from jsonb_array_elements_text(o.config->'backup_ids') with ordinality z(x,n) where x::uuid=any(ids) order by n limit 1;
 else preferred:=null;end if;
 if preferred is distinct from o.owner_id then update public.ops_occurrences set owner_id=preferred,revision=revision+1 where id=o.id;perform operations_private.auto_audit(r.id,o.id,'Owner selected',jsonb_build_object('from',o.owner_id,'to',preferred),true);end if;end if;end if;
 perform operations_private.evaluate_occurrence(o.id,p_now);
end $$;

create function public.ops_maintenance_preview(p_unit uuid,p_version uuid,p_config jsonb,p_from date) returns jsonb language plpgsql security definer set search_path='' as $$
declare d date;w jsonb;rows jsonb:='[]';begin
 perform operations_private.validate_rule(p_unit,p_version,p_config);
 if not p_config ? 'maintenance' then raise exception 'Maintenance configuration required';end if;
 for d in select p_from+x from generate_series(0,1826) x loop
 if operations_private.recurrence_due(p_config,d) then w:=operations_private.rule_window(p_config,d,p_unit);
 rows:=rows||jsonb_build_array(jsonb_build_object('date',d,'window',w));exit when jsonb_array_length(rows)>=12;end if;end loop;return rows;
end $$;

create function operations_private.maintenance_work_json(p_occ uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('assignee_name',h.full_name,'history',(select coalesce(jsonb_agg(to_jsonb(log)||jsonb_build_object('actor_name',coalesce(log.detail->>'actor_name',who.full_name)) order by log.created_at),'[]') from public.ops_audit_log log left join public.hris_users who on who.id=log.actor_id where log.assignment_id=a.id),
 'execution',(select to_jsonb(run)||jsonb_build_object('can_write',false,'can_reopen',false,'items',(select coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object('response',to_jsonb(resp),'evidence',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'path',e.path,'bytes',e.bytes,'state',e.state,'accessible',e.state='Ready' and e.expires_at>now() and e.deleted_at is null,'uploader_name',e.uploader_name,'uploaded_at',e.uploaded_at,'created_at',e.created_at,'expires_at',e.expires_at,'deleted_at',e.deleted_at) order by e.created_at),'[]') from public.ops_evidence e where e.item_id=i.id)) order by i.ordinal),'[]') from public.ops_run_items i join public.ops_responses resp on resp.item_id=i.id where i.run_id=run.id)) from public.ops_checklist_runs run where run.id=a.checklist_run_id))),'[]') from public.ops_assignments a join public.hris_users h on h.id=a.assignee_id where a.occurrence_id=p_occ and operations_private.can_view_assignment(a.id)
$$;
revoke all on function operations_private.maintenance_work_json(uuid) from public,anon,authenticated;

-- Read existing assignments/responses/evidence; original context controls authorization after transfer.
create function public.ops_maintenance_workspace(p_unit uuid,p_from date,p_to date,p_offset int default 0,p_filters jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare w jsonb;rows jsonb;begin
 perform operations_private.actor();
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>36600 or p_offset<0 or p_offset>100000 then raise exception 'Invalid history date range or page';end if;
 if p_unit is not null and not (operations_private.member(public.current_hris_user_id(),p_unit) or operations_private.manager(p_unit) or exists(select 1 from public.ops_assignments where assignee_id=public.current_hris_user_id() and business_unit_id=p_unit)) then raise exception 'Business unit is not authorized' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'rule_id',o.rule_id,'asset',o.asset_context,'operating_date',o.operating_date,'title',o.title,'due_at',o.due_at,'window_start',o.window_start,'window_end',o.window_end,'status',o.status,'coverage',o.coverage,'coverage_reason',o.coverage_reason,'owner_name',(select full_name from public.hris_users where id=o.owner_id),'assignments',operations_private.maintenance_work_json(o.id),'audit',(select coalesce(jsonb_agg(to_jsonb(h) order by h.created_at desc),'[]') from public.ops_occurrence_audit h where h.occurrence_id=o.id)) order by o.operating_date desc,o.id),'[]') into rows from (select * from public.ops_occurrences x where x.asset_context is not null and (p_unit is null or x.business_unit_id=p_unit) and x.operating_date between p_from and p_to and operations_private.occ_view(x.id)
 and (coalesce(p_filters->>'asset_id','')='' or x.asset_context->>'id'=p_filters->>'asset_id')
 and (coalesce(p_filters->>'activity','')='' or strpos(lower(x.title),lower(p_filters->>'activity'))>0)
 and (coalesce(p_filters->>'status','All')='All' or x.status=p_filters->>'status')
 and (not coalesce((p_filters->>'due_only')::bool,false) or x.status='Open')
 and (not coalesce((p_filters->>'issues')::bool,false) or exists(select 1 from public.ops_assignments ax join public.ops_run_items i on i.run_id=ax.checklist_run_id join public.ops_responses s on s.item_id=i.id where ax.occurrence_id=x.id and s.issue))
 order by x.operating_date desc,x.id limit 100 offset p_offset) o;
 return jsonb_build_object('stats',(select jsonb_build_object('open',count(*) filter(where status='Open'),'overdue',count(*) filter(where status='Open' and due_at<now()),'completed',count(*) filter(where status='Completed'),'uncovered',count(*) filter(where status='Open' and coverage in('Uncovered','Schedule missing','No owner','At risk'))) from public.ops_occurrences x where x.asset_context is not null and (p_unit is null or x.business_unit_id=p_unit) and operations_private.occ_view(x.id)),
 'managers',(select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'name',h.full_name) order by h.full_name),'[]') from public.hris_users h where lower(h.status)='active' and p_unit is not null and operations_private.can_use_library(p_unit) and operations_private.role_unit(h.id,p_unit,array['Business Unit Manager','GeneralManager','Admin','Board of Director'])),
 'assets',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'asset_tag',a.asset_tag,'type',a.type,'brand',a.brand,'model',a.model,'serial_number',a.serial_number,'business_unit_id',u.id,'unit_name',u.name) order by u.name,a.name),'[]') from public.assets a join public.business_units u on a.business_unit_id in(u.id::text,u.name) where a.requires_maintenance and a.status::text<>'Retired' and (p_unit is null or u.id=p_unit) and operations_private.can_use_library(u.id)),
 'plans',(select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('asset_name',a.name,'asset_tag',a.asset_tag,'unit_name',u.name,'blocked_reason',coalesce(r.maintenance_blocked,operations_private.maintenance_asset_reason(r.asset_id,r.business_unit_id)),'versions',(select coalesce(jsonb_agg(to_jsonb(v) order by revision desc),'[]') from public.ops_rule_versions v where v.rule_id=r.id),'history',(select coalesce(jsonb_agg(to_jsonb(h) order by created_at desc),'[]') from public.ops_occurrence_audit h where h.rule_id=r.id and h.occurrence_id is null)) order by r.title),'[]') from public.ops_rules r join public.assets a on a.id=r.asset_id join public.business_units u on u.id=r.business_unit_id where (p_unit is null or r.business_unit_id=p_unit) and operations_private.rule_manage(r.id)),
 'records',rows,'has_more',jsonb_array_length(rows)=100);
end $$;

alter function operations_private.workspace(uuid) rename to workspace_before_maintenance;
create function operations_private.workspace(p_unit uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare w jsonb:=operations_private.workspace_before_maintenance(p_unit);begin
 return w||jsonb_build_object('assets',(select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(w->'assets') x join public.assets a on a.id=(x->>'id')::uuid where a.status::text<>'Retired'),'assignments',(select coalesce(jsonb_agg(a||jsonb_build_object('maintenance',o.asset_context,'maintenance_owner',(select full_name from public.hris_users where id=o.owner_id))),'[]') from jsonb_array_elements(w->'assignments') a left join public.ops_occurrences o on o.id=(a->>'occurrence_id')::uuid));
end $$;
revoke all on function operations_private.workspace_before_maintenance(uuid),operations_private.validate_rule_phase3(uuid,uuid,jsonb),operations_private.recurrence_due_phase3(jsonb,date),operations_private.save_rule_phase3(uuid,uuid,text,uuid,jsonb,text,integer,text) from public,anon,authenticated;
do $$declare f record;begin
 for f in select p.oid::regprocedure signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='operations_private' and p.proname in('maintenance_asset_reason','maintenance_capture','maintenance_asset_changed','validate_rule','recurrence_due','save_rule','workspace','generate_rule','reconcile')) or (n.nspname='public' and p.proname in('ops_maintenance_preview','ops_maintenance_workspace')) loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 if f.nspname='public' or f.proname in('workspace','save_rule') then execute format('grant execute on function %s to authenticated',f.signature);end if;
 end loop;end $$;

alter function operations_private.submit_run(uuid,integer) rename to submit_run_before_maintenance;
create function operations_private.submit_run(p_run uuid,p_revision int) returns void language plpgsql security definer set search_path='' as $$declare o uuid;begin
 perform operations_private.submit_run_before_maintenance(p_run,p_revision);
 select x.id into o from public.ops_occurrences x join public.ops_assignments a on a.occurrence_id=x.id where a.checklist_run_id=p_run and x.asset_context is not null limit 1;
 if o is not null then perform operations_private.evaluate_occurrence(o,now());end if;
end $$;
revoke all on function operations_private.submit_run_before_maintenance(uuid,integer) from public,anon,authenticated;
revoke all on function operations_private.submit_run(uuid,integer) from public,anon;
grant execute on function operations_private.submit_run(uuid,integer) to authenticated;
