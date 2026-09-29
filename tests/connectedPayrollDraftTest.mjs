import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
const manualOt=process.env.TEST_MANUAL_OT==='1';
const fixture=fs.readFileSync('tests/actualAttendanceImportTest.mjs','utf8');
const setup=fixture.slice(fixture.indexOf('await db.exec(`create schema private;'),fixture.indexOf('await db.exec(fs.readFileSync('));
const sql=setup.slice(setup.indexOf('`')+1,setup.lastIndexOf('`);'))
 .replace("select '00000000-0000-4000-8000-000000000001'::uuid", "select current_setting('test.actor')::uuid");
await db.exec("set test.actor='00000000-0000-4000-8000-000000000001'");
await db.exec(sql);
await db.exec(`create function private.attendance_schedule(uuid,date) returns jsonb language sql stable as $$
 select jsonb_build_object('published',current_setting('test.published',true)='yes',
   'publicationId','00000000-0000-4000-8000-000000000099','version',2,'entries','[{"kind":"rest"}]'::jsonb)$$;`);
await db.exec(`create table auth.users(id uuid primary key);
 insert into auth.users values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000006'),('00000000-0000-4000-8000-000000000007'),('00000000-0000-4000-8000-000000000008');
 alter table public.hris_users add column auth_user_id uuid;
 create function public.has_active_role(text) returns boolean language sql stable as $$
  select ($1='HR Manager' and current_setting('test.actor') in('00000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000008'))
  or ($1='Board of Director' and current_setting('test.actor') in('00000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000008'))$$;
 create table public.payroll_time_rules(id uuid primary key default gen_random_uuid(),scope_id uuid,effective_from date,effective_to date,config jsonb,source_ref text,approved_by uuid);
 create table public.payroll_time_audit(scope_id uuid,actor_id uuid,action text,record_id uuid,reason text);
 create table private.payroll_actual_days(scope_id uuid,employee_id uuid,work_date date,batch_id uuid,source_row int,day_status text,events jsonb,updated_at timestamptz default now(),primary key(scope_id,employee_id,work_date));`);
