import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { transformSync } from 'esbuild';

const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
await db.exec(`
  create role authenticated; create role anon; create schema private;
  create table hris_users(id uuid primary key, email text, status text, business_unit_id uuid, department_id uuid);
  create table roles(id text primary key, is_active boolean default true);
  create table user_roles(user_id uuid, role_id text, is_active boolean default true);
  create function current_hris_user_id() returns uuid language sql stable security definer as $$
    select id from public.hris_users where id=nullif(current_setting('test.actor',true),'')::uuid and status='Active'
  $$;
  create function has_active_role(p_role text) returns boolean language sql stable security definer as $$
    select exists(select 1 from public.user_roles u join public.roles r on r.id=u.role_id
      where u.user_id=public.current_hris_user_id() and u.role_id=p_role and u.is_active and r.is_active)
  $$;
  create function is_hr_or_admin() returns boolean language sql stable as $$
    select public.has_active_role('Admin') or public.has_active_role('HR Manager') or public.has_active_role('HR Staff')
  $$;
  create table evaluations(id uuid primary key, status text, due_date date, updated_at timestamptz,
    target_employee_ids uuid[]);
  create table evaluation_assignments(id uuid primary key, evaluation_id uuid, due_date date, status text, completed_at timestamptz);
  create table evaluation_evaluators(evaluation_id uuid, type text, user_id uuid, business_unit_id uuid,
    department_id uuid, exclude_subject boolean);
  create table evaluation_submissions(id uuid primary key, evaluation_id uuid, subject_employee_id uuid, rater_id uuid, scores jsonb);
  create table audit_logs(user_id text,user_email text,action text,entity text,entity_id text,details text);
  alter table evaluations enable row level security;
  alter table evaluation_assignments enable row level security;
  alter table evaluation_submissions enable row level security;
  create policy read_evaluations on evaluations for select to authenticated using(true);
  create policy read_assignments on evaluation_assignments for select to authenticated using(true);
  create policy read_submissions on evaluation_submissions for select to authenticated using(rater_id=public.current_hris_user_id());
  grant usage on schema public to authenticated,anon;
  grant select on evaluations,evaluation_assignments,hris_users,evaluation_evaluators,evaluation_submissions to authenticated;
  grant insert,update on evaluation_submissions to authenticated;
  insert into roles(id) values('HR Manager'),('Admin'),('HR Staff'),('Board of Director'),('Employee');
  insert into hris_users(id,email,status) values
    ('${id(1)}','head@example.test','Active'),('${id(2)}','staff@example.test','Active'),
    ('${id(3)}','evaluator@example.test','Active'),('${id(4)}','inactive@example.test','Inactive'),
    ('${id(5)}','director@example.test','Active'),('${id(6)}','admin@example.test','Active');
  insert into user_roles(user_id,role_id) values
    ('${id(1)}','HR Manager'),('${id(2)}','HR Staff'),('${id(3)}','Employee'),
    ('${id(4)}','HR Manager'),('${id(5)}','Board of Director'),('${id(6)}','Admin');
  insert into evaluations values
    ('${id(10)}','InProgress',current_date-5,now(),array['${id(30)}'::uuid]),
    ('${id(11)}','Completed',current_date-5,now(),array['${id(30)}'::uuid]);
  insert into evaluation_assignments values
    ('${id(20)}','${id(10)}',current_date-5,'Pending',null),
    ('${id(21)}','${id(10)}',current_date-5,'Completed',now()),
    ('${id(22)}','${id(10)}',current_date-5,'Cancelled',null);
  insert into evaluation_evaluators values ('${id(10)}','Individual','${id(3)}',null,null,true);
  insert into evaluation_submissions values ('${id(40)}','${id(10)}','${id(31)}','${id(3)}','[{"score":4}]');
`);
// Use the application's existing evaluator write policies, not a test-only allowance.
await db.exec(fs.readFileSync('supabase/migrations/20260824062000_harden_evaluation_submission_assignment.sql','utf8'));
await db.exec(fs.readFileSync('supabase/migrations/20261124035025_hr_head_evaluation_deadline_extensions.sql','utf8'));
const scalar = async sql => (await db.query(sql)).rows[0];
const dates = await scalar(`select (current_date-5)::text old, (current_date+5)::text next, (current_date+6)::text later`);
const actor = async n => { await db.exec(`reset role; select set_config('test.actor','${n ? id(n) : ''}',false); set role authenticated;`); };
const call = (newDate=dates.next,oldDate=dates.old,reason='Delayed evaluation') => db.query(
  'select public.extend_evaluation_deadline($1,$2,$3,$4) result',[id(10),newDate,oldDate,reason]);
