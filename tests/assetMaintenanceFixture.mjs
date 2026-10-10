import fs from 'node:fs';
import {createPhase3Fixture,id} from './operationsPhase3Fixture.mjs';
export {id};
export const migrationPath='supabase/migrations/20261010075343_asset_maintenance_eligibility.sql';
export async function createAssetMaintenanceFixture(dir){
 const db=await createPhase3Fixture(dir);
 await db.exec(`alter table assets alter column id set default gen_random_uuid();
 alter table assets add column asset_tag text unique,add column type text default 'Other',add column serial_number text,add column brand text,add column model text,add column description text,add column purchase_date date,add column value numeric default 0,add column notes text,add column condition text,add column warranty_expiry date,add column created_at timestamptz default now(),add column updated_at timestamptz default now();
 create type public.asset_status as enum('Available','Assigned','In Repair','Retired');alter table assets add column status public.asset_status default 'Available';
 alter table assets add constraint assets_type_check check(type in('Laptop','Mobile Phone','Monitor','Software License','Other'));
 alter table business_units add column code text;alter table hris_users add column email text;
 create function public.is_system_admin() returns boolean language sql stable security definer set search_path='' as $$select public.current_hris_user_id()='${id(10)}'::uuid$$;
 create function public.has_feature_permission(text,text) returns boolean language sql stable security definer set search_path='' as $$select public.is_system_admin()$$;
 create function public.is_hr_or_admin() returns boolean language sql stable security definer set search_path='' as $$select public.is_system_admin()$$;
 create table public.asset_assignments(id uuid primary key default gen_random_uuid(),asset_id uuid,employee_id uuid,date_assigned timestamptz,condition_on_assign text,is_acknowledged bool);
 create table public.audit_logs(user_id text,user_email text,action text,entity text,entity_id text,details text);
 alter table assets enable row level security;grant select,insert,update on assets to authenticated;
 create policy assets_employee_read on assets for select to authenticated using(true);
 create policy assets_hr_admin_all on assets for all to authenticated using(public.is_hr_or_admin()) with check(public.is_hr_or_admin());
 insert into assets(id,name,business_unit_id,asset_tag,type) values('${id(51)}','Office laptop','${id(1)}','LAPTOP-1','Laptop');`);
 await db.exec(fs.readFileSync(migrationPath,'utf8'));
 await db.exec(`grant execute on function public.import_assets_batch(jsonb) to authenticated;revoke all on function public.import_assets_batch(jsonb) from public,anon;`);
 return db;
}
