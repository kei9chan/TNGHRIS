import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
await db.exec(`
create role authenticated; create role anon; create schema auth; create schema private; create schema schedule_compliance;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
create table public.hris_users(id uuid primary key,auth_user_id uuid,full_name text,role text,status text default 'Active',reports_to text,business_unit_id uuid,department_id uuid,business_unit text,department text,position text);
create function public.current_hris_user_id() returns uuid language sql stable security definer as $$select id from public.hris_users where auth_user_id=auth.uid()$$;
create function private.payroll_actor_id() returns uuid language sql stable security definer as $$select auth_user_id from public.hris_users where auth_user_id=auth.uid() and status='Active'$$;
create function public.has_active_role(r text) returns boolean language sql stable security definer as $$select exists(select 1 from public.hris_users where auth_user_id=auth.uid() and role=r and status='Active')$$;
create function private.schedule_team_can_use_bu(b uuid) returns boolean language sql stable security definer as $$select exists(select 1 from public.hris_users where auth_user_id=auth.uid() and business_unit_id=b and role in('Manager','Business Unit Manager','Board of Director'))$$;
create function private.payroll_schedule_can_edit(e uuid) returns boolean language sql stable security definer as $$select exists(select 1 from public.hris_users t join public.hris_users a on a.auth_user_id=auth.uid() where t.id=e and (t.id=a.id or t.reports_to=a.id::text or a.role in('Admin','HR Manager','HR Staff')))$$;
create table shift_templates(id uuid primary key default gen_random_uuid(),name text,start_time time,end_time time,break_minutes int default 60,grace_period_minutes int default 5,business_unit_id uuid,created_by uuid,color text,schedule_kind text default 'work',end_day_offset int default 0,paid_minutes int default 480,is_flexible boolean default false,min_hours_per_day numeric,min_days_per_week int);
create table shift_assignments(id uuid primary key default gen_random_uuid(),employee_id uuid,shift_template_id uuid references shift_templates(id),date date,business_unit_id uuid,department_id uuid,created_by uuid,assigned_area_id uuid,notes text);
create table schedule_day_statuses(id uuid,employee_id uuid,work_date date,tag text,revision int);
create table schedule_compliance.submissions(id uuid primary key default gen_random_uuid(),employee_id uuid,manager_id uuid,week date,version int default 1,entries jsonb,template_hash text,draft_hash text,status text,reason text,reviewed_by uuid,review_reason text,submitted_at timestamptz default now(),reviewed_at timestamptz,unique(employee_id,week));
create table schedule_compliance.settings(days_before int,deadline_time time);
create table public.payroll_schedule_freezes(employee_id uuid,date_from date,date_to date);
create function schedule_compliance.bod_manager(e uuid) returns uuid language sql stable security definer as $$select reports_to::uuid from public.hris_users where id=e$$;
create function schedule_compliance.snapshot(m uuid,w date) returns jsonb language sql as $$select '{"employees":[]}'::jsonb$$;
create function private.workflow_user_has_role(e uuid,r text) returns boolean language sql as $$select false$$;
create function private.payroll_schedule_draft(e uuid,w date) returns jsonb language sql as $$select '[]'::jsonb$$;
create function private.schedule_day_status(e uuid,d date) returns jsonb language sql as $$select '{}'::jsonb$$;
create function private.payroll_schedule_validate(x jsonb) returns void language sql as $$select$$;
create function schedule_compliance.template_hash(x jsonb) returns text language sql as $$select md5(x::text)$$;

create function private.schedule_preset_bu_guard() returns trigger language plpgsql as $$begin return new;end$$;
create function private.schedule_assignment_preset_guard() returns trigger language plpgsql as $$begin return new;end$$;
create trigger schedule_preset_bu before insert or update on shift_templates for each row execute function private.schedule_preset_bu_guard();
create trigger schedule_assignment_preset before insert or update on shift_assignments for each row execute function private.schedule_assignment_preset_guard();
alter table shift_assignments enable row level security;
create policy assignment_access on shift_assignments for all to authenticated using(private.payroll_schedule_can_edit(employee_id)) with check(private.payroll_schedule_can_edit(employee_id));
create policy ref_select on shift_templates for select to authenticated using(true);
grant usage on schema auth,private,schedule_compliance to authenticated,anon;
grant select on hris_users,schedule_day_statuses to authenticated;
grant select,insert,update,delete on shift_templates,shift_assignments to authenticated;
`);
await db.exec(fs.readFileSync('tests/fixtures/schedulePresetExistingFunctions.sql','utf8'));
await db.exec(fs.readFileSync('supabase/migrations/20260914232027_schedule_preset_reporting_visibility.sql','utf8'));
await db.query(`insert into hris_users(id,auth_user_id,full_name,role,reports_to,business_unit_id) values
 ($1,$1,'Creator','Manager',null,$7),($2,$2,'Direct report','Employee',$1::uuid::text,$7),
 ($3,$3,'Same BU outsider','Employee',$4::uuid::text,$7),($4,$4,'Other manager','Manager',null,$7),
 ($5,$5,'Other BUM','Business Unit Manager',null,$7),($6,$6,'Support','Admin',null,$7)`,[id(1),id(2),id(3),id(4),id(5),id(6),id(10)]);