await db.exec(fs.readFileSync('supabase/real_attendance_import.sql','utf8'));
const final=fs.readFileSync('supabase/migrations/20260928180000_attendance_import_final_payroll_source.sql','utf8');
await db.exec(final.slice(final.indexOf('-- Preserve all the existing validation'),final.indexOf("notify pgrst,'reload schema';")));
await db.exec(fs.readFileSync('supabase/migrations/20260928210000_payroll_attendance_import_approval.sql','utf8').replace("notify pgrst,'reload schema';",''));
await db.exec(fs.readFileSync('supabase/migrations/20260929060500_attendance_change_review_snapshot.sql','utf8').replace("notify pgrst,'reload schema';",''));
await db.exec(fs.readFileSync('supabase/migrations/20260929074500_bod_attendance_dual_role_route.sql','utf8').replace("notify pgrst,'reload schema';",''));
await db.exec(fs.readFileSync('supabase/migrations/20260929083000_attendance_schedule_error_context.sql','utf8').replace("notify pgrst,'reload schema';",''));
await db.exec(`alter table public.hris_users add column department_id uuid;
 create function private.resolve_direct_manager_id(uuid) returns uuid language sql stable as $$select case when current_setting('test.manager',true)='missing' then null else '00000000-0000-4000-8000-000000000006'::uuid end$$;
 create table public.leave_types(id uuid primary key default gen_random_uuid(),name text);
 insert into public.leave_types(name) values('Vacation Leave');
 create table public.ot_requests(id uuid primary key default gen_random_uuid(),employee_id uuid,employee_name text,date date,start_time time,end_time time,hours numeric,reason text,status text,submitted_at timestamptz,business_unit_id uuid,department_id uuid,ot_type text,paid_ot_type text,history_log jsonb,approved_hours numeric,direct_manager_id uuid);
 create table public.leave_requests(id uuid primary key default gen_random_uuid(),employee_id uuid,employee_name text,leave_type_id uuid,selected_leave_type_id uuid,selected_leave_type text,start_date date,end_date date,start_time text,end_time text,duration_days numeric,reason text,status text,business_unit_id uuid,department_id uuid,history_log jsonb,direct_manager_id uuid);
`);
await db.exec(fs.readFileSync('supabase/migrations/20260929120000_connected_attendance_schedule_context.sql','utf8'));
await db.exec(fs.readFileSync('supabase/migrations/20260929121000_attendance_linked_pay_requests.sql','utf8'));
const scope='00000000-0000-4000-8000-000000000002',employee='00000000-0000-4000-8000-000000000004';
process.on('uncaughtException',e=>{console.error(e.message,e.where||'',e.detail||'');process.exit(1);});
await db.exec("set test.published='yes'");
const row={employeeId:'00001',businessUnit:'Fixture',workDate:'2026-09-03',dayStatus:'Workday',classification:'Worked',events:[['ClockIn','09:00'],['BreakStart','12:00'],['BreakEnd','13:00'],['ClockOut','18:00']].map(([type,time])=>({type,timestamp:`2026-09-03T${time}:00+08:00`})),reviewRequest:'None',reviewExplanation:'',sourceRow:2};
const args=[scope,'2026-09-03','2026-09-03','safe-fixture.csv',JSON.stringify([row])];
const staged=(await db.query('select public.submit_actual_attendance_import($1,$2,$3,$4,$5) r',args)).rows[0].r;
await db.exec("set test.actor='00000000-0000-4000-8000-000000000006'");
await db.query("select public.review_actual_attendance_import($1,'approve',null)",[staged.reviewId]);
await db.exec("set test.actor='00000000-0000-4000-8000-000000000007'");
await db.query("select public.review_actual_attendance_import($1,'approve',null)",[staged.reviewId]);
const selected=(await db.query("select events from private.payroll_actual_days where employee_id=$1 and work_date='2026-09-03'",[employee])).rows[0].events;
const extract=(file,name,delimiter='$$')=>{const sql=fs.readFileSync(file,'utf8');const match=sql.match(new RegExp(`create (?:or replace )?function ${name.replaceAll('.','\\.')}\\(`,'i'));assert.ok(match,name);const tail=sql.slice(match.index);const a=tail.indexOf(delimiter),b=tail.indexOf(delimiter,a+delimiter.length);return tail.slice(0,b+delimiter.length)+';';};
await db.exec(extract('supabase/migrations/20260906112648_payroll_schedule_versions.sql','private.payroll_schedule_validate'));
await db.exec(extract('supabase/migrations/20260907015502_confirmed_hr_payroll_rules.sql','private.interpret_payroll_time','$function$'));
const source={employees:[{id:employee,name:'Fixture',hireDate:'2020-01-01',status:'Active'}],rules:[{id:'fixture-rule',revision:1,effective_from:'2026-01-01',effective_to:'2026-12-31',config:{holidayCoverageConfirmed:true,splitShiftConfirmed:true,restTemplates:[],meals:{}}}],shifts:[{id:'fixture-shift',employeeId:employee,date:'2026-09-03',templateId:'fixture',start:'09:00',end:'18:00',breakMinutes:60,kind:'work',endDayOffset:0,paidMinutes:480,published:true}],scheduleDays:[{employeeId:employee,date:'2026-09-03',status:'published'}],leave:[],ot:[],holidays:[],wfh:[],leavePolicies:[],events:selected.map((e,i)=>({...e,id:String(i),employeeId:employee,type:{ClockIn:'CLOCK_IN',ClockOut:'CLOCK_OUT',BreakStart:'START_BREAK',BreakEnd:'END_BREAK'}[e.type]}))};
let interpreted=(await db.query("select private.interpret_payroll_time($1,'2026-09-03','2026-09-03') r",[source])).rows[0].r;
assert.equal(interpreted.blockedDays,0);assert.equal(interpreted.rows[0].regularMinutes,480);
const read=p=>fs.readFileSync(p,'utf8');
const wanted=new Set(['private.payroll_audit_immutable','private.validate_payroll_gross_config','private.payroll_gross_intervals','private.payroll_gross_line','private.calculate_payroll_gross_v1','private.payroll_net_money','private.payroll_withholding_2023','private.payroll_contributions_2026','private.validate_payroll_net_arrangement','private.calculate_payroll_net_v1','private.payroll_comparison_rows','private.payroll_compare_values']);
const definitions=new Map();
let serviceChargeBase,inputAdditionsBase;
for(const file of fs.readdirSync('supabase/migrations').sort()){
 if(file==='20260929151000_manual_ot_payroll_evidence.sql')continue;
 const sql=read(`supabase/migrations/${file}`);
 if(sql.includes('alter function private.calculate_payroll_gross_v1(jsonb) rename to calculate_payroll_gross_without_service_charge_phase3'))serviceChargeBase=definitions.get('private.calculate_payroll_gross_v1').replace('private.calculate_payroll_gross_v1','private.calculate_payroll_gross_without_service_charge_phase3');
 if(sql.includes('alter function private.calculate_payroll_gross_v1(jsonb) rename to calculate_payroll_gross_before_input_additions'))inputAdditionsBase=definitions.get('private.calculate_payroll_gross_v1').replace('private.calculate_payroll_gross_v1','private.calculate_payroll_gross_before_input_additions');
 const re=/create\s+(?:or\s+replace\s+)?function\s+([a-z_0-9]+\.[a-z_0-9]+)\s*\(/gi;let m;
 while((m=re.exec(sql))){if(!wanted.has(m[1].toLowerCase()))continue;const tail=sql.slice(m.index),delim=tail.match(/\bas\s+(\$[a-z_0-9]*\$)/i);if(!delim)continue;const start=delim.index+delim[0].length,end=tail.indexOf(delim[1],start)+delim[1].length;definitions.set(m[1].toLowerCase(),tail.slice(0,end)+';');}
}

if(serviceChargeBase)await db.exec(serviceChargeBase);if(inputAdditionsBase)await db.exec(inputAdditionsBase);
for(const name of wanted)await db.exec(definitions.get(name));
if(manualOt){
 await db.exec(`create function private.payroll_time_sources(uuid,date,date) returns jsonb language sql as $$select '{}'::jsonb$$;
 alter function private.interpret_payroll_time(jsonb,date,date) rename to interpret_payroll_time_before_ob;`);
 await db.exec(fs.readFileSync('supabase/migrations/20260929151000_manual_ot_payroll_evidence.sql','utf8'));
 source.ot=[{id:'manual-ot-fixture',employeeId:employee,date:'2026-09-03',start:'19:00',end:'20:15',endDate:'2026-09-03',status:'Approved',type:'Paid',approvedHours:1,finalApprovedMinutes:60,evidenceMode:'manual'}];
 interpreted=(await db.query("select private.interpret_payroll_time_before_ob($1,'2026-09-03','2026-09-03') r",[source])).rows[0].r;
 assert.equal(interpreted.rows[0].payableOtMinutes,60);assert.equal(interpreted.rows[0].regularMinutes,480);assert.equal(interpreted.blockedDays,0,JSON.stringify(interpreted));
}
const grossConfig={monthlyMethod:'calendar_prorated',rounding:'employee_total_half_up',recurringMethod:'calendar_prorated',annualDivisor:'313',hoursPerDay:'8',nightStart:'22:00',nightEnd:'06:00',offsetCash:'excluded',gracePay:'base_only',rateBoundary:'shift_date',premiums:{ordinary:{regular:'1',ot:'1.25',nightRegular:'0.1',nightOt:'0.125'}}};
const salary=[{id:'00000000-0000-4000-8000-000000000070',employee_id:employee,scope_id:scope,engagement_key:'employee',effective_from:'2026-01-01',rate_type:'Daily',base_amount:'800',treatment:{proration:'rule_defined'},source_ref:'Isolated approved salary fixture',components:[]}];
const grossSnapshot={dateFrom:'2026-09-03',dateTo:'2026-09-03',time:{source,result:interpreted},packages:salary,rules:[{id:'rule',revision:1,effective_from:'2026-01-01',effective_to:'2026-12-31',source_ref:'Isolated approved policy',config:grossConfig}]};
await db.exec(`create table public.payroll_time_packages(id uuid primary key default gen_random_uuid(),scope_id uuid,date_from date,date_to date,status text,source_hash text);
create table public.payroll_gross_runs(id uuid primary key default gen_random_uuid(),scope_id uuid,time_package_id uuid,date_from date,date_to date,version int,previous_id uuid,source_hash text,engine_version text,source_snapshot jsonb,result jsonb,gross_amount numeric,created_by uuid,reason text);
create table public.payroll_gross_audit(scope_id uuid,actor_id uuid,action text,record_id uuid,reason text);
create table public.payroll_net_runs(id uuid primary key default gen_random_uuid(),scope_id uuid,gross_run_id uuid,review_id uuid,date_from date,date_to date,version int,previous_id uuid,source_hash text,source_snapshot jsonb,result jsonb,gross_amount numeric,deduction_amount numeric,net_amount numeric,employer_amount numeric,reason text,created_by uuid);
create function private.payroll_gross_permission(uuid,text) returns boolean language sql as $$select true$$;
create function public.check_payroll_operation(text,uuid,text) returns boolean language sql as $$select true$$;
create table private.fixture_snapshots(kind text primary key,snapshot jsonb);
create function private.payroll_gross_snapshot(uuid) returns jsonb language sql as $$select snapshot from private.fixture_snapshots where kind='gross'$$;
create function private.payroll_net_snapshot(uuid) returns jsonb language sql as $$select snapshot from private.fixture_snapshots where kind='net'$$;`);
await db.exec(extract('supabase/migrations/20260906033117_payroll_gross_phase4.sql','public.prepare_payroll_gross'));
await db.exec(extract('supabase/migrations/20260906043821_payroll_net_phase5.sql','public.prepare_payroll_net'));
await db.exec(fs.readFileSync('supabase/migrations/20260929125000_pending_attendance_calculation_guard.sql','utf8'));
const timeId=(await db.query("insert into payroll_time_packages(scope_id,date_from,date_to,status,source_hash) values($1,'2026-09-03','2026-09-03','submitted','test-time') returning id",[scope])).rows[0].id;
await db.query("insert into private.fixture_snapshots values('gross',$1)",[grossSnapshot]);
const grossId=(await db.query("select public.prepare_payroll_gross($1,'Controlled draft verification') id",[timeId])).rows[0].id;
const gross=(await db.query('select result from payroll_gross_runs where id=$1',[grossId])).rows[0].result;
assert.equal(Number(gross.gross),manualOt?925:800,JSON.stringify(gross));
if(manualOt){
 const before=await db.query('select private.payroll_gross_intervals($1,$2,$3) intervals',[source,interpreted.rows[0],grossConfig]);
 assert.equal(before.rows[0].intervals.filter(x=>x.kind==='ot').reduce((n,x)=>n+Number(x.minutes),0),60);
 const later=structuredClone(source),laterRow=structuredClone(interpreted.rows[0]);
 later.events.push({id:'later-ot-in',employeeId:employee,type:'CLOCK_IN',timestamp:'2026-09-03T19:00:00+08:00'},{id:'later-ot-out',employeeId:employee,type:'CLOCK_OUT',timestamp:'2026-09-03T20:15:00+08:00'});
 laterRow.eventIds.push('later-ot-in','later-ot-out');
 const after=(await db.query('select private.payroll_gross_intervals($1,$2,$3) intervals',[later,laterRow,grossConfig])).rows[0].intervals;
 assert.equal(after.filter(x=>x.kind==='ot').reduce((n,x)=>n+Number(x.minutes),0),60,'Later attendance never pays manual OT twice');
 const durationOnly=structuredClone(interpreted.rows[0]);durationOnly.ot[0].start=null;durationOnly.ot[0].end=null;durationOnly.ot[0].finalNightMinutes=15;
 const durationParts=(await db.query('select private.payroll_gross_intervals($1,$2,$3) intervals',[source,durationOnly,grossConfig])).rows[0].intervals.filter(x=>x.kind==='ot');
 assert.equal(durationParts.reduce((n,x)=>n+Number(x.minutes),0),60);assert.equal(durationParts.filter(x=>x.night).reduce((n,x)=>n+Number(x.minutes),0),15);
 const mixed=structuredClone(interpreted.rows[0]);mixed.ot[0].start='21:30';mixed.ot[0].end='23:00';
 await assert.rejects(db.query('select private.payroll_gross_intervals($1,$2,$3)',[source,mixed,grossConfig]),/different holiday\/night rates/);
}

const inputs={ruleset:'PH-2026-09-06',payDate:'2026-09-20',contributionMonth:'2026-09-01',cutoff:'2',allocation:{sss:'0.5',philhealth:'0.5',pagibig:'0.5'},insufficientNet:'block',previousRunId:'',employees:[{employeeId:employee,sssBase:'0',philhealthBase:'0',pagibigBase:'0',sssCovered:false,philhealthCovered:false,pagibigCovered:false,openingTaxable:'0',openingWithheld:'0',openingPeriods:'0',previousEmployer:false,cumulativeAlready:false,sourceRef:'Isolated reviewed deduction fixture',openingRef:'Isolated zero opening',openingContributions:Object.fromEntries(['sssEE','sssER','mpfEE','mpfER','ecER','philhealthEE','philhealthER','pagibigEE','pagibigER'].map(k=>[k,'0'])),taxLines:gross.employees[0].lines.map(l=>({taxable:l.amount,kind:'regular'})),deductions:[]}]};
const netSnapshot={reviewId:'00000000-0000-4000-8000-000000000080',review:inputs,gross,packages:salary,loans:[]};
await db.query("insert into private.fixture_snapshots values('net',$1)",[netSnapshot]);
const netId=(await db.query("select public.prepare_payroll_net($1,'Controlled draft verification') id",[grossId])).rows[0].id;
const net=(await db.query('select result from payroll_net_runs where id=$1',[netId])).rows[0].result;
assert.equal(Number(net.net),manualOt?925:800);assert.equal(Number(net.gross),manualOt?925:800);
assert.equal((await db.query("select public.prepare_payroll_gross($1,'Repeat') id",[timeId])).rows[0].id,grossId);
assert.equal((await db.query("select public.prepare_payroll_net($1,'Repeat') id",[grossId])).rows[0].id,netId);
assert.equal((await db.query('select count(*)::int n from payroll_net_runs')).rows[0].n,1);
await db.query("update private.payroll_attendance_import_reviews set status='pending_bod' where id=$1",[staged.reviewId]);
await assert.rejects(db.query("select public.prepare_payroll_gross($1,'Pending review')",[timeId]),/Attendance fixes still await approval/);
await db.close();console.log('PASS: isolated attendance submission → HR → BOD → persisted punches → production time/gross/net engines → persistent payroll draft. 480 regular minutes; manual-mode fixture verifies 60 OT minutes and gross/net 925, baseline fixture verifies 800; repeated calculation reused draft. No release or publishing calls. Snapshot access adapters are isolated fixtures.');
