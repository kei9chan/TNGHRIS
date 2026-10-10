-- Additive operations module. Existing attendance/payroll/asset behavior is untouched.
create schema if not exists operations_private;
revoke all on schema operations_private from public, anon, authenticated;

create table public.ops_permissions (
  user_id uuid not null references public.hris_users(id),
  business_unit_id uuid not null references public.business_units(id),
  can_create boolean not null default false,
  can_assign boolean not null default false,
  granted_by uuid not null references public.hris_users(id),
  updated_at timestamptz not null default now(),
  primary key(user_id,business_unit_id)
);
create table public.ops_templates (
  id uuid primary key default gen_random_uuid(),
  kind text not null check(kind in ('task','checklist')),
  business_unit_id uuid references public.business_units(id), -- NULL = TNG master
  status text not null default 'Draft' check(status in ('Draft','Published','Archived')),
  draft jsonb not null default '{}',
  latest_version integer not null default 0,
  revision integer not null default 1,
  created_by uuid not null references public.hris_users(id),
  updated_by uuid not null references public.hris_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ops_templates_unit on public.ops_templates(business_unit_id,kind,status);
create table public.ops_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.ops_templates(id),
  version integer not null check(version>0),
  content jsonb not null,
  department_id uuid references public.departments(id),
  asset_id uuid references public.assets(id),
  responsible_manager_id uuid references public.hris_users(id),
  published_by uuid not null references public.hris_users(id),
  published_at timestamptz not null default now(),
  unique(template_id,version)
);
create table public.ops_checklist_items (
  id uuid primary key default gen_random_uuid(),
  checklist_version_id uuid not null references public.ops_template_versions(id),
  ordinal integer not null check(ordinal>=0),
  task_version_id uuid references public.ops_template_versions(id),
  snapshot jsonb not null,
  required boolean not null default true,
  response_type text not null check(response_type in ('none','text','photo','numeric')),
  unique(checklist_version_id,ordinal)
);
create table public.ops_assignments (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  business_unit_id uuid not null references public.business_units(id),
  template_version_id uuid not null references public.ops_template_versions(id),
  assignee_id uuid not null references public.hris_users(id),
  created_by uuid not null references public.hris_users(id),
  instructions text not null default '',
  attachments jsonb not null default '[]',
  due_at timestamptz not null,
  priority text not null check(priority in ('Low','Normal','High','Urgent')),
  requires_verification boolean not null default false,
  verification_status text not null default 'Not required' check(verification_status in ('Not required','Not yet implemented')),
  status text not null default 'Assigned' check(status in ('Assigned','In Progress','Completed','Cancelled')),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(batch_id,assignee_id)
);
create index ops_assignments_assignee on public.ops_assignments(assignee_id,business_unit_id,due_at);
create index ops_assignments_unit on public.ops_assignments(business_unit_id,status,due_at);
create index ops_assignments_version on public.ops_assignments(template_version_id);
create table public.ops_audit_log (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid references public.business_units(id),
  template_id uuid references public.ops_templates(id),
  assignment_id uuid references public.ops_assignments(id),
  actor_id uuid not null references public.hris_users(id),
  action text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index ops_audit_assignment on public.ops_audit_log(assignment_id,created_at);
create index ops_audit_template on public.ops_audit_log(template_id,created_at);

create function operations_private.actor() returns uuid language plpgsql stable security definer set search_path='' as $$
declare a uuid:=public.current_hris_user_id(); begin
 if auth.uid() is null or a is null or not exists(select 1 from public.hris_users where id=a and lower(status)='active') then raise exception 'Active HRIS sign-in required' using errcode='42501';end if;
 return a;
end $$;
create function operations_private.role_unit(p_actor uuid,p_unit uuid,p_roles text[]) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.user_roles r join public.roles rr on rr.id=r.role_id and rr.is_active
 join public.hris_users h on h.id=r.user_id and lower(h.status)='active'
 where r.user_id=p_actor and r.is_active and r.role_id=any(p_roles) and
 (r.scope_type='GLOBAL' or (p_unit is not null and
 ((r.scope_type='SPECIFIC' and p_unit=any(r.allowed_business_unit_ids)) or
 (r.scope_type='HOME_ONLY' and h.business_unit_id=p_unit)))));
