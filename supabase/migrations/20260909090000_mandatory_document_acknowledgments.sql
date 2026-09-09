-- Private storage is reachable only through explicitly authorized RPCs.
create schema if not exists acknowledgment_private;
revoke all on schema acknowledgment_private from public, anon, authenticated;

create table acknowledgment_private.versions (
  id uuid primary key default gen_random_uuid(),
  source_table text not null check (source_table in ('announcements','memos')),
  document_id uuid not null,
  version_number integer not null check (version_number > 0),
  requirement_group uuid not null,
  document_type text not null check (document_type in ('Announcement','Policy','Memorandum')),
  title text not null,
  reference_number text,
  content_snapshot jsonb not null,
  content_hash text not null,
  effective_date date not null,
  due_date date,
  mandatory boolean not null,
  audience_snapshot jsonb not null,
  request_types text[] not null,
  issuing_department_id uuid references public.departments(id),
  issuing_department_name text,
  material_revision boolean not null,
  future_revision_requires_ack boolean not null,
  classification_reason text not null,
  published_by uuid not null,
  published_auth_user_id uuid not null,
  published_at timestamptz not null default clock_timestamp(),
  unique(source_table,document_id,version_number),
  check (due_date is null or due_date >= effective_date)
);

create table acknowledgment_private.assignments (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references acknowledgment_private.versions(id),
  employee_id uuid not null,
  employee_snapshot jsonb not null,
  assigned_by uuid not null,
  assigned_at timestamptz not null default clock_timestamp(),
  applicability_snapshot jsonb not null,
  unique(version_id,employee_id)
);

create table acknowledgment_private.deliveries (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references acknowledgment_private.assignments(id),
  employee_id uuid not null,
  auth_user_id uuid not null,
  delivered_at timestamptz not null default clock_timestamp(),
  content_hash text not null
);

create table acknowledgment_private.view_events (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null unique references acknowledgment_private.deliveries(id),
  assignment_id uuid not null references acknowledgment_private.assignments(id),
  employee_id uuid not null,
  auth_user_id uuid not null,
  viewed_at timestamptz not null default clock_timestamp()
);

create table acknowledgment_private.receipts (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null unique references acknowledgment_private.assignments(id),
  employee_id uuid not null,
  auth_user_id uuid not null,
  employee_snapshot jsonb not null,
  document_snapshot jsonb not null,
  version_id uuid not null references acknowledgment_private.versions(id),
  requirement_group uuid not null,
  content_hash text not null,
  first_viewed_at timestamptz not null,
  latest_viewed_at timestamptz not null,
  acknowledged_at timestamptz not null default clock_timestamp(),
  display_timezone text not null default 'Asia/Manila' check (display_timezone='Asia/Manila'),
  statement text not null,
  source text not null check (source in ('web','mobile')),
  created_at timestamptz not null default clock_timestamp(),
  check (first_viewed_at <= latest_viewed_at and latest_viewed_at <= acknowledged_at)
);

create table acknowledgment_private.administrative_actions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references acknowledgment_private.assignments(id),
  action text not null check (action in ('exempt','revoke_exemption','assignment_correction')),
  reason text not null check (length(btrim(reason)) >= 3),
  actor_id uuid not null,
  auth_user_id uuid not null,
  created_at timestamptz not null default clock_timestamp()
);

create table acknowledgment_private.settings_history (
  id bigint generated always as identity primary key,
  enabled boolean not null,
  request_types text[] not null,
  changed_by uuid not null,
  auth_user_id uuid not null,
  reason text not null,
  changed_at timestamptz not null default clock_timestamp()
);

create index assignments_employee_idx on acknowledgment_private.assignments(employee_id,version_id);
create index receipts_employee_group_idx on acknowledgment_private.receipts(employee_id,requirement_group);
create index views_assignment_time_idx on acknowledgment_private.view_events(assignment_id,viewed_at);
create index versions_document_time_idx on acknowledgment_private.versions(source_table,document_id,effective_date desc,version_number desc);

