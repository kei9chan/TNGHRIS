import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const noop=()=>{};
const component=fn=>({__esModule:true,default:fn});
const link=({to,children,...props})=>React.createElement('a',{href:to,...props},children);
function load(path,deps,globals={}){
 const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
 const exports={};vm.runInNewContext(code,{exports,require:n=>{
  assert.ok(n in deps,'Unexpected import: '+n);return deps[n];
 },...globals});return exports;
}

// Real layout effect: dashboard-to-queue and repeated footer navigation reset
// the scroll, while schedule anchors on other routes retain their behavior.
let route={pathname:'/approvals',search:'?type=overtime',key:'first'},effects=[],scroll=[];
const history={scrollRestoration:'auto'};
const document={documentElement:{style:{overflowAnchor:'auto'}},body:{style:{overflowAnchor:''}}};
const layout=load('components/layout/Layout.tsx',new Proxy({
 react:{...React,useEffect:noop,useLayoutEffect:fn=>effects.push(fn)},
 'react-router-dom':{useLocation:()=>route,Outlet:()=>null},
 '../notifications/PhoneNotificationSetup':{PhoneAccountBinding:()=>null},
},{has:()=>true,get:(target,name)=>name in target?target[name]:component(()=>null)}),{document,window:{history,scrollTo:options=>scroll.push(options)}});
renderToStaticMarkup(React.createElement(layout.default));const restore=effects.pop()();
assert.deepEqual(JSON.parse(JSON.stringify(scroll[0])),{top:0,left:0,behavior:'instant'});
assert.equal(history.scrollRestoration,'manual');assert.equal(document.body.style.overflowAnchor,'none');
restore();assert.equal(history.scrollRestoration,'auto');assert.equal(document.documentElement.style.overflowAnchor,'auto');assert.equal(document.body.style.overflowAnchor,'');
route={...route,key:'second'};renderToStaticMarkup(React.createElement(layout.default));effects.pop()();assert.equal(scroll.length,2);
route={pathname:'/dashboard',search:'',hash:'#schedule-approvals',key:'third'};
renderToStaticMarkup(React.createElement(layout.default));effects.pop()();assert.equal(scroll.length,2);

// Execute the actual OB load, refresh, count callback, and error rendering.
let state=[],cursor=0,obEffects=[],rows=[],failure=false,count=-1,listeners={};
const hooks={...React,useState:initial=>{
 const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;
 return[state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v;}];
},useEffect:fn=>obEffects.push(fn)};
const ob=load('modules/official-business/OBApprovalQueue.tsx',{
 react:hooks,'react-router-dom':{Link:link},'./api':{listOB:async()=>{if(failure)throw Error('Fixture load failed');return{rows};},phTime:v=>v},
},{window:{addEventListener:(event,fn)=>{listeners[event]=fn;},removeEventListener:noop}});
const renderOb=()=>{cursor=0;return renderToStaticMarkup(React.createElement(ob.default,{onCountChange:n=>{count=n;}}));};
assert.equal(renderOb(),'','No empty or loading zero-count OB card');
const cleanup=obEffects.shift()();await new Promise(setImmediate);
assert.equal(renderOb(),'');assert.equal(count,0);
rows=[{id:'ob-one',reference:'OB-ONE',employeeName:'Test employee',destination:'Site visit',starts_at:'2026-10-13',approval_step:'head'}];
await listeners.focus();assert.match(renderOb(),/Official Business approvals \(1\)/);assert.equal(count,1);
rows=[];await listeners['official-business-changed']();assert.equal(renderOb(),'');assert.equal(count,0);
failure=true;await listeners.focus();assert.match(renderOb(),/Fixture load failed/,'Load errors must remain visible');cleanup();

