create function private.payroll_input_catalog() returns jsonb language sql immutable set search_path='' as $catalog$ select '{"schedules":{"type":"schedules","version":1,"title":"Schedules","meaning":"One employee shift or non-working-day assignment.","notice":"Imported schedules are saved as drafts. Review and publish through Schedule Builder.","fields":[{"key":"employeeId","label":"Employee ID*","type":"text","required":true,"help":"Use the actual HRIS ID. Keep as text to preserve leading zeros. DEMO IDs are rejected."},{"key":"employeeName","label":"Employee name (optional)","type":"text","required":false,"help":""},{"key":"businessUnit","label":"Business unit*","type":"text","required":true,"help":"Must match the selected business unit and employee assignment."},{"key":"workDate","label":"Work date*","type":"date","required":true,"help":"YYYY-MM-DD or a real Excel date."},{"key":"dayType","label":"Day type*","type":"text","required":true,"help":"Use configured holidays; a typed holiday label does not authorize holiday pay.","choices":["Workday","Rest day"]},{"key":"start","label":"Shift start (optional)","type":"datetime","required":false,"help":"Required when applicable. YYYY-MM-DD HH:mm in Asia/Manila. Specify the next date for overnight work."},{"key":"end","label":"Shift end (optional)","type":"datetime","required":false,"help":"Required when applicable. YYYY-MM-DD HH:mm in Asia/Manila. Specify the next date for overnight work."},{"key":"breakStart","label":"Planned break start (optional)","type":"datetime","required":false,"help":"Required when applicable. YYYY-MM-DD HH:mm in Asia/Manila. Specify the next date for overnight work."},{"key":"breakEnd","label":"Planned break end (optional)","type":"datetime","required":false,"help":"Required when applicable. YYYY-MM-DD HH:mm in Asia/Manila. Specify the next date for overnight work."},{"key":"department","label":"Department or work area (optional)","type":"text","required":false,"help":""},{"key":"notes","label":"Notes (optional)","type":"text","required":false,"help":"Additional source information."}],"sample":{"employeeId":"DEMO-001","employeeName":"Sample Employee","businessUnit":"Bakebe - SM Aura","workDate":"2026-08-26","dayType":"Workday","start":"2026-08-26 09:00","end":"2026-08-26 18:00","breakStart":"2026-08-26 12:00","breakEnd":"2026-08-26 13:00"}},"leave-balances":{"type":"leave-balances","version":1,"title":"Leave opening balances","meaning":"One employee, leave type and as-of date.","notice":"Enter the remaining balance at the END of the as-of date, not annual entitlement. Earlier leave usage is already included. Approval is required.","fields":[{"key":"employeeId","label":"Employee ID*","type":"text","required":true,"help":"Use the actual HRIS ID. Keep as text to preserve leading zeros. DEMO IDs are rejected."},{"key":"leaveType","label":"Leave type*","type":"text","required":true,"help":"Choose the HRIS leave type.","choices":["Vacation Leave","Sick Leave","Offset Leave"]},{"key":"balance","label":"Opening balance in days*","type":"number","required":true,"help":"Remaining days, including fractions. Zero is allowed."},{"key":"asOf","label":"Balance as-of date*","type":"date","required":true,"help":"Balance AFTER all transactions on this date."},{"key":"reference","label":"Source reference (optional)","type":"text","required":false,"help":"Keep document and source identifiers as text."},{"key":"document","label":"Supporting document (optional)","type":"text","required":false,"help":"Accessible HTTPS document link. The reviewer must open and verify it; a link is not approval."},{"key":"notes","label":"Notes (optional)","type":"text","required":false,"help":"Additional source information."}],"sample":{"employeeId":"DEMO-001","leaveType":"Vacation Leave","balance":"3.50","asOf":"2026-08-25","reference":"Opening balance migration"}},"leave-taken":{"type":"leave-taken","version":1,"title":"Leave taken","meaning":"One dated leave request. Opening balances do not establish leave taken.","notice":"Imported leave follows the existing approval route. Imported approval references do not bypass review.","fields":[{"key":"employeeId","label":"Employee ID*","type":"text","required":true,"help":"Use the actual HRIS ID. Keep as text to preserve leading zeros. DEMO IDs are rejected."},{"key":"leaveType","label":"Leave type*","type":"text","required":true,"help":"Use the exact HRIS leave type."},{"key":"startDate","label":"Start date*","type":"date","required":true,"help":""},{"key":"endDate","label":"End date*","type":"date","required":true,"help":""},{"key":"dayPart","label":"Full or partial day*","type":"text","required":true,"help":"Partial day requires start/end times.","choices":["Full day","Partial day"]},{"key":"duration","label":"Duration*","type":"number","required":true,"help":"Positive number of days or hours."},{"key":"durationUnit","label":"Duration unit*","type":"text","required":true,"help":"Hours must correspond to the dated schedule.","choices":["Days","Hours"]},{"key":"start","label":"Partial-day start (optional)","type":"datetime","required":false,"help":"Required when applicable. YYYY-MM-DD HH:mm in Asia/Manila. Specify the next date for overnight work."},{"key":"end","label":"Partial-day end (optional)","type":"datetime","required":false,"help":"Required when applicable. YYYY-MM-DD HH:mm in Asia/Manila. Specify the next date for overnight work."},{"key":"approvalReference","label":"Approval reference*","type":"text","required":true,"help":"Original approved leave reference or evidence description. HRIS approval is still required."},{"key":"document","label":"Supporting document (optional)","type":"text","required":false,"help":"Accessible HTTPS document link. The reviewer must open and verify it; a link is not approval."},{"key":"notes","label":"Notes (optional)","type":"text","required":false,"help":"Additional source information."}],"sample":{"employeeId":"DEMO-001","leaveType":"Vacation Leave","startDate":"2026-09-02","endDate":"2026-09-02","dayPart":"Full day","duration":"1","durationUnit":"Days","approvalReference":"DEMO-LEAVE-001"}},"deductions":{"type":"deductions","version":1,"title":"Loans and authorized deductions","meaning":"One existing obligation, with the outstanding balance after prior repayments.","notice":"Finance must verify authority evidence before deductions become eligible. Do not include past repayments in the new balance.","fields":[{"key":"employeeId","label":"Employee ID*","type":"text","required":true,"help":"Use the actual HRIS ID. Keep as text to preserve leading zeros. DEMO IDs are rejected."},{"key":"reference","label":"Obligation reference*","type":"text","required":true,"help":"Unique existing loan or deduction reference. Preserve leading zeros."},{"key":"kind","label":"Type*","type":"text","required":true,"help":"Choose the type of obligation.","choices":["Loan","Authorized deduction"]},{"key":"original","label":"Original amount*","type":"number","required":true,"help":""},{"key":"repaid","label":"Amount already repaid*","type":"number","required":true,"help":""},{"key":"balance","label":"Outstanding balance*","type":"number","required":true,"help":"Original amount minus already repaid."},{"key":"asOf","label":"Balance as-of date*","type":"date","required":true,"help":"Balance after transactions on this date."},{"key":"payrollDate","label":"Deduction start payroll*","type":"date","required":true,"help":""},{"key":"method","label":"Repayment method*","type":"text","required":true,"help":"Select one method.","choices":["Amount per cutoff","Number of cutoffs","Number of months"]},{"key":"installment","label":"Installment amount (optional)","type":"number","required":false,"help":"Required for Amount per cutoff."},{"key":"duration","label":"Repayment duration (optional)","type":"number","required":false,"help":"Required integer for Number of cutoffs or Number of months."},{"key":"frequency","label":"Deduction frequency*","type":"text","required":true,"help":"Monthly method is split across the configured two cutoffs.","choices":["Every cutoff"]},{"key":"document","label":"Authority-to-deduct document*","type":"text","required":true,"help":"Accessible HTTPS link to signed authority. Finance verifies access and accepts evidence before approval."},{"key":"nteReference","label":"External NTE reference (optional)","type":"text","required":false,"help":"Optional. A fabricated internal NTE is not required."},{"key":"notes","label":"Notes (optional)","type":"text","required":false,"help":"Additional source information."}],"sample":{"employeeId":"DEMO-001","reference":"DEMO-LOAN-001","kind":"Loan","original":"10000","repaid":"4000","balance":"6000","asOf":"2026-08-25","payrollDate":"2026-09-20","method":"Number of cutoffs","duration":"6","frequency":"Every cutoff","document":"https://example.com/signed-authority.pdf"}},"additions":{"type":"additions","version":1,"title":"Allowances and reimbursements","meaning":"One employee’s one-time payroll addition or approved receipt-based claim.","notice":"Recurring allowances belong in pay packages. Reimbursement caps do not create payments. Required receipts and independent approval are checked.","fields":[{"key":"employeeId","label":"Employee ID*","type":"text","required":true,"help":"Use the actual HRIS ID. Keep as text to preserve leading zeros. DEMO IDs are rejected."},{"key":"payrollDate","label":"Payroll release date*","type":"date","required":true,"help":"The release date from the configured payroll calendar."},{"key":"kind","label":"Component type*","type":"text","required":true,"help":"Choose the one-time payment type.","choices":["Allowance","Reimbursement"]},{"key":"description","label":"Description*","type":"text","required":true,"help":""},{"key":"amount","label":"Amount*","type":"number","required":true,"help":"Numeric pesos without the peso sign."},{"key":"document","label":"Supporting document (optional)","type":"text","required":false,"help":"Accessible HTTPS document link. The reviewer must open and verify it; a link is not approval."},{"key":"approvalReference","label":"Approval reference*","type":"text","required":true,"help":"Approved policy or claim reference. Pending imports still require review."},{"key":"tax","label":"Tax treatment*","type":"text","required":true,"help":"Finance must confirm treatment before calculation.","choices":["Taxable","Excluded"]},{"key":"notes","label":"Notes (optional)","type":"text","required":false,"help":"Additional source information."}],"sample":{"employeeId":"DEMO-001","payrollDate":"2026-09-20","kind":"Reimbursement","description":"Approved transport receipt","amount":"250","document":"https://example.com/receipt.pdf","approvalReference":"DEMO-CLAIM-001","tax":"Excluded"}},"service-charge":{"type":"service-charge","version":1,"title":"Service-charge allocations","meaning":"One eligible employee’s allocation for a selected payroll.","notice":"Allocation totals must match the existing approved pool. No automatic employee distribution or duplicate pool payment.","fields":[{"key":"employeeId","label":"Employee ID*","type":"text","required":true,"help":"Use the actual HRIS ID. Keep as text to preserve leading zeros. DEMO IDs are rejected."},{"key":"businessUnit","label":"Business unit*","type":"text","required":true,"help":"Must match the selected business unit and employee assignment."},{"key":"payrollDate","label":"Payroll release date*","type":"date","required":true,"help":"The release date from the configured payroll calendar."},{"key":"amount","label":"Allocation amount*","type":"number","required":true,"help":""},{"key":"reference","label":"Source reference (optional)","type":"text","required":false,"help":"Keep document and source identifiers as text."},{"key":"notes","label":"Notes (optional)","type":"text","required":false,"help":"Additional source information."}],"sample":{"employeeId":"DEMO-001","businessUnit":"Bakebe - SM Aura","payrollDate":"2026-09-20","amount":"500","reference":"DEMO-POOL-001"}},"attendance-events":{"type":"attendance-events","version":1,"title":"Attendance event log","meaning":"One actual punch event. Group complete sessions using Work date, including overnight events.","notice":"Use for multiple sessions or breaks. Missing punches need review; overtime still requires approval.","fields":[{"key":"employeeId","label":"Employee ID*","type":"text","required":true,"help":"Use the actual HRIS ID. Keep as text to preserve leading zeros. DEMO IDs are rejected."},{"key":"businessUnit","label":"Business unit*","type":"text","required":true,"help":"Must match the selected business unit and employee assignment."},{"key":"workDate","label":"Work date*","type":"date","required":true,"help":"YYYY-MM-DD or a real Excel date."},{"key":"eventType","label":"Event type*","type":"text","required":true,"help":"Choose the actual event.","choices":["ClockIn","BreakStart","BreakEnd","ClockOut"]},{"key":"timestamp","label":"Timestamp*","type":"datetime","required":true,"help":"YYYY-MM-DD HH:mm in Asia/Manila."},{"key":"reference","label":"Source reference (optional)","type":"text","required":false,"help":"Keep document and source identifiers as text."},{"key":"notes","label":"Notes (optional)","type":"text","required":false,"help":"Additional source information."}],"sample":{"employeeId":"DEMO-001","businessUnit":"Bakebe - SM Aura","workDate":"2026-08-26","eventType":"ClockIn","timestamp":"2026-08-26 09:00"}}}'::jsonb $catalog$;
revoke all on function private.payroll_input_catalog() from public,anon,authenticated;

