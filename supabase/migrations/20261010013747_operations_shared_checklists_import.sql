-- Shared checklist runs retain separate recipient records and immutable published items.
create table public.ops_checklist_runs (
 id uuid primary key default gen_random_uuid(),
 business_unit_id uuid not null references public.business_units(id),
 template_version_id uuid not null references public.ops_template_versions(id),
 created_by uuid not null references public.hris_users(id),
 created_at timestamptz not null default now()
);
create index ops_runs_unit on public.ops_checklist_runs(business_unit_id);
create index ops_runs_version on public.ops_checklist_runs(template_version_id);
create index ops_runs_creator on public.ops_checklist_runs(created_by);
alter table public.ops_assignments add column checklist_run_id uuid references public.ops_checklist_runs(id);
create index ops_assignments_run on public.ops_assignments(checklist_run_id);
create table public.ops_item_checks (
 run_id uuid not null references public.ops_checklist_runs(id),
 item_id uuid not null references public.ops_checklist_items(id),
 checked boolean not null default false,
 revision integer not null default 1,
 actor_id uuid references public.hris_users(id),
 actor_name text,
 updated_at timestamptz,
 primary key(run_id,item_id)
);
create index ops_checks_item on public.ops_item_checks(item_id);
create index ops_checks_actor on public.ops_item_checks(actor_id);
create function operations_private.can_view_run(p_run uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ops_assignments a where a.checklist_run_id=p_run and operations_private.can_view_assignment(a.id))
$$;
alter table public.ops_checklist_runs enable row level security;
alter table public.ops_item_checks enable row level security;
revoke all on public.ops_checklist_runs,public.ops_item_checks from public,anon,authenticated;
grant select on public.ops_checklist_runs,public.ops_item_checks to authenticated;
create policy ops_runs_read on public.ops_checklist_runs for select to authenticated using(operations_private.can_view_run(id));
create policy ops_checks_read on public.ops_item_checks for select to authenticated using(operations_private.can_view_run(run_id));