create function acknowledgment_private.reject_mutation() returns trigger
language plpgsql set search_path='' as $$
begin
  raise exception 'Published document and acknowledgment evidence is append-only. Record a separate administrative action.' using errcode='42501';
end $$;

do $$ declare t text; begin
  foreach t in array array['versions','assignments','deliveries','view_events','receipts','administrative_actions','settings_history'] loop
    execute format('alter table acknowledgment_private.%I enable row level security',t);
    execute format('revoke all on acknowledgment_private.%I from public,anon,authenticated',t);
    execute format('create trigger immutable_evidence before update or delete on acknowledgment_private.%I for each row execute function acknowledgment_private.reject_mutation()',t);
  end loop;
end $$;
revoke all on all sequences in schema acknowledgment_private from public,anon,authenticated;
revoke all on all functions in schema acknowledgment_private from public,anon,authenticated;

-- Integration registry contains only verified employee-submission adapters. All other
-- channels (including protected reporting and approval tasks) are non-configurable.
create table acknowledgment_private.request_adapters (
 request_type text primary key, label text not null, table_name text not null unique,
 employee_column text not null, draft_statuses text[] not null default '{}'
);
insert into acknowledgment_private.request_adapters values
 ('Leave','Leave','leave_requests','employee_id','{Draft}'),
 ('Overtime','Overtime / Offset','ot_requests','employee_id','{Draft}'),
 ('WFH','Work from home','wfh_requests','employee_id','{WFH_PENDING_SUBMISSION}'),
 ('Manpower','On-call coverage','manpower_requests','requester_id','{}'),
 ('COE','Certificate of employment','coe_requests','employee_id','{}'),
 ('AssetRequests','Asset request','asset_requests','employee_id','{}'),
 ('Benefits','Benefit request','benefit_requests','employee_id','{}'),
 ('AttendanceCorrection','Attendance correction','attendance_punch_requests','employee_id','{}');
alter table acknowledgment_private.request_adapters enable row level security;
revoke all on acknowledgment_private.request_adapters from public,anon,authenticated;

create function acknowledgment_private.actor() returns uuid language plpgsql stable security definer set search_path='' as $$
declare a uuid:=public.current_hris_user_id();begin
 if a is null or auth.uid() is null then raise exception 'Active authenticated employee required' using errcode='42501';end if;return a;
end $$;
create function acknowledgment_private.can_manage(p_source text default null) returns boolean language sql stable security definer set search_path='' as $$
 select public.current_hris_user_id() is not null and
 case p_source when 'announcements' then public.has_feature_permission('Announcements','edit')
 when 'memos' then public.has_feature_permission('Feedback','edit')
 else public.has_feature_permission('Settings','edit') end
$$;
create function acknowledgment_private.can_report() returns boolean language sql stable security definer set search_path='' as $$
 select public.has_feature_permission('AuditLog','view') or acknowledgment_private.can_manage('announcements') or acknowledgment_private.can_manage('memos')