create table private.payroll_input_batches(
 id uuid primary key default gen_random_uuid(),scope_id uuid not null references public.payroll_access_scopes(id),
 kind text not null,date_from date not null,date_to date not null,filename text not null,
 fingerprint text not null,rows jsonb not null,created_by uuid not null,created_at timestamptz not null default now(),
 unique(scope_id,kind,date_from,date_to,fingerprint)
);
create table private.payroll_input_records(
 id uuid primary key default gen_random_uuid(),batch_id uuid not null references private.payroll_input_batches(id),
 kind text not null,employee_id uuid not null references public.hris_users(id),natural_key text not null,
 data jsonb not null,source_id uuid,unique(kind,employee_id,natural_key)
);
create table private.payroll_input_reviews(
 record_id uuid primary key references private.payroll_input_records(id),decision text not null check(decision in('approved','rejected')),
 note text not null,reviewed_by uuid not null,reviewed_at timestamptz not null default now()
);
alter table private.payroll_input_batches enable row level security;
alter table private.payroll_input_records enable row level security;
alter table private.payroll_input_reviews enable row level security;
revoke all on private.payroll_input_batches,private.payroll_input_records,private.payroll_input_reviews from public,anon,authenticated;
create trigger immutable before update or delete on private.payroll_input_batches for each row execute function private.payroll_audit_immutable();
create trigger immutable before update or delete on private.payroll_input_records for each row execute function private.payroll_audit_immutable();
create trigger immutable before update or delete on private.payroll_input_reviews for each row execute function private.payroll_audit_immutable();

