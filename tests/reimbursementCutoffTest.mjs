import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
process.on('uncaughtException',e=>{console.error(e.message,e.where||'',e.internalQuery||'');process.exit(1);});
const db=new PGlite();
await db.exec(`create schema auth;create schema private;create role anon;create role authenticated;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
create table public.hris_users(id uuid primary key,full_name text,employee_id text,auth_user_id uuid unique,business_unit_id uuid,is_duplicate boolean default false,date_hired date,end_date date);
create function public.current_hris_user_id() returns uuid language sql stable as $$select id from public.hris_users where auth_user_id=auth.uid()$$;
create table public.payroll_pay_packages(id uuid default gen_random_uuid(),employee_id uuid,status text,stream text,effective_from date,engagement_key text,components jsonb);
create function public.can_access_hris_user(uuid) returns boolean language sql as $$select true$$;
create function private.payroll_package_permission(uuid,uuid,text) returns boolean language sql as $$select true$$;
create table public.payroll_access_scopes(id uuid primary key,business_unit_id uuid,kind text default 'business_unit');
create table public.payroll_time_packages(id uuid primary key,scope_id uuid);
create table public.fixture(snap jsonb);
create function private.payroll_actor_id() returns uuid language sql stable as $$select auth.uid()$$;
create function private.payroll_gross_permission(uuid,text) returns boolean language sql stable as $$select auth.uid() is not null and current_setting('test.duty',true) in('prepare','finance')$$;
create function private.payroll_nte_finance(uuid) returns boolean language sql stable as $$select auth.uid() is not null and current_setting('test.duty',true)='finance'$$;
create function private.payroll_audit_immutable() returns trigger language plpgsql as $$begin raise exception 'Immutable';end$$;
create function private.calculate_payroll_gross_v1(snap jsonb) returns jsonb language sql immutable as $$select snap->'fixtureResult'$$;
create function private.payroll_gross_snapshot(p_time_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$begin if not coalesce(private.payroll_gross_permission(null,'view'),false) then raise exception 'Forbidden' using errcode='42501';end if;return (select snap from public.fixture);end$$;
`);
await db.exec(fs.readFileSync('supabase/migrations/20261019063033_reimbursement_cutoff_finance_evidence.sql','utf8'));
await db.exec(fs.readFileSync('supabase/migrations/20261019063637_reimbursement_requirement_fast_path.sql','utf8'));
await db.exec(fs.readFileSync('supabase/migrations/20261019065305_quarterly_reimbursement_receipts.sql','utf8'));
await db.exec(fs.readFileSync('supabase/migrations/20261019070521_early_quarterly_receipt_review.sql','utf8'));
await db.exec(fs.readFileSync('supabase/migrations/20261019074931_quarterly_receipt_standing_requirements.sql','utf8'));
const ids={scope:'00000000-0000-0000-0000-000000000001',employee:'00000000-0000-0000-0000-000000000002',finance:'00000000-0000-0000-0000-000000000003',preparer:'00000000-0000-0000-0000-000000000004',time:'00000000-0000-0000-0000-000000000005'};
const authId=key=>ids[key].replace('00000000-','10000000-');
await db.query('insert into public.payroll_access_scopes(id,business_unit_id) values($1,$1)',[ids.scope]);
for(const [key,name] of [['employee','Fixture Employee'],['finance','Fixture Finance'],['preparer','Fixture Preparer']])await db.query('insert into public.hris_users(id,full_name,employee_id,auth_user_id,business_unit_id) values($1,$2,$3,$4,$5)',[ids[key],name,key,authId(key),ids.scope]);
await db.query('insert into public.payroll_time_packages values($1,$2)',[ids.time,ids.scope]);
const snap={scopeId:ids.scope,dateFrom:'2026-10-11',dateTo:'2026-10-25',time:{source:{employees:[{id:ids.employee,name:'Fixture Employee'}]}},packages:[{employee_id:ids.employee,components:[{category:'reimbursable_allowance',amount:'1000'}]}]};
await db.query('insert into public.fixture values($1)',[snap]);
await db.query("insert into public.payroll_pay_packages(employee_id,status,stream,effective_from,engagement_key,components) values($1,'approved','employee_payroll','2026-01-01','employee',$2)",[ids.employee,[{category:'reimbursable_allowance',amount:'1000'}]]);
const actor=async(key,duty)=>{await db.query("select set_config('test.actor',$1,false),set_config('test.duty',$2,false)",[key?authId(key):'',duty]);};
const workspace=async()=> (await db.query('select public.get_payroll_reimbursement_workspace($1) w',[ids.time])).rows[0].w;
const gate=()=>db.query('select private.payroll_gross_snapshot($1)',[ids.time]);
const save=(w,amount='3000',url='https://drive.google.com/drive/folders/receipt-folder')=>db.query('select public.save_payroll_reimbursement_evidence($1,$2,$3,$4,$5)',[ids.time,ids.employee,w.sourceHash,amount,url]);
const verify=w=>db.query('select public.verify_payroll_reimbursement_evidence($1,$2,$3,$4)',[ids.time,ids.employee,w.sourceHash,w.rows[0].evidence.submitted_at]);
const target=(w,amount='3000')=>db.query('select public.confirm_payroll_reimbursement_quarter_target($1,$2,$3,$4,$5,$6)',[ids.time,ids.employee,w.sourceHash,amount,'Approved whole-quarter allowance breakdown',w.rows[0].targetRevision||0]);
await actor('preparer','prepare');
let w=await workspace();assert.equal(w.rows[0].requiredAmount,null);assert.equal(w.actorId,ids.preparer);assert.notEqual(w.actorId,authId('preparer'));assert.equal(w.quarter.from,'2026-07-01');assert.equal(w.quarter.deadline,'2026-10-15');
await assert.rejects(gate(),/Finance must confirm/);await assert.rejects(save(w),/Finance must first confirm/);await assert.rejects(target(w),/Assigned Finance/);
await actor('finance','finance');await target(w);w=await workspace();assert.equal(w.rows[0].requiredAmount,'3000.00');assert.equal(w.sourceHash,(await workspace()).sourceHash);
for(const url of ['https://drive.google.com.evil.test/drive/folders/a','https://drive.google.com@evil.test/file/d/a','javascript:alert(1)','http://drive.google.com/file/d/a'])await assert.rejects(save(w,'3000',url),/HTTPS Google/);
await save(w,'2999.99');w=await workspace();assert.equal(w.rows[0].evidence.submitted_by,ids.finance);await assert.rejects(verify(w),/must meet/);await assert.rejects(gate(),/requires PHP/);
await save(w);w=await workspace();await verify(w);w=await workspace();assert.equal(w.rows[0].verified,true);assert.equal(w.rows[0].evidence.verified_by,ids.finance);assert.equal((await gate()).rows[0].payroll_gross_snapshot.reimbursementEvidence.length,1);
const old=w;await save(w,'3100','https://docs.google.com/spreadsheets/d/breakdown/edit');w=await workspace();assert.equal(w.rows[0].verified,false);await assert.rejects(verify(old),/changed/);await verify(w);
// Confirming a revised target clears only this employee's evidence eligibility, even if amount is unchanged.
w=await workspace();await target(w);await assert.rejects(target(w),/requirement changed/);w=await workspace();assert.equal(w.rows[0].verified,false);await assert.rejects(verify(w),/changed/);await assert.rejects(gate(),/requires PHP/);await save(w);w=await workspace();await verify(w);
// Changes to payroll sources cannot reuse verification without review.
snap.changed='new source';await db.query('update public.fixture set snap=$1',[snap]);w=await workspace();assert.equal(w.rows[0].verified,true,'Attendance changes do not invalidate a receipt-only quarter review');
// Every ordinary cutoff must retain the base payroll snapshot exactly and need no receipts.
for(const [from,to] of [['2026-09-26','2026-10-10'],['2026-10-26','2026-11-10'],['2026-11-11','2026-11-25'],['2026-12-11','2026-12-25']]){snap.dateFrom=from;snap.dateTo=to;await db.query('update public.fixture set snap=$1',[snap]);w=await workspace();assert.equal(w.quarter,null);assert.equal(w.rows.length,0);assert.deepEqual((await gate()).rows[0].payroll_gross_snapshot,snap);await assert.rejects(target({...w,rows:[{targetRevision:0}]}),/not required/);}
// All four exact requested deadlines map to the containing 11–25 cutoff and prior full quarter.
for(const [year,month,start,end] of [[2026,4,'2026-01-01','2026-03-31'],[2026,7,'2026-04-01','2026-06-30'],[2026,10,'2026-07-01','2026-09-30'],[2027,1,'2026-10-01','2026-12-31']]){const m=String(month).padStart(2,'0');const q=(await db.query('select private.payroll_receipt_quarter($1,$2) q',[`${year}-${m}-11`,`${year}-${m}-25`])).rows[0].q;assert.equal(q.from,start);assert.equal(q.to,end);assert.equal(q.deadline,`${year}-${m}-15`);}
// A new quarter starts without target or evidence; never carries the last verification forward.
snap.dateFrom='2027-01-11';snap.dateTo='2027-01-25';await db.query('update public.fixture set snap=$1',[snap]);w=await workspace();assert.equal(w.rows[0].evidence,null);assert.equal(w.rows[0].requiredAmount,null);await assert.rejects(gate(),/Finance must confirm/);
await actor('employee','finance');await assert.rejects(target(w),/cannot confirm your own/);await assert.rejects(verify({...w,rows:[{evidence:{submitted_at:null}}]}),/cannot verify your own/);
await actor('finance','finance');await target(w,'0');w=await workspace();assert.equal(w.rows[0].verified,true);await gate();
// Direct scope/date RPCs work before ANY submitted time package exists.
await db.query('delete from public.payroll_time_packages');
const earlyArgs=[ids.scope,'2026-04-11','2026-04-25'];
await actor('finance','finance');
let early=(await db.query('select public.get_payroll_quarter_receipts($1,$2,$3) w',earlyArgs)).rows[0].w;
assert.equal(early.quarter.deadline,'2026-04-15');
await db.query('select public.confirm_payroll_quarter_receipt_requirement($1,$2,$3,$4,$5,3000,$6,0)',[...earlyArgs,ids.employee,early.sourceHash,'Confirmed Q1 allowance breakdown']);
early=(await db.query('select public.get_payroll_quarter_receipts($1,$2,$3) w',earlyArgs)).rows[0].w;
await db.query('select public.save_payroll_quarter_receipts($1,$2,$3,$4,$5,3000,$6)',[...earlyArgs,ids.employee,early.sourceHash,'https://docs.google.com/spreadsheets/d/q1/edit']);
early=(await db.query('select public.get_payroll_quarter_receipts($1,$2,$3) w',earlyArgs)).rows[0].w;
await db.query('select public.verify_payroll_quarter_receipts($1,$2,$3,$4,$5,$6)',[...earlyArgs,ids.employee,early.sourceHash,early.rows[0].evidence.submitted_at]);
assert.equal((await db.query('select public.get_payroll_quarter_receipts($1,$2,$3) w',earlyArgs)).rows[0].w.rows[0].verified,true);
await db.query('insert into public.payroll_time_packages values($1,$2)',[ids.time,ids.scope]);
await actor('preparer','prepare');await db.exec('set role authenticated');w=await workspace();assert.equal(w.actorId,ids.preparer);await db.exec('reset role');
await actor('','finance');await assert.rejects(workspace(),/signed-in/);
await actor('preparer','none');await assert.rejects(workspace(),/Forbidden|Scoped payroll/);
const acl=(await db.query("select has_function_privilege('anon','public.confirm_payroll_reimbursement_quarter_target(uuid,uuid,text,numeric,text,bigint)','execute') anon,has_table_privilege('authenticated','private.payroll_reimbursement_quarter_targets','select') direct")).rows[0];assert.deepEqual(acl,{anon:false,direct:false});
await assert.rejects(db.query('delete from private.payroll_reimbursement_target_audit'),/Immutable/);await assert.rejects(db.query('delete from private.payroll_reimbursement_evidence_audit'),/Immutable/);
// An approved standing amount repeats across quarters without carrying evidence forward.
await db.query('insert into private.payroll_reimbursement_standing_requirements(employee_id,effective_from,required_amount,basis_reference,approved_by) values($1,$2,1234.01,$3,$4)',[ids.employee,'2026-01-01','Approved standing quarterly requirement',ids.finance]);
await actor('finance','finance');snap.dateFrom='2027-07-11';snap.dateTo='2027-07-25';await db.query('update public.fixture set snap=$1',[snap]);w=await workspace();
assert.equal(w.rows[0].requiredAmount,'1234.01');assert.ok(Number(w.rows[0].targetRevision)<0);assert.equal(w.rows[0].evidence,null);assert.equal(w.rows[0].verified,false);await assert.rejects(gate(),/requires PHP/);
await save(w,'1234.00');w=await workspace();await assert.rejects(verify(w),/must meet/);await save(w,'1234.01');w=await workspace();await verify(w);assert.equal((await workspace()).rows[0].verified,true);
await target(w,'1300.01');w=await workspace();assert.equal(w.rows[0].requiredAmount,'1300.01');assert.ok(Number(w.rows[0].targetRevision)>0);assert.equal(w.rows[0].verified,false,'Quarter override invalidates the old default verification');
// A future effective amount does not change the earlier receipt quarter.
await db.query('insert into private.payroll_reimbursement_standing_requirements(employee_id,effective_from,required_amount,basis_reference,approved_by) values($1,$2,1500.01,$3,$4)',[ids.employee,'2027-07-01','Approved future quarterly requirement',ids.finance]);
assert.equal((await workspace()).rows[0].requiredAmount,'1300.01');snap.dateFrom='2027-10-11';snap.dateTo='2027-10-25';await db.query('update public.fixture set snap=$1',[snap]);w=await workspace();assert.equal(w.rows[0].requiredAmount,'1500.01');assert.equal(w.rows[0].evidence,null);assert.equal(w.rows[0].verified,false);
await assert.rejects(db.query('delete from private.payroll_reimbursement_standing_requirements'),/Immutable/);
assert.equal((await db.query("select has_table_privilege('authenticated','private.payroll_reimbursement_standing_requirements','select') access")).rows[0].access,false);
await db.close();console.log('PASS: exact four quarterly periods/deadlines, unaffected cutoff preservation, Finance-confirmed whole-quarter targets, shortfall, source/target/evidence revisions, distinct auth/HRIS actor IDs, self review denial, authenticated wrapper ACL and immutable audits.');
