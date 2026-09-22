import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite(), id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
await db.exec(`create schema private; create role anon; create role authenticated;
create table hris_users(id uuid primary key,auth_user_id uuid,full_name text,role text,email text,status text default 'active',is_duplicate boolean default false,created_at timestamptz default now());
create table payroll_pay_packages(id uuid primary key,employee_id uuid,scope_id uuid,created_by uuid,created_at timestamptz default now(),source_kind text default 'direct_entry',status text default 'draft',approval_state text default 'pending',approval_steps jsonb,source_metadata jsonb default '{}',source_hash text default 'ok',replaces_id uuid,engagement_key text,effective_from date,approved_by uuid,approved_at timestamptz,reason text);
create table payroll_pay_audit(employee_id uuid,scope_id uuid,package_id uuid,actor_id uuid,action text,reason text,previous_value jsonb,new_value jsonb,source text,calculation_version text);
create function private.payroll_actor_id() returns uuid language sql as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
create function public.current_hris_user_id() returns uuid language sql as $$select id from public.hris_users where auth_user_id=private.payroll_actor_id()$$;
create function private.payroll_source_hash(uuid) returns text language sql as $$select 'ok'::text$$;
insert into hris_users(id,auth_user_id,full_name,role,email) values
('${id(1)}','${id(11)}','Tejido, Jedediah','HR Manager','hr@example.com'),
('${id(2)}','${id(12)}','Casas, Lenny Rose','Manager','finance@example.com'),
('${id(3)}','${id(13)}','Kay Lacap','Board of Director','kay@thenextperience.com'),
('${id(4)}','${id(14)}','HR Staff','HR Staff','staff@example.com');`);
const actor=async n=>db.query("select set_config('test.actor',$1,false)",[id(n+10)]);
await db.exec(await fs.readFile(new URL('../supabase/migrations/20260921235506_pay_package_explicit_submission_signoff.sql',import.meta.url),'utf8'));
async function submit(n,p){await actor(n);await db.query(`insert into payroll_pay_packages(id,employee_id,created_by,approval_steps) values($1,$2,$3,private.direct_package_approval_steps($3))`,[id(p),id(4),id(n+10)]);}
async function review(n,p,approve=true){await actor(n);return db.query('select public.review_payroll_pay_package($1,$2,$3)',[id(p),approve,'Test review']);}
const state=async p=>(await db.query('select * from payroll_pay_packages where id=$1',[id(p)])).rows[0];
for(const n of [1,2,3]){
 const p=100+n;await submit(n,p);
 let row=await state(p);assert.equal(row.approval_steps.filter(s=>s.status==='Approved').length,1);assert.equal(row.approval_steps.find(s=>s.kind==='submission').userId,id(n));
 await assert.rejects(()=>review(n,p),/creator cannot approve/);
 await review(n===3?1:3,p);row=await state(p);assert.equal(row.status,'approved');assert.equal(new Set(row.approval_steps.filter(s=>s.status==='Approved').map(s=>s.userId)).size,2);
}
await submit(4,200);assert.equal((await state(200)).approval_steps.filter(s=>s.status==='Approved').length,0);
await review(1,200);assert.equal((await state(200)).status,'draft');
await assert.rejects(()=>review(1,200),/not an assigned pending approver/);
await review(3,200);assert.equal((await state(200)).status,'approved');
await submit(1,300);await assert.rejects(()=>review(4,300),/not an assigned pending approver/);await review(3,300,false);assert.equal((await state(300)).status,'rejected');
console.log('Passed: authorized submitters + independent review, HR Staff two reviews, self-review/duplicate/unassigned rejection, rejection flow.');
await db.close();