-- The generated field catalog is installed immediately before these functions.
create function public.get_payroll_input_context(p_scope uuid,p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare context jsonb;begin
 if not private.actual_attendance_access(p_scope) and not private.payroll_net_can_review(p_scope) then raise exception 'Authorized payroll input access required.' using errcode='42501';end if;
 context:=jsonb_build_object('canImport',private.actual_attendance_access(p_scope),'canReview',private.payroll_net_can_review(p_scope),
 'employees',(select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'code',h.employee_id,'name',h.full_name,'businessUnit',s.name) order by h.full_name),'[]') from public.hris_users h join public.payroll_access_scopes s on s.business_unit_id=h.business_unit_id where s.id=p_scope and not coalesce(h.is_duplicate,false) and h.date_hired<=p_to and (h.end_date is null or h.end_date>=p_from)),
 'additions',(select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('status',coalesce(v.decision,'pending'),'employeeName',h.full_name,'canReview',v.record_id is null and b.created_by<>public.current_hris_user_id() and private.payroll_net_can_review(p_scope)) order by b.created_at),'[]') from private.payroll_input_records r join private.payroll_input_batches b on b.id=r.batch_id join public.hris_users h on h.id=r.employee_id left join private.payroll_input_reviews v on v.record_id=r.id where b.scope_id=p_scope and b.date_from=p_from and b.date_to=p_to and r.kind='additions'),
 'imports',(select coalesce(jsonb_agg(x order by x.created_at desc),'[]') from(select id,kind,filename,created_at from private.payroll_input_batches where scope_id=p_scope and date_from=p_from and date_to=p_to order by created_at desc limit 30)x));
 return context;