alter function operations_private.assign(uuid,uuid,jsonb,timestamptz,text,text,jsonb,boolean) rename to assign_individual;
create function operations_private.assign(p_unit uuid,p_version uuid,p_selection jsonb,p_due timestamptz,p_priority text,p_instructions text,p_attachments jsonb,p_verify boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare batch uuid; run uuid; actor uuid:=operations_private.actor();begin
 if coalesce(p_selection->>'execution','individual') not in ('individual','shared') then raise exception 'Invalid checklist execution mode';end if;
 if p_selection->>'execution'='shared' and not exists(select 1 from public.ops_template_versions v join public.ops_templates t on t.id=v.template_id where v.id=p_version and t.kind='checklist') then raise exception 'Shared execution requires a checklist';end if;
 batch:=operations_private.assign_individual(p_unit,p_version,p_selection,p_due,p_priority,p_instructions,p_attachments,p_verify);
 if p_selection->>'execution'='shared' then
 insert into public.ops_checklist_runs(business_unit_id,template_version_id,created_by) values(p_unit,p_version,actor) returning id into run;
 update public.ops_assignments set checklist_run_id=run where batch_id=batch;
 insert into public.ops_item_checks(run_id,item_id) select run,id from public.ops_checklist_items where checklist_version_id=p_version;
 update public.ops_audit_log e set detail=e.detail||jsonb_build_object('execution','shared','run_id',run) where e.assignment_id in (select id from public.ops_assignments where batch_id=batch);
 end if;return batch;
end $$;

-- All shared-run writes acquire the same lock before locking recipient records.
create function operations_private.check_item(p_run uuid,p_item uuid,p_revision integer,p_checked boolean,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=operations_private.actor();r public.ops_checklist_runs;c public.ops_item_checks;a public.ops_assignments;new_status text;begin
 select * into r from public.ops_checklist_runs where id=p_run for update;
 select * into a from public.ops_assignments where checklist_run_id=p_run and assignee_id=actor;
 if r.id is null or a.id is null or a.status='Cancelled' or not operations_private.member(actor,r.business_unit_id) then raise exception 'Only an active assigned team member can check this checklist' using errcode='42501';end if;
 select * into c from public.ops_item_checks where run_id=p_run and item_id=p_item for update;
 if c.item_id is null then raise exception 'Item is not part of this checklist';end if;
 if c.revision is distinct from p_revision then raise exception 'This item changed. Refresh before updating.' using errcode='40001';end if;
 if p_checked is null or c.checked=p_checked then raise exception 'Choose a different check state';end if;
 if not p_checked and length(trim(coalesce(p_note,'')))<3 then raise exception 'Please give a reason for unchecking';end if;
 update public.ops_item_checks set checked=p_checked,revision=revision+1,actor_id=actor,actor_name=(select full_name from public.hris_users where id=actor),updated_at=now() where run_id=p_run and item_id=p_item;
 new_status:=case when not exists(select 1 from public.ops_checklist_items i join public.ops_item_checks cc on cc.item_id=i.id and cc.run_id=p_run where i.required and not cc.checked) and exists(select 1 from public.ops_item_checks where run_id=p_run and checked) then 'Completed' else 'In Progress' end;
 update public.ops_assignments set status=new_status,completed_at=case when new_status='Completed' then now() else null end,revision=revision+1,updated_at=now() where checklist_run_id=p_run and status<>'Cancelled';
 insert into public.ops_audit_log(business_unit_id,assignment_id,actor_id,action,detail) values(r.business_unit_id,a.id,actor,case when p_checked then 'Item checked' else 'Item unchecked' end,jsonb_build_object('run_id',p_run,'item_id',p_item,'item_title',(select snapshot->>'title' from public.ops_checklist_items where id=p_item),'checked',p_checked,'note',p_note,'actor_name',(select full_name from public.hris_users where id=actor),'status',new_status,'verification',a.verification_status));
end $$;

alter function operations_private.change_assignment(uuid,integer,text,text) rename to change_individual;
create function operations_private.change_assignment(p_id uuid,p_revision integer,p_status text,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=operations_private.actor();a public.ops_assignments;run uuid;begin
 select checklist_run_id into run from public.ops_assignments where id=p_id;
 if run is null then perform operations_private.change_individual(p_id,p_revision,p_status,p_note);return;end if;
 perform 1 from public.ops_checklist_runs where id=run for update;
 select * into a from public.ops_assignments where id=p_id for update;
 if not operations_private.can_view_assignment(p_id) or not (operations_private.manager(a.business_unit_id) or (a.created_by=actor and not exists(select 1 from public.ops_assignments x where x.checklist_run_id=run and not operations_private.can_assign(x.business_unit_id,x.assignee_id)))) then raise exception 'Only an authorized manager can cancel the shared checklist' using errcode='42501';end if;
 if a.revision is distinct from p_revision then raise exception 'Assignment changed. Refresh before updating.' using errcode='40001';end if;
 if p_status is distinct from 'Cancelled' then raise exception 'Complete shared checklists by checking their required items';end if;
 if a.status in ('Cancelled','Completed') then raise exception 'This assignment is already closed';end if;
 if length(trim(coalesce(p_note,'')))<3 then raise exception 'Cancellation reason required';end if;
 insert into public.ops_audit_log(business_unit_id,assignment_id,actor_id,action,detail) select business_unit_id,id,actor,'Cancelled',jsonb_build_object('note',p_note,'from',status,'run_id',run,'actor_name',(select full_name from public.hris_users where id=actor)) from public.ops_assignments where checklist_run_id=run and status<>'Cancelled';
 update public.ops_assignments set status='Cancelled',completed_at=null,revision=revision+1,updated_at=now() where checklist_run_id=run and status<>'Cancelled';
end $$;

alter function operations_private.update_assignment(uuid,integer,timestamptz,text,text,text) rename to update_individual;
create function operations_private.update_assignment(p_id uuid,p_revision integer,p_due timestamptz,p_priority text,p_instructions text,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare run uuid;x record;begin
 select checklist_run_id into run from public.ops_assignments where id=p_id;
 if run is null then perform operations_private.update_individual(p_id,p_revision,p_due,p_priority,p_instructions,p_note);return;end if;
 perform 1 from public.ops_checklist_runs where id=run for update;
 if not exists(select 1 from public.ops_assignments where id=p_id and revision=p_revision) then raise exception 'Assignment changed. Refresh before updating.' using errcode='40001';end if;
 for x in select id,revision from public.ops_assignments where checklist_run_id=run order by id loop
 perform operations_private.update_individual(x.id,x.revision,p_due,p_priority,p_instructions,p_note);
 end loop;
end $$;

alter function operations_private.workspace(uuid) rename to workspace_base;
create function operations_private.workspace(p_unit uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare w jsonb;begin
 w:=operations_private.workspace_base(p_unit);
 return w||jsonb_build_object('assignments',(select coalesce(jsonb_agg(a||jsonb_build_object(
 'members',case when a->>'checklist_run_id' is null then '[]'::jsonb else (select coalesce(jsonb_agg(jsonb_build_object('id',x.assignee_id,'name',h.full_name) order by h.full_name),'[]') from public.ops_assignments x join public.hris_users h on h.id=x.assignee_id where x.checklist_run_id=(a->>'checklist_run_id')::uuid) end,
 'checks',case when a->>'checklist_run_id' is null then '[]'::jsonb else (select coalesce(jsonb_agg(to_jsonb(c)),'[]') from public.ops_item_checks c where c.run_id=(a->>'checklist_run_id')::uuid) end,
 'can_check',a->>'checklist_run_id' is not null and exists(select 1 from public.ops_assignments x where x.checklist_run_id=(a->>'checklist_run_id')::uuid and x.assignee_id=operations_private.actor() and x.status<>'Cancelled' and operations_private.member(x.assignee_id,x.business_unit_id)),
 'history',(select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('actor_name',coalesce(e.detail->>'actor_name',h.full_name)) order by e.created_at,e.id),'[]') from public.ops_audit_log e left join public.hris_users h on h.id=e.actor_id where e.assignment_id=(a->>'id')::uuid or (a->>'checklist_run_id' is not null and e.assignment_id in (select id from public.ops_assignments x where x.checklist_run_id=(a->>'checklist_run_id')::uuid)))
 )),'[]') from jsonb_array_elements(w->'assignments') a));
end $$;

create function operations_private.import_checklists(p_unit uuid,p_checklists jsonb,p_publish boolean,p_source text) returns jsonb language plpgsql security definer set search_path='' as $$
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
 if coalesce(item->>'response_type','none') not in ('none','text','photo','numeric') then raise exception 'Invalid response type';end if;
 end loop;
 tid:=operations_private.save_template(null,p_unit,'checklist',c,null,p_publish);
 insert into public.ops_audit_log(business_unit_id,template_id,actor_id,action,detail) values(p_unit,tid,actor,'Checklist imported',jsonb_build_object('source',p_source,'item_count',jsonb_array_length(c->'items'),'published',p_publish));
 ids:=ids||jsonb_build_array(tid);
 end loop;return ids;
end $$;

-- Recreate wrappers after renaming private functions (SQL wrappers may hold OID dependencies).
create or replace function public.ops_workspace(p_unit uuid default null) returns jsonb language sql security definer set search_path='' as $$select operations_private.workspace(p_unit)$$;
create or replace function public.ops_assign(p_unit uuid,p_version uuid,p_selection jsonb,p_due timestamptz,p_priority text,p_instructions text,p_attachments jsonb,p_verify boolean) returns uuid language sql security definer set search_path='' as $$select operations_private.assign(p_unit,p_version,p_selection,p_due,p_priority,p_instructions,p_attachments,p_verify)$$;
create or replace function public.ops_change_assignment(p_id uuid,p_revision integer,p_status text,p_note text) returns void language sql security definer set search_path='' as $$select operations_private.change_assignment(p_id,p_revision,p_status,p_note)$$;
create or replace function public.ops_update_assignment(p_id uuid,p_revision integer,p_due timestamptz,p_priority text,p_instructions text,p_note text) returns void language sql security definer set search_path='' as $$select operations_private.update_assignment(p_id,p_revision,p_due,p_priority,p_instructions,p_note)$$;
create function public.ops_check_item(p_run uuid,p_item uuid,p_revision integer,p_checked boolean,p_note text) returns void language sql security definer set search_path='' as $$select operations_private.check_item(p_run,p_item,p_revision,p_checked,p_note)$$;
create function public.ops_import_checklists(p_unit uuid,p_checklists jsonb,p_publish boolean,p_source text) returns jsonb language sql security definer set search_path='' as $$select operations_private.import_checklists(p_unit,p_checklists,p_publish,p_source)$$;
revoke all on all functions in schema operations_private from public,anon,authenticated;
grant execute on function operations_private.manager(uuid),operations_private.can_edit(uuid),operations_private.can_use_library(uuid),operations_private.can_view_template(uuid),operations_private.can_view_assignment(uuid),operations_private.can_view_run(uuid) to authenticated;
revoke all on function public.ops_check_item(uuid,uuid,integer,boolean,text),public.ops_import_checklists(uuid,jsonb,boolean,text) from public,anon,authenticated;
grant execute on function public.ops_check_item(uuid,uuid,integer,boolean,text),public.ops_import_checklists(uuid,jsonb,boolean,text) to authenticated;