$$;
create function operations_private.member(p_actor uuid,p_unit uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.hris_users h where h.id=p_actor and lower(h.status)='active' and
 (h.business_unit_id=p_unit or exists(select 1 from public.user_roles r join public.roles rr on rr.id=r.role_id and rr.is_active
 where r.user_id=h.id and r.is_active and r.scope_type='SPECIFIC' and p_unit=any(r.allowed_business_unit_ids))));
$$;
create function operations_private.admin(p_unit uuid) returns boolean language sql stable security definer set search_path='' as $$
 select operations_private.role_unit(public.current_hris_user_id(),p_unit,array['Admin','Board of Director']);
$$;
create function operations_private.manager(p_unit uuid) returns boolean language sql stable security definer set search_path='' as $$
 select operations_private.admin(p_unit) or operations_private.role_unit(public.current_hris_user_id(),p_unit,array['Business Unit Manager','GeneralManager']);
$$;
create function operations_private.can_edit(p_unit uuid) returns boolean language sql stable security definer set search_path='' as $$
 select case when p_unit is null then operations_private.admin(null) else operations_private.manager(p_unit) or
 (operations_private.member(public.current_hris_user_id(),p_unit) and exists(select 1 from public.ops_permissions where user_id=public.current_hris_user_id() and business_unit_id=p_unit and can_create)) end;
$$;
create function operations_private.can_use_library(p_unit uuid) returns boolean language sql stable security definer set search_path='' as $$
 select operations_private.can_edit(p_unit) or (p_unit is not null and operations_private.member(public.current_hris_user_id(),p_unit) and exists(select 1 from public.ops_permissions where user_id=public.current_hris_user_id() and business_unit_id=p_unit and can_assign));
$$;
create function operations_private.can_assign(p_unit uuid,p_employee uuid) returns boolean language sql stable security definer set search_path='' as $$
 select operations_private.member(p_employee,p_unit) and (operations_private.manager(p_unit) or
 (operations_private.member(public.current_hris_user_id(),p_unit) and private.is_direct_reporting_manager(public.current_hris_user_id(),p_employee) and
 exists(select 1 from public.ops_permissions where user_id=public.current_hris_user_id() and business_unit_id=p_unit and can_assign)));
$$;
create function operations_private.can_view_assignment(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ops_assignments a where a.id=p_id and public.current_hris_user_id() is not null and
 (a.assignee_id=public.current_hris_user_id() or operations_private.manager(a.business_unit_id) or
 (operations_private.member(public.current_hris_user_id(),a.business_unit_id) and private.is_direct_reporting_manager(public.current_hris_user_id(),a.assignee_id))));
$$;
create function operations_private.can_view_template(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ops_templates t where t.id=p_id and public.current_hris_user_id() is not null and
 (operations_private.can_use_library(t.business_unit_id) or (t.business_unit_id is null and exists(select 1 from public.business_units b where operations_private.can_use_library(b.id)))));
$$;

-- No direct writes. All mutations pass through validated, transactional RPCs.
do $$ declare n text;begin
 foreach n in array array['ops_permissions','ops_templates','ops_template_versions','ops_checklist_items','ops_assignments','ops_audit_log'] loop
 execute format('alter table public.%I enable row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated',n);
 execute format('grant select on public.%I to authenticated',n);
 end loop;
