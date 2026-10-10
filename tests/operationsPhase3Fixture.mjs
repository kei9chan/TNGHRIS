import fs from 'node:fs';
import {createOperationsFixture,id} from './operationsFixture.mjs';
export {id};
export async function createPhase3Fixture(dir){
 const db=await createOperationsFixture(dir);
 await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('test.actor',true),''))::uuid$$;
 create table public.payroll_schedule_publications(id uuid primary key default gen_random_uuid(),employee_id uuid,business_unit_id uuid,effective_from date,effective_to date,version int default 1,snapshot jsonb,approval_required bool default false,published_at timestamptz default now());
 create table public.payroll_schedule_overrides(publication_id uuid,decision text);
 create table private.payroll_actual_days(employee_id uuid,work_date date,events jsonb,day_status text,updated_at timestamptz default now());
 create schema attendance_issues;create table attendance_issues.requests(employee_id uuid,work_date date,kind text,status text);
 create table private.test_days(employee_id uuid,work_date date,data jsonb,schedule jsonb,primary key(employee_id,work_date));
 create function private.attendance_day(e uuid,d date) returns jsonb language sql stable as $$select coalesce((select data from private.test_days where employee_id=e and work_date=d),'{}')$$;
 create function private.attendance_schedule(e uuid,d date) returns jsonb language sql stable as $$select coalesce((select schedule from private.test_days where employee_id=e and work_date=d),'{}')$$;
 create table public.notifications(id uuid primary key default gen_random_uuid(),user_id text,type text,title text,message text,link text,related_entity_id text,dedupe_key text,is_read bool default false,created_at timestamptz default now(),unique(user_id,dedupe_key));`);
 await db.exec(fs.readFileSync('supabase/migrations/20261010052026_operations_phase3_automation_coverage.sql','utf8'));await db.exec(fs.readFileSync('supabase/migrations/20261010054426_operations_phase3_assignment_integrity.sql','utf8'));await db.exec(fs.readFileSync('supabase/migrations/20261010054627_operations_phase3_shared_responsibility.sql','utf8'));return db;
}
