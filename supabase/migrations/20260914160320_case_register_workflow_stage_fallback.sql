-- Keep pre-NTE workflow stages aligned with the processing board.
set local lock_timeout='2s';
set local statement_timeout='20s';
create or replace function public.case_register_rows() returns setof jsonb
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
 case when n.id is not null then public.case_register_nte_metadata(n.id) else '{}'::jsonb end meta,
 coalesce((select string_agg(de.code||' — '||de.description,'; ' order by de.code) from public.discipline_entries de where de.id::text=any(n.discipline_code_ids)),array_to_string(n.discipline_code_ids,'; ')) policy,
 (select string_agg(distinct de.category,'; ') from public.discipline_entries de where de.id::text=any(n.discipline_code_ids)) offense_category
 from public.incident_reports ir
 left join lateral unnest(ir.involved_employee_ids) with ordinality e(employee_id,ordinality) on true
 left join public.ntes n on n.incident_report_id=ir.id and n.recipient_employee_id=e.employee_id and public.case_register_can_view_nte(n.id)
 left join lateral (select r.* from public.resolutions r where r.incident_report_id=ir.id and r.employee_id=e.employee_id
 and (r.nte_id=n.id or (r.nte_id is null and n.id is null)) order by r.created_at desc,r.id limit 1) d on true
 left join directory u on u.id=e.employee_id
 where public.case_register_scope(ir.business_unit_id,e.employee_id)
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
 when c.response_date is not null then 'For HR review'
 when c.nte_id is null then case c.pipeline_stage
  when 'nte-for-approval' then 'For approval' when 'bod-gm-approval' then 'For approval'
  when 'nte-sent' then 'Awaiting employee response' when 'hr-review-response' then 'For HR review'
  when 'scheduled-hearing' then 'Scheduled for conference/hearing' when 'resolution' then 'For resolution'
  when 'closed' then 'Closed' when 'converted-coaching' then 'Converted to coaching' else 'IR review' end
 else 'IR review' end stage,
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
 'overdue',coalesce(stage<>'Closed' and ((response_date is null and nte_status='Issued' and due_at<=now()) or (sla_deadline<=now() and nte_id is null and stage='IR review')),false),
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
