import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createMaintenanceFixture,id} from './maintenanceFixture.mjs';
const db=await createMaintenanceFixture();
const actor=async n=>db.exec(`reset role;set test.actor='${id(n)}';set role authenticated`);
const rpc=async(name,args)=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
try{
 await db.exec(fs.readFileSync('supabase/migrations/20261012020627_maintenance_equipment_groups.sql','utf8'));
 await actor(11);
 const group=await rpc('ops_save_equipment_group',[null,id(1),'Fun Roof Speaker System','Speakers / Audio','DJ area',JSON.stringify([{name:'Speaker 1'},{name:'Speaker 2'},{name:'Subwoofer 1'}]),null]);
 const work=()=>rpc('ops_grouped_maintenance_workspace',[id(1),'2026-01-01','2028-12-31',0,{}]);
 let data=await work();let a=data.assets.find(a=>a.id===group);assert.equal(a.group.members.length,3);assert.equal(a.group.revision,1);
 const m=a.group.members;const client=id(95);
 const issue=await rpc('ops_report_equipment_issue',[group,m[1].id,null,'Speaker crackles during sound test','Normal',client]);
 assert.equal(await rpc('ops_report_equipment_issue',[group,m[1].id,null,'Speaker crackles during sound test','Normal',client]),issue);
 assert.equal((await rpc('ops_equipment_issues',[group,null])).length,1);
 await assert.rejects(()=>rpc('ops_report_equipment_issue',[group,id(99),null,'Wrong member','Normal',id(96)]),/Select equipment/);
 await assert.rejects(()=>rpc('ops_save_equipment_group',[group,id(1),'Speaker System','Speakers / Audio','',JSON.stringify(m),999]),/changed/);
 await actor(12);await assert.rejects(()=>rpc('ops_equipment_issues',[group,null]),/authorized/);await assert.rejects(()=>rpc('ops_save_equipment_group',[group,id(2),'Wrong unit','Other','',JSON.stringify(m),1]),/authorized/);
 await actor(13);await assert.rejects(()=>rpc('ops_report_equipment_issue',[group,m[0].id,null,'No permission','Normal',id(97)]),/authorized/);await assert.rejects(()=>rpc('ops_resolve_equipment_issue',[issue,'Not authorized']),/authorized/);
 await actor(11);await rpc('ops_resolve_equipment_issue',[issue,'Replaced faulty cable; sound tested clear']);assert.equal((await rpc('ops_equipment_issues',[group,null]))[0].status,'Resolved');
 // Standard recurring engine generates one shared checklist, not one per member.
 const today=(await db.query("select (now() at time zone 'Asia/Manila')::date::text d")).rows[0].d;
 const t=await rpc('ops_save_template',[null,id(1),'checklist',{title:'Speaker opening check',asset_id:group,category:'Maintenance',items:[{snapshot:{title:'Sound test all speakers',evidence:'yes_no',allow_na:true},required:true,response_type:'yes_no'}]},null,true]);
 const version=(await rpc('ops_workspace',[id(1)])).templates.find(x=>x.id===t).versions[0].id;
 await db.exec('reset role');for(const n of [13,15])await db.query('insert into payroll_schedule_publications(employee_id,business_unit_id,effective_from,effective_to,snapshot) values($1,$2,$3,$3,$4)',[id(n),id(1),today,[{date:today,kind:'work',start:'08:00',end:'17:00'}]]);
 await actor(11);const c={frequency:'daily',interval:1,start_date:today,end_date:'',mode:'shift',execution:'shared',timezone:'Asia/Manila',anchor:'fixed',start_time:'08:00',end_time:'12:00',due_time:'11:30',end_day_offset:0,due_day_offset:0,employee_ids:[],backup_ids:[],preferred_owner:id(13),auto_backup:false,allow_claim:true,weekdays:[1,2,3,4,5],month_day:1,short_month:'last',horizon_days:7,grace_minutes:15,remind_before:30,overdue_every:120,priority:'Normal',department_id:'',position:'',role:'',reference_employee:'',start_offset:0,duration_minutes:60,due_offset:60,instructions:'',requires_verification:false,excluded_dates:[],maintenance:{asset_id:group,description:'Whole group',category:'Inspection',sop_url:'',estimated_minutes:5,responsible_manager_id:id(11)}};
 const plan=await rpc('ops_save_rule',[null,id(1),'Speaker daily check',version,c,'Active',null,'']);await rpc('ops_retry_rule',[plan]);data=await work();const o=data.records.find(o=>o.rule_id===plan&&o.operating_date===today);assert.equal(o.asset.group.members.length,3);assert.equal(new Set(o.assignments.map(a=>a.execution.id)).size,1);
 await actor(13);const own=(await rpc('ops_workspace',[id(1)])).assignments.find(a=>a.id===o.assignments.find(a=>a.assignee_id===id(13)).id);assert.equal(own.maintenance.group.members.length,3);
 const staffIssue=await rpc('ops_report_equipment_issue',[group,m[0].id,o.id,'Buzzing during group sound test','Urgent / Stop use',id(98)]);assert.equal((await rpc('ops_equipment_issues',[group,o.id]))[0].id,staffIssue);
 await actor(11);await rpc('ops_save_equipment_group',[group,id(1),'Updated group','Speakers / Audio','DJ area',JSON.stringify([m[0],m[2]]),1]);data=await work();assert.equal(data.assets.find(a=>a.id===group).group.members.length,2);assert.equal(data.records.find(x=>x.id===o.id).asset.group.members.length,3);assert.equal((await rpc('ops_equipment_issues',[group,null])).find(x=>x.id===issue).member_name,'Speaker 2');
 await actor(12);await assert.rejects(()=>rpc('ops_report_equipment_issue',[group,m[0].id,o.id,'Cross-unit attack','Normal',id(94)]),/authorized/);
 await db.exec('reset role');await assert.rejects(()=>db.query('update assets set business_unit_id=$2 where id=$1',[group,id(2)]),/cannot transfer/);
 await db.exec('set role anon');await assert.rejects(()=>work(),/permission/);
 console.log('PASS: equipment grouping, shared generation, frozen history, staff reporting, cross-unit isolation, revision guards, issue idempotency, manager-only repair resolution, and removed-member repair history.');
}finally{await db.close();}
