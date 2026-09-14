// Local-only PostgreSQL test. Install @electric-sql/pglite in a temporary directory
// and set PGLITE_MODULE to its dist/index.js; no production connection is used.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite();
const originalFile=readFileSync('supabase/migrations/20260823210000_complete_rbac_repair.sql','utf8');
const start=originalFile.indexOf('create or replace function public.get_accessible_hris_users()');
const old=originalFile.slice(start,originalFile.indexOf('$$;',start)+3);
const next=readFileSync('supabase/migrations/20260914150812_cache_directory_mask_permissions.sql','utf8');
const columns=[...new Set([...old.matchAll(/row_value\.(\w+) := null/g)].map(m=>m[1]))].filter(x=>x!=='auth_user_id');
await db.exec(`create table public.hris_users(id uuid primary key,auth_user_id uuid,${columns.map(c=>c+' text').join(',')});
create sequence public.permission_calls;
create function public.current_hris_user_id() returns uuid language sql stable as $$select nullif(current_setting('test.viewer'),'')::uuid$$;
create function public.can_access_hris_user(target uuid) returns boolean language sql stable as $$select target in (select id from public.hris_users order by id limit current_setting('test.visible')::int)$$;
create function public.has_feature_permission(resource text,action text) returns boolean language plpgsql stable as $$begin perform nextval('public.permission_calls');return (current_setting('test.mask')::jsonb->>resource)::boolean;end$$;
create function public.has_sensitive_permission(field text) returns boolean language plpgsql stable as $$begin perform nextval('public.permission_calls');return (current_setting('test.mask')::jsonb->>field)::boolean;end$$;
insert into public.hris_users select md5(n::text)::uuid,md5(('auth'||n)::text)::uuid,${columns.map(()=>"'synthetic'").join(',')} from generate_series(1,150)n;`);
const viewer=(await db.query('select id from public.hris_users order by id limit 1')).rows[0].id;
const keys=['PersonalInformation','sss','tin','pagibig','philhealth','bank_information','salary_compensation'];
const scenarios=[{visible:0,mask:{}},{visible:1,mask:{}},{visible:8,mask:{}},{visible:150,mask:Object.fromEntries(keys.map(k=>[k,false]))},{visible:150,mask:Object.fromEntries(keys.map(k=>[k,true]))},{visible:150,mask:{sss:true,tin:false,bank_information:true}}];
let comparisons=0;
for(const scenario of scenarios){
 await db.query("select set_config('test.viewer',$1,false),set_config('test.visible',$2,false),set_config('test.mask',$3,false)",[viewer,String(scenario.visible),JSON.stringify(scenario.mask)]);
 await db.exec(old);const before=(await db.query('select * from public.get_accessible_hris_users() order by id')).rows;
 await db.exec(next);const after=(await db.query('select * from public.get_accessible_hris_users() order by id')).rows;
 assert.deepEqual(after,before);comparisons++;
}
await db.query("select set_config('test.visible','150',false),set_config('test.mask',$1,false)",[JSON.stringify(Object.fromEntries(keys.map(k=>[k,false])))]);
async function count(sql){await db.exec(sql);await db.exec('alter sequence public.permission_calls restart with 1');await db.query('select count(*) from public.get_accessible_hris_users()');return Number((await db.query('select last_value from public.permission_calls')).rows[0].last_value);}
const beforeCalls=await count(old),afterCalls=await count(next);
assert.equal(beforeCalls,149*7);assert.equal(afterCalls,7);
console.log(JSON.stringify({comparisons,beforeCalls,afterCalls,result:'PASS: identical directory rows and masks; 1043 permission checks reduced to 7'}));
await db.close();