end $$;

create function private.payroll_input_row(p_kind text,p_scope uuid,p_from date,p_to date,r jsonb,p_apply boolean)
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
   if bs is null or be is null or be-bs<>interval '1 hour' or bs<ts or be>te then raise exception 'Enter the configured one-hour unpaid break inside the shift.';end if;
   if exists(select 1 from public.shift_assignments a join public.shift_templates t on t.id=a.shift_template_id where a.employee_id=e.id and a.date between d-1 and d+1 and coalesce(t.schedule_kind,'work')='work' and a.date+t.start_time::time<te and a.date+t.end_time::time+coalesce(t.end_day_offset,0)*interval '1 day'>ts) then raise exception 'Shift overlaps an existing schedule.';end if;
  else ts:=d::timestamp;te:=d::timestamp;bs:=null;be:=null;end if;
  if nullif(r->>'department','') is not null and not exists(select 1 from public.departments where id=e.department_id and name=r->>'department') then raise exception 'Department must match the employee department. Use Schedule Builder to assign another work area.';end if;
  if p_apply then
   insert into public.shift_templates(name,start_time,end_time,break_minutes,grace_period_minutes,business_unit_id,created_by,end_day_offset,paid_minutes,schedule_kind)
   values('Imported '||(r->>'dayType')||' '||d::text,ts::time,te::time,case when r->>'dayType'='Workday' then 60 else 0 end,5,bu,public.current_hris_user_id(),te::date-d,case when r->>'dayType'='Workday' then extract(epoch from(te-ts))/60-60 else 0 end,case when r->>'dayType'='Workday' then 'work' else 'rest' end) returning id into template;
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