end $$;
create policy ops_permissions_read on public.ops_permissions for select to authenticated using (user_id=public.current_hris_user_id() or operations_private.manager(business_unit_id));
create policy ops_templates_read on public.ops_templates for select to authenticated using (operations_private.can_view_template(id));
create policy ops_versions_read on public.ops_template_versions for select to authenticated using (operations_private.can_use_library((select business_unit_id from public.ops_templates where id=template_id)) or exists(select 1 from public.ops_templates t where t.id=template_id and t.business_unit_id is null and operations_private.can_view_template(t.id)) or exists(select 1 from public.ops_assignments a where a.template_version_id=ops_template_versions.id and operations_private.can_view_assignment(a.id)));
create policy ops_items_read on public.ops_checklist_items for select to authenticated using (exists(select 1 from public.ops_template_versions v where v.id=checklist_version_id));
create policy ops_assignments_read on public.ops_assignments for select to authenticated using (operations_private.can_view_assignment(id));
create policy ops_audit_read on public.ops_audit_log for select to authenticated using (operations_private.manager(business_unit_id) or (assignment_id is not null and operations_private.can_view_assignment(assignment_id)));

create function operations_private.validate_content(p_unit uuid,p_kind text,p_content jsonb) returns void language plpgsql security definer set search_path='' as $$
declare d uuid:=nullif(p_content->>'department_id','')::uuid; a uuid:=nullif(p_content->>'asset_id','')::uuid; m uuid:=nullif(p_content->>'responsible_manager_id','')::uuid; begin
 if length(trim(coalesce(p_content->>'title','')))<3 or length(p_content->>'title')>180 then raise exception 'Title must be 3–180 characters';end if;
 if coalesce(p_content->>'priority','Normal') not in ('Low','Normal','High','Urgent') then raise exception 'Invalid priority';end if;
 if coalesce(p_content->>'evidence','none') not in ('none','text','photo','numeric') then raise exception 'Invalid evidence type';end if;
 if nullif(p_content->>'sop_url','') is not null and p_content->>'sop_url' !~ '^https?://' then raise exception 'SOP URL must use http or https';end if;
 if coalesce((p_content->>'duration')::numeric,0)<0 then raise exception 'Duration cannot be negative';end if;
 if d is not null and not exists(select 1 from public.departments where id=d and business_unit_id=p_unit) then raise exception 'Department is outside this unit' using errcode='42501';end if;
 if a is not null and not exists(select 1 from public.assets x join public.business_units b on b.id=p_unit where x.id=a and x.business_unit_id in (b.id::text,b.name)) then raise exception 'Asset is outside this unit' using errcode='42501';end if;
 if m is not null and not operations_private.role_unit(m,p_unit,array['Business Unit Manager','GeneralManager','Admin','Board of Director']) then raise exception 'Responsible manager is outside this unit' using errcode='42501';end if;
 if p_kind='checklist' and coalesce(p_content->>'category','Other') not in ('Opening','Closing','Cleaning','Maintenance','Inspection','Inventory','Handover','Other') then raise exception 'Invalid checklist category';end if;
end $$;

create function operations_private.save_template(p_id uuid,p_unit uuid,p_kind text,p_content jsonb,p_revision integer,p_publish boolean) returns uuid language plpgsql security definer set search_path='' as $$
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
 if coalesce(item->>'response_type',snap->>'evidence','none') not in ('none','text','photo','numeric') then raise exception 'Invalid checklist response type';end if;
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

create function operations_private.template_action(p_id uuid,p_unit uuid,p_action text,p_revision integer) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=operations_private.actor();t public.ops_templates; result uuid;begin
 select * into t from public.ops_templates where id=p_id for update;
 if t.id is null or not operations_private.can_view_template(t.id) then raise exception 'Template unavailable' using errcode='42501';end if;
 if t.revision is distinct from p_revision then raise exception 'Template changed. Refresh first.' using errcode='40001';end if;
 if p_action='duplicate' then
 if not operations_private.can_edit(p_unit) or (t.business_unit_id is not null and t.business_unit_id is distinct from p_unit) then raise exception 'Cannot duplicate into this library' using errcode='42501';end if;
 insert into public.ops_templates(kind,business_unit_id,draft,created_by,updated_by) values(t.kind,p_unit,jsonb_set(t.draft,'{title}',to_jsonb((t.draft->>'title')||' (copy)')),actor,actor) returning id into result;
 elsif p_action='archive' then
 if not operations_private.can_edit(t.business_unit_id) or (not operations_private.manager(t.business_unit_id) and t.created_by<>actor) then raise exception 'Cannot archive this library' using errcode='42501';end if;
 update public.ops_templates set status='Archived',revision=revision+1,updated_at=now(),updated_by=actor where id=t.id;result:=t.id;
 else raise exception 'Invalid template action';end if;
 insert into public.ops_audit_log(business_unit_id,template_id,actor_id,action,detail) values(case when p_action='duplicate' then p_unit else t.business_unit_id end,result,actor,p_action,jsonb_build_object('source',t.id));
 return result;