$$;
create function acknowledgment_private.employee_snapshot(p_employee uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',id,'name',full_name,'number',employee_id,'businessUnitId',business_unit_id,'businessUnit',business_unit,'departmentId',department_id,'department',department) from public.hris_users where id=p_employee
$$;
create function acknowledgment_private.valid_types(p_types text[]) returns boolean language sql stable security definer set search_path='' as $$
 select p_types is not null and not exists(select 1 from unnest(p_types) k where k is null or not exists(select 1 from acknowledgment_private.request_adapters r where r.request_type=k))
$$;
create function acknowledgment_private.matches(p_employee uuid,p_audience jsonb) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((p_audience->>'all')::boolean,false) or exists(
 select 1 from public.hris_users h where h.id=p_employee and (
 coalesce(p_audience->'employees','[]') ? h.id::text or
 coalesce(p_audience->'businessUnits','[]') ? h.business_unit_id::text or
 coalesce(p_audience->'departments','[]') ? h.department_id::text or
 coalesce(p_audience->'employmentTypes','[]') ? h.employment_status or
 exists(select 1 from private.effective_role_ids(h.id) r where coalesce(p_audience->'roles','[]') ? r.role_id)))
$$;
-- Assignments are publication snapshots, never retroactively removed by personnel edits.
-- Reconciliation uses only employee IDs resolved in the immutable publication snapshot.
create function acknowledgment_private.assign_current(p_employee uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 insert into acknowledgment_private.assignments(version_id,employee_id,employee_snapshot,assigned_by,applicability_snapshot)
 select v.id,p_employee,acknowledgment_private.employee_snapshot(p_employee),v.published_by,v.audience_snapshot
 from acknowledgment_private.versions v where v.mandatory and (v.audience_snapshot->'assignedEmployeeIds') ? p_employee::text
 and exists(select 1 from public.hris_users h where h.id=p_employee and lower(h.status)='active')
 on conflict(version_id,employee_id) do nothing;
end $$;
create function acknowledgment_private.exempt(p_assignment uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select action in ('exempt','assignment_correction') from acknowledgment_private.administrative_actions where assignment_id=p_assignment order by created_at desc,id desc limit 1),false)
$$;
create function acknowledgment_private.pending(p_employee uuid,p_type text default null) returns table(assignment_id uuid,version_id uuid,title text) language sql stable security definer set search_path='' as $$
 select a.id,v.id,v.title from acknowledgment_private.assignments a join acknowledgment_private.versions v on v.id=a.version_id
 where a.employee_id=p_employee and v.mandatory and v.effective_date <= (statement_timestamp() at time zone 'Asia/Manila')::date
 and (p_type is null or p_type=any(v.request_types))
 and not exists(select 1 from acknowledgment_private.versions n where n.source_table=v.source_table and n.document_id=v.document_id and n.version_number>v.version_number and n.effective_date <= (statement_timestamp() at time zone 'Asia/Manila')::date)
 and not acknowledgment_private.exempt(a.id)
 and not exists(select 1 from acknowledgment_private.receipts r where r.employee_id=p_employee and r.requirement_group=v.requirement_group)
$$;
create function public.acknowledgment_gate(p_request_type text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=acknowledgment_private.actor();s acknowledgment_private.settings_history;items jsonb;begin
 select * into s from acknowledgment_private.settings_history order by id desc limit 1;
 -- Unknown and protected types are never blocked, even if configuration is malformed.
 if not coalesce(s.enabled,false) or not p_request_type=any(s.request_types) or not exists(select 1 from acknowledgment_private.request_adapters where request_type=p_request_type) then return jsonb_build_object('blocked',false);end if;
 perform acknowledgment_private.assign_current(a);
 select coalesce(jsonb_agg(to_jsonb(p)),'[]') into items from acknowledgment_private.pending(a,p_request_type) p;
 return jsonb_build_object('blocked',jsonb_array_length(items)>0,'code','ACKNOWLEDGMENT_REQUIRED','requestType',p_request_type,'documents',items,'link','/acknowledgments','message','You have one or more announcements, policies, or memorandums that require your acknowledgment. Please open and acknowledge all pending documents before submitting this request.');
end $$;
create function acknowledgment_private.enforce_submission() returns trigger language plpgsql security definer set search_path='' as $$
declare r acknowledgment_private.request_adapters;g jsonb;n jsonb:=to_jsonb(new);o jsonb;begin
 select * into strict r from acknowledgment_private.request_adapters where table_name=tg_table_name;
 if tg_op='UPDATE' then
  o:=to_jsonb(old);
  -- Only draft-to-submitted transitions; pending/approved requests and approval tasks are untouched.
  if not coalesce(o->>'status','')=any(r.draft_statuses) then return new;end if;
 end if;
 if coalesce(n->>'status','')=any(r.draft_statuses) then return new;end if;
 -- The gate concerns the authenticated submitter's personal requests, never an approver.
 if (n->>r.employee_column)::uuid is distinct from public.current_hris_user_id() then return new;end if;
 g:=public.acknowledgment_gate(r.request_type);
 if (g->>'blocked')::boolean then raise exception using errcode='P0001',message='ACKNOWLEDGMENT_REQUIRED',detail=g::text,hint='/acknowledgments';end if;
 return new;
end $$;
do $$ declare r record;begin
 for r in select * from acknowledgment_private.request_adapters loop
 execute format('create trigger z_mandatory_acknowledgment before insert or update on public.%I for each row execute function acknowledgment_private.enforce_submission()',r.table_name);
 end loop;
end $$;

create function public.acknowledgment_settings(p_change jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=acknowledgment_private.actor();ts text[];begin
 if not acknowledgment_private.can_manage() then raise exception 'Settings edit permission required' using errcode='42501';end if;
 if p_change is not null then
 select coalesce(array_agg(x),'{}') into ts from jsonb_array_elements_text(p_change->'requestTypes') x;
 if not acknowledgment_private.valid_types(ts) then raise exception 'Protected or unsupported request types cannot be gated';end if;
 if length(trim(coalesce(p_change->>'reason','')))<3 then raise exception 'A change reason is required';end if;
 insert into acknowledgment_private.settings_history(enabled,request_types,changed_by,auth_user_id,reason) values((p_change->>'enabled')::boolean,ts,a,auth.uid(),p_change->>'reason');
 end if;
 return jsonb_build_object('settings',(select to_jsonb(s)||jsonb_build_object('changedByName',(select full_name from public.hris_users where id=s.changed_by)) from acknowledgment_private.settings_history s order by id desc limit 1),'types',(select jsonb_agg(jsonb_build_object('id',request_type,'name',label) order by label) from acknowledgment_private.request_adapters));
end $$;

create function public.acknowledgment_options() returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=acknowledgment_private.actor();begin
 if not acknowledgment_private.can_manage('announcements') and not acknowledgment_private.can_manage('memos') then raise exception 'Document edit permission required' using errcode='42501';end if;
 return jsonb_build_object(
 'employees',(select coalesce(jsonb_agg(acknowledgment_private.employee_snapshot(h.id)||jsonb_build_object('employmentType',h.employment_status)),'[]') from public.hris_users h where lower(h.status)='active' and public.can_access_hris_user(h.id)),
 'businessUnits',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name)),'[]') from public.business_units b where exists(select 1 from public.hris_users h where h.business_unit_id=b.id and public.can_access_hris_user(h.id))),
 'departments',(select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'name',d.name)),'[]') from public.departments d where exists(select 1 from public.hris_users h where h.department_id=d.id and public.can_access_hris_user(h.id))),
 'roles',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',id)),'[]') from public.roles where is_active),
 'types',(select jsonb_agg(jsonb_build_object('id',request_type,'name',label) order by label) from acknowledgment_private.request_adapters),
 'documents',(select coalesce(jsonb_agg(x),'[]') from (
 select jsonb_build_object('id',id,'source','announcements','title',title,'body',message,'revisionDefault',(select future_revision_requires_ack from acknowledgment_private.versions v where v.source_table='announcements' and v.document_id=announcements.id order by version_number desc limit 1),'attachments',case when attachment_url is null or attachment_url='' then '[]'::jsonb else jsonb_build_array(attachment_url) end) x from public.announcements where acknowledgment_private.can_manage('announcements') and (created_by_user_id=a or public.can_access_hris_user(created_by_user_id))
 union all select jsonb_build_object('id',id,'source','memos','title',title,'body',body,'revisionDefault',(select future_revision_requires_ack from acknowledgment_private.versions v where v.source_table='memos' and v.document_id=memos.id order by version_number desc limit 1),'attachments',to_jsonb(attachments)) from public.memos where acknowledgment_private.can_manage('memos') and (created_by=a or public.can_access_hris_user(created_by)) ) docs));
