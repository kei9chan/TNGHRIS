-- Reporting adds no grants to case data and runs under the caller's existing RLS.
set local lock_timeout='2s';
set local statement_timeout='20s';

create function private.case_report_scope(p_bu uuid,p_employee uuid default null)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id(); scope jsonb:=public.current_data_scope(); home uuid;
begin
 if actor is null or not public.has_feature_permission('IncidentReports','view') then return false; end if;
 select business_unit_id into home from public.hris_users where id=actor;
 return case scope->>'type'
 when 'GLOBAL' then true
 when 'SPECIFIC' then coalesce(scope->'allowedBuIds' ? p_bu::text,false)
 when 'HOME_ONLY' then coalesce(p_bu=home,false)
 when 'DEPARTMENT' then coalesce(p_bu=home and public.can_access_hris_user(p_employee),false)
 when 'DIRECT_REPORTS' then coalesce(p_bu=home and public.can_access_hris_user(p_employee),false)
 else false end;
end $$;
revoke all on function private.case_report_scope(uuid,uuid) from public,anon;
grant execute on function private.case_report_scope(uuid,uuid) to authenticated;

-- Only the minimal receipt/implementation metadata already available to an NTE reader.
create function private.case_report_nte_metadata(p_nte uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not coalesce(private.can_view_nte(p_nte),false) then return '{}'::jsonb;end if;
 return jsonb_build_object('received_at',(select received_at from private.nte_receipts where nte_id=p_nte),
 'deadline',(select deadline_exclusive from private.nte_receipts where nte_id=p_nte),
 'reply_attachment',(select response_attachment from private.nte_receipts where nte_id=p_nte),
 'implementation',(select i.status from private.nte_implementation i join public.resolutions r on r.id=i.resolution_id where r.nte_id=p_nte order by r.created_at desc limit 1));
end $$;
revoke all on function private.case_report_nte_metadata(uuid) from public,anon;
grant execute on function private.case_report_nte_metadata(uuid) to authenticated;

create table public.case_register_archives (
 row_key text primary key, incident_report_id uuid not null references public.incident_reports(id),
 employee_id uuid, archived_at timestamptz not null default now(), archived_by uuid not null default public.current_hris_user_id()
);
alter table public.case_register_archives enable row level security;
revoke all on public.case_register_archives from public,anon,authenticated;
grant select,insert,delete on public.case_register_archives to authenticated;
create policy case_archive_read on public.case_register_archives for select to authenticated using
 (exists(select 1 from public.incident_reports ir where ir.id=incident_report_id and private.case_report_scope(ir.business_unit_id,employee_id)));
create policy case_archive_insert on public.case_register_archives for insert to authenticated with check
 (archived_by=public.current_hris_user_id() and public.has_feature_permission('IncidentReports','manage') and
 exists(select 1 from public.incident_reports ir where ir.id=incident_report_id and private.case_report_scope(ir.business_unit_id,employee_id)));
create policy case_archive_delete on public.case_register_archives for delete to authenticated using
 (public.has_feature_permission('IncidentReports','manage') and exists(select 1 from public.incident_reports ir where ir.id=incident_report_id and private.case_report_scope(ir.business_unit_id,employee_id)));

create function private.case_register_rows() returns setof jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
 if public.current_hris_user_id() is null or not public.has_feature_permission('IncidentReports','view')
 or public.current_data_scope()->>'type' not in ('GLOBAL','SPECIFIC','HOME_ONLY','DEPARTMENT','DIRECT_REPORTS') then
 raise exception 'Case reporting requires authorized organizational access.' using errcode='42501';end if;
 return query
 with directory as materialized (
 select id,full_name,department,position,employment_status from public.get_accessible_hris_users()
 ), cases as materialized (
 select ir.*,e.employee_id,e.ordinality,
 coalesce(n.id::text,ir.id::text||':'||coalesce(e.employee_id::text,'unassigned')) row_key,
 n.id nte_id,n.nte_number,n.nte_code,n.status::text nte_status,n.response_date,n.response_deadline,
 n.closed_at nte_closed_at,n.discipline_code_ids,n.employee_response_evidence_url,
 n.recipient_name_snapshot,n.response_stage,
 d.id decision_id,d.resolution_type,d.status::text decision_status,d.decision_date,d.employee_acknowledged_at,
 d.document_reference,d.supporting_document_url,
 u.full_name,u.department,u.position,u.employment_status,
 case when n.id is not null then private.case_report_nte_metadata(n.id) else '{}'::jsonb end meta,
 coalesce((select string_agg(de.code||' — '||de.description,'; ' order by de.code) from public.discipline_entries de where de.id::text=any(n.discipline_code_ids)),array_to_string(n.discipline_code_ids,'; ')) policy,
 (select string_agg(distinct de.category,'; ') from public.discipline_entries de where de.id::text=any(n.discipline_code_ids)) offense_category
 from public.incident_reports ir
 left join lateral unnest(ir.involved_employee_ids) with ordinality e(employee_id,ordinality) on true
 left join public.ntes n on n.incident_report_id=ir.id and n.recipient_employee_id=e.employee_id and private.can_view_nte(n.id)
 left join lateral (select r.* from public.resolutions r where r.incident_report_id=ir.id and r.employee_id=e.employee_id
 and (r.nte_id=n.id or (r.nte_id is null and n.id is null)) order by r.created_at desc,r.id limit 1) d on true
 left join directory u on u.id=e.employee_id
 where private.case_report_scope(ir.business_unit_id,e.employee_id)
 ), staged as (
 select c.*,a.archived_at,
 case when c.status::text in ('Closed','NoAction') or c.nte_status='Closed' or c.decision_status in ('Approved','Acknowledged') then 'Closed'
 when c.decision_status='Pending Approval' then 'For approval'
 when c.decision_id is not null and c.decision_status='Rejected' then 'For HR review'
 when c.decision_id is not null then 'For resolution'
 when c.nte_status in ('Response Submitted','Waiver') then 'For HR review'
 when c.nte_status='Hearing Scheduled' then 'Scheduled for conference/hearing'
 when c.nte_status='PendingApproval' then 'For approval'
 when c.nte_status='Issued' and c.response_date is null then 'Awaiting employee response'
 when c.response_date is not null then 'For HR review' else 'IR review' end stage,
 coalesce((c.meta->>'deadline')::timestamptz,c.response_deadline) due_at,
 coalesce(c.nte_closed_at,c.employee_acknowledged_at) closed_date
 from cases c left join public.case_register_archives a on a.row_key=c.row_key
 )
 select jsonb_build_object(
 'id',row_key,'incidentId',id,'employeeId',employee_id,'nteId',nte_id,'buId',business_unit_id,
 'reference',case when case_number is null then id::text else 'TNGIR-'||lpad(case_number::text,5,'0') end,
 'nteReference',coalesce(nullif(nte_code,''),case when nte_number ~ '^\d+$' then 'TNGNTE-'||lpad(nte_number,5,'0') else nte_number end),
 'businessUnit',business_unit_name,'department',department,
 'employee',coalesce(full_name,recipient_name_snapshot,involved_employee_names[ordinality]),
 'position',position,'employmentStatus',employment_status,'summary',description,'offense',category,
 'policy',policy,'offenseCategory',offense_category,'incidentDate',date_time,'reportedDate',created_at,
 'servedDate',meta->>'received_at','replyDate',response_date,
 'dueDate',case when meta->>'deadline' is not null then due_at-interval '1 second' else due_at end,
 'stage',stage,'status',case when archived_at is not null then 'Archived' when stage='Closed' then 'Closed' else 'Open' end,
 'overdue',stage<>'Closed' and ((response_date is null and nte_status='Issued' and due_at<=now()) or (sla_deadline<=now() and nte_id is null)),
 'pendingDays',case when stage='Closed' then 0 else greatest(0,extract(day from now()-created_at)::integer) end,
 'resolutionDays',case when stage='Closed' and closed_date>=created_at then round(extract(epoch from closed_date-created_at)/86400,1) end,
 'action',case when meta->>'implementation' in ('Completed','Fully Served') then resolution_type end,
 'proposedAction',resolution_type,'implementationStatus',meta->>'implementation',
 'decisionDate',decision_date,'handlerId',assigned_to_id,'handler',assigned_to_name,
 'nteDocument',case when nte_id is not null then '/feedback/cases?caseId='||id::text||'&employeeId='||employee_id::text end,
 'replyDocument',case when response_date is not null then '/feedback/cases?caseId='||id::text||'&employeeId='||employee_id::text end,
 'decisionDocument',coalesce(nullif(document_reference,''),nullif(supporting_document_url,''),case when decision_id is not null then '/feedback/cases?caseId='||id::text||'&employeeId='||employee_id::text end),
 'closedDate',case when stage='Closed' then closed_date end,'archivedAt',archived_at)
 from staged order by created_at desc,row_key;
end $$;
revoke all on function private.case_register_rows() from public,anon;
grant execute on function private.case_register_rows() to authenticated;

create function private.case_register_matches(r jsonb,f jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare k text; date_key text:=coalesce(nullif(f->>'dateField',''),'reportedDate'); value_date date;
begin
 if date_key not in ('reportedDate','incidentDate','servedDate','closedDate') then raise exception 'Invalid report date field';end if;
 foreach k in array array['buId','employeeId','department','offense','offenseCategory','handlerId','action','stage','status'] loop
 if nullif(f->>k,'') is not null and coalesce(r->>k,'')<>f->>k then return false;end if;end loop;
 if f->>'overdue'='true' and coalesce((r->>'overdue')::boolean,false)=false then return false;end if;
 if nullif(f->>'policy','') is not null and position(lower(f->>'policy') in lower(coalesce(r->>'policy','')))=0 then return false;end if;
 if nullif(f->>'keyword','') is not null and position(lower(f->>'keyword') in lower(concat_ws(' ',r->>'reference',r->>'nteReference',r->>'employee',r->>'summary',r->>'policy')))=0 then return false;end if;
 value_date:=((r->>date_key)::timestamptz at time zone 'Asia/Manila')::date;
 if nullif(f->>'from','') is not null and (value_date is null or value_date<(f->>'from')::date) then return false;end if;
 if nullif(f->>'to','') is not null and (value_date is null or value_date>(f->>'to')::date) then return false;end if;
 return true;
end $$;
revoke all on function private.case_register_matches(jsonb,jsonb) from public,anon;
grant execute on function private.case_register_matches(jsonb,jsonb) to authenticated;

create function public.get_case_register(p_filters jsonb default '{}',p_page integer default 0,p_page_size integer default 50,
 p_export jsonb default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare rows jsonb; filtered jsonb; selected jsonb; output_rows jsonb; stats jsonb; facets jsonb; actor uuid:=public.current_hris_user_id();
 export_id uuid; k text; format text; n integer; cols jsonb; filters jsonb:=coalesce(p_filters,'{}');
begin
 if p_page<0 or p_page_size not between 1 and 100 then raise exception 'Invalid page';end if;
 if jsonb_typeof(filters)<>'object' or length(filters::text)>12000 then raise exception 'Invalid filters';end if;
 if nullif(filters->>'from','') is not null and nullif(filters->>'to','') is not null and (filters->>'from')::date>(filters->>'to')::date then raise exception 'Start date must precede end date';end if;
 if p_export is not null and not public.has_feature_permission('IncidentReports','export') then raise exception 'IncidentReports export permission is required' using errcode='42501';end if;
 select coalesce(jsonb_agg(r),'[]') into rows from private.case_register_rows() r;
 select coalesce(jsonb_agg(r),'[]') into filtered from jsonb_array_elements(rows) r where private.case_register_matches(r,filters);
 if p_export is not null then
 format:=p_export->>'format';cols:=p_export->'columns';
 if format not in ('xlsx','csv','pdf') or format is null or p_export->>'layout' not in ('summary','detailed')
 or jsonb_typeof(cols) is distinct from 'array' or jsonb_array_length(cols)=0 then raise exception 'Invalid export options';end if;
 if exists(select 1 from jsonb_array_elements_text(cols) c where c not in ('reference','nteReference','businessUnit','department','employee','position','employmentStatus','summary','offense','policy','incidentDate','reportedDate','servedDate','replyDate','dueDate','stage','status','pendingDays','action','decisionDate','handler','nteDocument','replyDocument','decisionDocument','closedDate')) then raise exception 'Invalid export column';end if;
 selected:=p_export->'selectedIds';
 if selected is not null and (jsonb_typeof(selected)<>'array' or jsonb_array_length(selected)=0) then raise exception 'Select at least one row';end if;
 if selected is not null then select coalesce(jsonb_agg(r),'[]') into filtered from jsonb_array_elements(filtered) r where selected ? (r->>'id');end if;
 n:=jsonb_array_length(filtered);
 if n>10000 then raise exception 'More than 10,000 records. Narrow the date range or Business Unit.';end if;
 -- Same snapshot, same filters, same row set: audit is mandatory and errors propagate.
 export_id:=gen_random_uuid();
 insert into public.audit_logs(id,user_id,user_email,action,entity,entity_id,details)
 values(export_id,actor::text,auth.jwt()->>'email','EXPORT','CaseRegister',null,jsonb_build_object('filters',filters,'recordCount',n,'format',format,
 'layout',p_export->>'layout','columns',cols,'selectedIds',selected,'scope',public.current_data_scope(),'outcome','authorized_for_download')::text);
 return jsonb_build_object('rows',filtered,'total',n,'auditId',export_id,'generatedAt',now());
 end if;
 select jsonb_build_object('total',count(*),'open',count(*) filter(where r->>'status'='Open'),
 'closed',count(*) filter(where r->>'stage'='Closed'),'overdue',count(*) filter(where r->>'overdue'='true'),
 'awaiting',count(*) filter(where r->>'stage'='Awaiting employee response'),
 'approval',count(*) filter(where r->>'stage'='For approval'),'hr',count(*) filter(where r->>'stage'='For HR review'),
 'hearing',count(*) filter(where r->>'stage'='Scheduled for conference/hearing'),
 'averageResolution',round(avg((r->>'resolutionDays')::numeric),1),'resolutionSample',count(r->>'resolutionDays'),
 'byBusinessUnit',coalesce((select jsonb_agg(x) from (select r->>'buId' id,r->>'businessUnit' label,count(*) count from jsonb_array_elements(filtered) r group by 1,2 order by 3 desc) x),'[]'),
 'byOffense',coalesce((select jsonb_agg(x) from (select r->>'offense' label,count(*) count from jsonb_array_elements(filtered) r group by 1 order by 2 desc) x),'[]')) into stats from jsonb_array_elements(filtered) r;
 facets:='{}';
 foreach k in array array['businessUnit','department','employee','offense','offenseCategory','handler','action','stage'] loop
 facets:=facets||jsonb_build_object(k,coalesce((select jsonb_agg(x) from (select distinct r->>k label,
 case k when 'businessUnit' then r->>'buId' when 'employee' then r->>'employeeId' when 'handler' then r->>'handlerId' else r->>k end value
 from jsonb_array_elements(rows) r where nullif(r->>k,'') is not null order by 1) x),'[]'));end loop;
 select coalesce(jsonb_agg(r),'[]') into output_rows from (select r from jsonb_array_elements(filtered) r limit p_page_size offset p_page*p_page_size) x;
 return jsonb_build_object('rows',output_rows,'total',jsonb_array_length(filtered),'summary',stats,'facets',facets,
 'canExport',public.has_feature_permission('IncidentReports','export'),'canArchive',public.has_feature_permission('IncidentReports','manage'));
end $$;
revoke all on function public.get_case_register(jsonb,integer,integer,jsonb) from public,anon;
grant execute on function public.get_case_register(jsonb,integer,integer,jsonb) to authenticated;

create function public.set_case_register_archive(p_row_key text,p_archived boolean) returns void
language plpgsql security invoker set search_path='' as $$
declare r jsonb;
begin
 if not public.has_feature_permission('IncidentReports','manage') then raise exception 'Case management permission required' using errcode='42501';end if;
 select x into r from private.case_register_rows() x where x->>'id'=p_row_key;
 if r is null or r->>'stage'<>'Closed' then raise exception 'Only an accessible closed case can be archived or restored' using errcode='42501';end if;
 if p_archived then insert into public.case_register_archives(row_key,incident_report_id,employee_id) values(p_row_key,(r->>'incidentId')::uuid,(r->>'employeeId')::uuid) on conflict do nothing;
 else delete from public.case_register_archives where row_key=p_row_key;end if;

end $$;
revoke all on function public.set_case_register_archive(text,boolean) from public,anon;
grant execute on function public.set_case_register_archive(text,boolean) to authenticated;

-- Enforce closure, row identity and audit even when a client writes the archive table directly.
create function private.guard_case_register_archive() returns trigger language plpgsql security invoker set search_path='' as $$
declare r jsonb;
begin
 if tg_op='INSERT' then
  select x into r from private.case_register_rows() x where x->>'id'=new.row_key;
  if r is null or r->>'stage'<>'Closed' or (r->>'incidentId')::uuid is distinct from new.incident_report_id
    or (r->>'employeeId')::uuid is distinct from new.employee_id then
   raise exception 'Only an accessible closed case can be archived' using errcode='42501';
  end if;
  new.archived_at:=now();new.archived_by:=public.current_hris_user_id();return new;
 end if;
 return old;
end $$;
revoke all on function private.guard_case_register_archive() from public,anon,authenticated;
create trigger guard_case_register_archive before insert on public.case_register_archives for each row execute function private.guard_case_register_archive();
create function private.audit_case_register_archive() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.audit_logs(user_id,user_email,action,entity,entity_id,details)
 values(public.current_hris_user_id()::text,auth.jwt()->>'email',case when tg_op='INSERT' then 'ARCHIVE' else 'RESTORE' end,'CaseRegister',null,
 jsonb_build_object('rowKey',case when tg_op='INSERT' then new.row_key else old.row_key end)::text);
 return null;
end $$;
revoke all on function private.audit_case_register_archive() from public,anon,authenticated;
create trigger audit_case_register_archive after insert or delete on public.case_register_archives for each row execute function private.audit_case_register_archive();
