import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
await db.exec(`
 create role authenticated;create role anon;create schema private;
 create function public.current_hris_user_id() returns uuid language sql stable as $$ select nullif(current_setting('test.actor',true),'')::uuid $$;
 create function private.payroll_actor_id() returns uuid language sql stable as $$ select public.current_hris_user_id() $$;
 create table pans(id uuid primary key,status text,routing_steps jsonb,particulars jsonb,action_taken jsonb,notes text,effective_date date);
 create table job_requisitions(id uuid primary key,status text,routing_steps jsonb,headcount int,employment_type text,seasonal_months int,budgeted_salary_min numeric,budgeted_salary_max numeric,work_location text,location_type text,justification text,is_urgent boolean);
 create table payroll_pay_packages(id uuid primary key,employee_id uuid,scope_id uuid,engagement_key text,stream text,effective_from date,rate_type text,base_amount numeric,components jsonb,treatment jsonb,reason text,status text,approval_state text,source_kind text,created_by uuid,approval_steps jsonb,approved_at timestamptz,created_at timestamptz,correction_of_id uuid,replaces_id uuid);
 create table decisions(kind text,id uuid,actor uuid);
 -- Canonical decision fixtures only record delegation. The migration must never
 -- implement or replace the domain workflow; those APIs retain their own rules.
 create function public.approve_pan(p_id uuid,p_comment text) returns void language plpgsql as $$begin
   insert into public.decisions values('pan',p_id,public.current_hris_user_id());
   update public.pans set routing_steps=jsonb_set(routing_steps,'{0,status}','"Approved"') where id=p_id;
 end$$;
 create function public.process_job_requisition_approval(p_id uuid,p_decision text,p_reason text) returns void language plpgsql as $$begin
   if p_decision<>'approve' then raise exception 'Incorrect delegation';end if;
   insert into public.decisions values('requisition',p_id,public.current_hris_user_id());
   update public.job_requisitions set routing_steps=jsonb_set(routing_steps,'{0,status}','"Approved"') where id=p_id;
 end$$;
 create function public.review_payroll_pay_package(p_id uuid,p_approve boolean,p_reason text) returns void language plpgsql as $$begin
   if not p_approve then raise exception 'Incorrect delegation';end if;
   insert into public.decisions values('pay_package',p_id,public.current_hris_user_id());
   update public.payroll_pay_packages set approval_steps=jsonb_set(approval_steps,'{0,status}','"Approved"') where id=p_id;
 end$$;
 insert into pans values('${id(10)}','Pending Approval','[{"userId":"${id(1)}","status":"Pending"},{"userId":"${id(2)}","status":"Pending"}]','{"from":{"position":"Assistant"},"to":{"position":"Supervisor"}}','{"promotion":true}','Promotion','2026-12-01');
 insert into job_requisitions values('${id(11)}','PendingApproval','[{"userId":"${id(1)}","status":"Pending"},{"userId":"${id(2)}","status":"Waiting"}]',3,'Seasonal',5,20000,25000,'Fixture','Onsite','Seasonal help',false);
 insert into payroll_pay_packages(id,employee_id,scope_id,engagement_key,stream,effective_from,rate_type,base_amount,components,treatment,status,approval_state,source_kind,created_by,approval_steps,created_at) values
 ('${id(12)}','${id(50)}','${id(60)}','main','primary','2026-12-01','Daily',600,'[]','{}','draft','pending','direct_entry','${id(3)}','[{"userId":"${id(1)}","status":"Pending"},{"userId":"${id(2)}","status":"Pending"}]',now()),
 ('${id(13)}','${id(50)}','${id(60)}','main','primary','2026-11-01','Daily',500,'[]','{}','approved','approved','direct_entry','${id(3)}','[]',now()),
 ('${id(14)}','${id(50)}','${id(61)}','main','primary','2026-11-30','Monthly',90000,'[]','{}','approved','approved','direct_entry','${id(3)}','[]',now()),
 ('${id(15)}','${id(50)}','${id(60)}','main','primary','2027-01-01','Daily',900,'[]','{}','approved','approved','direct_entry','${id(3)}','[]',now());
`);
await db.exec(fs.readFileSync('supabase/migrations/20261125001446_approval_change_previews_batch.sql','utf8'));
const actor=async n=>{await db.exec(`reset role;select set_config('test.actor','${n?id(n):''}',false);set role authenticated;`);};
const previews=async(kind,ids)=> (await db.query('select public.get_approval_change_previews($1,$2) result',[kind,ids])).rows[0].result;
const approve=async(kind,item,snapshot)=> (await db.query('select public.approve_change_queue_item($1,$2,$3) result',[kind,item,snapshot])).rows[0].result;
await actor(null);await assert.rejects(()=>previews('pan',[id(10)]),/Authentication/);
await actor(4);assert.deepEqual(await previews('pan',[id(10)]),[]);assert.equal((await approve('pan',id(10),'x')).outcome,'skipped');
await actor(3);assert.deepEqual(await previews('pay_package',[id(12)]),[],'Creator cannot approve own package.');
await actor(1);
await assert.rejects(()=>db.query("select private.approval_change_preview('pan',$1)",[id(10)]),/permission denied/);
await assert.rejects(()=>previews('pan',Array.from({length:251},()=>id(10))),/250/);
for(const [kind,n]of [['pan',10],['requisition',11],['pay_package',12]]) {
 const rows=await previews(kind,[id(n),id(n)]);assert.equal(rows.length,1);
 let row=rows[0];assert.equal(row.kind,kind);
 if(kind==='pay_package'){assert.equal(row.data.previous.base_amount,500);assert.equal(row.data.proposed.base_amount,600);}
 assert.equal((await approve(kind,id(n),'old')).outcome,'skipped');
 await db.exec('reset role;');
 if(kind==='pan')await db.exec(`update pans set notes='Updated reason' where id='${id(n)}'`);
 if(kind==='requisition')await db.exec(`update job_requisitions set budgeted_salary_max=30000 where id='${id(n)}'`);
 if(kind==='pay_package')await db.exec(`update payroll_pay_packages set base_amount=650 where id='${id(n)}'`);
 await actor(1);
 assert.equal((await approve(kind,id(n),row.snapshot)).outcome,'skipped','Reject details edited after preview.');
 row=(await previews(kind,[id(n)]))[0];
 assert.equal((await approve(kind,id(n),row.snapshot)).outcome,'approved');
 assert.equal((await approve(kind,id(n),row.snapshot)).outcome,'skipped','No duplicate approval on retry.');
}
await db.exec('reset role;');
assert.equal((await db.query('select count(*)::int n from decisions')).rows[0].n,3);
assert.equal((await db.query(`select approval_steps->1->>'status' status from payroll_pay_packages where id='${id(12)}'`)).rows[0].status,'Pending','Other sign-off stays pending.');
assert.equal((await db.query(`select routing_steps->1->>'status' status from job_requisitions where id='${id(11)}'`)).rows[0].status,'Waiting','Later requisition stage is not bypassed.');
await actor(2);
assert.equal((await previews('pay_package',[id(12)])).length,1,'Second approver retains own pending task.');
await db.exec(`reset role;update payroll_pay_packages set source_kind='approved_pan' where id='${id(12)}';`);
await actor(2);assert.deepEqual(await previews('pay_package',[id(12)]),[],'PAN-derived packages do not get a second approval.');
await db.exec('reset role;set role anon;');
await assert.rejects(()=>previews('pan',[id(10)]),/permission denied/);
await assert.rejects(()=>approve('pan',id(10),'x'),/permission denied/);
await db.close();
console.log('Approval change database tests passed: exact assignment, creator exclusion, stale data, retries, retained stages and baseline matching.');