const actor=async n=>{await db.exec('reset role');await db.query("select set_config('test.actor',$1,false)",[id(n)]);await db.exec('set role authenticated');};
const admin=async(sql,args=[])=>{await db.exec('reset role');return args.length ? db.query(sql,args) : db.exec(sql).then(results=>results[results.length-1]);};
const visible=()=>scalar('select count(*)::int from shift_templates where id=$1',[id(100)]);
await actor(1);
await db.query('insert into shift_templates(id,name,business_unit_id,created_by,start_time,end_time) values($1,$2,$3,$4,\'09:00\',\'18:00\')',[id(100),'Direct line preset',id(10),id(4)]);
assert.equal(await scalar('select created_by from shift_templates'),id(1),'Insert cannot forge the creator');
assert.equal(await visible(),1);
await db.query("insert into shift_assignments(id,employee_id,shift_template_id,date,business_unit_id) values($1,$2,$3,'2026-09-14',$4)",[id(200),id(2),id(100),id(10)]);
await db.query("update shift_templates set name='Edited preset' where id=$1",[id(100)]);
await assert.rejects(()=>db.query('update shift_templates set created_by=$1 where id=$2',[id(4),id(100)]),/creator cannot/);
await actor(2);assert.equal(await visible(),1);
const week=await scalar("select date_trunc('week',now() at time zone 'Asia/Manila')::date::text");
assert.equal((await scalar('select get_bod_schedule_workflow($1)',[week])).templates.length,1);
const entries=Array.from({length:7},(_,n)=>({date:new Date(Date.parse(week+'T00:00:00Z')+n*86400000).toISOString().slice(0,10),templateId:id(100)}));
await db.query('select submit_my_bod_schedule($1,$2,$3)',[week,JSON.stringify(entries),'Isolated fixture schedule']);
await db.query("insert into shift_assignments(employee_id,shift_template_id,date,business_unit_id) values($1,$2,'2026-09-15',$3)",[id(2),id(100),id(10)]);
assert.equal((await db.query("update shift_templates set name='Unauthorized edit' where id=$1 returning id",[id(100)])).rows.length,0);
for(const n of [3,4,5]) {
 await actor(n);assert.equal(await visible(),0,'Same BU and manager titles do not confer access');
 assert.equal((await db.query('select * from shift_templates where business_unit_id=$1',[id(10)])).rows.length,0);
 await assert.rejects(()=>db.query("insert into shift_assignments(employee_id,shift_template_id,date,business_unit_id) values($1,$2,'2026-09-16',$3)",[id(n),id(100),id(10)]),/current reporting line/);
}
// Simulate an existing privileged API: the trigger must still enforce visibility.
await admin(`create function public.test_definer_apply(e uuid,t uuid,b uuid) returns void language sql security definer as $$insert into shift_assignments(employee_id,shift_template_id,date,business_unit_id) values(e,t,'2026-09-16',b)$$;grant execute on function public.test_definer_apply(uuid,uuid,uuid) to authenticated;`);
await actor(4);await assert.rejects(()=>db.query('select test_definer_apply($1,$2,$3)',[id(4),id(100),id(10)]),/current reporting line/);
const before=await admin('select to_jsonb(a) data from shift_assignments a order by id');
await admin('update hris_users set reports_to=$1 where id=$2',[id(4),id(2)]);
await actor(2);assert.equal(await visible(),0,'Current reporting relationship revokes access immediately');
assert.equal((await scalar('select get_bod_schedule_workflow($1)',[week])).templates.length,0);
await assert.rejects(()=>db.query('select submit_my_bod_schedule($1,$2,$3)',[week,JSON.stringify(entries),'Forged preset submission']),/Choose a preset/);
await assert.rejects(()=>db.query("insert into shift_assignments(employee_id,shift_template_id,date,business_unit_id) values($1,$2,'2026-09-17',$3)",[id(2),id(100),id(10)]),/current reporting line/);
await actor(4);
await assert.rejects(()=>db.query('select copy_schedule_week_with_statuses($1,$2)',[[id(2)],'2026-09-21']),/current reporting line/);
const roster=await scalar("select get_schedule_builder_data('direct','2026-09-14')");
assert.equal(roster.assignments.length,2);assert.equal(roster.templates.length,1);
assert.equal(roster.templates[0].can_use,false);assert.equal(roster.templates[0].can_manage,false);
assert.equal(roster.templates[0].name,'Edited preset','Existing saved shifts retain display details without granting preset reuse');
assert.deepEqual((await admin('select to_jsonb(a) data from shift_assignments a order by id')).rows,before.rows);
for(const role of ['Admin','HR Manager','HR Staff']) {
 await admin('update hris_users set role=$1 where id=$2',[role,id(6)]);
 await actor(6);assert.equal(await visible(),1);
 await db.query('update shift_templates set name=$1 where id=$2',[`Support ${role}`,id(100)]);
 assert.equal(await scalar('select name from shift_templates'),`Support ${role}`);
}
await admin("update hris_users set status='Inactive' where id=$1",[id(6)]);await actor(6);assert.equal(await visible(),0);
await db.exec('reset role;set role anon');await assert.rejects(()=>db.query('select * from shift_templates'),/permission denied/);
console.log('PASS: creator create/edit/use; direct report view/use; same-BU outsiders, other managers and BUMs denied; forged owner and definer reuse denied; reporting change revokes reuse without changing saved shifts; Admin/HR Manager/HR Staff support; inactive/anonymous denied.');
await db.close();