create function public.import_payroll_inputs(p_kind text,p_scope uuid,p_from date,p_to date,p_filename text,p_rows jsonb,p_confirm boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item jsonb;r jsonb;result jsonb;checked jsonb:='[]';errors jsonb:='[]';seen text[]:='{}';key text;idx int:=0;batch uuid;v_fingerprint text;ready int:=0;duplicates int:=0;st public.payroll_service_charge_setups;allocations jsonb;total numeric;
begin
 if not private.actual_attendance_access(p_scope) then raise exception 'Imports require authorized BOD, Admin or HR access.' using errcode='42501';end if;
 if p_kind not in('schedules','leave-balances','leave-taken','deductions','additions','service-charge') or p_kind is null then raise exception 'Unsupported template.';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>31 or coalesce(length(trim(p_filename)),0) not between 1 and 250 or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 2000 then raise exception 'Select a valid cutoff and upload 1–2,000 rows.';end if;
 v_fingerprint:=md5(p_rows::text);
 if p_confirm then
  perform pg_advisory_xact_lock(hashtextextended('payroll-schedule-publication',0));
  perform pg_advisory_xact_lock(hashtextextended('payroll-input-scope:'||p_scope::text,0));
 end if;
 select b.id into batch from private.payroll_input_batches b where b.scope_id=p_scope and b.kind=p_kind and b.date_from=p_from and b.date_to=p_to and b.fingerprint=v_fingerprint;
 if batch is not null then return jsonb_build_object('alreadyImported',true,'ready',0,'duplicates',jsonb_array_length(p_rows),'errors','[]'::jsonb,'rows','[]'::jsonb);end if;
 for item in select value from jsonb_array_elements(p_rows) loop
  idx:=idx+1;r:=item->'values';begin
   result:=private.payroll_input_row(p_kind,p_scope,p_from,p_to,r,false);key:=(result->>'employeeId')||':'||(result->>'key');
   if key=any(seen) then raise exception 'Duplicate employee record in this file.';end if;seen:=array_append(seen,key);
   if (result->>'duplicate')::boolean then duplicates:=duplicates+1;else ready:=ready+1;end if;
   checked:=checked||jsonb_build_array(result||jsonb_build_object('row',coalesce((item->>'rowNumber')::int,idx+1),'values',r));
  exception when others then errors:=errors||jsonb_build_array(jsonb_build_object('row',coalesce((item->>'rowNumber')::int,idx+1),'message',sqlerrm));end;
 end loop;
 if p_kind='schedules' and jsonb_array_length(errors)=0 and exists(select 1 from jsonb_array_elements(checked) a join jsonb_array_elements(checked) b on a->>'employeeId'=b->>'employeeId' and a->>'key'<b->>'key' where a#>>'{values,dayType}'='Workday' and b#>>'{values,dayType}'='Workday' and (a#>>'{values,start}')::timestamp<(b#>>'{values,end}')::timestamp and (a#>>'{values,end}')::timestamp>(b#>>'{values,start}')::timestamp) then
  errors:=errors||jsonb_build_array(jsonb_build_object('row',0,'message','Two shifts in this file overlap for the same employee. Check overnight dates.'));
 end if;
 if p_kind='service-charge' and jsonb_array_length(errors)=0 and ready>0 then
  select * into st from public.payroll_service_charge_setups where scope_id=p_scope and period_from=p_from and period_to=p_to order by version desc limit 1;
  select sum((x#>>'{values,amount}')::numeric) into total from jsonb_array_elements(checked)x where not(x->>'duplicate')::boolean;
  if total is distinct from st.pool_amount or exists(select 1 from public.payroll_service_charge_allocations where setup_id=st.id and amount<>0) then errors:=errors||jsonb_build_array(jsonb_build_object('row',0,'message','Imported allocations must equal the approved pool and cannot be combined with existing allocations.'));end if;
 end if;
 if p_confirm then
  if jsonb_array_length(errors)>0 then raise exception 'Correct all rows before confirming: %',errors;end if;
  insert into private.payroll_input_batches(scope_id,kind,date_from,date_to,filename,fingerprint,rows,created_by) values(p_scope,p_kind,p_from,p_to,p_filename,v_fingerprint,p_rows,public.current_hris_user_id()) returning id into batch;
  for item in select value from jsonb_array_elements(checked) where not(value->>'duplicate')::boolean order by value->>'employeeId',value->>'key' loop
   result:=private.payroll_input_row(p_kind,p_scope,p_from,p_to,item->'values',true);
   insert into private.payroll_input_records(batch_id,kind,employee_id,natural_key,data,source_id) values(batch,p_kind,(result->>'employeeId')::uuid,result->>'key',item->'values',nullif(result->>'sourceId','')::uuid);
  end loop;
  if p_kind='service-charge' and ready>0 then
   select jsonb_agg(jsonb_build_object('employeeId',a.employee_id,'selected',x is not null,'amount',coalesce(x#>>'{values,amount}','0'),'reason',case when x is null then 'Not included in approved imported allocation' else 'Imported approved allocation' end)) into allocations from public.payroll_service_charge_allocations a left join lateral(select value x from jsonb_array_elements(checked) where value->>'employeeId'=a.employee_id::text) z on true where a.setup_id=st.id;
   perform public.save_payroll_service_charge(st.id,jsonb_build_object('poolAmount',st.pool_amount,'effectiveDate',st.effective_date,'classificationFilter',st.classification_filter,'approvedRuleName',st.approved_rule_name,'approvedRuleReference',st.approved_rule_reference,'approvedRuleVersion',st.approved_rule_version,'allocationBasis',st.allocation_basis,'fundingSource',st.funding_source,'notes','Imported allocations; review and include the preview before calculation.'),allocations);
  end if;
 end if;
 return jsonb_build_object('confirmed',p_confirm,'batchId',batch,'ready',ready,'duplicates',duplicates,'errors',errors,'rows',checked);
end $$;

create function public.review_payroll_input_addition(p_id uuid,p_decision text,p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare r private.payroll_input_records;b private.payroll_input_batches;begin
 select * into strict r from private.payroll_input_records where id=p_id and kind='additions';select * into strict b from private.payroll_input_batches where id=r.batch_id;
 if auth.uid() is null or not private.payroll_net_can_review(b.scope_id) or b.created_by=public.current_hris_user_id() then raise exception 'Independent scoped Finance approval is required.' using errcode='42501';end if;
 if p_decision not in('approved','rejected') or coalesce(length(trim(p_note)),0)<3 then raise exception 'Record the document and tax-treatment review note.';end if;
 perform pg_advisory_xact_lock(hashtextextended('payroll-schedule-publication',0));
 if exists(select 1 from public.payroll_schedule_freezes where employee_id=r.employee_id and date_from<=b.date_to and date_to>=b.date_from) then raise exception 'Payroll is locked. Use the authorized revision workflow.';end if;
 insert into private.payroll_input_reviews(record_id,decision,note,reviewed_by) values(r.id,p_decision,p_note,public.current_hris_user_id());
end $$;

alter function private.payroll_gross_snapshot(uuid) rename to payroll_gross_snapshot_before_input_additions;
create function private.payroll_gross_snapshot(p_time_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare snap jsonb;items jsonb;begin
 snap:=private.payroll_gross_snapshot_before_input_additions(p_time_id);
 if exists(select 1 from private.payroll_input_records r join private.payroll_input_batches b on b.id=r.batch_id left join private.payroll_input_reviews v on v.record_id=r.id where r.kind='additions' and b.scope_id=(snap->>'scopeId')::uuid and b.date_from=(snap->>'dateFrom')::date and b.date_to=(snap->>'dateTo')::date and v.record_id is null) then raise exception 'One-time additions require Finance approval before calculation.';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'employeeId',r.employee_id,'data',r.data,'approvedBy',v.reviewed_by) order by r.id),'[]') into items from private.payroll_input_records r join private.payroll_input_batches b on b.id=r.batch_id join private.payroll_input_reviews v on v.record_id=r.id and v.decision='approved' where r.kind='additions' and b.scope_id=(snap->>'scopeId')::uuid and b.date_from=(snap->>'dateFrom')::date and b.date_to=(snap->>'dateTo')::date;
 return snap||jsonb_build_object('approvedAdditions',items);
end $$;
alter function private.calculate_payroll_gross_v1(jsonb) rename to calculate_payroll_gross_before_input_additions;
create function private.calculate_payroll_gross_v1(snap jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb;e jsonb;a jsonb;employees jsonb:='[]';amount numeric;total numeric:=0;begin
 result:=private.calculate_payroll_gross_before_input_additions(snap);
 for e in select value from jsonb_array_elements(result->'employees') loop
  for a in select value from jsonb_array_elements(coalesce(snap->'approvedAdditions','[]')) where value->>'employeeId'=e->>'employeeId' loop
   amount:=(a#>>'{data,amount}')::numeric;
   e:=jsonb_set(e,'{lines}',e->'lines'||jsonb_build_array(private.payroll_gross_line(a#>>'{data,description}',1,amount,1,jsonb_build_object('sourceKind','approved_addition','sourceId',a->>'id','component',jsonb_build_object('tax',case a#>>'{data,tax}' when 'Taxable' then 'included' else 'excluded' end),'sourceReference',a#>>'{data,approvalReference}'))));
   if e->>'gross' is not null then e:=jsonb_set(e,'{gross}',to_jsonb(((e->>'gross')::numeric+amount)::text));end if;total:=total+amount;
  end loop;employees:=employees||jsonb_build_array(e);
 end loop;result:=jsonb_set(result,'{employees}',employees);
 if result->>'gross' is not null then result:=jsonb_set(result,'{gross}',to_jsonb(((result->>'gross')::numeric+total)::text));end if;
 return result;
end $$;
revoke all on function private.payroll_input_row(text,uuid,date,date,jsonb,boolean),private.payroll_gross_snapshot_before_input_additions(uuid),private.calculate_payroll_gross_before_input_additions(jsonb),private.payroll_gross_snapshot(uuid),private.calculate_payroll_gross_v1(jsonb) from public,anon,authenticated;
revoke all on function public.get_payroll_input_context(uuid,date,date),public.import_payroll_inputs(text,uuid,date,date,text,jsonb,boolean),public.review_payroll_input_addition(uuid,text,text) from public,anon;
grant execute on function public.get_payroll_input_context(uuid,date,date),public.import_payroll_inputs(text,uuid,date,date,text,jsonb,boolean),public.review_payroll_input_addition(uuid,text,text) to authenticated;
notify pgrst,'reload schema';

-- Only the new remaining-balance importer uses a dated balancing adjustment.
-- Older migration batches retain their approved semantics and audit records.
alter function private.activate_leave_balance_migration(uuid,uuid) rename to activate_leave_balance_migration_before_remaining;
create function private.activate_leave_balance_migration(p_batch uuid,p_actor uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r public.leave_balance_migration_rows;existing numeric;begin
 if not exists(select 1 from private.payroll_input_records where kind='leave-balances' and source_id=p_batch) then
  perform private.activate_leave_balance_migration_before_remaining(p_batch,p_actor);return;
 end if;
 for r in select * from public.leave_balance_migration_rows where batch_id=p_batch and validation_status in('valid','review') and leave_kind in('vacation','sick','offset') order by employee_id,row_number loop
  perform pg_advisory_xact_lock(hashtextextended('confirmed-leave:'||r.employee_id,0));
  if r.activated_at is not null then continue;end if;
  perform private.sync_confirmed_leave(r.employee_id,r.as_of_date);
  existing:=private.confirmed_leave_balance(r.employee_id,r.leave_kind,r.as_of_date);
  insert into public.payroll_leave_ledger(employee_id,leave_kind,amount,credit_date,source,event_key,approved_by)
  values(r.employee_id,r.leave_kind,r.remaining_balance-existing,r.as_of_date,'Approved remaining balance adjustment · '||coalesce(r.source,'Opening balance migration'),'migration:'||p_batch||':'||r.id||':remaining',p_actor) on conflict do nothing;
  update public.leave_balance_migration_rows set activated_at=clock_timestamp() where id=r.id;
 end loop;
end $$;
-- Approval routing remains unchanged. Skip only the ledger debit for imported
-- usage already included in an approved end-of-day remaining balance.
do $$declare definition text;needle text:='  if new.final_classification=''lwop'' then return new;end if;';replacement text;begin
 definition:=pg_get_functiondef('private.confirmed_leave_request_accounting()'::regprocedure);
 if strpos(definition,needle)=0 then raise exception 'Leave accounting contract changed; review before applying migration.';end if;
 replacement:=needle||$patch$
  perform pg_advisory_xact_lock(hashtextextended('confirmed-leave:'||new.employee_id,0));
  if exists(select 1 from private.payroll_input_records where kind='leave-taken' and source_id=new.id) then
   if exists(select 1 from public.leave_balance_migration_rows mr join public.leave_balance_migration_batches mb on mb.id=mr.batch_id where mr.employee_id=new.employee_id and mr.leave_kind=k and mr.as_of_date>=new.end_date and mb.status in('pending_hr_manager','pending_bod')) then raise exception 'Approve the imported opening balance before approving leave already included in that balance.';end if;
   if exists(select 1 from public.leave_balance_migration_rows mr join public.leave_balance_migration_batches mb on mb.id=mr.batch_id join private.payroll_input_records ir on ir.source_id=mb.id and ir.kind='leave-balances' where mr.employee_id=new.employee_id and mr.leave_kind=k and mr.as_of_date>=new.end_date and mb.status='approved' and mr.activated_at is not null) then return new;end if;
  end if;
$patch$;
 definition:=replace(definition,needle,replacement);
 definition:=replace(definition,'values(new.employee_id,k,-charge,(now() at time zone ''Asia/Manila'')::date,','values(new.employee_id,k,-charge,case when exists(select 1 from private.payroll_input_records where kind=''leave-taken'' and source_id=new.id) then new.end_date else (now() at time zone ''Asia/Manila'')::date end,');
 execute definition;
end $$;
revoke all on function private.activate_leave_balance_migration(uuid,uuid),private.activate_leave_balance_migration_before_remaining(uuid,uuid) from public,anon,authenticated;

-- Previous payments are evidence, never a second disbursement or loan posting.
create table private.payroll_previous_payments (
 id uuid primary key default gen_random_uuid(),
 scope_id uuid not null references public.payroll_access_scopes(id),
 date_from date not null,date_to date not null,
 amount numeric(16,2) not null check(amount>0),paid_on date not null,
 reference text not null check(length(trim(reference))>0),
 evidence text not null check(evidence ~ '^https://'),
 recorded_by uuid not null references public.hris_users(id),
 recorded_at timestamptz not null default clock_timestamp(),
 unique(scope_id,reference),check(date_to>=date_from)
);
create table private.payroll_previous_payment_reviews (
 payment_id uuid primary key references private.payroll_previous_payments(id),
 decision text not null check(decision in('verified','rejected')),
 note text not null,reviewed_by uuid not null references public.hris_users(id),
 reviewed_at timestamptz not null default clock_timestamp()
);
create index payroll_previous_payment_period on private.payroll_previous_payments(scope_id,date_from,date_to);
alter table private.payroll_previous_payments enable row level security;
alter table private.payroll_previous_payment_reviews enable row level security;
revoke all on private.payroll_previous_payments,private.payroll_previous_payment_reviews from public,anon,authenticated;
create trigger immutable before update or delete on private.payroll_previous_payments for each row execute function private.payroll_audit_immutable();
create trigger immutable before update or delete on private.payroll_previous_payment_reviews for each row execute function private.payroll_audit_immutable();

create function private.previous_payment_can_review(p_scope uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.payroll_actor_id() is not null
 and private.payroll_gross_permission(p_scope,'view') and
 (public.has_active_role('Board of Director') or (public.has_active_role('Finance Staff') and private.payroll_has_access('authorize_finance',p_scope)))
$$;
create function public.get_payroll_previous_payments(p_scope uuid,p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$begin
 if auth.uid() is null or private.payroll_actor_id() is null or not private.payroll_gross_permission(p_scope,'view') then raise exception 'Payroll access required.' using errcode='42501';end if;
 return jsonb_build_object('canRecord',private.historical_reconciliation_user(public.current_hris_user_id()) or private.previous_payment_can_review(p_scope),
 'records',(select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('status',coalesce(r.decision,'pending_verification'),'reviewed_by',r.reviewed_by,'note',r.note,
 'canReview',r.payment_id is null and p.recorded_by<>public.current_hris_user_id() and private.previous_payment_can_review(p_scope)) order by p.recorded_at),'[]')
 from private.payroll_previous_payments p left join private.payroll_previous_payment_reviews r on r.payment_id=p.id
 where p.scope_id=p_scope and p.date_from=p_from and p.date_to=p_to));
end $$;
create function public.record_payroll_previous_payment(p_scope uuid,p_from date,p_to date,p_amount text,p_paid_on date,p_reference text,p_evidence text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id();amount numeric;existing private.payroll_previous_payments;key text;
begin
 if auth.uid() is null or private.payroll_actor_id() is null or not private.payroll_gross_permission(p_scope,'view')
 or not(private.historical_reconciliation_user(actor) or private.previous_payment_can_review(p_scope)) then raise exception 'Authorized HR, BOD or Finance access required.' using errcode='42501';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>31 or p_paid_on is null or p_paid_on>(now() at time zone 'Asia/Manila')::date
 or p_amount is null or p_amount!~'^[0-9]+([.][0-9]{1,2})?$' or coalesce(trim(p_reference),'')='' or coalesce(p_evidence,'')!~'^https://[^[:space:]]+$' then raise exception 'Enter the actual positive amount, payment date, reference and an accessible HTTPS evidence document.';end if;
 amount:=p_amount::numeric;if amount<=0 then raise exception 'Actual payment amount must be greater than zero.';end if;
 key:='regular:'||p_scope::text||':'||p_from::text||':'||p_to::text;
 perform pg_advisory_xact_lock(hashtextextended('payroll-settlement:'||key,0));
 select * into existing from private.payroll_previous_payments where scope_id=p_scope and reference=trim(p_reference);
 if existing.id is not null then
  if existing.date_from=p_from and existing.date_to=p_to and existing.amount=amount and existing.paid_on=p_paid_on and existing.evidence=p_evidence then return existing.id;end if;
  raise exception 'This payment reference already belongs to different evidence.';
 end if;
 if exists(select 1 from public.payroll_disbursements where settlement_key=key)
 or exists(select 1 from public.payroll_payment_batches b where b.settlement_key=key and not exists(select 1 from public.payroll_payment_closures c where c.batch_id=b.id)) then
 raise exception 'A payment or active payment batch already exists. Reconcile its outcomes in Payments & Reports before recording external payment evidence.';end if;
 insert into private.payroll_previous_payments(scope_id,date_from,date_to,amount,paid_on,reference,evidence,recorded_by)
 values(p_scope,p_from,p_to,amount,p_paid_on,trim(p_reference),p_evidence,actor) returning id into existing.id;
 return existing.id;
end $$;
create function public.review_payroll_previous_payment(p_id uuid,p_decision text,p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare p private.payroll_previous_payments;begin
 select * into strict p from private.payroll_previous_payments where id=p_id;
 if not private.previous_payment_can_review(p.scope_id) or p.recorded_by=public.current_hris_user_id() then raise exception 'Independent authorized Finance or BOD verification is required.' using errcode='42501';end if;
 if p_decision not in('verified','rejected') or coalesce(trim(p_note),'')='' then raise exception 'Enter your evidence verification or rejection note.';end if;
 perform pg_advisory_xact_lock(hashtextextended('payroll-settlement:regular:'||p.scope_id::text||':'||p.date_from::text||':'||p.date_to::text,0));
 insert into private.payroll_previous_payment_reviews(payment_id,decision,note,reviewed_by) values(p.id,p_decision,trim(p_note),public.current_hris_user_id());
end $$;
create function private.guard_previous_payroll_payment() returns trigger language plpgsql security definer set search_path='' as $$
declare key text;begin
 if tg_table_name='payroll_payment_attempts' then select settlement_key into key from public.payroll_payment_batches where id=new.batch_id;
 else key:=new.settlement_key;end if;
 perform pg_advisory_xact_lock(hashtextextended('payroll-settlement:'||key,0));
 if exists(select 1 from private.payroll_previous_payments p left join private.payroll_previous_payment_reviews r on r.payment_id=p.id
 where key='regular:'||p.scope_id::text||':'||p.date_from::text||':'||p.date_to::text and coalesce(r.decision,'pending_verification')<>'rejected') then
 raise exception 'Previous payment is recorded for this payroll. A second disbursement is blocked. Verify the evidence and review any difference; do not pay this payroll again.';end if;
 return new;
end $$;
create trigger previous_payment_guard before insert on public.payroll_payment_batches for each row execute function private.guard_previous_payroll_payment();
create trigger previous_payment_guard before insert on public.payroll_payment_attempts for each row execute function private.guard_previous_payroll_payment();
create trigger previous_payment_guard before insert on public.payroll_disbursements for each row execute function private.guard_previous_payroll_payment();
revoke all on function private.previous_payment_can_review(uuid),private.guard_previous_payroll_payment() from public,anon,authenticated;
revoke all on function public.get_payroll_previous_payments(uuid,date,date),public.record_payroll_previous_payment(uuid,date,date,text,date,text,text),public.review_payroll_previous_payment(uuid,text,text) from public,anon;
grant execute on function public.get_payroll_previous_payments(uuid,date,date),public.record_payroll_previous_payment(uuid,date,date,text,date,text,text),public.review_payroll_previous_payment(uuid,text,text) to authenticated;
notify pgrst,'reload schema';
