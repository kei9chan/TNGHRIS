-- Forward fixes confined to Phase 3 functions: SQL qualification and holiday versions.
create or replace function public.save_payroll_time_rules(p_scope_id uuid,p_date_from date,p_date_to date,p_config jsonb,p_source_ref text) returns uuid
language plpgsql security definer set search_path='' as $$
declare id uuid;entry record;bu uuid;begin
 if not private.payroll_time_permission(p_scope_id,'rules') then raise exception 'Scoped HR authorization is required.' using errcode='42501';end if;
 if p_date_from is null or p_date_to is null or p_date_to<p_date_from or p_date_to-p_date_from>366 then raise exception 'Choose a policy coverage range of at most one year.';end if;
 if jsonb_typeof(p_config)<>'object' or jsonb_typeof(coalesce(p_config->'restTemplates','[]'))<>'array' or jsonb_typeof(coalesce(p_config->'meals','{}'))<>'object' then raise exception 'Invalid time-rule configuration.';end if;
 select business_unit_id into bu from public.payroll_access_scopes s where s.id=p_scope_id;
 for entry in select value#>>'{}' key from jsonb_array_elements(coalesce(p_config->'restTemplates','[]')) loop
 if not exists(select 1 from public.shift_templates t where t.id=entry.key::uuid and t.business_unit_id=bu) then raise exception 'Rest-day template belongs to another BU.';end if;end loop;
 for entry in select * from jsonb_each_text(coalesce(p_config->'meals','{}')) loop
 if not exists(select 1 from public.shift_templates t where t.id=entry.key::uuid and t.business_unit_id=bu) or entry.value!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Choose a BU template and valid prescribed meal start time.';end if;end loop;
 insert into public.payroll_time_rules(scope_id,effective_from,effective_to,config,source_ref,approved_by) values(p_scope_id,p_date_from,p_date_to,
 jsonb_build_object('graceMinutes',5,'unpaidLunchMinutes',60,'minimumOtMinutes',60,'timezone','Asia/Manila','holidayCoverageConfirmed',coalesce((p_config->>'holidayCoverageConfirmed')::boolean,false),'splitShiftConfirmed',coalesce((p_config->>'splitShiftConfirmed')::boolean,false),'restTemplates',coalesce(p_config->'restTemplates','[]'),'meals',coalesce(p_config->'meals','{}'),'leavePolicyRef',p_config->>'leavePolicyRef','offsetPolicyRef',p_config->>'offsetPolicyRef'),p_source_ref,private.payroll_actor_id()) returning payroll_time_rules.id into id;
 insert into public.payroll_time_audit(scope_id,actor_id,action,record_id,reason) values(p_scope_id,private.payroll_actor_id(),'rules_recorded',id,p_source_ref);return id;
end $$;