end $$;

create function public.publish_acknowledgment_version(p_document uuid,p_source text,p_config jsonb,p_files jsonb default '[]') returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=acknowledgment_private.actor();src jsonb;prior acknowledgment_private.versions;v acknowledgment_private.versions;aud jsonb:=p_config->'audience';ts text[];snap jsonb;file jsonb;targets uuid[];h uuid;grp uuid;begin
 if not acknowledgment_private.can_manage(p_source) or p_source not in ('announcements','memos') then raise exception 'Document publication permission required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('ack-publish:'||p_source||p_document,0));
 if p_source='announcements' then select to_jsonb(d) into src from public.announcements d where id=p_document and (created_by_user_id=actor or public.can_access_hris_user(created_by_user_id));
 else select to_jsonb(d) into src from public.memos d where id=p_document and (created_by=actor or public.can_access_hris_user(created_by));end if;
 if src is null then raise exception 'Document outside permitted scope' using errcode='42501';end if;
 if length(trim(coalesce(p_config->>'title','')))=0 or length(trim(coalesce(p_config->>'reason','')))<3 then raise exception 'Title and publication / revision reason required';end if;
 if aud is null or jsonb_typeof(aud)<>'object' then raise exception 'Target audience required';end if;
 -- Explicit OR audience; unknown identifiers do not expand the audience.
 select coalesce(array_agg(x),'{}') into ts from jsonb_array_elements_text(p_config->'requestTypes') x;
 if not acknowledgment_private.valid_types(ts) then raise exception 'Protected or unsupported request type';end if;
 select array_agg(id) into targets from public.hris_users where lower(status)='active' and acknowledgment_private.matches(id,aud);
 if cardinality(targets) is null then raise exception 'Audience contains no active employees';end if;
 foreach h in array targets loop
 if not public.can_access_hris_user(h) then raise exception 'Audience includes employees outside your permitted scope' using errcode='42501';end if;
 end loop;
 aud:=aud||jsonb_build_object('assignedEmployeeIds',to_jsonb(targets));
 if (p_config->>'issuingDepartmentId') is not null and not exists(select 1 from public.hris_users where department_id=(p_config->>'issuingDepartmentId')::uuid and public.can_access_hris_user(id)) then raise exception 'Issuing department outside permitted scope';end if;
 if jsonb_typeof(p_files)<>'array' or jsonb_array_length(p_files)>10 or octet_length(p_files::text)>75000000 then raise exception 'Invalid attachment archive';end if;
 if jsonb_array_length(p_files)<>(case when p_source='announcements' then case when coalesce(src->>'attachment_url','')='' then 0 else 1 end else jsonb_array_length(coalesce(src->'attachments','[]')) end) then raise exception 'Archive every document attachment before publication';end if;
 for file in select * from jsonb_array_elements(p_files) loop
 if coalesce(file->>'mime','') not in ('application/pdf','image/png','image/jpeg','text/plain') or coalesce(octet_length(decode(file->>'base64','base64')),0)=0 or octet_length(decode(file->>'base64','base64'))>5242880 then raise exception 'Attachments must be PDF, PNG, JPEG or plain text, up to 5 MB each';end if;
 end loop;
 snap:=jsonb_build_object('body',coalesce(src->>'message',src->>'body',''),'files',p_files);
 select * into prior from acknowledgment_private.versions where source_table=p_source and document_id=p_document order by version_number desc limit 1;
 if prior.id is not null and (p_config->>'effectiveDate')::date<prior.effective_date then raise exception 'Revision effective date cannot precede its previous version';end if;
 grp:=case when prior.id is not null and not coalesce((p_config->>'material')::boolean,true) then prior.requirement_group else gen_random_uuid() end;
 insert into acknowledgment_private.versions(source_table,document_id,version_number,requirement_group,document_type,title,reference_number,content_snapshot,content_hash,effective_date,due_date,mandatory,audience_snapshot,request_types,issuing_department_id,issuing_department_name,material_revision,future_revision_requires_ack,classification_reason,published_by,published_auth_user_id)
 values(p_source,p_document,coalesce(prior.version_number,0)+1,grp,p_config->>'documentType',p_config->>'title',nullif(p_config->>'referenceNumber',''),snap,encode(sha256(convert_to(snap::text,'UTF8')),'hex'),(p_config->>'effectiveDate')::date,nullif(p_config->>'dueDate','')::date,(p_config->>'mandatory')::boolean,aud,ts,(p_config->>'issuingDepartmentId')::uuid,(select name from public.departments where id=(p_config->>'issuingDepartmentId')::uuid),coalesce((p_config->>'material')::boolean,true),coalesce((p_config->>'futureRevisionRequiresAck')::boolean,true),p_config->>'reason',actor,auth.uid()) returning * into v;
 insert into acknowledgment_private.assignments(version_id,employee_id,employee_snapshot,assigned_by,applicability_snapshot)
 select v.id,x,acknowledgment_private.employee_snapshot(x),actor,aud from unnest(targets) x;
 return v.id;
