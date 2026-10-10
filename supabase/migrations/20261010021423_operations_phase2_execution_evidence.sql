-- Phase 2 adds detailed runs without rewriting historical confirmations.
alter table public.ops_checklist_items drop constraint ops_checklist_items_response_type_check;
alter table public.ops_checklist_items add constraint ops_checklist_items_response_type_check check(response_type in ('none','text','photo','numeric','yes_no'));
alter table public.ops_checklist_runs add column execution_phase integer not null default 1 check(execution_phase in(1,2));
alter table public.ops_checklist_runs add column shared boolean not null default true;
alter table public.ops_checklist_runs add column revision integer not null default 1;
alter table public.ops_checklist_runs add column submitted_at timestamptz;
alter table public.ops_checklist_runs add column submitted_by uuid references public.hris_users(id);
alter table public.ops_checklist_runs add column outcome text not null default 'Pending' check(outcome in ('Pending','Clear','Issues'));
create index ops_runs_submitter on public.ops_checklist_runs(submitted_by);
create table public.ops_run_items (
 id uuid primary key default gen_random_uuid(),run_id uuid not null references public.ops_checklist_runs(id),
 ordinal integer not null,snapshot jsonb not null,required boolean not null,response_type text not null check(response_type in ('none','text','photo','numeric','yes_no')),unique(run_id,ordinal)
);
create table public.ops_responses (
 item_id uuid primary key references public.ops_run_items(id),value jsonb,remarks text not null default '',issue boolean not null default false,
 revision integer not null default 1,actor_id uuid references public.hris_users(id),actor_name text,updated_at timestamptz
);
create index ops_responses_actor on public.ops_responses(actor_id);
create table public.ops_evidence (
 id uuid primary key default gen_random_uuid(),item_id uuid not null references public.ops_run_items(id),
 path text not null unique,uploader_id uuid not null references public.hris_users(id),uploader_name text not null,
 bytes integer not null check(bytes between 1 and 512000),state text not null default 'Pending' check(state in ('Pending','Ready','Removed','Expired')),
 created_at timestamptz not null default now(),uploaded_at timestamptz,expires_at timestamptz not null default(now()+interval '60 days'),deleted_at timestamptz,
 attempts integer not null default 0,last_error text,next_attempt_at timestamptz not null default now()
);
create index ops_evidence_item on public.ops_evidence(item_id);
create index ops_evidence_uploader on public.ops_evidence(uploader_id);
create index ops_evidence_cleanup on public.ops_evidence(next_attempt_at,expires_at) where deleted_at is null;
create function operations_private.can_write_run(p_run uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ops_assignments a join public.ops_checklist_runs r on r.id=a.checklist_run_id where r.id=p_run and r.execution_phase=2 and r.submitted_at is null and a.assignee_id=public.current_hris_user_id() and a.status in ('Assigned','In Progress') and operations_private.member(a.assignee_id,a.business_unit_id))
$$;
create function operations_private.can_read_item(p_item uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ops_run_items i where i.id=p_item and operations_private.can_view_run(i.run_id))
$$;
alter table public.ops_run_items enable row level security;
alter table public.ops_responses enable row level security;
alter table public.ops_evidence enable row level security;
revoke all on public.ops_run_items,public.ops_responses,public.ops_evidence from public,anon,authenticated;
grant select on public.ops_run_items,public.ops_responses,public.ops_evidence to authenticated;
create policy ops_run_items_read on public.ops_run_items for select to authenticated using(operations_private.can_view_run(run_id));
create policy ops_responses_read on public.ops_responses for select to authenticated using(operations_private.can_read_item(item_id));
create policy ops_evidence_read on public.ops_evidence for select to authenticated using(operations_private.can_read_item(item_id));
create or replace function operations_private.validate_content(p_unit uuid,p_kind text,p_content jsonb) returns void language plpgsql security definer set search_path='' as $$
declare d uuid:=nullif(p_content->>'department_id','')::uuid; a uuid:=nullif(p_content->>'asset_id','')::uuid; m uuid:=nullif(p_content->>'responsible_manager_id','')::uuid; begin
 if length(trim(coalesce(p_content->>'title','')))<3 or length(p_content->>'title')>180 then raise exception 'Title must be 3–180 characters';end if;
 if coalesce(p_content->>'priority','Normal') not in ('Low','Normal','High','Urgent') then raise exception 'Invalid priority';end if;
 if coalesce(p_content->>'evidence','none') not in ('none','text','photo','numeric','yes_no') then raise exception 'Invalid evidence type';end if;
 if nullif(p_content->>'sop_url','') is not null and p_content->>'sop_url' !~ '^https?://' then raise exception 'SOP URL must use http or https';end if;
 if coalesce((p_content->>'duration')::numeric,0)<0 then raise exception 'Duration cannot be negative';end if;
 if d is not null and not exists(select 1 from public.departments where id=d and business_unit_id=p_unit) then raise exception 'Department is outside this unit' using errcode='42501';end if;
 if a is not null and not exists(select 1 from public.assets x join public.business_units b on b.id=p_unit where x.id=a and x.business_unit_id in (b.id::text,b.name)) then raise exception 'Asset is outside this unit' using errcode='42501';end if;
 if m is not null and not operations_private.role_unit(m,p_unit,array['Business Unit Manager','GeneralManager','Admin','Board of Director']) then raise exception 'Responsible manager is outside this unit' using errcode='42501';end if;
 if p_kind='checklist' and coalesce(p_content->>'category','Other') not in ('Opening','Closing','Cleaning','Maintenance','Inspection','Inventory','Handover','Other') then raise exception 'Invalid checklist category';end if;
 if p_content ? 'allow_na' and jsonb_typeof(p_content->'allow_na')<>'boolean' or p_content ? 'photo_required' and jsonb_typeof(p_content->'photo_required')<>'boolean' then raise exception 'Invalid evidence rules';end if;
 if (p_content ? 'min' and jsonb_typeof(p_content->'min') not in ('number','null')) or (p_content ? 'max' and jsonb_typeof(p_content->'max') not in ('number','null')) then raise exception 'Numeric bounds must be numbers';end if;
 if (p_content->>'min')::numeric>(p_content->>'max')::numeric then raise exception 'Minimum cannot exceed maximum';end if;
 if length(coalesce(p_content->>'unit',''))>30 then raise exception 'Reading unit must be at most 30 characters';end if;