// Render the full actual Approval Center with empty server queues plus one
// pending schedule and OB count; summary precedes every queue and history.
let index=0;
const approvalHooks=new Proxy({}, {get:(_,name)=>String(name).startsWith('pending')?[]:false});
let pendingScroll=0,pageEffects=[];
const ReactFixture={...React,useRef:()=>({current:{scrollIntoView:()=>pendingScroll++}}),useLayoutEffect:fn=>pageEffects.push(fn),useEffect:noop,useMemo:fn=>fn(),useState:initial=>{
 const n=index++;return[n===13?[{id:'schedule-one',employeeName:'Test schedule',week:'2026-10-19'}]:n===14?1:typeof initial==='function'?initial():initial,noop];
}};
const pageDeps={
 react:ReactFixture,'react-router-dom':{Link:link,useLocation:()=>route,useNavigate:()=>noop,useSearchParams:()=>[new URLSearchParams()]},
 '../hooks/useAuth':{useAuth:()=>({user:{id:'fixture',role:'Board of Director',roles:[]}})},
 '../hooks/useApprovals':{useApprovals:()=>approvalHooks},
 '../hooks/useAdditionalApprovals':{useAdditionalApprovals:()=>approvalHooks},
 '../services/attendanceIssues':{useAttendanceIssues:()=>({pending:[],loading:false,error:null})},
 '../context/SettingsContext':{useSettings:()=>({approverConfigs:{conditionalTimeApprovals:{valid:true}}})},
 '../types':{Role:{HRStaff:'HR Staff'},OTStatus:{}},
 '../services/approvalDeepLinks':{getApprovalRequestId:()=>null},
 '../components/approvals/ApprovalNavigation':{ApprovalOutcome:()=>null},
 '../modules/official-business/OBApprovalQueue':component(()=>React.createElement('section',null,'Official Business fixture')),
 '../components/approvals/RecentDecisions':component(()=>React.createElement('section',null,'Recent decisions fixture')),
};
const approval=load('pages/ApprovalCenter.tsx',new Proxy(pageDeps,{has:()=>true,get:(target,name)=>name in target?target[name]:name.includes('/components/')||name.includes('/modules/')?component(()=>null):{}}));
const pageHtml=renderToStaticMarkup(React.createElement(approval.default));
assert.ok(pageHtml.indexOf('Pending approvals')<pageHtml.indexOf('Official Business fixture'));
assert.ok(pageHtml.indexOf('Pending approvals')<pageHtml.indexOf('Employee schedules'));
assert.ok(pageHtml.indexOf('Employee schedules')<pageHtml.indexOf('Decision history'));
assert.ok(!pageHtml.includes('Recent decisions fixture'),'History is not fetched or mounted on entry');
assert.match(pageHtml,/aria-expanded="false"/);
pageEffects.pop()();assert.equal(pendingScroll,1,'Lazy page mount also resets the viewport after loading');
assert.match(pageHtml,/text-2xl font-bold bg-blue-50 text-blue-700">2<\/div>/,'Pending summary includes schedule and OB requests');

// BOD rows expose the cost directly below manager-approved minutes on mobile.
const svc=load('services/manualOtService.ts',{'./supabaseClient':{supabase:{}}});
const ot=load('components/overtime/OtRequestReviewList.tsx',{
 react:React,'../../services/manualOtService':svc,'../../services/supabaseClient':{supabase:{}}});
const request={id:'ot-one',updated_at:'v1',date:'2026-09-30',start_time:'22:00',end_time:'02:00',end_date:'2026-10-01',reason:'Closing work',status:'PendingBOD',requestedMinutes:240,reviewedMinutes:180,finalMinutes:null,manager_night_minutes:null,canDecide:true,blocked:null,history_log:[],costEstimate:{available:true,total:412.5,currency:'PHP',nightPremium:37.5,nightMinutes:180,estimated:true}};
const week={employeeId:'employee',employee:{name:'Test employee',position:'Staff',businessUnit:'Test BU'},summary:{weekStart:'2026-09-28',weekEnd:'2026-10-04',requiresBod:true,reviewedMinutes:180,baselineMissing:false,quantitiesMissing:false,reviewOnly:true}};
function renderOt(row){return renderToStaticMarkup(React.createElement(ot.BulkRows,{groups:[{week,rows:[row]}],readOnly:false,onChanged:noop}));}
let otHtml=renderOt(request);
const cells=otHtml.match(/<td\b[^>]*>[\s\S]*?<\/td>/g);
assert.match(cells[1],/3h manager-approved/);assert.match(cells[1],/OT cost est\. ₱412\.50/);
assert.match(cells[1],/Includes night premium ₱37\.50/);
assert.ok(cells[1].indexOf('manager-approved')<cells[1].indexOf('OT cost est.'));
assert.ok(cells[1].indexOf('OT cost est.')<cells[1].indexOf('Requested:'));
assert.match(cells[3],/hidden lg:table-cell/,'Duplicate reviewed column is hidden on mobile');
assert.match(otHtml,/grid grid-cols-1 gap-y-3/,'Mobile requests stack without horizontal scrolling');
assert.match(otHtml,/lg:min-w-\[720px\]/,'Desktop retains the review table');
assert.match(renderOt({...request,costEstimate:{available:false}}),/Cost pending pay details/);
assert.match(renderOt({...request,status:'Submitted',reviewedMinutes:null,costEstimate:{available:false}}),/aria-label="Approved OT hours/,'Manager quantity editing remains available');
console.log('PASS: pending-entry scroll reset, schedule anchors preserved, OB zero hiding/refresh/count/error, summary-before-queues, mobile approved-hours/cost/night premium, missing pay details, and manager editing.');