end $$;

create function public.my_acknowledgments() returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=acknowledgment_private.actor();begin
 perform acknowledgment_private.assign_current(a);
 return jsonb_build_object('documents',(select coalesce(jsonb_agg(jsonb_build_object('assignmentId',s.id,'versionId',v.id,'title',v.title,'documentType',v.document_type,'version',v.version_number,'publishedAt',v.published_at,'effectiveDate',v.effective_date,'dueDate',v.due_date,'issuingDepartment',v.issuing_department_name,'pending',exists(select 1 from acknowledgment_private.pending(a) p where p.assignment_id=s.id),'status',case when exists(select 1 from acknowledgment_private.receipts r where r.employee_id=a and r.requirement_group=v.requirement_group) then 'Acknowledged' when exists(select 1 from acknowledgment_private.view_events where assignment_id=s.id) then 'Viewed' else 'Not Opened' end,'exempt',acknowledgment_private.exempt(s.id)) order by v.published_at desc),'[]') from acknowledgment_private.assignments s join acknowledgment_private.versions v on v.id=s.version_id where s.employee_id=a),
 'receipts',(select coalesce(jsonb_agg(to_jsonb(r) order by r.acknowledged_at desc),'[]') from acknowledgment_private.receipts r where employee_id=a));
end $$;
create function public.open_acknowledgment_document(p_assignment uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=acknowledgment_private.actor();v acknowledgment_private.versions;d uuid;begin
 select x.* into v from acknowledgment_private.assignments s join acknowledgment_private.versions x on x.id=s.version_id where s.id=p_assignment and s.employee_id=a;
 if v.id is null then raise exception 'Document not assigned to you' using errcode='42501';end if;
 insert into acknowledgment_private.deliveries(assignment_id,employee_id,auth_user_id,content_hash) values(p_assignment,a,auth.uid(),v.content_hash) returning id into d;
 return jsonb_build_object('deliveryId',d,'version',to_jsonb(v));
end $$;
create function public.record_acknowledgment_view(p_delivery uuid) returns void language plpgsql security definer set search_path='' as $$
declare a uuid:=acknowledgment_private.actor();d acknowledgment_private.deliveries;begin
 select * into d from acknowledgment_private.deliveries where id=p_delivery and employee_id=a and auth_user_id=auth.uid();
 if d.id is null then raise exception 'Invalid document delivery' using errcode='42501';end if;
 insert into acknowledgment_private.view_events(delivery_id,assignment_id,employee_id,auth_user_id) values(d.id,d.assignment_id,a,auth.uid()) on conflict(delivery_id) do nothing;
end $$;
create function public.acknowledge_document(p_delivery uuid,p_confirmed boolean,p_source text default 'web') returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=acknowledgment_private.actor();d acknowledgment_private.deliveries;v acknowledgment_private.versions;r acknowledgment_private.receipts;first_at timestamptz;latest_at timestamptz;begin
 if p_confirmed is distinct from true then raise exception 'Select the acknowledgment statement first';end if;
 select * into d from acknowledgment_private.deliveries where id=p_delivery and employee_id=a and auth_user_id=auth.uid();
 if d.id is null then raise exception 'Invalid document delivery' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('ack-receipt:'||d.assignment_id,0));
 select * into r from acknowledgment_private.receipts where assignment_id=d.assignment_id;
 if r.id is not null then return to_jsonb(r);end if;
 if not exists(select 1 from acknowledgment_private.view_events where delivery_id=d.id and auth_user_id=auth.uid()) then raise exception 'Load the document before acknowledging';end if;
 select x.* into strict v from acknowledgment_private.versions x join acknowledgment_private.assignments s on s.version_id=x.id where s.id=d.assignment_id;
 select min(viewed_at),max(viewed_at) into first_at,latest_at from acknowledgment_private.view_events where assignment_id=d.assignment_id;
 insert into acknowledgment_private.receipts(assignment_id,employee_id,auth_user_id,employee_snapshot,document_snapshot,version_id,requirement_group,content_hash,first_viewed_at,latest_viewed_at,statement,source)
 values(d.assignment_id,a,auth.uid(),acknowledgment_private.employee_snapshot(a),to_jsonb(v)-'content_snapshot',v.id,v.requirement_group,v.content_hash,first_at,latest_at,'I acknowledge that I have received and opened this document and have been given the opportunity to read and understand its contents. I understand that this acknowledgment confirms receipt and review and does not necessarily mean that I agree with every provision.',p_source) returning * into r;
 return to_jsonb(r);