end $$;

create or replace function operations_private.save_template(p_id uuid,p_unit uuid,p_kind text,p_content jsonb,p_revision integer,p_publish boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=operations_private.actor(); t public.ops_templates; v uuid; item jsonb; snap jsonb; source public.ops_template_versions; pos integer:=0; source_id uuid;
begin
 if not operations_private.can_edit(p_unit) then raise exception 'You cannot edit this library' using errcode='42501';end if;
 if p_kind not in ('task','checklist') then raise exception 'Invalid template type';end if;
 perform operations_private.validate_content(p_unit,p_kind,p_content);
 if p_id is null then
 insert into public.ops_templates(kind,business_unit_id,draft,created_by,updated_by) values(p_kind,p_unit,p_content,actor,actor) returning * into t;
 else
 select * into t from public.ops_templates where id=p_id for update;
 if t.id is null or t.business_unit_id is distinct from p_unit or t.kind<>p_kind then raise exception 'Template not available in this library' using errcode='42501';end if;
 if t.revision is distinct from p_revision then raise exception 'Template changed. Refresh before saving.' using errcode='40001';end if;
 if not operations_private.manager(p_unit) and t.created_by<>actor then raise exception 'You may edit only templates you created' using errcode='42501';end if;
 if t.status='Archived' then raise exception 'Duplicate archived templates to edit them';end if;
 update public.ops_templates set draft=p_content,revision=revision+1,updated_by=actor,updated_at=now() where id=t.id returning * into t;
 end if;
 if p_publish then
 if p_kind='checklist' and jsonb_array_length(coalesce(p_content->'items','[]'))>200 then raise exception 'A checklist may have at most 200 tasks';end if;
 if p_kind='checklist' and (jsonb_typeof(p_content->'items') is distinct from 'array' or jsonb_array_length(p_content->'items')=0) then raise exception 'Add at least one checklist task';end if;
 insert into public.ops_template_versions(template_id,version,content,department_id,asset_id,responsible_manager_id,published_by)
 values(t.id,t.latest_version+1,p_content-'items',nullif(p_content->>'department_id','')::uuid,nullif(p_content->>'asset_id','')::uuid,nullif(p_content->>'responsible_manager_id','')::uuid,actor) returning id into v;
 if p_kind='checklist' then
 for item in select value from jsonb_array_elements(p_content->'items') loop
 source_id:=nullif(item->>'task_version_id','')::uuid;
 if source_id is not null then
 select tv.* into source from public.ops_template_versions tv join public.ops_templates tt on tt.id=tv.template_id
 where tv.id=source_id and tt.kind='task' and tt.status='Published' and (tt.business_unit_id is null or tt.business_unit_id=p_unit) and operations_private.can_view_template(tt.id);
 if source.id is null then raise exception 'Checklist task is unavailable or outside this unit' using errcode='42501';end if;
 snap:=source.content;
 else snap:=item->'snapshot'; perform operations_private.validate_content(p_unit,'task',snap);end if;
 snap:=snap||coalesce(item->'rules','{}'::jsonb);perform operations_private.validate_content(p_unit,'task',snap);
 if coalesce(item->>'response_type',snap->>'evidence','none') not in ('none','text','photo','numeric','yes_no') then raise exception 'Invalid checklist response type';end if;
 insert into public.ops_checklist_items(checklist_version_id,ordinal,task_version_id,snapshot,required,response_type)
 values(v,pos,source_id,snap,coalesce((item->>'required')::boolean,true),coalesce(item->>'response_type',snap->>'evidence','none'));
 pos:=pos+1;
 end loop;
 end if;
 update public.ops_templates set status='Published',latest_version=latest_version+1 where id=t.id;
 end if;
 insert into public.ops_audit_log(business_unit_id,template_id,actor_id,action,detail) values(p_unit,t.id,actor,case when p_publish then 'Publish template' else 'Save draft' end,jsonb_build_object('version',t.latest_version+case when p_publish then 1 else 0 end,'revision',t.revision));
 return t.id;
end $$;

create or replace function operations_private.import_checklists(p_unit uuid,p_checklists jsonb,p_publish boolean,p_source text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=operations_private.actor();c jsonb;tid uuid;ids jsonb:='[]';item jsonb;begin
 if not operations_private.can_edit(p_unit) then raise exception 'You cannot import into this library' using errcode='42501';end if;
 if jsonb_typeof(p_checklists) is distinct from 'array' or jsonb_array_length(p_checklists) not between 1 and 50 then raise exception 'Import 1–50 checklists at a time';end if;
 if length(coalesce(p_source,''))>180 then raise exception 'Source name is too long';end if;
 for c in select value from jsonb_array_elements(p_checklists) loop
 if jsonb_typeof(c->'items') is distinct from 'array' or jsonb_array_length(c->'items') not between 1 and 200 then raise exception 'Each checklist needs 1–200 items';end if;
 perform operations_private.validate_content(p_unit,'checklist',c);
 for item in select value from jsonb_array_elements(c->'items') loop
 if item->>'task_version_id' is not null then raise exception 'Imported items must be custom tasks';end if;
 perform operations_private.validate_content(p_unit,'task',item->'snapshot');
 if coalesce(item->>'response_type','none') not in ('none','text','photo','numeric','yes_no') then raise exception 'Invalid response type';end if;
 end loop;
 tid:=operations_private.save_template(null,p_unit,'checklist',c,null,p_publish);
 insert into public.ops_audit_log(business_unit_id,template_id,actor_id,action,detail) values(p_unit,tid,actor,'Checklist imported',jsonb_build_object('source',p_source,'item_count',jsonb_array_length(c->'items'),'published',p_publish));
 ids:=ids||jsonb_build_array(tid);
 end loop;return ids;
end $$;


alter function operations_private.assign(uuid,uuid,jsonb,timestamptz,text,text,jsonb,boolean) rename to assign_phase1;
create function operations_private.assign(p_unit uuid,p_version uuid,p_selection jsonb,p_due timestamptz,p_priority text,p_instructions text,p_attachments jsonb,p_verify boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare batch uuid;run uuid;x record;v public.ops_template_versions;kind text;begin
 if coalesce(p_selection->>'phase','1') not in('1','2') then raise exception 'Invalid execution phase';end if;
 batch:=operations_private.assign_phase1(p_unit,p_version,p_selection,p_due,p_priority,p_instructions,p_attachments,p_verify);
 if p_selection->>'phase'='2' then
 select * into v from public.ops_template_versions where id=p_version;select t.kind into kind from public.ops_templates t where t.id=v.template_id;
 for x in select a.id,a.checklist_run_id from public.ops_assignments a where a.batch_id=batch order by a.id loop
 run:=x.checklist_run_id;
 if run is null then insert into public.ops_checklist_runs(business_unit_id,template_version_id,created_by,execution_phase,shared) values(p_unit,p_version,operations_private.actor(),2,false) returning id into run;update public.ops_assignments set checklist_run_id=run where id=x.id;
 else update public.ops_checklist_runs set execution_phase=2 where id=run;end if;
 if not exists(select 1 from public.ops_run_items where run_id=run) then
 if kind='checklist' then insert into public.ops_run_items(run_id,ordinal,snapshot,required,response_type) select run,i.ordinal,i.snapshot,i.required,i.response_type from public.ops_checklist_items i where i.checklist_version_id=p_version;
 else insert into public.ops_run_items(run_id,ordinal,snapshot,required,response_type) values(run,0,v.content,true,coalesce(v.content->>'evidence','none'));end if;
 insert into public.ops_responses(item_id) select id from public.ops_run_items where run_id=run;
 end if;
 end loop;
 end if;return batch;
end $$;

create function operations_private.run_audit(p_run uuid,p_action text,p_detail jsonb) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=operations_private.actor();a public.ops_assignments;begin
 select * into a from public.ops_assignments where checklist_run_id=p_run order by (assignee_id=actor) desc,id limit 1;
 insert into public.ops_audit_log(business_unit_id,assignment_id,actor_id,action,detail) values(a.business_unit_id,a.id,actor,p_action,p_detail||jsonb_build_object('run_id',p_run,'actor_name',(select full_name from public.hris_users where id=actor)));
end $$;
create function operations_private.touch_run(p_run uuid) returns void language plpgsql security definer set search_path='' as $$begin
 update public.ops_checklist_runs set revision=revision+1 where id=p_run;
 update public.ops_assignments set status='In Progress',revision=revision+1,updated_at=now(),completed_at=null where checklist_run_id=p_run and status<>'Cancelled';
end $$;
create function operations_private.response_error(p_item uuid,p_value jsonb,p_remarks text,p_submit boolean) returns text language plpgsql stable security definer set search_path='' as $$
declare i public.ops_run_items;v jsonb:=nullif(p_value,'null'::jsonb);begin
 select * into i from public.ops_run_items where id=p_item;
 if i.id is null then return 'Item unavailable';end if;
 if length(coalesce(p_remarks,''))>2000 then return 'Remarks must be at most 2,000 characters';end if;
 if v is null then if p_submit and i.required then return 'A required answer is missing';else return null;end if;end if;
 if v='"na"'::jsonb then
 if not coalesce((i.snapshot->>'allow_na')::boolean,false) then return 'Not Applicable is not permitted';end if;
 if length(trim(coalesce(p_remarks,'')))<3 then return 'Explain why the item is Not Applicable';end if;return null;
 end if;
 if i.response_type in ('none','photo') then
 if jsonb_typeof(v)<>'boolean' then return 'Expected a checkbox confirmation';end if;
 if p_submit and v<>'true' then return 'Confirm the work is complete';end if;
 elsif i.response_type='yes_no' then
 if v not in ('"yes"'::jsonb,'"no"'::jsonb) then return 'Choose Yes or No';end if;
 if v='"no"'::jsonb and length(trim(coalesce(p_remarks,'')))<3 then return 'Explain the failed inspection';end if;
 elsif i.response_type='numeric' then
 if jsonb_typeof(v)<>'number' or abs((v#>>'{}')::numeric)>1e12 then return 'Enter a numeric reading between -1 trillion and 1 trillion';end if;
 elsif i.response_type='text' then
 if jsonb_typeof(v)<>'string' or length(trim(v#>>'{}')) not between 1 and 4000 then return 'Enter a text response (1–4,000 characters)';end if;
 end if;
 if p_submit and (i.response_type='photo' or coalesce((i.snapshot->>'photo_required')::boolean,false)) and not exists(select 1 from public.ops_evidence e where e.item_id=p_item and e.state='Ready' and e.expires_at>now() and e.deleted_at is null) then return 'A photo is required';end if;
 return null;
end $$;
create function operations_private.save_response(p_item uuid,p_revision integer,p_value jsonb,p_remarks text,p_issue boolean,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare i public.ops_run_items;r public.ops_responses;err text;flag boolean;begin
 select * into i from public.ops_run_items where id=p_item;
 perform 1 from public.ops_checklist_runs where id=i.run_id for update;
 if not operations_private.can_write_run(i.run_id) then raise exception 'Only an assigned active team member can edit an open run' using errcode='42501';end if;
 select * into r from public.ops_responses where item_id=p_item for update;
 if r.revision is distinct from p_revision then raise exception 'This response changed. Refresh before saving.' using errcode='40001';end if;
 err:=operations_private.response_error(p_item,p_value,p_remarks,false);if err is not null then raise exception '%',err;end if;
 if r.actor_id is not null and (r.value is distinct from nullif(p_value,'null'::jsonb) or r.issue is distinct from coalesce(p_issue,false) or r.remarks is distinct from coalesce(p_remarks,'')) and length(trim(coalesce(p_note,'')))<3 then raise exception 'Give a reason when changing a saved response';end if;
 flag:=coalesce(p_issue,false) or p_value='"no"'::jsonb or (i.response_type='numeric' and jsonb_typeof(p_value)='number' and (((p_value#>>'{}')::numeric<(i.snapshot->>'min')::numeric) or ((p_value#>>'{}')::numeric>(i.snapshot->>'max')::numeric)));
 update public.ops_responses set value=nullif(p_value,'null'::jsonb),remarks=coalesce(p_remarks,''),issue=coalesce(flag,false),revision=revision+1,actor_id=operations_private.actor(),actor_name=(select full_name from public.hris_users where id=operations_private.actor()),updated_at=now() where item_id=p_item;
 perform operations_private.touch_run(i.run_id);
 -- Keep audit compact: values live in responses, photo bytes never enter the database.
 perform operations_private.run_audit(i.run_id,'Response saved',jsonb_build_object('item_id',p_item,'item_title',i.snapshot->>'title','previous_value',r.value,'value',p_value,'previous_remarks',r.remarks,'remarks',p_remarks,'issue',coalesce(flag,false),'note',p_note));
end $$;
create function operations_private.submit_run(p_run uuid,p_revision integer) returns void language plpgsql security definer set search_path='' as $$
declare r public.ops_checklist_runs;x record;err text;run_outcome text;begin
 select * into r from public.ops_checklist_runs where id=p_run for update;
 if not operations_private.can_write_run(p_run) then raise exception 'Only an assigned active team member can submit an open run' using errcode='42501';end if;
 if r.revision is distinct from p_revision then raise exception 'Run changed. Refresh before submitting.' using errcode='40001';end if;
 for x in select i.*,s.value,s.remarks from public.ops_run_items i join public.ops_responses s on s.item_id=i.id where i.run_id=p_run order by i.ordinal loop
 err:=operations_private.response_error(x.id,x.value,x.remarks,true);if err is not null then raise exception 'Item % (%): %',x.ordinal+1,x.snapshot->>'title',err;end if;
 end loop;
 if not exists(select 1 from public.ops_run_items i join public.ops_responses s on s.item_id=i.id where i.run_id=p_run and s.value is not null) then raise exception 'Complete at least one item before submitting';end if;
 run_outcome:=case when exists(select 1 from public.ops_run_items i join public.ops_responses s on s.item_id=i.id where i.run_id=p_run and s.issue) then 'Issues' else 'Clear' end;
 update public.ops_checklist_runs set revision=revision+1,submitted_at=now(),submitted_by=operations_private.actor(),outcome=run_outcome where id=p_run;
 update public.ops_assignments set status='Completed',revision=revision+1,updated_at=now(),completed_at=now() where checklist_run_id=p_run and status<>'Cancelled';
 perform operations_private.run_audit(p_run,'Run submitted',jsonb_build_object('outcome',run_outcome,'verification','Not independently verified'));
end $$;
create function operations_private.reopen_run(p_run uuid,p_revision integer,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare r public.ops_checklist_runs;begin
 select * into r from public.ops_checklist_runs where id=p_run for update;
 if not operations_private.can_view_run(p_run) or not (operations_private.manager(r.business_unit_id) or exists(select 1 from public.ops_assignments a where a.checklist_run_id=p_run and a.assignee_id=operations_private.actor() and operations_private.member(a.assignee_id,a.business_unit_id))) then raise exception 'Reopening is not authorized' using errcode='42501';end if;
 if r.execution_phase<>2 or r.submitted_at is null then raise exception 'Only a submitted run may be reopened';end if;
 if r.revision is distinct from p_revision then raise exception 'Run changed. Refresh before reopening.' using errcode='40001';end if;
 if length(trim(coalesce(p_note,'')))<3 then raise exception 'A reopening reason is required';end if;
 update public.ops_checklist_runs set submitted_at=null,submitted_by=null,outcome='Pending' where id=p_run;
 perform operations_private.touch_run(p_run);perform operations_private.run_audit(p_run,'Run reopened',jsonb_build_object('note',p_note,'previous_outcome',r.outcome));
end $$;

-- Old confirmation endpoints cannot bypass Phase 2 validation.
alter function operations_private.change_assignment(uuid,integer,text,text) rename to change_phase1;
create function operations_private.change_assignment(p_id uuid,p_revision integer,p_status text,p_note text) returns void language plpgsql security definer set search_path='' as $$begin
 perform operations_private.actor();if not operations_private.can_view_assignment(p_id) then raise exception 'Assignment unavailable' using errcode='42501';end if;
 if p_status is distinct from 'Cancelled' and exists(select 1 from public.ops_assignments a join public.ops_checklist_runs r on r.id=a.checklist_run_id where a.id=p_id and r.execution_phase=2) then raise exception 'Save responses and use Submit work for this assignment';end if;
 perform operations_private.change_phase1(p_id,p_revision,p_status,p_note);
end $$;
alter function operations_private.check_item(uuid,uuid,integer,boolean,text) rename to check_phase1;
create function operations_private.check_item(p_run uuid,p_item uuid,p_revision integer,p_checked boolean,p_note text) returns void language plpgsql security definer set search_path='' as $$begin
 perform operations_private.actor();if not operations_private.can_view_run(p_run) then raise exception 'Run unavailable' using errcode='42501';end if;
 if exists(select 1 from public.ops_checklist_runs where id=p_run and execution_phase=2) then raise exception 'Save item responses in the execution form';end if;
 perform operations_private.check_phase1(p_run,p_item,p_revision,p_checked,p_note);
end $$;

create function operations_private.prepare_evidence(p_item uuid,p_bytes integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.ops_run_items;e public.ops_evidence;eid uuid:=gen_random_uuid();begin
 select * into i from public.ops_run_items where id=p_item;
 perform 1 from public.ops_checklist_runs where id=i.run_id for update;
 if not operations_private.can_write_run(i.run_id) then raise exception 'Only an assigned active team member can upload evidence' using errcode='42501';end if;
 if p_bytes not between 1 and 512000 then raise exception 'Photo must be 500 KB or smaller';end if;
 if (select count(*) from public.ops_evidence where item_id=p_item and state in ('Pending','Ready') and deleted_at is null and expires_at>now() and (state='Ready' or created_at>now()-interval '30 minutes'))>=3 then raise exception 'Maximum three photos per item. Remove a photo before adding another.';end if;
 insert into public.ops_evidence(id,item_id,path,uploader_id,uploader_name,bytes) values(eid,p_item,i.run_id::text||'/'||eid::text||'.jpg',operations_private.actor(),(select full_name from public.hris_users where id=operations_private.actor()),p_bytes) returning * into e;
 return jsonb_build_object('id',e.id,'path',e.path,'expires_at',e.expires_at);
end $$;
create function operations_private.evidence_access(p_path text,p_upload boolean) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ops_evidence e join public.ops_run_items i on i.id=e.item_id where e.path=p_path and e.deleted_at is null and e.expires_at>now() and
 case when p_upload then e.state='Pending' and e.created_at>now()-interval '30 minutes' and e.uploader_id=public.current_hris_user_id() and operations_private.can_write_run(i.run_id)
 else e.state='Ready' and operations_private.can_view_run(i.run_id) end)
$$;
-- Restrictive boundary also protects this bucket if unrelated permissive storage policies are added later.
create policy ops_evidence_bucket_boundary on storage.objects as restrictive for all to authenticated using(bucket_id<>'ops-evidence' or operations_private.evidence_access(name,false)) with check(bucket_id<>'ops-evidence' or operations_private.evidence_access(name,true));
create policy ops_evidence_download on storage.objects for select to authenticated using(bucket_id='ops-evidence' and operations_private.evidence_access(name,false));
create policy ops_evidence_upload on storage.objects for insert to authenticated with check(bucket_id='ops-evidence' and operations_private.evidence_access(name,true));
-- No client update/upsert or direct delete policies: all removals keep their metadata and audit.
create policy ops_evidence_no_update on storage.objects as restrictive for update to authenticated using(bucket_id<>'ops-evidence') with check(bucket_id<>'ops-evidence');
create policy ops_evidence_no_delete on storage.objects as restrictive for delete to authenticated using(bucket_id<>'ops-evidence');
create function operations_private.finish_evidence(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare e public.ops_evidence;i public.ops_run_items;begin
 select ee.* into e from public.ops_evidence ee where ee.id=p_id;select * into i from public.ops_run_items where id=e.item_id;
 perform 1 from public.ops_checklist_runs where id=i.run_id for update;
 select * into e from public.ops_evidence where id=p_id for update;
 if not operations_private.can_write_run(i.run_id) or e.uploader_id<>operations_private.actor() then raise exception 'Upload finalization is not authorized' using errcode='42501';end if;
 if e.state<>'Pending' or e.created_at<=now()-interval '30 minutes' then raise exception 'Upload reservation expired';end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='ops-evidence' and o.name=e.path and (o.metadata->>'size')::bigint=e.bytes and o.metadata->>'mimetype'='image/jpeg') then raise exception 'Uploaded photo is missing or invalid';end if;
 update public.ops_evidence set state='Ready',uploaded_at=now() where id=e.id;
 perform operations_private.touch_run(i.run_id);perform operations_private.run_audit(i.run_id,'Photo added',jsonb_build_object('item_id',i.id,'item_title',i.snapshot->>'title','evidence_id',e.id,'bytes',e.bytes,'expires_at',e.expires_at));
end $$;
create function operations_private.remove_evidence(p_id uuid,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare e public.ops_evidence;i public.ops_run_items;begin
 select * into e from public.ops_evidence where id=p_id;select * into i from public.ops_run_items where id=e.item_id;
 perform 1 from public.ops_checklist_runs where id=i.run_id for update;
 select * into e from public.ops_evidence where id=p_id for update;
 if not operations_private.can_write_run(i.run_id) then raise exception 'Photo removal is not authorized' using errcode='42501';end if;
 if e.state not in ('Pending','Ready') then raise exception 'Photo is already removed or expired';end if;
 if length(trim(coalesce(p_note,'')))<3 then raise exception 'Photo removal reason required';end if;
 update public.ops_evidence set state='Removed',next_attempt_at=now() where id=p_id;
 perform operations_private.touch_run(i.run_id);perform operations_private.run_audit(i.run_id,'Photo removed',jsonb_build_object('item_id',i.id,'item_title',i.snapshot->>'title','evidence_id',e.id,'note',p_note));
end $$;

alter function operations_private.workspace(uuid) rename to workspace_phase1;
create function operations_private.workspace(p_unit uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare w jsonb;begin
 w:=operations_private.workspace_phase1(p_unit);
 return w||jsonb_build_object('assignments',(select coalesce(jsonb_agg(a||jsonb_build_object('execution',
 (select to_jsonb(r)||jsonb_build_object('can_write',operations_private.can_write_run(r.id),'can_reopen',r.submitted_at is not null and (operations_private.manager(r.business_unit_id) or exists(select 1 from public.ops_assignments x where x.checklist_run_id=r.id and x.assignee_id=operations_private.actor() and operations_private.member(x.assignee_id,x.business_unit_id))),
 'items',(select coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object('response',to_jsonb(s),'error',operations_private.response_error(i.id,s.value,s.remarks,true),'evidence',(select coalesce(jsonb_agg((to_jsonb(e)-'last_error'-'next_attempt_at')||jsonb_build_object('accessible',e.state='Ready' and e.expires_at>now() and e.deleted_at is null) order by e.created_at),'[]') from public.ops_evidence e where e.item_id=i.id)) order by i.ordinal),'[]') from public.ops_run_items i join public.ops_responses s on s.item_id=i.id where i.run_id=r.id))
 from public.ops_checklist_runs r where r.id=(a->>'checklist_run_id')::uuid and r.execution_phase=2))), '[]') from jsonb_array_elements(w->'assignments') a));
end $$;

-- Cleanup is service-only. Private token never reaches browsers or stored cron text.
create table operations_private.evidence_worker(singleton boolean primary key default true check(singleton),token text not null default(gen_random_uuid()::text||gen_random_uuid()::text),endpoint text,last_attempt_at timestamptz,last_success_at timestamptz,last_error text);
alter table operations_private.evidence_worker enable row level security;
revoke all on operations_private.evidence_worker from public,anon,authenticated;
insert into operations_private.evidence_worker(singleton) values(true);
create function public.ops_cleanup_authorize(p_token text) returns boolean language sql security definer set search_path='' as $$select exists(select 1 from operations_private.evidence_worker where singleton and encode(sha256(convert_to(token,'UTF8')),'hex')=encode(sha256(convert_to(p_token,'UTF8')),'hex'))$$;
create function public.ops_cleanup_batch() returns jsonb language plpgsql security definer set search_path='' as $$begin
 update operations_private.evidence_worker set last_attempt_at=now() where singleton;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'path',path)),'[]') from (select id,path from public.ops_evidence where deleted_at is null and next_attempt_at<=now() and (state in ('Removed','Expired') or expires_at<=now()+interval '5 minutes' or (state='Pending' and created_at<=now()-interval '30 minutes')) order by next_attempt_at,created_at limit 500) e);
end $$;
create function public.ops_cleanup_record(p_id uuid,p_error text) returns void language plpgsql security definer set search_path='' as $$
declare e public.ops_evidence;unit uuid;aid uuid;begin
 select * into e from public.ops_evidence where id=p_id for update;if e.id is null or e.deleted_at is not null then return;end if;
 if p_error is null then
 update public.ops_evidence set state=case when state='Removed' then 'Removed' else 'Expired' end,deleted_at=now(),attempts=attempts+1,last_error=null where id=e.id;
 select a.business_unit_id,a.id into unit,aid from public.ops_run_items i join public.ops_assignments a on a.checklist_run_id=i.run_id where i.id=e.item_id order by a.id limit 1;
 insert into public.ops_audit_log(business_unit_id,assignment_id,actor_id,action,detail) values(unit,aid,e.uploader_id,'Evidence file deleted',jsonb_build_object('evidence_id',e.id,'actor_name','Automatic retention cleanup','uploaded_by',e.uploader_id,'reason',case when e.state='Removed' then 'Removed by team' when e.state='Pending' then 'Abandoned upload' else '60-day retention' end));
 else update public.ops_evidence set attempts=attempts+1,last_error=left(p_error,500),next_attempt_at=now()+interval '5 minutes' where id=e.id;end if;
end $$;
create function public.ops_cleanup_finished(p_error text) returns void language plpgsql security definer set search_path='' as $$begin
 update operations_private.evidence_worker set last_success_at=case when p_error is null then now() else last_success_at end,last_error=left(p_error,500) where singleton;
end $$;
create function operations_private.enqueue_evidence_cleanup() returns bigint language plpgsql security definer set search_path='' as $$
declare cfg operations_private.evidence_worker;request_id bigint;begin
 select * into cfg from operations_private.evidence_worker where singleton;
 if cfg.endpoint is null then return null;end if;
 select net.http_post(url:=cfg.endpoint,headers:=jsonb_build_object('Content-Type','application/json','x-ops-cleanup-token',cfg.token),body:='{}'::jsonb,timeout_milliseconds:=60000) into request_id;
 return request_id;
end $$;
do $$begin if exists(select 1 from pg_namespace where nspname='cron') then execute $job$select cron.schedule('ops-evidence-retention','*/5 * * * *','select operations_private.enqueue_evidence_cleanup()')$job$;end if;end $$;
create or replace function public.ops_workspace(p_unit uuid default null) returns jsonb language sql security definer set search_path='' as $$select operations_private.workspace(p_unit)$$;
create or replace function public.ops_assign(p_unit uuid,p_version uuid,p_selection jsonb,p_due timestamptz,p_priority text,p_instructions text,p_attachments jsonb,p_verify boolean) returns uuid language sql security definer set search_path='' as $$select operations_private.assign(p_unit,p_version,p_selection,p_due,p_priority,p_instructions,p_attachments,p_verify)$$;
create or replace function public.ops_change_assignment(p_id uuid,p_revision integer,p_status text,p_note text) returns void language sql security definer set search_path='' as $$select operations_private.change_assignment(p_id,p_revision,p_status,p_note)$$;
create or replace function public.ops_check_item(p_run uuid,p_item uuid,p_revision integer,p_checked boolean,p_note text) returns void language sql security definer set search_path='' as $$select operations_private.check_item(p_run,p_item,p_revision,p_checked,p_note)$$;
create function public.ops_save_response(p_item uuid,p_revision integer,p_value jsonb,p_remarks text,p_issue boolean,p_note text) returns void language sql security definer set search_path='' as $$select operations_private.save_response(p_item,p_revision,p_value,p_remarks,p_issue,p_note)$$;
create function public.ops_submit_run(p_run uuid,p_revision integer) returns void language sql security definer set search_path='' as $$select operations_private.submit_run(p_run,p_revision)$$;
create function public.ops_reopen_run(p_run uuid,p_revision integer,p_note text) returns void language sql security definer set search_path='' as $$select operations_private.reopen_run(p_run,p_revision,p_note)$$;
create function public.ops_prepare_evidence(p_item uuid,p_bytes integer) returns jsonb language sql security definer set search_path='' as $$select operations_private.prepare_evidence(p_item,p_bytes)$$;
create function public.ops_finish_evidence(p_id uuid) returns void language sql security definer set search_path='' as $$select operations_private.finish_evidence(p_id)$$;
create function public.ops_remove_evidence(p_id uuid,p_note text) returns void language sql security definer set search_path='' as $$select operations_private.remove_evidence(p_id,p_note)$$;
revoke all on all functions in schema operations_private from public,anon,authenticated;
grant execute on function operations_private.manager(uuid),operations_private.can_edit(uuid),operations_private.can_use_library(uuid),operations_private.can_view_template(uuid),operations_private.can_view_assignment(uuid),operations_private.can_view_run(uuid),operations_private.can_write_run(uuid),operations_private.can_read_item(uuid),operations_private.evidence_access(text,boolean) to authenticated;
do $$declare f regprocedure;begin for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('ops_save_response','ops_submit_run','ops_reopen_run','ops_prepare_evidence','ops_finish_evidence','ops_remove_evidence') loop execute format('revoke all on function %s from public,anon,authenticated',f);execute format('grant execute on function %s to authenticated',f);end loop;
for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'ops_cleanup_%' loop execute format('revoke all on function %s from public,anon,authenticated',f);execute format('grant execute on function %s to service_role',f);end loop;end $$;
