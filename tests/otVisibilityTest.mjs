import assert from 'node:assert/strict';import fs from 'node:fs';import {PGlite} from '@electric-sql/pglite';
process.on('uncaughtException',e=>{console.error(e.message,e.where||'');process.exit(1);});
const db=new PGlite();const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
await db.exec(`create schema private;create schema auth;create role anon;create role authenticated;grant usage on schema private,auth to authenticated;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
create function public.current_hris_user_id() returns uuid language sql stable as $$select auth.uid()$$;
create table hris_users(id uuid primary key,business_unit_id uuid,position text);
create table roles(id text primary key,is_active boolean);
create table user_roles(user_id uuid,role_id text,is_active boolean,scope_type text,allowed_business_unit_ids uuid[]);
create table business_units(id uuid primary key,name text);
create table org_chart_assignments(user_id uuid,business_unit_id uuid,is_approved boolean,effective_from date,effective_until date);
create function public.current_hris_roles() returns text[] language sql stable security definer set search_path='' as $$select coalesce(array_agg(u.role_id),'{}') from public.user_roles u join public.roles r on r.id=u.role_id and r.is_active where u.user_id=auth.uid() and u.is_active$$;
create function private.is_active_time_request_approver(uuid,text,uuid) returns boolean language sql stable as $$select false$$;
create table ot_requests(id uuid primary key,employee_id uuid,business_unit_id uuid,status text,created_at timestamptz default now());
alter table ot_requests enable row level security;grant select on ot_requests to authenticated;
create policy ot_authorized_view on ot_requests for select to authenticated using(false);`);
await db.query('insert into business_units values($1,\'A\'),($2,\'B\'),($3,\'C\')',[id(1),id(2),id(3)]);
await db.query("insert into hris_users values($1,$3,'Manager'),($2,$4,'Staff'),($5,$3,'Staff')",[id(10),id(20),id(1),id(2),id(21)]);
for(const role of ['Admin','HR Staff','HR Manager','Board of Director','Manager','Business Unit Manager','Employee'])await db.query('insert into roles values($1,true)',[role]);
await db.query("insert into ot_requests(id,employee_id,business_unit_id,status) values($1,$2,null,'Submitted'),($3,$4,null,'Approved'),($5,$4,$6,'Rejected')",[id(30),id(21),id(31),id(20),id(32),id(3)]);
await db.exec(fs.readFileSync('supabase/migrations/20260929133000_overtime_management_visibility.sql','utf8'));
// Match production ACLs: the actor-parameter helper cannot be called by clients.
await db.exec('revoke all on function private.is_active_time_request_approver(uuid,text,uuid) from public,anon,authenticated');
await db.exec('set role authenticated');
await assert.rejects(db.query('select count(*) from ot_requests'),/permission denied for function is_active_time_request_approver/);
await db.exec('reset role');
await db.exec(fs.readFileSync('supabase/migrations/20260929140000_restore_approval_queue_ot_rls.sql','utf8'));
await db.exec(`set test.actor='${id(10)}'`);
const setRole=async(role,active=true)=>{await db.exec('delete from user_roles');await db.query("insert into user_roles values($1,$2,$3,'HOME_ONLY','{}')",[id(10),role,active]);};
const read=async()=>{await db.exec('set role authenticated');try{return (await db.query('select * from list_visible_ot_requests()')).rows.map(r=>r.list_visible_ot_requests);}finally{await db.exec('reset role');}};
for(const role of ['Admin','HR Staff','HR Manager','Board of Director']){await setRole(role);assert.equal((await read()).length,3,role);await db.exec('set role authenticated');assert.equal((await db.query('select count(*)::int n from ot_requests')).rows[0].n,3);await db.exec('reset role');}
for(const role of ['Manager','Business Unit Manager']){await setRole(role);let rows=await read();assert.equal(rows.length,1);assert.equal(rows[0].business_unit_id,id(1));await db.query("update user_roles set scope_type='SPECIFIC',allowed_business_unit_ids=$1",[[id(2)]]);rows=await read();assert.equal(rows.length,2);assert.ok(!rows.some(r=>r.id===id(32)),'Foreign snapshot excluded');}
// A scoped assigned approver can read only the assigned foreign-BU request.
await db.exec(`create or replace function private.is_active_time_request_approver(uuid,text,uuid) returns boolean language sql stable as $$select $1='${id(10)}'::uuid and $3='${id(31)}'::uuid$$`);
await setRole('Employee');
await db.exec('set role authenticated');
assert.deepEqual((await db.query('select id from ot_requests')).rows.map(r=>r.id),[id(31)]);
await assert.rejects(db.query(`select private.is_active_time_request_approver('${id(10)}','overtime','${id(31)}')`),/permission denied/);
await db.exec('reset role');
assert.equal((await db.query("select has_function_privilege('anon','private.current_actor_can_read_assigned_ot(uuid)','execute') allowed")).rows[0].allowed,false);
await db.exec('create or replace function private.is_active_time_request_approver(uuid,text,uuid) returns boolean language sql stable as $$select false$$');
await setRole('HR Staff',false);assert.equal((await read()).length,0,'Inactive role denied');await setRole('Employee');assert.equal((await read()).length,0,'Employee cannot view others');
await db.query('insert into ot_requests(id,employee_id,status) values($1,$2,\'Draft\')',[id(33),id(10)]);assert.equal((await read()).length,1,'Employee own request retained');
await setRole('Admin');const page1=(await db.query('select * from list_visible_ot_requests(0,2)')).rows;const page2=(await db.query('select * from list_visible_ot_requests(2,2)')).rows;assert.equal(new Set([...page1,...page2].map(r=>r.list_visible_ot_requests.id)).size,4);
await db.exec("set test.actor=''");await assert.rejects(read(),/Sign in/);
assert.equal((await db.query("select has_function_privilege('anon','public.list_visible_ot_requests(integer,integer)','execute') allowed")).rows[0].allowed,false);
await db.close();console.log('PASS: global HR/Admin/BOD visibility, manager assigned BU boundaries, legacy missing BU fallback, preserved snapshots, inactive/employee/anonymous denial, own requests and pagination.');
