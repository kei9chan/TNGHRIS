import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
const original=fs.readFileSync('supabase/migrations/20261012042226_ot_cost_estimates.sql','utf8');
const repair=fs.readFileSync('supabase/migrations/20261012044924_repair_optional_ot_cost_loading.sql','utf8');
await db.exec(`
create schema private; create schema auth;
create role anon; create role authenticated;
create table public.ot_requests(id uuid,employee_id uuid,date date,ot_type text,paid_ot_type text,status text,
  requested_minutes integer,final_approved_minutes integer,manager_confirmed_minutes integer,approved_hours numeric,
  final_night_minutes integer,manager_night_minutes integer,start_time time,end_time time,end_date date);
create table public.payroll_pay_packages(employee_id uuid,scope_id uuid,stream text,status text,effective_from date,
  created_at timestamptz,rate_type text,base_amount numeric,currency text);
create table public.payroll_gross_rules(scope_id uuid,effective_from date,effective_to date,config jsonb);
create function auth.uid() returns uuid language sql as $$
  select nullif(current_setting('test.actor',true),'')::uuid $$;
create function private.payroll_employee_bu_scope(uuid) returns uuid language sql as $$
  select '00000000-0000-0000-0000-000000000002'::uuid $$;
create function private.payroll_package_permission(uuid,uuid,text) returns boolean language sql as $$
  select coalesce(current_setting('test.permission',true),'true')='true' $$;
create function private.ot_requested_minutes(r public.ot_requests) returns integer language sql as $$
  select r.requested_minutes $$;
create function private.payroll_statutory_gross_config() returns jsonb language sql as $$
  select '{"annualDivisor":365,"hoursPerDay":8,"nightStart":"22:00","nightEnd":"06:00",
    "premiums":{"ordinary":{"ot":1.25,"nightOt":0.125}}}'::jsonb $$;
create function public.get_ot_week_review(p_ids uuid[]) returns jsonb language plpgsql as $$
declare r public.ot_requests; rows jsonb:='[]'; summary jsonb:='{"baselineMissing":false}';
begin
  for r in select * from public.ot_requests where id=any(p_ids) order by id loop
    rows:=rows||jsonb_build_array(to_jsonb(r)||jsonb_build_object('canDecide',true,
      'costEstimate',private.ot_cost_estimate(r)));
  end loop;
  return jsonb_build_array(jsonb_build_object('requests',rows,'version',md5(rows::text||summary::text)));
end $$;
insert into public.ot_requests values('00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001','2026-10-01','Paid','Regular Overtime','PendingBOD',
  240,null,180,3,null,null,'22:00','02:00','2026-10-02');
insert into public.payroll_pay_packages values('00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002','employee_payroll','approved','2026-09-01',now(),'Hourly',100,'PHP');
set test.actor='00000000-0000-0000-0000-000000000003';
`);
await db.exec(original.slice(0,original.indexOf('\ndo $$')));
await assert.rejects(db.query('select private.ot_cost_estimate(r) from public.ot_requests r'),/scope_id.*ambiguous/);
await db.exec(repair);
const cost=async()=> (await db.query('select private.ot_cost_estimate_safe(r) as result from public.ot_requests r')).rows[0].result;
const review=async()=> (await db.query("select public.get_ot_week_review(array['00000000-0000-0000-0000-000000000010'::uuid]) as result")).rows[0].result[0];
assert.equal((await cost()).total,412.5);
assert.equal((await cost()).minutes,180,'BOD cost uses only manager-confirmed hours');
assert.equal((await cost()).nightPremium,37.5);
const before=await review();
assert.equal(before.requests[0].canDecide,true);
await db.exec(`insert into public.payroll_gross_rules values('00000000-0000-0000-0000-000000000002',
 '2026-01-01',null,'{"annualDivisor":"bad","hoursPerDay":8}'::jsonb);
 update public.payroll_pay_packages set rate_type='Monthly';`);
await assert.rejects(db.query('select private.ot_cost_estimate(r) from public.ot_requests r'),/invalid input syntax/);
const unavailable=await cost();
assert.equal(unavailable.available,false);
assert.equal(unavailable.reason,'Cost estimate temporarily unavailable.');
const after=await review();
assert.equal(after.requests[0].canDecide,true,'Cost failure cannot hide review/approval eligibility');
assert.equal(after.version,before.version,'Cost details cannot invalidate the approval version');
await db.exec("set test.permission='false'");
assert.equal((await cost()).available,false);
assert.equal((await cost()).total,undefined,'Compensation remains restricted');
await db.exec("set test.actor=''");
assert.equal((await cost()).total,undefined,'Anonymous users receive no compensation');
await db.exec("set test.actor='00000000-0000-0000-0000-000000000003'; set test.permission='true'; delete from public.payroll_pay_packages;");
assert.equal((await cost()).reason,'No approved pay package for this work date.');
assert.equal((await review()).requests[0].canDecide,true,'Missing salary does not prevent OT review');
await db.close();
console.log('PASS: reproduces scope_id regression; approved cost and night premium; manager-only hours; cost failure isolation; stable approval version; denied/anonymous compensation stays private; missing package still allows review.');
