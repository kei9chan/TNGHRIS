import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
await db.exec(`create schema private;create schema auth;create role authenticated;create role anon;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select '{"email":"fixture@example.invalid"}'::jsonb$$;
create function public.current_hris_user_id() returns uuid language sql stable as $$select auth.uid()$$;
create function public.current_data_scope() returns jsonb language sql stable as $$select jsonb_build_object('type',current_setting('test.scope'),'allowedBuIds',jsonb_build_array('${id(11)}'))$$;
create function public.has_feature_permission(text,text) returns boolean language sql stable as $$select $2<>'export' or current_setting('test.export')='yes'$$;
create function public.can_access_hris_user(uuid) returns boolean language sql stable as $$select true$$;
create function private.can_view_nte(uuid) returns boolean language sql stable as $$select $1<>'${id(204)}'::uuid$$;`);
await db.exec(fs.readFileSync(new URL('./caseRegisterSchema.sql',import.meta.url),'utf8'));
await db.exec(`create function public.get_accessible_hris_users() returns setof public.hris_users language sql stable security definer as $$select * from public.hris_users$$;
insert into public.hris_users(id,full_name,business_unit_id,department,position,employment_status) values('${id(1)}','Fixture HR','${id(11)}','HR','HR Manager','Regular'),('${id(2)}','Fixture Employee','${id(11)}','Operations','Associate','Regular');
insert into public.incident_reports(id,case_number,business_unit_id,business_unit_name,involved_employee_ids,involved_employee_names,status,description,category,created_at,date_time) values
('${id(101)}',1,'${id(11)}','BU A',array['${id(2)}'::uuid],array['Fixture Employee'],'Converted','Fixture incident','Attendance',now()-interval '12 days',now()-interval '13 days'),
('${id(102)}',2,'${id(12)}','BU B',array['${id(2)}'::uuid],array['Fixture Employee'],'Closed','Second fixture','Conduct',now()-interval '20 days',now()-interval '21 days'),
('${id(103)}',3,'${id(11)}','BU A',array['${id(2)}'::uuid],array['Fixture Employee'],'Converted','Restricted IR','Conduct',now(),now());
insert into public.ntes(id,incident_report_id,recipient_employee_id,nte_number,status,response_deadline,closed_at) values
('${id(201)}','${id(101)}','${id(2)}','1','Issued',now()-interval '1 day',null),
('${id(202)}','${id(102)}','${id(2)}','2','Closed',null,now()-interval '5 days');
insert into private.nte_receipts(nte_id,received_at,recorded_at,deadline_exclusive) values('${id(201)}',now()-interval '3 days',now(),now()-interval '1 day');
alter table public.incident_reports enable row level security;
create policy fixture_read on public.incident_reports for select to authenticated using(id<>'${id(103)}');
alter table public.audit_logs enable row level security;
create policy fixture_audit on public.audit_logs for insert to authenticated with check(user_id=auth.uid()::text);
grant usage on schema public,auth to authenticated;
grant select on all tables in schema public to authenticated;grant insert on public.audit_logs to authenticated;
set test.actor='${id(1)}';set test.scope='GLOBAL';set test.export='yes';`);
const migration=fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_case_monitoring_register.sql'));
await db.exec(fs.readFileSync(`supabase/migrations/${migration}`,'utf8'));
const boundary=fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_case_register_invoker_boundaries.sql'));
await db.exec(fs.readFileSync(`supabase/migrations/${boundary}`,'utf8'));
await db.exec('set role authenticated');
const query=async(f={},e=null,page=0,size=50)=>(await db.query('select public.get_case_register($1::jsonb,$2,$3,$4::jsonb) result',[JSON.stringify(f),page,size,e===null?null:JSON.stringify(e)])).rows[0].result;
let r=await query();assert.equal(r.total,2);assert.equal(r.summary.open,1);assert.equal(r.summary.closed,1);assert.equal(r.summary.overdue,1);assert.equal(r.summary.averageResolution,15);assert.equal(r.rows[0].action,null);assert.ok(r.rows[0].servedDate);assert.notEqual(r.rows[0].servedDate,r.rows[0].reportedDate);
await db.exec("set test.scope='HOME_ONLY'");r=await query();assert.equal(r.total,1);assert.equal((await query({buId:id(12)})).total,0);
await db.exec("set test.scope='SPECIFIC'");assert.equal((await query()).total,1);
await db.exec("set test.scope='SELF'");await assert.rejects(query(),/authorized organizational access/);
await db.exec("set test.scope='GLOBAL'");
assert.equal((await query({status:'Closed'})).total,1);assert.equal((await query({keyword:'TNGIR-00001'})).total,1);assert.equal((await query({},null,1,1)).rows.length,1);
const opts={format:'xlsx',layout:'detailed',columns:['reference','employee'],selectedIds:[id(201),id(103)]};
r=await query({},opts);assert.equal(r.total,1);assert.ok(r.auditId);
await db.exec("set test.export='no'");await assert.rejects(query({},opts),/export permission/);await db.exec("set test.export='yes'");
await assert.rejects(query({}, {...opts,selectedIds:[]}),/at least one/);
await db.query('select public.set_case_register_archive($1,true)',[id(202)]);assert.equal((await query({status:'Archived'})).total,1);
await db.query('select public.set_case_register_archive($1,false)',[id(202)]);assert.equal((await query({status:'Archived'})).total,0);
await assert.rejects(db.query('select public.set_case_register_archive($1,true)',[id(201)]),/closed case/);
await assert.rejects(db.query('insert into public.case_register_archives(row_key,incident_report_id,employee_id) values($1,$2,$3)',[id(201),id(101),id(2)]),/closed case/);
await db.exec('reset role');const audits=(await db.query("select details::jsonb details from public.audit_logs where action='EXPORT'")).rows;assert.equal(audits.length,1);assert.equal(audits[0].details.recordCount,1);
await db.exec('drop policy fixture_audit on public.audit_logs;set role authenticated');await assert.rejects(query({},opts),/row-level security/);
console.log('PASS: register mapping, RLS exclusion, global/BU/self scope, filters, pagination, selected export, mandatory audit, archive integrity.');
await db.close();
