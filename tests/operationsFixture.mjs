import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
export const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export async function createOperationsFixture(dataDir){
 const db=new PGlite(dataDir);
 await db.exec(`create schema auth;create schema private;create role authenticated;create role anon;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
create function public.current_hris_user_id() returns uuid language plpgsql stable as $$begin return (select id from public.hris_users where auth_user_id=auth.uid() and lower(status)='active');end$$;
create table public.hris_users(id uuid primary key,auth_user_id uuid,full_name text,employee_id text,status text,business_unit_id uuid,department_id uuid,position text,reports_to text);
create table public.business_units(id uuid primary key,name text);
create table public.departments(id uuid primary key,business_unit_id uuid,name text);
create table public.assets(id uuid primary key,name text,business_unit_id text);
create table public.roles(id text primary key,is_active boolean default true);
create table public.user_roles(user_id uuid,role_id text,is_active boolean default true,scope_type text,allowed_business_unit_ids uuid[] default '{}');
create function private.is_direct_reporting_manager(a uuid,e uuid) returns boolean language sql stable as $$select exists(select 1 from public.hris_users where id=e and reports_to=a::text)$$;
insert into public.business_units values('${id(1)}','Unit A'),('${id(2)}','Unit B');
insert into public.departments values('${id(3)}','${id(1)}','Bar'),('${id(4)}','${id(2)}','Kitchen');
insert into public.roles(id) values('Admin'),('Board of Director'),('Business Unit Manager'),('Manager'),('Employee');
insert into public.hris_users values
('${id(10)}','${id(10)}','BOD','10','Active',null,null,'Director',null),
('${id(11)}','${id(11)}','BUM A','11','Active','${id(1)}','${id(3)}','BUM',null),
('${id(12)}','${id(12)}','BUM B','12','Active','${id(2)}','${id(4)}','BUM',null),
('${id(13)}','${id(13)}','Employee A','13','Active','${id(1)}','${id(3)}','Staff','${id(15)}'),
('${id(14)}','${id(14)}','Employee B','14','Active','${id(2)}','${id(4)}','Staff',null),
('${id(15)}','${id(15)}','Supervisor A','15','Active','${id(1)}','${id(3)}','Supervisor','${id(11)}'),
('${id(16)}','${id(16)}','Multi-unit BUM','16','Active','${id(1)}','${id(3)}','BUM',null);
insert into public.user_roles(user_id,role_id,scope_type,allowed_business_unit_ids) values
('${id(10)}','Board of Director','GLOBAL','{}'),('${id(11)}','Business Unit Manager','HOME_ONLY','{}'),('${id(12)}','Business Unit Manager','HOME_ONLY','{}'),('${id(13)}','Employee','HOME_ONLY','{}'),('${id(14)}','Employee','HOME_ONLY','{}'),('${id(15)}','Manager','DIRECT_REPORTS','{}'),('${id(16)}','Business Unit Manager','SPECIFIC',array['${id(1)}','${id(2)}']::uuid[]);`);
 await db.exec(fs.readFileSync('supabase/migrations/20261010005116_operations_station_phase1.sql','utf8'));
 return db;
}
