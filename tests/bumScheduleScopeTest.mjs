import assert from 'node:assert/strict';import fs from 'node:fs';import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
await db.exec(`create schema private;create schema auth;create role anon;create role authenticated;
create table hris_users(id uuid primary key,auth_user_id uuid,role text,status text,department text,business_unit_id uuid,reports_to text);
create function public.current_hris_user_id() returns uuid language sql as $$select current_setting('test.actor')::uuid$$;
create function auth.uid() returns uuid language sql as $$select auth_user_id from public.hris_users where id=public.current_hris_user_id()$$;
create function private.payroll_actor_id() returns uuid language sql as $$select public.current_hris_user_id()$$;
create function public.has_active_role(text) returns boolean language sql as $$select role=$1 from public.hris_users where id=public.current_hris_user_id()$$;
create function public.is_hr_or_admin() returns boolean language sql as $$select role in ('HR Manager','Admin') from public.hris_users where id=public.current_hris_user_id()$$;
create function private.schedule_employee_in_week(uuid,date) returns boolean language sql as $$select true$$;
create function public.get_schedule_builder_data(p_scope text,p_week date) returns jsonb language plpgsql as $$declare broad boolean:=public.is_hr_or_admin();begin return (select coalesce(jsonb_agg(h.id),'[]') from public.hris_users h where private.schedule_employee_in_week(h.id,p_week) and (p_scope='all' or h.business_unit_id=(select business_unit_id from public.hris_users where id=public.current_hris_user_id())));end$$;`);
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
await db.exec(`insert into hris_users values
('${id(1)}','${id(101)}','Business Unit Manager','Active','Operations - Business Unit Manager','${id(90)}',null),
('${id(2)}','${id(102)}','Employee','Active','Operations - Kitchen','${id(90)}','${id(1)}'),
('${id(3)}','${id(103)}','Employee','Active','Sales and Reservations','${id(90)}','${id(7)}'),
('${id(4)}','${id(104)}','Employee','Active','Finance and Accounting','${id(90)}','${id(8)}'),
('${id(5)}','${id(105)}','Employee','Active','Operations - Kitchen','${id(91)}',null),
('${id(6)}','${id(106)}','Admin','Active','Executive','${id(90)}',null),
('${id(7)}','${id(107)}','Manager','Active','Sales and Reservations','${id(90)}',null),
('${id(8)}','${id(108)}','Manager','Active','Finance and Accounting','${id(90)}',null);`);
await db.exec(fs.readFileSync('supabase/migrations/20261120064646_bum_operations_schedule_scope.sql','utf8'));
const actor=async n=>db.exec(`set test.actor='${id(n)}'`);
const can=async n=>(await db.query(`select private.payroll_schedule_can_edit('${id(n)}') ok`)).rows[0].ok;
await actor(1);assert.equal(await can(1),true);assert.equal(await can(2),true);assert.equal(await can(3),false);assert.equal(await can(4),false);assert.equal(await can(5),false);
const roster=(await db.query("select get_schedule_builder_data('bu','2026-11-23') r")).rows[0].r;assert.deepEqual(roster.sort(),[id(1),id(2)]);
await actor(7);assert.equal(await can(3),true);assert.equal(await can(4),false);
await actor(8);assert.equal(await can(4),true);assert.equal(await can(3),false);
await actor(6);assert.equal(await can(3),true);assert.equal(await can(4),true);assert.equal((await db.query("select get_schedule_builder_data('all','2026-11-23') r")).rows[0].r.length,8);
console.log('Passed: BUM self + operations, Sales/Finance exclusion, other BU exclusion, functional managers, global admin roster and edit access.');await db.close();