const rejects = async (fn,re) => assert.rejects(fn,re);
for (const n of [null,2,3,4,5]) {
  await actor(n);
  await rejects(()=>call(), /Only the HR Manager/);
}
await db.exec('reset role; set role anon;');
await rejects(()=>call(), /permission denied/);
await actor(1);
await rejects(()=>db.query('select private.extend_evaluation_deadline($1,$2,$3,$4)',[id(10),dates.next,dates.old,'test']),/permission denied/);
await rejects(()=>call(dates.old),/today or a later date/);
await rejects(()=>call(null),/today or a later date/);
await rejects(()=>call(dates.next,dates.old,'  '),/Enter a reason/);
await rejects(()=>call(dates.next,dates.old,'x'.repeat(1001)),/Enter a reason/);
await rejects(()=>db.query('select public.extend_evaluation_deadline($1,$2,$3,$4)',[id(11),dates.next,dates.old,'test']),/in-progress/);
// The role does not need general UPDATE rights to evaluations.
await rejects(()=>db.exec(`update evaluations set status='Completed' where id='${id(10)}'`),/permission denied/);
await actor(3);
const submit = () => db.exec(`insert into evaluation_submissions values ('${id(41)}','${id(10)}','${id(30)}','${id(3)}','[{"score":5}]')`);
await rejects(submit,/row-level security/);
await actor(1);
const before = await scalar(`select completed_at::text from evaluation_assignments where id='${id(21)}'`);
const result = (await call()).rows[0].result;
assert.equal(result.due_date, dates.next);
assert.equal(result.assignments_updated,2);
await rejects(()=>call(),/deadline has changed/);
await rejects(()=>call(dates.next,dates.next),/later than the current deadline/);
await db.exec('reset role;');
assert.deepEqual((await db.query(`select status,due_date::text from evaluation_assignments order by id`)).rows,[
  {status:'Pending',due_date:dates.next},{status:'Completed',due_date:dates.next},{status:'Cancelled',due_date:dates.old}]);
assert.equal((await scalar(`select completed_at::text from evaluation_assignments where id='${id(21)}'`)).completed_at,before.completed_at);
assert.deepEqual((await scalar(`select scores from evaluation_submissions where id='${id(40)}'`)).scores,[{score:4}]);
const audit = await scalar('select * from audit_logs');
assert.equal(audit.user_id,id(1));
assert.deepEqual(JSON.parse(audit.details),{operation:'extend_deadline',previous_due_date:dates.old,due_date:dates.next,
  timezone:'Asia/Manila',reason:'Delayed evaluation',assignments_updated:2});
await actor(3);
await submit(); // Assigned evaluator can now submit through the original RLS policy.
await actor(6);
await call(dates.later,dates.next,'Further extension');
await db.exec(`reset role; update user_roles set is_active=false where user_id='${id(1)}';`);
await actor(1);
await rejects(()=>call(dates.later,dates.next),/Only the HR Manager/);
await db.close();

// Exercise date handling in several browser time zones at the Philippine boundary.
const src = fs.readFileSync('utils/evaluationDeadline.ts','utf8');
const js = transformSync(src,{loader:'ts',format:'esm'}).code;
const helpers = await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
for (const tz of ['Asia/Manila','UTC','America/Los_Angeles']) {
  process.env.TZ=tz;
  const deadline = new Date('2026-11-24T00:00:00+08:00');
  assert.equal(helpers.evaluationDeadlineDay(deadline),'2026-11-24');
  assert.equal(helpers.isEvaluationDeadlinePassed(deadline,new Date('2026-11-24T15:59:59Z')),false);
  assert.equal(helpers.isEvaluationDeadlinePassed(deadline,new Date('2026-11-24T16:00:00Z')),true);
}
console.log('Evaluation deadline tests passed: role boundaries, audited extension, submission reopening, preserved responses, concurrent changes, Philippine dates.');
