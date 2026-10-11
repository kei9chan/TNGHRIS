import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createReviewFixture,id} from './operationsReviewFixture.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tng-creation-'));const db=await createReviewFixture(dir);
const migration='supabase/migrations/20261011021039_operations_creation_studio.sql';
const actor=async n=>db.exec(`reset role;set test.actor='${n?id(n):''}';set role authenticated;`);
const rpc=async(name,args=[]) => (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
const today=(await db.query("select (now() at time zone 'Asia/Manila')::date::text d")).rows[0].d;
const config={frequency:'daily',interval:1,start_date:today,end_date:'',mode:'shift',execution:'shared',timezone:'Asia/Manila',anchor:'fixed',start_time:'08:00',end_time:'12:00',due_time:'11:30',end_day_offset:0,due_day_offset:0,employee_ids:[id(13),id(15)],backup_ids:[],preferred_owner:id(13),auto_backup:false,allow_claim:true,weekdays:[1,2,3,4,5,6,7],month_day:1,short_month:'skip',horizon_days:1,grace_minutes:15,remind_before:30,overdue_every:120,priority:'Normal',department_id:'',position:'',role:'',reference_employee:'',start_offset:0,duration_minutes:60,due_offset:60,instructions:'',requires_verification:false,excluded_dates:[]};
const content=(title,enabled=true,c=config)=>({title,instructions:'Clean the kitchen.',evidence:'photo',priority:'Normal',creation:{enabled,config:c}});
const save=(body,publish=true,existing=null,rev=null,c=config,rr=null,kind='task',unit=id(1))=>rpc('ops_save_creation',[existing,unit,kind,body,rev,publish,c,rr]);
try {
 await actor(11);
 const legacyTemplate=await rpc('ops_save_template',[null,id(1),'task',{title:'Existing daily task'},null,true]);
 const legacyVersion=(await rpc('ops_workspace',[id(1)])).templates.find(x=>x.id===legacyTemplate).versions[0].id;
 const legacyRule=await rpc('ops_save_rule',[null,id(1),'Existing daily schedule',legacyVersion,config,'Active',null,'']);
 await db.exec('reset role');await db.exec(fs.readFileSync(migration,'utf8'));await actor(11);
 assert.equal((await rpc('ops_creation_state',[legacyTemplate])).rule.id,legacyRule);

 const before=(await rpc('ops_workspace',[id(1)])).templates.length;
 // A bad schedule must roll back the new template and published version too.
 await assert.rejects(()=>save(content('Invalid schedule'),true,null,null,{...config,due_time:'14:00'}),/Deadline/);
 assert.equal((await rpc('ops_workspace',[id(1)])).templates.length,before);
 const draft=await save(content('Kitchen Closing'),false);assert.equal(draft.rule_id,null);assert.equal(draft.version_id,null);
 let t=(await rpc('ops_workspace',[id(1)])).templates.find(t=>t.id===draft.template_id);assert.equal(t.status,'Draft');
 const published=await save(t.draft,true,t.id,t.revision);assert.ok(published.rule_id);assert.ok(published.version_id);
 const state=await rpc('ops_creation_state',[t.id]);assert.equal(state.rule.status,'Active');assert.equal(state.rule.revision,1);
 // Already-generated assignments retain their published content when the library is edited.
 await db.exec('reset role');
 for(const employee of [13,15])await db.query('insert into payroll_schedule_publications(employee_id,business_unit_id,effective_from,effective_to,snapshot) values($1,$2,$3,$3,$4)',[id(employee),id(1),today,[{date:today,kind:'work',start:'08:00',end:'17:00'}]]);
 await actor(11);await rpc('ops_retry_rule',[published.rule_id]);
 const assigned=(await rpc('ops_workspace',[id(1)])).assignments.find(x=>x.template_version_id===published.version_id);assert.ok(assigned);

 // Saving a draft with different dates leaves the live rule unchanged.
 t=(await rpc('ops_workspace',[id(1)])).templates.find(x=>x.id===draft.template_id);
 const newConfig={...config,due_time:'10:00'};
 await save(content('Kitchen Closing draft',true,newConfig),false,t.id,t.revision,newConfig,1);
 assert.equal((await rpc('ops_creation_state',[t.id])).rule.config.due_time,'11:30');
 t=(await rpc('ops_workspace',[id(1)])).templates.find(t=>t.id===draft.template_id);assert.equal(t.draft.creation.pending,true);
 await assert.rejects(()=>save(content('Stale plan'),true,t.id,t.revision,config,0),/Schedule changed/);
 assert.equal((await rpc('ops_workspace',[id(1)])).templates.find(x=>x.id===t.id).latest_version,1);
 // Publishing updates the same rule rather than creating a second schedule.
 const updated=await save(content('Kitchen Closing',true,newConfig),true,t.id,t.revision,newConfig,1);assert.equal(updated.rule_id,published.rule_id);
 let current=await rpc('ops_creation_state',[t.id]);assert.equal(current.rule.revision,2);assert.equal(current.rule.config.due_time,'10:00');
 const frozen=(await rpc('ops_workspace',[id(1)])).assignments.find(x=>x.id===assigned.id);
 assert.equal(frozen.template_version_id,published.version_id);assert.equal(frozen.due_at,assigned.due_at);assert.equal(frozen.content.instructions,assigned.content.instructions);

 // Disabling the schedule pauses future generation without deleting the rule.
 t=(await rpc('ops_workspace',[id(1)])).templates.find(x=>x.id===t.id);
 await save(content('Kitchen Closing',false),true,t.id,t.revision,null,2);assert.equal((await rpc('ops_creation_state',[t.id])).rule.status,'Paused');
 // Copies never share the original template's linked schedule.
 t=(await rpc('ops_workspace',[id(1)])).templates.find(x=>x.id===t.id);
 const copied=await rpc('ops_template_action',[t.id,id(1),'duplicate',t.revision]);
 let cp=(await rpc('ops_workspace',[id(1)])).templates.find(x=>x.id===copied);assert.equal((await rpc('ops_creation_state',[copied])).rule,null);
 const copySaved=await save(cp.draft,true,cp.id,cp.revision,config,null);assert.notEqual(copySaved.rule_id,published.rule_id);
 // Old library item references resolve to the newest published task on publication.
 const task=await rpc('ops_save_template',[null,id(1),'task',{title:'Bar wipe down',instructions:'Old instructions'},null,true]);
 let source=(await rpc('ops_workspace',[id(1)])).templates.find(x=>x.id===task);const old=source.versions[0].id;
 await rpc('ops_save_template',[task,id(1),'task',{title:'Bar wipe down',instructions:'Newest instructions'},source.revision,true]);
 source=(await rpc('ops_workspace',[id(1)])).templates.find(x=>x.id===task);const newest=source.versions[0].id;
 const checklist=await save({title:'Bar Closing',items:[{task_version_id:old,required:true,response_type:'none'}]},true,null,null,null,null,'checklist');
 const cv=(await rpc('ops_workspace',[id(1)])).templates.find(x=>x.id===checklist.template_id).versions[0];assert.equal(cv.items[0].task_version_id,newest);assert.equal(cv.items[0].snapshot.instructions,'Newest instructions');
 // Permission checks protect both libraries and schedules across units.
 await actor(12);await assert.rejects(()=>rpc('ops_creation_state',[t.id]),/unavailable/i);await assert.rejects(()=>save(content('Cross unit task')),/cannot edit/i);
 await actor(null);await assert.rejects(()=>save(content('Anonymous task')),/sign.?in|session|authenticated/i);
 await db.exec('reset role');const privileges=await db.query("select has_function_privilege('anon','public.ops_save_creation(uuid,uuid,text,jsonb,integer,boolean,jsonb,integer)','execute') anon,has_function_privilege('authenticated','public.ops_save_creation(uuid,uuid,text,jsonb,integer,boolean,jsonb,integer)','execute') staff");assert.equal(privileges.rows[0].anon,false);assert.equal(privileges.rows[0].staff,true);
 console.log('Creation studio: atomic publish, rollback, drafts, linked schedule updates, pause, duplication, latest checklist tasks, concurrency and authorization passed.');
} finally {await db.close();fs.rmSync(dir,{recursive:true,force:true});}