end $$;
create function public.acknowledgment_report() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform acknowledgment_private.actor();
 if not acknowledgment_private.can_report() then raise exception 'Acknowledgment report access required' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('assignmentId',s.id,'employee',s.employee_snapshot,'title',v.title,'version',v.version_number,'documentId',v.document_id,'assignedAt',s.assigned_at,'dueDate',v.due_date,'firstViewedAt',(select min(viewed_at) from acknowledgment_private.view_events where assignment_id=s.id),'acknowledgedAt',r.acknowledged_at,'receiptId',r.id,'status',case when r.id is not null then 'Acknowledged' when exists(select 1 from acknowledgment_private.view_events where assignment_id=s.id) then 'Viewed' else 'Not Opened' end,'exempt',acknowledgment_private.exempt(s.id),'overdue',v.due_date<(statement_timestamp() at time zone 'Asia/Manila')::date and r.id is null and not acknowledgment_private.exempt(s.id),'canCorrect',acknowledgment_private.can_manage(v.source_table),'publication',to_jsonb(v)-'content_snapshot','administrativeActions',(select coalesce(jsonb_agg(to_jsonb(x) order by created_at),'[]') from acknowledgment_private.administrative_actions x where x.assignment_id=s.id)) order by s.assigned_at desc),'[]') from acknowledgment_private.assignments s join acknowledgment_private.versions v on v.id=s.version_id left join lateral(select * from acknowledgment_private.receipts x where x.employee_id=s.employee_id and x.requirement_group=v.requirement_group order by acknowledged_at limit 1) r on true where public.can_access_hris_user(s.employee_id) and (public.has_feature_permission('AuditLog','view') or acknowledgment_private.can_manage(v.source_table)));
end $$;
create function public.acknowledgment_administrative_action(p_assignment uuid,p_action text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare a uuid:=acknowledgment_private.actor();s acknowledgment_private.assignments;src text;begin
 select * into s from acknowledgment_private.assignments where id=p_assignment;
 select source_table into src from acknowledgment_private.versions where id=s.version_id;
 if s.id is null or not acknowledgment_private.can_manage(src) or not public.can_access_hris_user(s.employee_id) then raise exception 'Scoped document edit permission required' using errcode='42501';end if;
 insert into acknowledgment_private.administrative_actions(assignment_id,action,reason,actor_id,auth_user_id) values(s.id,p_action,p_reason,a,auth.uid());
end $$;
revoke all on all functions in schema acknowledgment_private from public,anon,authenticated;
do $$ declare p record;begin
 for p in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in ('acknowledgment_gate','acknowledgment_settings','acknowledgment_options','publish_acknowledgment_version','my_acknowledgments','open_acknowledgment_document','record_acknowledgment_view','acknowledge_document','acknowledgment_report','acknowledgment_administrative_action') loop
 execute format('revoke all on function %s from public,anon',p.signature);execute format('grant execute on function %s to authenticated',p.signature);
 end loop;
end $$;
