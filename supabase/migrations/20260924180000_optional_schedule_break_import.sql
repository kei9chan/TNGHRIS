-- Match payroll schedule import to the optional planned-break template.
-- Preserve the normal Schedule Builder permission, publishing, and lock checks.
create or replace function private.payroll_input_row(p_kind text,p_scope uuid,p_from date,p_to date,r jsonb,p_apply boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.hris_users;bu uuid;bu_name text;spec jsonb;field jsonb;val text;key text;prior private.payroll_input_records;
 d date;first_date date;last_date date;ts timestamp;te timestamp;bs timestamp;be timestamp;template uuid;source uuid;payload jsonb;result jsonb;
 warning text;st public.payroll_service_charge_setups;lt uuid;days numeric;balance numeric;term int;installment numeric;scope_text text;week date;
begin
 select business_unit_id,name into bu,bu_name from public.payroll_access_scopes where id=p_scope;
 spec:=private.payroll_input_catalog()->p_kind;if spec is null then raise exception 'Unsupported import template.';end if;
 for field in select value from jsonb_array_elements(spec->'fields') loop
  val:=nullif(btrim(r->>(field->>'key')),'');
  if coalesce((field->>'required')::boolean,false) and val is null then raise exception '% is required.',field->>'label';end if;
  if val is null then continue;end if;
  if val ~ '^[=+@]' then raise exception '%: paste values, not formulas.',field->>'label';end if;
  if field->'choices' is not null and field->'choices'<>'null'::jsonb and not(field->'choices' ? val) then raise exception '% has an unsupported value.',field->>'label';end if;
  if field->>'type'='number' and val!~'^[0-9]{1,12}([.][0-9]{1,4})?$' then raise exception '% must be a non-negative number.',field->>'label';end if;
  if field->>'type'='date' then if val!~'^\d{4}-\d{2}-\d{2}$' then raise exception '%: use YYYY-MM-DD.',field->>'label';end if;d:=val::date;end if;
  if field->>'type'='datetime' then if val!~'^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$' then raise exception '%: use YYYY-MM-DD HH:mm in Asia/Manila.',field->>'label';end if;ts:=val::timestamp;end if;
 end loop;
 if coalesce(r->>'employeeId','')~*'^DEMO-' then raise exception 'Example-only Employee ID. Use an actual HRIS employee.';end if;
 select * into e from public.hris_users where employee_id=r->>'employeeId' and business_unit_id=bu and not coalesce(is_duplicate,false);
 if e.id is null or (select count(*) from public.hris_users where employee_id=r->>'employeeId' and business_unit_id=bu and not coalesce(is_duplicate,false))<>1 then raise exception 'Employee ID was not found or is ambiguous in this business unit. Select an HRIS employee.';end if;
 if r ? 'businessUnit' and r->>'businessUnit' is distinct from bu_name then raise exception 'Business unit does not match the selected business unit.';end if;
 if nullif(r->>'document','') is not null and r->>'document' !~'^https://[^[:space:]]+$' then raise exception 'Use an accessible HTTPS supporting document link.';end if;
 if nullif(r->>'payrollDate','') is not null and not exists(select 1 from jsonb_array_elements(public.get_normal_payroll_periods(p_scope,extract(year from (r->>'payrollDate')::date)::int)) c where c->>'releaseDate'=r->>'payrollDate' and (p_kind='deductions' or (c->>'from'=p_from::text and c->>'to'=p_to::text))) then raise exception 'Payroll date does not match the configured calendar and selected cutoff.';end if;
 key:=case p_kind when 'schedules' then r->>'workDate' when 'leave-balances' then (r->>'leaveType')||':'||(r->>'asOf') when 'deductions' then r->>'reference' when 'leave-taken' then (r->>'leaveType')||':'||(r->>'startDate')||':'||(r->>'endDate') when 'service-charge' then p_from::text||':'||p_to::text else (r->>'payrollDate')||':'||(r->>'approvalReference')||':'||(r->>'description') end;
 if p_apply then perform pg_advisory_xact_lock(hashtextextended('payroll-input:'||p_kind||':'||e.id::text||':'||key,0));end if;
 select * into prior from private.payroll_input_records where kind=p_kind and employee_id=e.id and natural_key=key;
 if prior.id is not null then if prior.data=r then return jsonb_build_object('duplicate',true,'employee',e.full_name,'employeeId',e.id,'key',key,'sourceId',prior.source_id);end if;raise exception 'A conflicting imported record already exists. Open the source record for an audited correction.';end if;
 first_date:=coalesce(nullif(r->>'workDate','')::date,nullif(r->>'startDate','')::date,p_from);last_date:=coalesce(nullif(r->>'endDate','')::date,first_date);
 if p_kind in('schedules','leave-taken') and (first_date<p_from or last_date>p_to or last_date<first_date) then raise exception 'Dates must be within the selected payroll cutoff.';end if;
 if e.date_hired is null or e.date_hired>last_date or (e.end_date is not null and e.end_date<first_date) then raise exception 'Records are outside employee employment dates or the hire date is missing.';end if;
 if p_kind in('schedules','leave-taken','additions','service-charge') and exists(select 1 from public.payroll_schedule_freezes where employee_id=e.id and date_from<=p_to and date_to>=p_from) then raise exception 'This period is locked by submitted payroll. Use the authorized correction workflow.';end if;

 if p_kind='schedules' then
  d:=(r->>'workDate')::date;week:=d-(extract(isodow from d)::int-1);scope_text:='business_unit:'||bu::text;
  if not private.payroll_schedule_can_edit(e.id) or not private.schedule_preset_manage(public.current_hris_user_id(),bu) then raise exception 'Existing schedule editing and preset permissions are required for this employee.' using errcode='42501';end if;
  if exists(select 1 from public.shift_assignments where employee_id=e.id and date=d) or exists(select 1 from public.payroll_schedule_publications where employee_id=e.id and d between effective_from and effective_to) then raise exception 'A saved or published schedule already exists. Import never overwrites it.';end if;
  if private.is_schedule_suspended(e.id,d) then raise exception 'An active suspension covers this date.';end if;
  if r->>'dayType'='Workday' then
   ts:=nullif(r->>'start','')::timestamp;te:=nullif(r->>'end','')::timestamp;bs:=nullif(r->>'breakStart','')::timestamp;be:=nullif(r->>'breakEnd','')::timestamp;
   if ts is null or te is null or ts::date<>d or te<=ts or te-ts>=interval '24 hours' then raise exception 'Enter a valid shift with explicit overnight end date and duration below 24 hours.';end if;
   if (bs is null) <> (be is null) or (bs is not null and (be<=bs or bs<ts or be>te)) then raise exception 'Enter both planned break times inside the shift, or leave both blank when no break applies.';end if;
   if exists(select 1 from public.shift_assignments a join public.shift_templates t on t.id=a.shift_template_id where a.employee_id=e.id and a.date between d-1 and d+1 and coalesce(t.schedule_kind,'work')='work' and a.date+t.start_time::time<te and a.date+t.end_time::time+coalesce(t.end_day_offset,0)*interval '1 day'>ts) then raise exception 'Shift overlaps an existing schedule.';end if;
  else ts:=d::timestamp;te:=d::timestamp;bs:=null;be:=null;end if;
  if nullif(r->>'department','') is not null and not exists(select 1 from public.departments where id=e.department_id and name=r->>'department') then raise exception 'Department must match the employee department. Use Schedule Builder to assign another work area.';end if;
  if p_apply then
   insert into public.shift_templates(name,start_time,end_time,break_minutes,grace_period_minutes,business_unit_id,created_by,end_day_offset,paid_minutes,schedule_kind)
   values('Imported '||(r->>'dayType')||' '||d::text,ts::time,te::time,case when r->>'dayType'='Workday' then coalesce(extract(epoch from(be-bs))/60,0) else 0 end,5,bu,public.current_hris_user_id(),te::date-d,case when r->>'dayType'='Workday' then extract(epoch from(te-ts))/60-coalesce(extract(epoch from(be-bs))/60,0) else 0 end,case when r->>'dayType'='Workday' then 'work' else 'rest' end) returning id into template;
   result:=public.save_schedule_builder_shift(scope_text,week,e.id,d,template,null,null);source:=(result->>'id')::uuid;
  end if;
 elsif p_kind='leave-balances' then
  if (r->>'asOf')::date>=(now() at time zone 'Asia/Manila')::date+1 then raise exception 'Opening balance must be as of a completed day.';end if;
  if exists(select 1 from public.payroll_confirmed_policy where id=1 and effective_from>(r->>'asOf')::date) then raise exception 'Opening date precedes the configured leave-ledger start. HR must reconcile the earlier opening before importing.';end if;
  if exists(select 1 from public.leave_balance_migration_rows mr join public.leave_balance_migration_batches mb on mb.id=mr.batch_id where mr.employee_id=e.id and mr.leave_type=r->>'leaveType' and mb.status not in('rejected','returned')) then raise exception 'A leave balance migration already exists for this employee and leave type. Review it instead of adding the balance again.';end if;
  if p_apply then
   payload:=jsonb_build_array(jsonb_build_object('employee_id_code',e.employee_id,'employee_name',e.full_name,'business_unit',bu_name,'leave_type',r->>'leaveType','opening_balance',r->>'balance','accrued_credits','0','used_credits','0','remaining_balance',r->>'balance','as_of_date',r->>'asOf','source',coalesce(nullif(r->>'reference',''),'Opening balance migration'),'supporting_document',r->>'document','notes','End-of-day opening balance. '||coalesce(r->>'notes',''),'validation_status','valid','validation_messages','[]'::jsonb));
   result:=public.save_leave_balance_migration(null,'Opening balance import',payload,true,false);source:=(result->>'id')::uuid;
  end if;
 elsif p_kind='deductions' then
  balance:=private.payroll_net_money(r,'balance');installment:=coalesce(nullif(r->>'installment','')::numeric,0);
  if balance<=0 or private.payroll_net_money(r,'original')-private.payroll_net_money(r,'repaid')<>balance then raise exception 'Original amount less prior repayments must equal a positive outstanding balance.';end if;
  if (r->>'asOf')::date>=(r->>'payrollDate')::date then raise exception 'First deduction must follow the balance as-of date.';end if;
  term:=case when r->>'method'='Amount per cutoff' then case when installment>0 then ceil(balance/installment)::int else 0 end else nullif(r->>'duration','')::int end;
  if term is null or term not between 1 and 120 then raise exception 'Repayment duration must be 1–120 cutoffs or months.';end if;
  if nullif(r->>'document','') is null then raise exception 'Authority-to-deduct document is required.';end if;
  if not private.payroll_debt_creator(p_scope) then raise exception 'Existing loan creation authority is required.' using errcode='42501';end if;
  if exists(select 1 from public.payroll_debts where employee_id=e.id and authority_reference=r->>'reference') then raise exception 'An obligation with this authority reference already exists.';end if;
  if p_apply then
   source:=gen_random_uuid();perform public.create_payroll_debt_record(source,jsonb_build_object('employeeId',e.id,'kind',case when r->>'kind'='Loan' then 'existing_loan' else 'external_nte_deduction' end,'source','Imported obligation '||(r->>'reference'),'originalAmount',r->>'original','openingBalance',r->>'balance','amountPaid',r->>'repaid','installmentsPaid',0,'deductionBasis',case r->>'method' when 'Amount per cutoff' then 'fixed_per_cutoff' when 'Number of months' then 'remaining_months' else 'remaining_cutoffs' end,'installment',installment,'term',term,'firstDate',r->>'payrollDate','issuedOn',r->>'asOf','authorityReference',r->>'reference','signedOn',null,'notes',coalesce(r->>'notes','')||' External NTE: '||coalesce(r->>'nteReference','')));
   perform public.add_payroll_debt_document_link(source,'Authority to deduct',r->>'document','Imported document',null,true);
   perform public.act_on_payroll_debt(source,'submit','Imported obligation submitted for Finance document review','{}');
  end if;
 elsif p_kind='leave-taken' then
  select id into lt from public.leave_types where lower(name)=lower(r->>'leaveType');if lt is null then raise exception 'Leave type was not found.';end if;
  days:=(r->>'duration')::numeric;if days<=0 then raise exception 'Leave duration must be positive.';end if;
  if r->>'durationUnit'='Hours' then
   select sum(t.paid_minutes)/60.0 into balance from public.shift_assignments a join public.shift_templates t on t.id=a.shift_template_id where a.employee_id=e.id and a.date=first_date;
   if first_date<>last_date or balance is null or balance<=0 then raise exception 'Hourly leave requires one dated saved work schedule.';end if;days:=days/balance;
  end if;
  if exists(select 1 from public.leave_balance_migration_rows mr join public.leave_balance_migration_batches mb on mb.id=mr.batch_id where mr.employee_id=e.id and mr.leave_type=r->>'leaveType' and mb.status not in('rejected','returned') and mr.as_of_date between first_date and last_date-1) then raise exception 'Split this leave at the opening-balance as-of date so historical usage is not deducted twice.';end if;
  if days>last_date-first_date+1 then raise exception 'Duration exceeds the leave period.';end if;
  if r->>'dayPart'='Partial day' and (nullif(r->>'start','') is null or nullif(r->>'end','') is null or (r->>'end')::timestamp<=(r->>'start')::timestamp) then raise exception 'Partial-day leave requires valid dated times.';end if;
  if r->>'dayPart'='Partial day' and (((r->>'start')::timestamp)::date<>first_date or ((r->>'end')::timestamp)::date<>last_date or (r->>'durationUnit'='Hours' and extract(epoch from((r->>'end')::timestamp-(r->>'start')::timestamp))/3600<>(r->>'duration')::numeric)) then raise exception 'Partial-day dates and duration must agree with the entered times.';end if;
  if exists(select 1 from public.leave_requests where employee_id=e.id and start_date<=last_date and end_date>=first_date and status not in('Rejected','Cancelled')) then raise exception 'An existing leave request overlaps this entry. Review the source request.';end if;
  if p_apply then
   insert into public.leave_requests(employee_id,employee_name,leave_type_id,selected_leave_type_id,selected_leave_type,start_date,end_date,start_time,end_time,duration_days,reason,status,attachment_url,business_unit_id,department_id,history_log)
   values(e.id,e.full_name,lt,lt,r->>'leaveType',first_date,last_date,case when r->>'dayPart'='Partial day' then ((r->>'start')::timestamp)::time::text end,case when r->>'dayPart'='Partial day' then ((r->>'end')::timestamp)::time::text end,days,'Imported dated leave for approval. Reference: '||(r->>'approvalReference')||'. '||coalesce(r->>'notes',''),'Pending',nullif(r->>'document',''),bu,e.department_id,jsonb_build_array(jsonb_build_object('action','Imported for approval','userId',public.current_hris_user_id(),'timestamp',now(),'details',r))) returning id into source;
  end if;
 elsif p_kind='service-charge' then
  select * into st from public.payroll_service_charge_setups where scope_id=p_scope and period_from=p_from and period_to=p_to order by version desc limit 1;
  if st.id is null or st.status not in('Draft','Needs review') then raise exception 'Open Service charge and prepare the approved pool first. Frozen allocations cannot be overwritten.';end if;
  if not private.payroll_service_charge_permission(p_scope,'manage') then raise exception 'Service-charge management authority required.' using errcode='42501';end if;
  if not exists(select 1 from public.payroll_service_charge_allocations where setup_id=st.id and employee_id=e.id and eligibility_status='Eligible' and amount=0) then raise exception 'Employee is not eligible or already has an allocation. Review Service charge.';end if;
  perform private.payroll_net_money(r,'amount');source:=st.id;
 elsif p_kind='additions' then
  if private.payroll_net_money(r,'amount')<=0 then raise exception 'Enter a positive approved claim or allowance amount.';end if;
  if r->>'kind'='Reimbursement' and nullif(r->>'document','') is null then raise exception 'Receipt document is required.';end if;
  if exists(select 1 from public.payroll_pay_packages p cross join lateral jsonb_array_elements(p.components) c where p.employee_id=e.id and p.scope_id=p_scope and p.status='approved' and p.effective_from<=p_to and (p.effective_until is null or p.effective_until>p_from) and lower(trim(c->>'name'))=lower(trim(r->>'description'))) then warning:='A matching approved package component exists. Finance must verify this is a separate entitlement before approval.';end if;
  if not private.payroll_gross_permission(p_scope,'view') then raise exception 'Compensation access required.' using errcode='42501';end if;
 end if;
 return jsonb_build_object('duplicate',false,'employee',e.full_name,'employeeId',e.id,'key',key,'sourceId',source,'warning',warning);
end $$;
