import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

function load(path,deps={}) {
 const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
 const exports={};vm.runInNewContext(code,{exports,URLSearchParams,require:name=>deps[name]});return exports;
}
const noop=()=>{}, component=fn=>({__esModule:true,default:fn});
let params=new URLSearchParams('type=nte'),states=[],cursor=0,effects=[],navigation=[];
const hooks={...React,useState:initial=>{const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];},useMemo:fn=>fn(),useEffect:fn=>effects.push(fn),useLayoutEffect:noop,useRef:()=>({current:null}),lazy:()=>()=>React.createElement('div',null,'Exact request review dialog')};
const queueValues={};
const queues=new Proxy(queueValues,{get:(target,name)=>name in target?target[name]:String(name).startsWith('pending')?[]:false});
const date=new Date('2026-10-14T00:00:00Z');
queueValues.pendingNTEApprovals=[1,2].map(n=>({id:`nte-${n}`,canonicalKey:`nte:${n}`,employeeId:'employee',employeeName:`NTE employee ${n}`,reference:`NTE-${n}`,createdAt:date,status:'Pending',currentStep:'HR approval',category:'Attendance',assignedHandler:'HR',caseReference:'CASE'}));
queueValues.pendingRequisitionApprovals=[{id:'job-one',canonicalKey:'requisition:one',title:'Other category job',reference:'JOB',createdAt:date,status:'Pending',currentStep:'HR'}];
const dependencies={
 react:hooks,'react-router-dom':{Link:({to,children,...props})=>React.createElement('a',{href:to,...props},children),useLocation:()=>({key:params.toString()}),useNavigate:()=>url=>navigation.push(url),useSearchParams:()=>[params]},
 '../hooks/useAuth':{useAuth:()=>({user:{id:'fixture',role:'HR Staff',roles:[]}})},
 '../hooks/useApprovals':{useApprovals:()=>queues},'../hooks/useAdditionalApprovals':{useAdditionalApprovals:()=>queues},
 '../services/attendanceIssues':{useAttendanceIssues:()=>({pending:[],loading:false,error:null})},
 '../context/SettingsContext':{useSettings:()=>({approverConfigs:{conditionalTimeApprovals:{valid:true}}})},
 '../types':{Role:{HRStaff:'HR Staff'},OTStatus:{}},
 '../services/approvalDeepLinks':load('services/approvalDeepLinks.ts'),
 '../utils/approvalPresentation':load('utils/approvalPresentation.ts'),
 '../modules/official-business/OBApprovalQueue':component(()=>React.createElement('div',null,'Unrelated OB queue')),
 '../modules/payroll/PayrollAttendanceInbox':component(()=>React.createElement('div',null,'Unrelated payroll inbox')),
 '../components/overtime/OvertimeWeekReview':component(({requestIds})=>React.createElement('div',{'data-ot-ids':requestIds.join(',')},'OT decision controls')),
 '../components/approvals/ApprovalNavigation':{ApprovalOutcome:()=>null},
};
const page=load('pages/ApprovalCenter.tsx',new Proxy(dependencies,{get:(target,name)=>name in target?target[name]:component(({children})=>React.createElement('button',null,children))})).default;
const render=()=>{cursor=0;effects=[];return renderToStaticMarkup(React.createElement(page));};
let html=render();
assert.match(html,/NTE Approval · Pending/);
assert.match(html,/NTE employee 1/);assert.match(html,/NTE employee 2/);
assert.match(html,/href="\/feedback\/nte\/nte-1"/);
for(const unwanted of ['Other category job','Unrelated OB queue','Unrelated payroll inbox','High risk / exceptions','id="approval-filters"']) assert.ok(!html.includes(unwanted),unwanted);

// Navigate within the mounted page: URL filtering applies immediately, then the
// normal route effect resets selection and opens the new category.
queueValues.pendingLeaveApprovals=[{id:'leave-one',employeeId:'employee',employeeName:'Leave employee',startDate:date,endDate:date,createdAt:date,durationDays:1,status:'Pending',reason:'Leave'}];
params=new URLSearchParams('type=leave');render();effects[0]();html=render();
assert.match(html,/Leave employee/);assert.ok(!html.includes('NTE employee'));
assert.match(html,/href="\/approvals\?type=leave&amp;item=leave-one"/);
queueValues.pendingWfhApprovals=[{id:'wfh-one',employeeId:'employee',employeeName:'WFH employee',date,createdAt:date,status:'Pending',reason:'WFH'}];
params=new URLSearchParams('type=wfh&item=wfh-one');render();effects[0]();html=render();
assert.match(html,/Exact request review dialog/);assert.match(html,/WFH employee/);

// OT data can arrive after navigation; keep the selected queue focused while
// loading, then pass only its authorized request IDs to the decision component.
params=new URLSearchParams('type=overtime');render();effects[0]();
queueValues.approvalsLoading=true;html=render();assert.match(html,/Updating approval queues/);
queueValues.approvalsLoading=false;
queueValues.pendingOtApprovals=[{id:'ot-one',employeeId:'employee',employeeName:'OT employee',date,createdAt:date,startTime:'18:00',endTime:'20:00',status:'Submitted',reason:'Closing'}];
html=render();assert.match(html,/data-ot-ids="ot-one"/);assert.match(html,/OT decision controls/);
assert.ok(!html.includes('NTE employee'));assert.ok(!html.includes('Unrelated payroll inbox'));

// General Approvals navigation restores all pending categories and the summary,
// and does not mount decision history or an old request dialog.
params=new URLSearchParams();render();effects[0]();html=render();
assert.match(html,/Approval Center/);assert.match(html,/Unrelated OB queue/);
assert.match(html,/Toggle NTE Approval/);assert.match(html,/Toggle Leave/);
assert.ok(!html.includes('Exact request review dialog'));
console.log('PASS: focused NTE/Leave queues, exact WFH review, delayed OT queue loading, unrelated panels omitted, mounted category switching, and general pending navigation.');
