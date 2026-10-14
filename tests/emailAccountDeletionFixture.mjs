import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
export const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export async function createEmailDeletionFixture(){
const db=new PGlite();
const migration='supabase/migrations/20261014081838_hr_email_account_deletion_approval.sql';
await db.exec(`create schema auth;create schema private;create role authenticated;create role anon;create role service_role bypassrls;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
create function auth.role() returns text language sql stable as $$select current_setting('test.role',true)$$;
create table auth.users(id uuid primary key,email text,deleted_at timestamptz);
create table public.hris_users(id uuid primary key,auth_user_id uuid references auth.users(id),full_name text,email text,role text,status text,account_lifecycle_reason text,account_inactivated_at timestamptz,account_inactivated_by uuid);
create table public.roles(id text primary key,is_active boolean default true);
create table public.user_roles(user_id uuid references public.hris_users(id),role_id text references public.roles(id),is_active boolean default true);
create table public.audit_logs(id uuid default gen_random_uuid(),user_id text,user_email text,action text,entity text,entity_id text,details text);
create table public.notifications(user_id text,type text,title text,message text,link text,related_entity_id text,is_read boolean,dedupe_key text,unique(user_id,dedupe_key));
create table public.payroll_history(employee_id uuid references public.hris_users(id),amount numeric);
create table public.attendance_history(employee_id uuid references public.hris_users(id),work_date date);
create function public.current_hris_user_id() returns uuid language sql stable security definer set search_path='' as $$select id from public.hris_users where auth_user_id=auth.uid() and lower(status)='active'$$;
create function public.has_active_role(p_role text) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.user_roles u join public.roles r on r.id=u.role_id where u.user_id=public.current_hris_user_id() and u.is_active and r.is_active and r.id=p_role)$$;
create function public.can_access_hris_user(p_target uuid) returns boolean language sql stable security definer set search_path='' as $$select public.current_hris_user_id()=p_target or public.has_active_role('HR Manager') or public.has_active_role('Board of Director')$$;
create function public.approval_email_actor_allowed(p_actor uuid) returns boolean language sql stable security definer set search_path='' as $$select p_actor is not null and (p_actor=public.current_hris_user_id() or auth.role()='service_role') and exists(select 1 from public.hris_users where id=p_actor and lower(status)='active' and auth_user_id is not null)$$;
create function public.get_actionable_approval_tasks_for_actor(p_actor uuid) returns table(request_type text,request_id uuid,type_label text) language sql stable as $$select 'leave','${id(500)}'::uuid,'Leave Requests' where public.approval_email_actor_allowed(p_actor)$$;
create function public.get_my_actionable_approval_tasks() returns table(request_type text,request_id uuid,type_label text) language sql stable as $$select * from public.get_actionable_approval_tasks_for_actor(public.current_hris_user_id())$$;
grant execute on function public.get_my_actionable_approval_tasks() to authenticated;
insert into public.roles(id) values('HR Manager'),('Board of Director'),('Admin'),('Employee');`);
for(const [n,name,email,role] of [[10,'Kay Lacap','kay@thenextperience.com','Board of Director'],[11,'Jedediah Tejido','hrs@thenextperience.com','HR Manager'],[12,'Other BOD','other-bod@example.invalid','Board of Director'],[13,'Employee','old@example.invalid','Employee'],[14,'Admin','admin@example.invalid','Admin'],[15,'Other HR Manager','other-hr@example.invalid','HR Manager'],[20,'Rejected employee','rejected@example.invalid','Employee'],[30,'Stale employee','stale@example.invalid','Employee']]){
 await db.query('insert into auth.users(id,email) values($1,$2)',[id(n),email]);
 await db.query("insert into hris_users(id,auth_user_id,full_name,email,role,status) values($1,$1,$2,$3,$4,'Active')",[id(n),name,email,role]);
 await db.query('insert into user_roles(user_id,role_id) values($1,$2)',[id(n),role]);
}
await db.exec(`insert into payroll_history values('${id(13)}',15000);insert into attendance_history values('${id(13)}','2026-10-13');`);
await db.exec(fs.readFileSync(migration,'utf8'));
const actor=async(n,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('test.actor',$1,false),set_config('test.role',$2,false)",[n?id(n):'',role]);await db.exec(`set role ${role}`);};
const rpc=async(name,args=[])=>{const params=args.map((_,i)=>'$'+(i+1)).join(',');return(await db.query(`select public.${name}(${params}) value`,args)).rows[0].value;};
return {db,actor,rpc};
}