end $$;

create function operations_private.assign(p_unit uuid,p_version uuid,p_selection jsonb,p_due timestamptz,p_priority text,p_instructions text,p_attachments jsonb,p_verify boolean) returns uuid language plpgsql security definer set search_path='' as $$
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
 insert into public.ops_assignments(batch_id,business_unit_id,template_version_id,assignee_id,created_by,due_at,priority,instructions,attachments,requires_verification,verification_status)
 values(batch,p_unit,p_version,person.id,actor,p_due,p_priority,coalesce(p_instructions,''),p_attachments,p_verify,case when p_verify then 'Not yet implemented' else 'Not required' end) returning id into aid;
 insert into public.ops_audit_log(business_unit_id,assignment_id,actor_id,action,detail) values(p_unit,aid,actor,'Assigned',jsonb_build_object('assignee',person.id,'due_at',p_due));n:=n+1;
 end loop;
 if n=0 then raise exception 'No eligible assignees. Refresh your team selection.';end if;
 if p_selection->>'mode' in ('individual','bum') and n<>(select count(distinct value) from jsonb_array_elements_text(p_selection->'ids')) then raise exception 'Some selected employees are no longer eligible' using errcode='42501';end if;
 return batch;
end $$;

create function operations_private.change_assignment(p_id uuid,p_revision integer,p_status text,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=operations_private.actor();a public.ops_assignments;begin
 select * into a from public.ops_assignments where id=p_id for update;
 if a.id is null or not operations_private.can_view_assignment(a.id) then raise exception 'Assignment unavailable' using errcode='42501';end if;
 if a.revision is distinct from p_revision then raise exception 'Assignment changed. Refresh before updating.' using errcode='40001';end if;
 if a.status in ('Completed','Cancelled') then raise exception 'This assignment is already closed';end if;
 if p_status='Cancelled' then
 if not operations_private.manager(a.business_unit_id) and not (operations_private.can_assign(a.business_unit_id,a.assignee_id) and a.created_by=actor) then raise exception 'Only an authorized manager can cancel' using errcode='42501';end if;
 if length(trim(coalesce(p_note,'')))<3 then raise exception 'Cancellation reason required';end if;
 elsif actor<>a.assignee_id or p_status not in ('In Progress','Completed') or (p_status='In Progress' and a.status<>'Assigned') then raise exception 'Only the assignee can start or complete this task' using errcode='42501';end if;
 update public.ops_assignments set status=p_status,revision=revision+1,updated_at=now(),completed_at=case when p_status='Completed' then now() else null end where id=a.id;
 insert into public.ops_audit_log(business_unit_id,assignment_id,actor_id,action,detail) values(a.business_unit_id,a.id,actor,p_status,jsonb_build_object('from',a.status,'note',p_note,'verification',a.verification_status));
end $$;

create function operations_private.delegate(p_unit uuid,p_user uuid,p_create boolean,p_assign boolean) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=operations_private.actor();begin
 if not operations_private.manager(p_unit) or not operations_private.member(p_user,p_unit) then raise exception 'Only the unit manager can grant permissions to unit staff' using errcode='42501';end if;
 insert into public.ops_permissions(user_id,business_unit_id,can_create,can_assign,granted_by) values(p_user,p_unit,p_create,p_assign,actor)
 on conflict(user_id,business_unit_id) do update set can_create=excluded.can_create,can_assign=excluded.can_assign,granted_by=actor,updated_at=now();
 insert into public.ops_audit_log(business_unit_id,actor_id,action,detail) values(p_unit,actor,'Supervisor permissions',jsonb_build_object('user',p_user,'create',p_create,'assign',p_assign));
end $$;

create function operations_private.workspace(p_unit uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=operations_private.actor();begin
 if p_unit is not null and not (operations_private.member(actor,p_unit) or operations_private.manager(p_unit) or exists(select 1 from public.ops_assignments where assignee_id=actor and business_unit_id=p_unit)) then raise exception 'Business unit is not authorized' using errcode='42501';end if;
 return jsonb_build_object('actor',actor,'masterAdmin',operations_private.admin(null),
 'units',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'manage',operations_private.manager(b.id),'edit',operations_private.can_edit(b.id),'assign',operations_private.manager(b.id) or exists(select 1 from public.ops_permissions p where p.user_id=actor and p.business_unit_id=b.id and p.can_assign and operations_private.member(actor,b.id))) order by b.name),'[]') from public.business_units b where operations_private.member(actor,b.id) or operations_private.manager(b.id) or exists(select 1 from public.ops_assignments where assignee_id=actor and business_unit_id=b.id)),
 'departments',(select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'name',d.name)),'[]') from public.departments d where d.business_unit_id=p_unit),
 'people',(select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'name',h.full_name,'position',h.position,'department_id',h.department_id,'roles',(select coalesce(jsonb_agg(rr.role_id),'[]') from public.user_roles rr join public.roles rrr on rrr.id=rr.role_id and rrr.is_active where rr.user_id=h.id and rr.is_active),'bum',operations_private.role_unit(h.id,p_unit,array['Business Unit Manager','GeneralManager']),'can_assign',operations_private.can_assign(p_unit,h.id)) order by h.full_name),'[]') from public.hris_users h where lower(h.status)='active' and operations_private.member(h.id,p_unit) and (h.id=actor or operations_private.manager(p_unit) or private.is_direct_reporting_manager(actor,h.id))),
 'assets',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name)),'[]') from public.assets a join public.business_units b on b.id=p_unit where operations_private.can_edit(p_unit) and a.business_unit_id in(b.id::text,b.name)),
 'templates',(select coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object('versions',(select coalesce(jsonb_agg(to_jsonb(v)||jsonb_build_object('items',(select coalesce(jsonb_agg(to_jsonb(i) order by i.ordinal),'[]') from public.ops_checklist_items i where i.checklist_version_id=v.id)) order by v.version desc),'[]') from public.ops_template_versions v where v.template_id=t.id)) order by t.updated_at desc),'[]') from public.ops_templates t where (t.business_unit_id=p_unit or t.business_unit_id is null) and (operations_private.can_use_library(t.business_unit_id) or (t.business_unit_id is null and operations_private.can_use_library(p_unit))) ),
 'assignments',(select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('kind',t.kind,'content',v.content,'version',v.version,'assignee_name',h.full_name,'assignee_is_bum',operations_private.role_unit(h.id,a.business_unit_id,array['Business Unit Manager','GeneralManager']),'unit_name',b.name,'can_cancel',operations_private.manager(a.business_unit_id) or (a.created_by=actor and operations_private.can_assign(a.business_unit_id,a.assignee_id)), 'items',(select coalesce(jsonb_agg(to_jsonb(i) order by i.ordinal),'[]') from public.ops_checklist_items i where i.checklist_version_id=v.id),'history',(select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at),'[]') from public.ops_audit_log e where e.assignment_id=a.id)) order by a.due_at),'[]') from public.ops_assignments a join public.ops_template_versions v on v.id=a.template_version_id join public.ops_templates t on t.id=v.template_id join public.hris_users h on h.id=a.assignee_id join public.business_units b on b.id=a.business_unit_id where (p_unit is null or a.business_unit_id=p_unit) and operations_private.can_view_assignment(a.id)),
 'permissions',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from public.ops_permissions p where p.business_unit_id=p_unit and operations_private.manager(p_unit)));
