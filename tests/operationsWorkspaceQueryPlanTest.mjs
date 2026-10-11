import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createReviewFixture,id,workspacePlanMigration,workspaceAssemblyMigration} from './operationsReviewFixture.mjs';

const dir=mkdtempSync(join(tmpdir(),'tng-workspace-plans-'));
const db=await createReviewFixture(dir,undefined,[workspacePlanMigration,workspaceAssemblyMigration,'20261011070931_operations_fast_overview_and_detail.sql','20261011071609_operations_overview_payload_trim.sql']);
const actor=n=>db.exec(`reset role;set test.actor='${id(n)}';set role authenticated`);
const rpc=async(name,args=[]) => (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
const normalize=value=>Array.isArray(value)?value.map(normalize).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,normalize(v)])):value;
try {
 await actor(10);
 const template=await rpc('ops_save_template',[null,id(1),'checklist',{title:'Shared checklist load regression',review_mode:'Individual Verification',items:Array.from({length:10},(_,i)=>({snapshot:{title:'Check '+i},response_type:'yes_no',required:true}))},null,true]);
 const version=(await rpc('ops_workspace',[id(1)])).templates.find(t=>t.id===template).versions[0].id;
 for(let i=0;i<24;i++)await rpc('ops_assign',[id(1),version,{mode:'individual',phase:'2',ids:[id(13),id(15)],execution:'shared'},new Date(Date.now()+86400000).toISOString(),'Normal','',[],false]);
 const eventStart=new Date(Date.now()+3*86400000).toISOString();
 await rpc('ops_save_event',[null,id(1),null,{title:'Preparation and event-day regression',start_at:eventStart,end_at:new Date(Date.now()+3*86400000+6*3600000).toISOString()},[
  {id:id(90),title:'Preparation',template_version_id:version,timing_mode:'relative',anchor:'start',offset_minutes:-4320,duration_minutes:4320,finish_mode:'duration',mode:'fixed',execution:'shared',employee_ids:[id(13),id(15)],preferred_owner:'',backup_ids:[],auto_backup:false,priority:'High'},
  {id:id(91),title:'Event day',template_version_id:version,timing_mode:'relative',anchor:'start',offset_minutes:0,duration_minutes:360,finish_mode:'duration',mode:'fixed',execution:'shared',employee_ids:[id(13),id(15)],preferred_owner:id(13),backup_ids:[],auto_backup:false,priority:'High'}
 ],'Active','']);
 await db.exec(`reset role;insert into assets(id,name,asset_tag,type,business_unit_id,requires_maintenance,status) values('${id(92)}','Maintenance fixture','AC-92','Equipment','${id(1)}',true,'Available'),('${id(93)}','Retired fixture','AC-93','Equipment','${id(1)}',true,'Retired');`);
 await actor(10);
 const today=(await db.query("select (now() at time zone 'Asia/Manila')::date::text d")).rows[0].d;
 await db.exec('reset role');
 for(const employee of [13,15])await db.query('insert into payroll_schedule_publications(employee_id,business_unit_id,effective_from,effective_to,snapshot) values($1,$2,$3,$3,$4)',[id(employee),id(1),today,[{date:today,kind:'work',start:'00:00',end:'23:59'}]]);
 await actor(10);
 const rule=await rpc('ops_save_rule',[null,id(1),'Maintenance assembly regression',version,{frequency:'once',interval:1,start_date:today,mode:'shift',execution:'shared',timezone:'Asia/Manila',anchor:'fixed',start_time:'00:00',end_time:'23:59',due_time:'23:59',end_day_offset:0,due_day_offset:0,employee_ids:[id(13),id(15)],backup_ids:[],preferred_owner:id(13),auto_backup:false,horizon_days:0,grace_minutes:0,remind_before:0,overdue_every:0,priority:'Normal',maintenance:{asset_id:id(92),category:'Cleaning',description:'Check asset',estimated_minutes:10,responsible_manager_id:id(11)}},'Active',null,'']);
 await rpc('ops_retry_rule',[rule]);
 await rpc('ops_review_delegate',[id(1),id(15),true]);
 await actor(13);
 const own=(await rpc('ops_workspace',[id(1)])).assignments.find(a=>!a.occurrence_id);
 await rpc('ops_save_response',[own.execution.items[0].id,own.execution.items[0].response.revision,'"yes"','Checked with shared team',false,'']);
 await rpc('ops_snooze_assignment',[own.id,0,new Date(Date.now()+1800000).toISOString()]);
 const cases=[[10,null],[10,id(1)],[11,null],[12,null],[13,null],[15,null],[16,null]];
 const before=[];
 for(const [user,unit] of cases){await actor(user);before.push(normalize(await rpc('ops_workspace',[unit])));}
 assert.equal(before[0].assignments.length,54);
 assert.ok(before[0].assignments.some(a=>a.event));
 assert.ok(before[0].assignments.some(a=>a.maintenance));
 assert.ok(before[4].assignments.some(a=>a.snooze));
 assert.equal(before[3].assignments.length,0);
 await db.exec('reset role');
 await db.exec(readFileSync('supabase/migrations/'+workspacePlanMigration,'utf8'));
 await db.exec(readFileSync('supabase/migrations/'+workspaceAssemblyMigration,'utf8'));
 await db.exec(readFileSync('supabase/migrations/20261011070931_operations_fast_overview_and_detail.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/20261011071609_operations_overview_payload_trim.sql','utf8'));
 for(let i=0;i<cases.length;i++){const [user,unit]=cases[i];await actor(user);assert.deepEqual(normalize(await rpc('ops_workspace',[unit])),before[i],`Workspace fields and permissions changed for user ${user}`);}
 for(let i=0;i<cases.length;i++){const [user,unit]=cases[i];await actor(user);const overview=await rpc('ops_workspace_overview',[unit]);assert.equal(overview.assignments.length,before[i].assignments.length);assert.equal(overview.summary,true);assert.deepEqual(normalize(overview.units),before[i].units);for(const a of before[i].assignments){const full=await rpc('ops_assignment_detail',[a.id]);assert.deepEqual(normalize(full),a);const summary=overview.assignments.find(x=>x.id===a.id);for(const key of ['id','status','due_at','assignee_id','checklist_run_id','unit_name','kind','members','snooze'])assert.deepEqual(normalize(summary[key]),a[key],key);assert.equal(summary.execution?.items.length||0,0);assert.equal(summary.history.length,0);assert.equal(summary.content.title,a.content.title);assert.equal(summary.review?.state,a.review?.state);assert.equal(summary.review?.mode,a.review?.mode);assert.equal(summary.instructions,'');assert.equal(summary.content.creation,undefined);}}
 await actor(12);await assert.rejects(()=>rpc('ops_assignment_detail',[before[0].assignments[0].id]),/unavailable/);await assert.rejects(()=>rpc('ops_workspace_overview',[id(1)]),/authorized/);
 await actor(12);await assert.rejects(()=>rpc('ops_workspace',[id(1)]),/authorized/);
 await db.exec('reset role;set role anon');await assert.rejects(()=>rpc('ops_workspace',[null]),/permission/);await assert.rejects(()=>rpc('ops_workspace_overview',[null]),/permission/);await assert.rejects(()=>rpc('ops_assignment_detail',[before[0].assignments[0].id]),/permission/);
 console.log('Workspace query plans passed: identical complete JSON for global BOD, unit managers, staff, delegate and multi-unit manager across 54 shared daily/event/maintenance assignments, responses, audit history, snoozes and active/retired assets; cross-unit and anonymous denial preserved.');
} catch(e) {console.error(e.message,e.where);process.exitCode=1;} finally {await db.close();rmSync(dir,{recursive:true,force:true});}