create or replace function public.review_payroll_offset_case(p_case_id uuid,p_approve boolean,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare c public.payroll_offset_cases;stage text;day date;begin
 select * into strict c from public.payroll_offset_cases where id=p_case_id for update;
 if private.payroll_actor_id() is null or c.employee_id=public.current_hris_user_id() or not public.can_access_hris_user(c.employee_id) then raise exception 'Offset review denied; requesters cannot approve their own offset.' using errcode='42501';end if;
 select date into day from public.ot_requests where id=c.ot_request_id;
 if c.source_hash<>md5(private.payroll_time_sources(c.scope_id,day,day)::text) then raise exception 'Offset source changed. Create a new review version.' using errcode='40001';end if;
 if exists(select 1 from public.payroll_offset_actions where case_id=c.id and decision='reject') or private.payroll_offset_complete(c.id) then raise exception 'This offset review is already complete.';end if;
 if not exists(select 1 from public.payroll_offset_actions where case_id=c.id and stage='hr' and decision='approve' and private.payroll_offset_role(actor_id,'HR Manager')) then stage:='hr';
 elsif not exists(select 1 from public.payroll_offset_actions where case_id=c.id and stage='gm' and decision='approve' and private.payroll_offset_role(actor_id,'General Manager')) then stage:='gm';else stage:='bod';end if;
 if not private.payroll_offset_role(private.payroll_actor_id(),case stage when 'hr' then 'HR Manager' when 'gm' then 'General Manager' else 'Board of Director' end) then raise exception 'The current offset stage must be approved by %.',stage using errcode='42501';end if;
 insert into public.payroll_offset_actions(case_id,stage,actor_id,decision,reason) values(c.id,stage,private.payroll_actor_id(),case when p_approve then 'approve' else 'reject' end,p_reason);
 insert into public.payroll_time_audit(scope_id,actor_id,action,record_id,reason) values(c.scope_id,private.payroll_actor_id(),'offset_'||stage||case when p_approve then '_approved' else '_rejected' end,c.id,p_reason);
end $$;

create or replace function private.payroll_time_sources(p_scope uuid,p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare bu uuid; employees uuid[];begin
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>30 then raise exception 'Select a date range of at most 31 days.';end if;
 select business_unit_id into bu from public.payroll_access_scopes where id=p_scope and kind='business_unit';
 if bu is null then raise exception 'Choose one business unit.';end if;
 select coalesce(array_agg(h.id order by h.id),'{}') into employees from public.hris_users h where h.business_unit_id=bu and not coalesce(h.is_duplicate,false)
 and (h.date_hired is null or h.date_hired::date<=p_to) and (h.end_date is null or h.end_date::date>=p_from)
 ;
 if cardinality(employees)>300 then raise exception 'This business unit exceeds the 300-person review limit.';end if;
 return jsonb_build_object('scopeId',p_scope,'dateFrom',p_from,'dateTo',p_to,
 'employees',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'name',h.full_name,'hireDate',h.date_hired,'endDate',h.end_date,'status',h.status,'employmentStatus',h.employment_status,'managerId',h.reports_to) order by h.id) from public.hris_users h where h.id=any(employees)),'[]'),
 'shifts',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'employeeId',a.employee_id,'date',a.date,'templateId',a.shift_template_id,'name',t.name,'start',t.start_time,'end',t.end_time,'breakMinutes',t.break_minutes,'flexible',t.is_flexible,'businessUnitId',a.business_unit_id) order by a.date,a.id) from public.shift_assignments a left join public.shift_templates t on t.id=a.shift_template_id where a.employee_id=any(employees) and a.date between p_from-1 and p_to+1),'[]'),
 'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'employeeId',e.employee_id,'timestamp',e.timestamp,'type',e.type,'source',e.source,'managerId',e.manager_id,'anomalies',e.anomaly_tags) order by e.timestamp,e.id) from public.time_events e where e.employee_id=any(employees) and e.timestamp >= ((p_from-1)::timestamp at time zone 'Asia/Manila') and e.timestamp<((p_to+2)::timestamp at time zone 'Asia/Manila')),'[]'),
 'leave',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'employeeId',l.employee_id,'startDate',l.start_date,'endDate',l.end_date,'startTime',l.start_time,'endTime',l.end_time,'days',l.duration_days,'status',l.status,'typeId',l.leave_type_id,'type',t.name,'paid',t.paid,'configurationRequired',l.approver_configuration_required,'approvalChain',l.approver_chain) order by l.id) from public.leave_requests l left join public.leave_types t on t.id=l.leave_type_id where l.employee_id=any(employees) and l.start_date<=p_to and l.end_date>=p_from),'[]'),
 'ot',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'employeeId',o.employee_id,'date',o.date,'start',o.start_time,'end',o.end_time,'hours',o.hours,'approvedHours',o.approved_hours,'status',o.status,'type',o.ot_type,'paidType',o.paid_ot_type,'approvedBy',o.approved_by,'directManagerId',o.direct_manager_id,'approvalRoute',o.approval_route,'configurationRequired',o.approver_configuration_required,'converted',o.is_converted) order by o.id) from public.ot_requests o where o.employee_id=any(employees) and o.date between p_from-1 and p_to+1),'[]'),
 'wfh',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'employeeId',w.employee_id,'startDate',w.date,'endDate',coalesce(w.end_date,w.date),'status',w.status,'configurationRequired',w.approver_configuration_required) order by w.id) from public.wfh_requests w where w.employee_id=any(employees) and w.date<=p_to and coalesce(w.end_date,w.date)>=p_from),'[]'),
 'holidays',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'date',h.date,'name',h.name,'kind',h.type,'source','Existing HRIS holiday') order by h.date,h.id) from public.holidays h where h.date between p_from-1 and p_to+1 and not exists(select 1 from public.payroll_time_holidays local_h where local_h.scope_id=p_scope and local_h.date=h.date)),'[]') ||
 coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'date',h.date,'name',h.name,'kind',h.kind,'source',h.source_ref) order by h.date,h.id) from public.payroll_time_holidays h where h.scope_id=p_scope and h.date between p_from-1 and p_to+1 and not exists(select 1 from public.payroll_time_holidays x where x.replaces_id=h.id)),'[]'),
 'rules',coalesce((select jsonb_agg(to_jsonb(r) order by r.revision desc) from public.payroll_time_rules r where r.scope_id=p_scope and r.effective_from<=p_to and r.effective_to>=p_from),'[]'),
 'leavePolicies',coalesce((select jsonb_agg(to_jsonb(l) order by l.id) from public.leave_policies l),'[]'));
