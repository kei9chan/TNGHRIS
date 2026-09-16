process.on('uncaughtException',e=>{console.error(e.message,e.code,e.position,e.where);process.exit(1);});
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {employeeReviews,timeTotals,correctionLink} from '../modules/payroll/timeReviewModel.ts';
const db=new PGlite();const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const read=p=>fs.readFileSync(p,'utf8');
await db.exec(`create schema auth;create schema private;create role authenticated;create role anon;
create table auth.users(id uuid primary key);insert into auth.users values('${id(9)}'),('${id(8)}');
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
create function private.payroll_actor_id() returns uuid language sql as $$select auth.uid()$$;
create function private.payroll_time_permission(uuid,text) returns boolean language sql as $$select $1='${id(10)}'::uuid and auth.uid() in('${id(9)}','${id(8)}') and ($2='view' or auth.uid()='${id(9)}')$$;
create function public.can_access_hris_user(uuid) returns boolean language sql as $$select $1 in('${id(1)}','${id(2)}')$$;
create function private.schedule_preset_visible(uuid) returns boolean language sql as $$select true$$;
create table payroll_access_scopes(id uuid primary key,business_unit_id uuid,name text);insert into payroll_access_scopes values('${id(10)}','${id(100)}','Test BU');
create table hris_users(id uuid primary key,full_name text,business_unit_id uuid);
insert into hris_users values('${id(1)}','Synthetic One','${id(100)}'),('${id(2)}','Synthetic Two','${id(100)}'),('${id(3)}','Not accessible','${id(100)}');
create table ot_requests(id uuid primary key,employee_id uuid,date date);
create table shift_templates(id uuid,name text,start_time time,end_time time,business_unit_id uuid,created_by uuid);
create table fixture_review(source jsonb,result jsonb);
create function private.payroll_time_review(uuid,date,date) returns jsonb language sql stable as $$select jsonb_build_object('source',source,'sourceHash',md5(source::text),'result',result) from public.fixture_review$$;
`);
// Original protected package tables and immutable-history trigger, not mocks.
const original=read('supabase/migrations/20260906021209_payroll_attendance_readiness_phase3.sql');
await db.exec(original.slice(0,original.indexOf('create function private.payroll_time_permission')));
// Phase 2's actual storage schema (no live attendance data).
const historical=read('supabase/migrations/20260916024456_payroll_historical_test_imports.sql');
await db.exec(historical.slice(0,historical.indexOf('create function payroll_history_private.')));
await db.exec(read('tests/fixtures/timekeepingReviewEntrypoints.sql'));
await db.exec(read('tests/fixtures/timekeepingOffsetEntrypoint.sql'));
await db.exec(`revoke all on function public.preview_payroll_time(uuid,date,date),public.save_payroll_time_package(uuid,date,date,text,text),public.submit_payroll_time_package(uuid),public.get_payroll_time_package(uuid) from public,anon;grant execute on function public.preview_payroll_time(uuid,date,date),public.save_payroll_time_package(uuid,date,date,text,text),public.submit_payroll_time_package(uuid),public.get_payroll_time_package(uuid) to authenticated;`);
await db.exec(read('supabase/migrations/20260916031828_payroll_unified_timekeeping_review.sql'));
const row=(employee,day)=>({employeeId:id(employee),employeeName:employee===1?'Synthetic One':'Synthetic Two',date:`2026-08-${day}`,requiresClock:true,restDay:false,holiday:false,approvedFullLeave:false,scheduledMinutes:480,actualMinutes:450,regularMinutes:450,breakMinutes:60,lateMinutes:20,undertimeMinutes:10,approvedOtMinutes:60,actualOtMinutes:45,workedLunch:false,issues:[],ready:true,shiftIds:[`s${employee}-${day}`],eventIds:[`e${employee}-${day}`],leaveIds:employee===2?[id(30)]:[],ot:[],segments:[]});
const rows=[row(1,'03'),row(1,'04'),row(2,'03'),row(2,'04')];rows[3].issues=['Missing clock-out or break end'];rows[3].ready=false;
const source={scheduleDays:rows.map(r=>({employeeId:r.employeeId,date:r.date,status:'published'})),shifts:rows.map(r=>({id:r.shiftIds[0],employeeId:r.employeeId,date:r.date,name:'Work',start:'09:00',end:'18:00',publicationId:id(41),publicationVersion:1})),events:rows.map(r=>({id:r.eventIds[0],timestamp:`${r.date}T01:00:00Z`,type:'CLOCK_IN',employeeId:r.employeeId,source:'System',clockRevision:1})),leave:[{id:id(30),type:'Vacation',status:'Pending',startDate:'2026-08-03',endDate:'2026-08-04',days:2}],rules:[],holidays:[],ot:[]};
let result={engineVersion:'unchanged',rows,totalDays:4,blockedDays:1};
const seed=async()=>{await db.exec('reset role');await db.query('delete from fixture_review');await db.query('insert into fixture_review values($1,$2)',[JSON.stringify(source),JSON.stringify(result)]);await db.exec(`select set_config('test.actor','${id(9)}',false);set role authenticated;`);};
await seed();
const preview=async(scope=id(10))=>(await db.query("select preview_payroll_time($1,'2026-08-03','2026-08-04') r",[scope])).rows[0].r;
const save=async(hash)=>(await db.query("select save_payroll_time_package($1,'2026-08-03','2026-08-04',$2,'Verified supporting records') id",[id(10),hash])).rows[0].id;
const submit=async(id)=>db.query('select submit_payroll_time_package($1)',[id]);
const get=async(id)=>(await db.query('select get_payroll_time_package($1) r',[id])).rows[0].r;
let p=await preview();
// Exact engine values are retained; evidence is joined by employee/date/source ID.
assert.deepEqual(p.result.rows.map(({evidence,...r})=>r),rows);
assert.equal(p.result.rows[0].evidence.shifts[0].id,'s1-03');assert.equal(p.result.rows[1].evidence.punches[0].id,'e1-04');assert.equal(p.result.rows[0].evidence.leave.length,0);assert.equal(p.result.rows[2].evidence.leave[0].id,id(30));
const grouped=employeeReviews(p.result.rows);assert.equal(grouped.length,2);assert.equal(grouped[0].totals.actualMinutes,900);assert.equal(grouped[1].totals.missingPunchDays,1);assert.equal(grouped[1].totals.blockedDays,1);assert.equal(grouped[0].totals.publishedDays,2);
const total=timeTotals(p.result.rows);assert.equal(total.scheduledMinutes,1920);assert.equal(total.actualMinutes,1800);assert.equal(total.lateMinutes,80);assert.equal(total.undertimeMinutes,40);assert.equal(total.approvedOtMinutes,240);assert.equal(total.actualOtMinutes,180);
assert.match(correctionLink('Missing clock-out or break end',rows[0]).path,/employee=.*&date=2026-08-03/);assert.equal(correctionLink('Missing or unpublished schedule',rows[0]).path,'/payroll/timekeeping?week=2026-08-03');assert.equal(correctionLink('OT approval incomplete',rows[0]).path,'/payroll/overtime-requests');
await assert.rejects(()=>save(p.sourceHash),/Resolve all attendance blockers/);
// Existing draft created before Phase 3 cannot be submitted while blocked.
await db.exec('reset role');const old=(await db.query("insert into payroll_time_packages(scope_id,date_from,date_to,version,source_hash,source_snapshot,result,created_by,reason) values($1,'2026-08-03','2026-08-04',1,$2,$3,$4,$5,'Prior blocked draft') returning id",[id(10),p.sourceHash,JSON.stringify(source),JSON.stringify(result),id(9)])).rows[0].id;await db.exec('set role authenticated');
await assert.rejects(()=>submit(old),/Resolve all attendance blockers/);
// Resolve source, save, submit, then re-read like a fresh page.
rows[3].ready=true;rows[3].issues=[];source.events[3].clockRevision=2;result.blockedDays=0;await seed();p=await preview();const saved=await save(p.sourceHash);assert.notEqual(saved,old);assert.equal(await save(p.sourceHash),saved,'same source save is idempotent');await submit(saved);await submit(saved);
let refreshed=await preview();assert.equal(refreshed.packages[0].status,'submitted');assert.equal(refreshed.packages[0].previousId,old);const frozen=await get(saved);assert.equal(frozen.result.rows[3].evidence.punches[0].revision,2);assert.equal(frozen.status,'submitted');
// A later corrected source produces a linked version without rewriting prior evidence.
source.events[3].clockRevision=3;rows[3].actualMinutes=460;await seed();await assert.rejects(()=>save(p.sourceHash),/Time sources changed/);await assert.rejects(()=>submit(saved),/Submitted inputs changed/);const prior=await get(saved);assert.equal(prior.current,false);assert.deepEqual(prior.result,frozen.result);
p=await preview();const next=await save(p.sourceHash);await submit(next);assert.equal((await preview()).packages[0].previousId,saved);assert.deepEqual((await get(saved)).result,frozen.result);
await db.exec('reset role');await assert.rejects(()=>db.query("update payroll_time_packages set reason='overwrite' where id=$1",[saved]),/Keep prior/);const audits=(await db.query("select count(*)::int n from payroll_time_audit where action='submitted_to_finance'")).rows[0].n;assert.equal(audits,2);await db.exec('set role authenticated');
// Auth and BU guards remain enforced at entrypoints.
await db.exec(`select set_config('test.actor','${id(8)}',false)`);await preview();await assert.rejects(()=>save(p.sourceHash),/Finalize/);await assert.rejects(()=>submit(next),/Finalize/);await assert.rejects(()=>preview(id(20)),/scoped/);
// Test evidence stays separate and never changes source hash or readiness.
await db.exec('reset role');const batch=(await db.query("insert into payroll_history_private.batches(scope_id,date_from,date_to,kind,filename,source_bytes,source_hash,reference,preview,status,created_by) values($1,'2026-08-03','2026-08-04','dtr','reviewed-dtr.csv','original','fixture','Reviewed DTR A','{}','imported',$2) returning id",[id(10),id(9)])).rows[0].id;
for(const employee of [1,3])await db.query("insert into payroll_history_private.records(batch_id,scope_id,kind,record_key,employee_id,work_date,source_row,payload) values($1,$2,'dtr',$3,$4,'2026-08-03',2,$5)",[batch,id(10),`dtr-${employee}`,id(employee),JSON.stringify({minutes:{REGULARMINUTES:999},reviewReference:'Reviewed DTR A'})]);
await db.exec(`select set_config('test.actor','${id(9)}',false);set role authenticated;`);
const evidence=(await db.query("select get_payroll_time_test_evidence($1,'2026-08-03','2026-08-04') r",[id(10)])).rows[0].r;assert.equal(evidence.length,1);assert.equal(evidence[0].payload.timestamp,undefined);assert.equal(evidence[0].sourceRow,2);assert.equal(employeeReviews(p.result.rows,evidence)[0].totals.actualMinutes,900);assert.equal((await preview()).sourceHash,p.sourceHash);
await assert.rejects(()=>db.query("select get_payroll_time_test_evidence($1,'2026-08-03','2026-08-04')",[id(20)]),/Scoped/);await assert.rejects(()=>db.query('select * from payroll_history_private.records'),/permission denied/);
await db.exec('reset role;set role anon');await assert.rejects(()=>get(saved),/permission denied/);await assert.rejects(()=>db.query("select get_payroll_time_test_evidence($1,'2026-08-03','2026-08-04')",[id(10)]),/permission denied/);
await db.close();console.log('PASS: source-linked totals and evidence; employee aggregation; correction routes; blocked save/submit; stale sources; linked immutable versions and refreshed submissions; scoped roles; isolated historical evidence.');
