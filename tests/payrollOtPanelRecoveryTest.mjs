import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
const noop=()=>{};const component=fn=>({__esModule:true,default:fn});
function load(path,deps){const exports={};const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;vm.runInNewContext(code,{exports,require:n=>{assert.ok(n in deps,n);return deps[n];},console});return exports;}
let payload,error;const rpc=async()=>({data:payload,error});
const service=load('services/manualOtService.ts',{'./supabaseClient':{supabase:{rpc}}});
const row={id:'request',date:'2026-10-01',start_time:'22:00',end_time:'02:00',status:'PendingBOD',requestedMinutes:240,reviewedMinutes:180,finalMinutes:null,canDecide:false,blocked:null,history_log:[],costEstimate:{available:true,total:412.5,currency:'PHP',nightPremium:37.5,nightMinutes:180}};
const week={employeeId:'fixture-employee',employee:{name:'Fixture employee',position:'Fixture position',businessUnit:'Fixture BU'},summary:{weekStart:'2026-09-28',weekEnd:'2026-10-04',reviewOnly:true,requiresBod:true,reviewedMinutes:180},requests:[row],version:'fixture-version'};
payload=[week];assert.equal((await service.getPayrollOtWeeks('fixture-employee','2026-09-26','2026-10-10'))[0],week);
payload=[];assert.deepEqual(Array.from(await service.getPayrollOtWeeks('employee','from','to')),[]);
for(const bad of [[{...week,employee:null}],[{...week,summary:null}],[{...week,summary:{...week.summary,weekStart:null}}],[{...week,requests:null}],[{...week,requests:[{...row,date:'invalid'}]}],[{...week,requests:[{...row,history_log:[null]}]}],{weeks:[week]}]){
 payload=bad;await assert.rejects(()=>service.getPayrollOtWeeks('employee','from','to'),/incomplete/);
}
// Real async panel load catches malformed data and shows its local Retry action
// instead of feeding malformed weeks into the renderer/global error boundary.
payload=[{...week,employee:null}];let states=[],index=0,effects=[];
const hookReact={...React,useState:initial=>{const i=index++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],next=>{states[i]=typeof next==='function'?next(states[i]):next;}];},useEffect:fn=>effects.push(fn)};
const panel=load('components/overtime/OtRequestReviewList.tsx',{react:hookReact,'../../services/manualOtService':service,'../../services/supabaseClient':{supabase:{}}});
const render=()=>{index=0;return renderToStaticMarkup(React.createElement(panel.default,{employeeId:'fixture-employee',from:'2026-09-26',to:'2026-10-10'}));};
render();effects.shift()();await new Promise(setImmediate);let html=render();assert.match(html,/role="alert"/);assert.match(html,/incomplete/);assert.match(html,/Retry/);assert.ok(!html.includes('Payroll could not be loaded'));
// The same component still shows manager-approved hours and the night cost for
// a valid legacy review after retry.
payload=[week];effects.pop()();await new Promise(setImmediate);html=render();assert.match(html,/3h manager-approved/);assert.match(html,/OT cost est\. ₱412\.50/);assert.match(html,/night premium ₱37\.50/);
const Modal=({children,footer,title})=>React.createElement('section',{role:'dialog'},title,children,footer);
const Button=props=>React.createElement('button',props,props.children);
const Boundary=load('modules/payroll/EmployeeReviewBoundary.tsx',{react:React,'../../components/ui/Modal':component(Modal),'../../components/ui/Button':component(Button)}).default;
let closed=false;const boundary=new Boundary({children:'Employee review',onClose:()=>{closed=true;}});
boundary.state=Boundary.getDerivedStateFromError(Error('Fixture legacy record error'));const recovery=boundary.render();const recoveryHtml=renderToStaticMarkup(recovery);assert.match(recoveryHtml,/Retry review/);assert.match(recoveryHtml,/Close review/);recovery.props.onClose();assert.equal(closed,true);
const source=fs.readFileSync('modules/payroll/TimekeepingEmployeeTable.tsx','utf8');assert.match(source,/<EmployeeReviewBoundary[^>]+>[\s\S]*?<EmployeeIssueReview[\s\S]*?<\/EmployeeReviewBoundary>/);
console.log('PASS: scoped payroll OT payload validation, malformed records handled inline, retry loads valid hours/night cost, employee-panel recovery and close controls preserve payroll readiness.');