end $$;

create or replace function public.save_payroll_time_holiday(p_scope_id uuid,p_date date,p_name text,p_kind text,p_source_ref text,p_replaces_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare id uuid;begin
 if not private.payroll_time_permission(p_scope_id,'rules') then raise exception 'Scoped HR authorization is required.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_scope_id::text||p_date::text,3));
 if p_replaces_id is null and exists(select 1 from public.payroll_time_holidays h where h.scope_id=p_scope_id and h.date=p_date) then raise exception 'Select the prior local holiday for a linked correction.';end if;
 if p_replaces_id is not null and not exists(select 1 from public.payroll_time_holidays where payroll_time_holidays.id=p_replaces_id and scope_id=p_scope_id and date=p_date and not exists(select 1 from public.payroll_time_holidays x where x.replaces_id=p_replaces_id)) then raise exception 'Select the current holiday version for this BU/date.';end if;
 insert into public.payroll_time_holidays(scope_id,date,name,kind,source_ref,replaces_id,approved_by) values(p_scope_id,p_date,p_name,p_kind,p_source_ref,p_replaces_id,private.payroll_actor_id()) returning payroll_time_holidays.id into id;
 insert into public.payroll_time_audit(scope_id,actor_id,action,record_id,reason) values(p_scope_id,private.payroll_actor_id(),'holiday_recorded',id,p_source_ref);return id;
end $$;

create or replace function public.preview_payroll_time(p_scope_id uuid,p_date_from date,p_date_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare review jsonb;begin
 if not private.payroll_time_permission(p_scope_id,'view') then raise exception 'A scoped timekeeping/payroll duty and existing Timekeeping access are required.' using errcode='42501';end if;
 review:=private.payroll_time_review(p_scope_id,p_date_from,p_date_to);
 return (review-'source')||jsonb_build_object('holidays',review#>'{source,holidays}','rules',review#>'{source,rules}','templates',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'start',t.start_time,'end',t.end_time) order by t.name) from public.shift_templates t join public.payroll_access_scopes s on s.business_unit_id=t.business_unit_id where s.id=p_scope_id),'[]'),
 'packages',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'version',p.version,'status',p.status,'createdAt',p.created_at,'submittedAt',p.submitted_at,'reason',p.reason,'previousId',p.previous_id,'current',p.source_hash=review->>'sourceHash','blockedDays',p.result->'blockedDays') order by p.version desc) from public.payroll_time_packages p where p.scope_id=p_scope_id and p.date_from=p_date_from and p.date_to=p_date_to),'[]'));
end $$;
notify pgrst,'reload schema';