end $$;

create function operations_private.update_assignment(p_id uuid,p_revision integer,p_due timestamptz,p_priority text,p_instructions text,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=operations_private.actor();a public.ops_assignments;begin
 select * into a from public.ops_assignments where id=p_id for update;
 if a.id is null or not operations_private.can_view_assignment(a.id) or not (operations_private.manager(a.business_unit_id) or (a.created_by=actor and operations_private.can_assign(a.business_unit_id,a.assignee_id))) then raise exception 'Only an authorized manager can change assignment details' using errcode='42501';end if;
 if a.revision is distinct from p_revision then raise exception 'Assignment changed. Refresh before updating.' using errcode='40001';end if;
 if a.status in ('Completed','Cancelled') then raise exception 'This assignment is already closed';end if;
 if p_due is null or p_priority not in ('Low','Normal','High','Urgent') or length(trim(coalesce(p_note,'')))<3 then raise exception 'Due date, priority and change reason required';end if;
 update public.ops_assignments set due_at=p_due,priority=p_priority,instructions=coalesce(p_instructions,''),revision=revision+1,updated_at=now() where id=a.id;
 insert into public.ops_audit_log(business_unit_id,assignment_id,actor_id,action,detail) values(a.business_unit_id,a.id,actor,'Assignment updated',jsonb_build_object('note',p_note,'previous_due',a.due_at,'due',p_due,'previous_priority',a.priority,'priority',p_priority,'previous_instructions',a.instructions,'instructions',p_instructions));
end $$;

-- Authenticated wrappers are the API boundary; private implementations are not exposed.
create function public.ops_workspace(p_unit uuid default null) returns jsonb language sql security definer set search_path='' as $$select operations_private.workspace(p_unit)$$;
create function public.ops_save_template(p_id uuid,p_unit uuid,p_kind text,p_content jsonb,p_revision integer,p_publish boolean) returns uuid language sql security definer set search_path='' as $$select operations_private.save_template(p_id,p_unit,p_kind,p_content,p_revision,p_publish)$$;
create function public.ops_template_action(p_id uuid,p_unit uuid,p_action text,p_revision integer) returns uuid language sql security definer set search_path='' as $$select operations_private.template_action(p_id,p_unit,p_action,p_revision)$$;
create function public.ops_assign(p_unit uuid,p_version uuid,p_selection jsonb,p_due timestamptz,p_priority text,p_instructions text,p_attachments jsonb,p_verify boolean) returns uuid language sql security definer set search_path='' as $$select operations_private.assign(p_unit,p_version,p_selection,p_due,p_priority,p_instructions,p_attachments,p_verify)$$;
create function public.ops_change_assignment(p_id uuid,p_revision integer,p_status text,p_note text) returns void language sql security definer set search_path='' as $$select operations_private.change_assignment(p_id,p_revision,p_status,p_note)$$;
create function public.ops_update_assignment(p_id uuid,p_revision integer,p_due timestamptz,p_priority text,p_instructions text,p_note text) returns void language sql security definer set search_path='' as $$select operations_private.update_assignment(p_id,p_revision,p_due,p_priority,p_instructions,p_note)$$;
create function public.ops_delegate(p_unit uuid,p_user uuid,p_create boolean,p_assign boolean) returns void language sql security definer set search_path='' as $$select operations_private.delegate(p_unit,p_user,p_create,p_assign)$$;
revoke all on all functions in schema operations_private from public,anon,authenticated;
-- Policy helpers may execute by authenticated roles, without granting private schema usage.
grant execute on function operations_private.manager(uuid),operations_private.can_edit(uuid),operations_private.can_use_library(uuid),operations_private.can_view_template(uuid),operations_private.can_view_assignment(uuid) to authenticated;
do $$ declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('ops_workspace','ops_save_template','ops_template_action','ops_assign','ops_change_assignment','ops_delegate','ops_update_assignment') loop
 execute format('revoke all on function %s from public,anon,authenticated',f);
 execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
