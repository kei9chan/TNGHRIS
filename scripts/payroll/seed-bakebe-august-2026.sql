-- Authorized recovery of the interrupted August pilot. Re-running is a no-op.
-- All synthetic schedules, punches and approvals remain inside the private test snapshot.
begin;
select pg_advisory_xact_lock(hashtext('bakebe-aura-2026-08-11-25-v1'));
do $$
declare sc uuid; bu uuid; emp record; p record; pan uuid; employees jsonb:='[]'; packages jsonb:='[]'; shifts jsonb:='[]'; events jsonb:='[]'; leaves jsonb:='[]'; ots jsonb:='[]'; scenarios jsonb:='[]'; blockers jsonb:='[]'; src jsonb; interpreted jsonb; gross jsonb; d date; n integer; ix integer:=0; scenario integer; shift_id text; event_type text; tm text; label text; starts text; ends text; new_id uuid;
begin
 select id,business_unit_id into strict sc,bu from public.payroll_access_scopes where kind='business_unit' and business_unit_id=(select id from public.business_units where name='Bakebe - SM Aura');
 if exists(select 1 from payroll_scenario_private.runs where seed_run_id='bakebe-aura-2026-08-11-25-v1') then return;end if;
 -- Preserve immutable originals. New drafts explicitly retain their original preparer's provenance.
 for p in select * from public.payroll_pay_packages where scope_id=sc and effective_from='2026-09-01' and status='draft' loop
 select id into pan from public.pans where employee_id=p.employee_id and status::text='Completed' and upper('PAN-'||left(id::text,8))=upper(btrim(p.source_ref));
 if not exists(select 1 from public.payroll_pay_packages where replaces_id=p.id and effective_from='2025-09-01') then
 insert into public.payroll_pay_packages(employee_id,scope_id,engagement_key,stream,effective_from,rate_type,base_amount,currency,components,treatment,tax_profile_ref,source_ref,reason,source_hash,source_pan_id,source_pan_hash,replaces_id,created_by)
 values(p.employee_id,p.scope_id,p.engagement_key,p.stream,'2025-09-01',p.rate_type,p.base_amount,p.currency,p.components,p.treatment,p.tax_profile_ref,p.source_ref,
 'User-authorized date correction to 2025-09-01 for August pilot; original preparer retained; automated recovery, no approval granted. Original draft retained.',p.source_hash,
 case when pan is not null then pan else p.source_pan_id end,
 case when pan is not null then private.payroll_source_pay_data(p.employee_id,pan)->>'hash' else p.source_pan_hash end,p.id,p.created_by) returning id into new_id;
 insert into public.payroll_pay_audit(employee_id,scope_id,package_id,actor_id,action,reason) values(p.employee_id,sc,new_id,null,'authorized_draft_date_correction','Automated recovery under explicit user instruction; effective date 2026-09-01 -> 2025-09-01. Original draft retained. No approval or payment.');
 end if;
 end loop;
 for emp in select * from public.hris_users where business_unit_id=bu and not coalesce(is_duplicate,false) and (date_hired is null or date_hired<='2026-08-25') and (end_date is null or end_date>='2026-08-11') order by id loop
 employees:=employees||jsonb_build_array(jsonb_build_object('id',emp.id,'name',emp.full_name,'code',emp.employee_id,'hireDate',emp.date_hired,'endDate',emp.end_date,'status',emp.status,'employmentStatus',emp.employment_status));
 select * into p from public.payroll_pay_packages where employee_id=emp.id and scope_id=sc and effective_from<='2026-08-11' order by effective_from desc,created_at desc limit 1;
 if p.id is null then blockers:=blockers||jsonb_build_array(jsonb_build_object('employeeId',emp.id,'reason','No pay package effective on or before August 11, 2026'));
 else packages:=packages||jsonb_build_array(to_jsonb(p));
 if p.status<>'approved' then blockers:=blockers||jsonb_build_array(jsonb_build_object('employeeId',emp.id,'reason','Pay package remains a draft; statutory, tax and proration treatments require review')) ;end if;
 if p.source_pan_id is not null then blockers:=blockers||jsonb_build_array(jsonb_build_object('employeeId',emp.id,'reason','Approved PAN recognized; reconcile the uploaded net arrangement and exemption request against the PAN, including its approval and effective dates.'));end if;
 end if;
 if nullif(btrim(emp.employee_id),'') is null then blockers:=blockers||jsonb_build_array(jsonb_build_object('employeeId',emp.id,'reason','Employee code is missing'));end if;
 if emp.date_hired is null then blockers:=blockers||jsonb_build_array(jsonb_build_object('employeeId',emp.id,'reason','Employment start date missing; provisional inclusion requires verification'));end if;
 for n in 0..14 loop
 d:='2026-08-11'::date+n;scenario:=(n+ix*3)%16;
 label:=(array['Complete attendance','09:05 grace boundary','09:06 one minute late','09:20 late arrival','Missing clock-out','Missing break','Extended break','Undertime','Full-day approved leave (test)','Half-day approved leave (test)','Unapproved absence','Approved overtime (test)','Unapproved overtime','Rest-day work (test)','Duplicate clock-in','Missing schedule'])[scenario+1];
 scenarios:=scenarios||jsonb_build_array(jsonb_build_object('employeeId',emp.id,'date',d,'scenario',label,'isTest',true));
 shift_id:='test:'||emp.id||':'||d;
 if scenario<>15 then shifts:=shifts||jsonb_build_array(jsonb_build_object('id',shift_id,'employeeId',emp.id,'date',d,'templateId',case when scenario=13 then 'test-rest' else 'test-nine-to-six' end,'name',case when scenario=13 then 'Rest day' else 'PRE OPENING SHIFT (2)' end,'start','09:00','end','18:00','breakMinutes',60,'flexible',false,'businessUnitId',bu,'publicationStatus','Published for test only','published',true,'kind',case when scenario=13 then 'rest' else 'work' end,'endDayOffset',0,'paidMinutes',480));end if;
 if scenario in(8,9) then leaves:=leaves||jsonb_build_array(jsonb_build_object('id',shift_id||':leave','employeeId',emp.id,'startDate',d,'endDate',d,'startTime',case when scenario=9 then '09:00' end,'endTime',case when scenario=9 then '13:00' end,'status','Approved','type','Synthetic paid leave','typeId','test-leave','paid',true,'isTest',true));end if;
 if scenario in(11,12) then ots:=ots||jsonb_build_array(jsonb_build_object('id',shift_id||':ot','employeeId',emp.id,'date',d,'start','18:00','end','20:00','hours',2,'approvedHours',case when scenario=11 then 2 end,'status',case when scenario=11 then 'Approved' else 'Pending' end,'type','Paid','isTest',true));end if;
 if scenario not in(8,10) then
 foreach event_type in array array['CLOCK_IN','START_BREAK','END_BREAK','CLOCK_OUT'] loop
 if (scenario=4 and event_type='CLOCK_OUT') or (scenario in(5,9) and event_type in('START_BREAK','END_BREAK')) then continue;end if;
 tm:=case event_type when 'CLOCK_IN' then case scenario when 1 then '09:05' when 2 then '09:06' when 3 then '09:20' when 9 then '13:00' else '09:00' end when 'START_BREAK' then '12:00' when 'END_BREAK' then case when scenario=6 then '13:30' else '13:00' end else case when scenario=7 then '16:00' when scenario in(11,12) then '20:00' else '18:00' end end;
 events:=events||jsonb_build_array(jsonb_build_object('id',shift_id||':'||event_type,'employeeId',emp.id,'timestamp',d||'T'||tm||':00+08:00','type',event_type,'source','Synthetic test fixture','isTest',true));
 end loop;
 if scenario=14 then events:=events||jsonb_build_array(jsonb_build_object('id',shift_id||':duplicate','employeeId',emp.id,'timestamp',d||'T09:01:00+08:00','type','CLOCK_IN','source','Synthetic test fixture','isTest',true));end if;
 end if;
 end loop;ix:=ix+1;
 end loop;
 src:=jsonb_build_object('scopeId',sc,'dateFrom','2026-08-11','dateTo','2026-08-25','employees',employees,'shifts',shifts,'events',events,'leave',leaves,'ot',ots,'wfh','[]'::jsonb,'holidays','[]'::jsonb,'rules','[]'::jsonb,'leavePolicies','[]'::jsonb);
 src:=src||jsonb_build_object('scheduleDays',(select jsonb_agg(jsonb_build_object('employeeId',x->>'employeeId','date',x->>'date','status','published')) from jsonb_array_elements(shifts) x));
 interpreted:=private.interpret_payroll_time(src,'2026-08-11','2026-08-25');
 gross:=private.calculate_payroll_gross_v1(jsonb_build_object('scopeId',sc,'dateFrom','2026-08-11','dateTo','2026-08-25','time',jsonb_build_object('source',src,'result',interpreted),'packages','[]'::jsonb,'rules','[]'::jsonb));
 insert into payroll_scenario_private.runs(seed_run_id,scope_id,label,date_from,date_to,pay_date,snapshot) values('bakebe-aura-2026-08-11-25-v1',sc,'TEST – Bakebe SM Aura – September 5, 2026 Payroll','2026-08-11','2026-08-25','2026-09-05',jsonb_build_object('employees',employees,'packages',packages,'blockers',blockers,'scenarios',scenarios,'source',src,'timeResult',interpreted,'grossResult',gross,'globalBlockers',jsonb_build_array('Approved time rules and gross-pay rules are not configured. No rates have been invented.','Historical deductions, contribution settings and opening balances require review before net pay.','Synthetic test schedules use the existing 09:00–18:00 template; these are not historical attendance evidence.','Rest-day and paid-leave rules are unresolved; their scenarios remain flagged.','No employee is confirmed to have joined or separated within this cutoff.')));
end $$;
commit;
