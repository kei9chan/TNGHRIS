import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const source=readFileSync(new URL('../components/dashboard/BodScheduleWorkflow.tsx',import.meta.url),'utf8');
const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
const base={isBod:true,eligible:false,week:'2026-09-21',deadline:'2026-09-19T15:59:00Z',templates:[],pending:[]};
function render(data){
 let state=0;
 const exports={};
 const deps={react:{...React,useState:value=>[state++===0?data:value,()=>{}],useEffect:()=>{}},
 '../../services/supabaseClient':{supabase:{}},
 '../../modules/scheduleCompliance':{ScheduleTask:()=>React.createElement('p',null,'Complete employee schedules')},
 };
 vm.runInNewContext(output,{exports,require:name=>{assert.ok(name in deps);return deps[name];}});
 return renderToStaticMarkup(React.createElement(exports.default));
}
assert.equal(render(base),'','BOD with no pending submissions sees no plotting reminder');
assert.equal(render({...base,eligible:true}),'','Stale eligibility must never show BOD self-submission');
assert.match(render({...base,isBod:false}),/Complete employee schedules/,'Normal manager workflow stays present');
const own={...base,isBod:false,eligible:true,managerName:'Assigned BOD'};
assert.match(render(own),/Submit your schedule for BOD approval/);
assert.match(render(own),/Prepare my schedule/);
const s={id:'test',version:1,week:base.week,status:'Pending',reason:'Proposed week',entries:[],schedule:[{date:base.week,name:'Opening',start:'09:00',end:'18:00'}],employeeName:'Direct report'};
const bod=render({...base,pending:[s]});
assert.match(bod,/Employee schedules awaiting your approval/);
assert.match(bod,/Approve schedule/);
assert.match(bod,/Reject \/ request revision/);
assert.doesNotMatch(bod,/Complete employee schedules|Prepare my schedule/);
assert.match(render({...own,submission:s}),/Your schedule is awaiting BOD approval/);
assert.match(render({...own,submission:{...s,status:'Rejected',review_reason:'Change Monday'}}),/Please revise and resubmit/);
assert.match(render({...own,submission:{...s,status:'Approved'}}),/Your schedule was approved/);
console.log('PASS: BOD reminder suppression, normal manager reminder, self-submission, approval/rejection and status rendering.');

const gmReport={...own,managerRole:'GM',managerName:'Assigned GM'};
assert.match(render(gmReport),/Submit your schedule for GM approval/);
assert.match(render(gmReport),/your GM will approve or reject/);
assert.doesNotMatch(render(gmReport),/BOD approval/);
assert.match(render({...gmReport,submission:s}),/awaiting GM approval/);
assert.match(render({...gmReport,submission:s,needsResubmission:true}),/reporting line changed/);
const gm=render({...base,isBod:false,isGm:true,pending:[s]});
assert.match(gm,/Review your direct reports/);
assert.match(gm,/Approve schedule/);
assert.doesNotMatch(gm,/Complete employee schedules/);
assert.match(render({...base,isBod:false,isGm:true,eligible:true,managerRole:'BOD',managerName:'BOD'}),/Submit your schedule for BOD approval/);
console.log('PASS: GM direct-report prompt, GM approval queue, no GM plotting reminder, reassignment prompt and GM own BOD submission.');
