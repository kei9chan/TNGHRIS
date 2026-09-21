import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

await db.exec(`
create role authenticated;
create role anon;
create schema auth;
create schema private;
create schema schedule_compliance;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.actor', true), '')::uuid
$$;
create table public.hris_users(
  id uuid primary key,
  auth_user_id uuid,
  role text,
  status text default 'Active',
  reports_to text,
  business_unit_id uuid
);
create function public.current_hris_user_id() returns uuid language sql stable security definer as $$
  select id from public.hris_users where auth_user_id = auth.uid()
$$;
create function private.payroll_actor_id() returns uuid language sql stable security definer as $$
  select auth_user_id from public.hris_users where auth_user_id = auth.uid() and status = 'Active'
$$;
create function private.workflow_user_has_role(p_user uuid, p_role text) returns boolean language sql stable as $$
  select exists(select 1 from public.hris_users where id = p_user and role = p_role and status = 'Active')
$$;
create function schedule_compliance.bod_manager(p_employee uuid) returns uuid language sql stable security definer as $$
  select manager.id
  from public.hris_users employee
  join public.hris_users manager on manager.id::text = employee.reports_to
  where employee.id = p_employee
    and manager.status = 'Active'
    and manager.role in ('Board of Director', 'GeneralManager')
$$;
create function private.schedule_preset_visible(p_creator uuid) returns boolean language sql stable security definer as $$
  select exists(
    select 1 from public.hris_users actor
    where actor.auth_user_id = auth.uid()
      and (actor.id = p_creator or actor.reports_to = p_creator::text)
  )
$$;
create table public.shift_templates(
  id uuid primary key,
  business_unit_id uuid,
  created_by uuid
);
create table public.shift_assignments(
  id uuid primary key default gen_random_uuid(),
  employee_id uuid,
  shift_template_id uuid,
  date date,
  business_unit_id uuid,
  created_by uuid,
  notes text
);
create table schedule_compliance.submissions(
  id uuid primary key,
  employee_id uuid,
  manager_id uuid,
  week date,
  entries jsonb,
  status text
);
create function private.schedule_assignment_preset_guard() returns trigger language plpgsql as $$begin return new;end$$;
create trigger schedule_assignment_preset before insert or update on public.shift_assignments
for each row execute function private.schedule_assignment_preset_guard();
grant usage on schema public to authenticated;
grant insert, select on public.shift_assignments to authenticated;
`);

await db.exec(fs.readFileSync('supabase/migrations/20260921013711_gm_schedule_approval_preset_authorization.sql', 'utf8'));

const bu = id(10), creator = id(1), employee = id(2), gm = id(3), outsider = id(4);
const template = id(20), submission = id(30);
await db.query(`insert into public.hris_users(id,auth_user_id,role,reports_to,business_unit_id) values
  ($1::uuid,$1::uuid,'Manager',null,$5::uuid),
  ($2::uuid,$2::uuid,'Employee',$3::uuid::text,$5::uuid),
  ($3::uuid,$3::uuid,'GeneralManager',null,$5::uuid),
  ($4::uuid,$4::uuid,'GeneralManager',null,$5::uuid)`, [creator, employee, gm, outsider, bu]);
await db.query('insert into public.shift_templates(id,business_unit_id,created_by) values($1,$2,$3)', [template, bu, creator]);
await db.query(`insert into schedule_compliance.submissions(id,employee_id,manager_id,week,entries,status)
values($1,$2,$3,'2026-09-21',$4::jsonb,'Pending')`, [submission, employee, gm, JSON.stringify([
  {date: '2026-09-23', templateId: template, restDay: false}
])]);

const actor = async value => {
  await db.exec('reset role');
  await db.query("select set_config('test.actor',$1,false)", [value]);
  await db.exec('set role authenticated');
};

await actor(gm);
await db.query(`insert into public.shift_assignments(employee_id,shift_template_id,date,business_unit_id,created_by,notes)
values($1,$2,'2026-09-23',$3,$4,$5)`, [employee, template, bu, gm, `Employee submission approved: ${submission}`]);
assert.equal((await db.query('select count(*)::int as count from public.shift_assignments')).rows[0].count, 1);

await assert.rejects(
  () => db.query(`insert into public.shift_assignments(employee_id,shift_template_id,date,business_unit_id,created_by,notes)
    values($1,$2,'2026-09-24',$3,$4,'Manual GM assignment')`, [employee, template, bu, gm]),
  /current reporting line/
);
await assert.rejects(
  () => db.query(`insert into public.shift_assignments(employee_id,shift_template_id,date,business_unit_id,created_by,notes)
    values($1,$2,'2026-09-24',$3,$4,$5)`, [employee, template, bu, gm, `Employee submission approved: ${submission}`]),
  /current reporting line/
);

await actor(outsider);
await assert.rejects(
  () => db.query(`insert into public.shift_assignments(employee_id,shift_template_id,date,business_unit_id,created_by,notes)
    values($1,$2,'2026-09-23',$3,$4,$5)`, [employee, template, bu, outsider, `Employee submission approved: ${submission}`]),
  /current reporting line/
);

console.log('PASS: assigned GM can apply the exact submitted preset; unrelated dates, manual reuse, and other GMs remain blocked.');
await db.close();
