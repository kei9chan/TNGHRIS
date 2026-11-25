import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const noop=()=>{};
let state=[],cursor=0,kind='pan',calls=[],release;
const hooks={...React,useEffect:noop,useLayoutEffect:noop,useMemo:fn=>fn(),useRef:value=>({current:value}),useState:initial=>{
 const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;
 return [state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value;}];
}};
function load(path,deps){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,{exports,require:name=>deps[name],URLSearchParams,structuredClone,crypto:{randomUUID:()=> 'test'},Map,Set});return exports;}
const Button=()=>null,Component=()=>null;
const preview=(kind,id)=>({id,kind,snapshot:'original-'+id,data:kind==='requisition'?{headcount:2,salaryMin:20000,salaryMax:25000,employmentType:'Full-time'}:kind==='pan'?{action:{promotion:true},particulars:{from:{position:'Associate'},to:{position:'Manager'}}}:{proposed:{base_amount:600,rate_type:'Daily',components:[]}}});
const rows=()=>['Alice','Bea'].map(id=>({id,employeeId:id,employeeName:id,title:id,reference:kind+'-'+id,action:'Promotion',createdAt:new Date('2026-11-01T00:00:00Z'),effectiveDate:new Date('2026-12-01T00:00:00Z'),effectiveFrom:'2026-12-01',baseAmount:600,rateType:'Daily',pendingApprovers:['Reviewer'],businessUnit:'Fixture unit',department:'Operations',status:'Pending Approval',currentStep:'BOD',canonicalKey:kind+':'+id,changePreview:preview(kind,id)}));
const additional=new Proxy({refreshAdditionalApprovals:async()=>{}},{get:(t,k)=>k in t?t[k]:k===({pan:'pendingPANApprovals',requisition:'pendingRequisitionApprovals',pay_package:'pendingPayPackageApprovals'})[kind]?rows():String(k).startsWith('pending')?[]:undefined});
const approvals={pendingLeaveApprovals:[],pendingWfhApprovals:[],pendingOtApprovals:[],pendingManpowerApprovals:[],refreshApprovals:()=>new Promise(()=>{})};
const deps=new Proxy({
 react:hooks,'react-router-dom':{useLocation:()=>({key:'test'}),useNavigate:()=>noop,useSearchParams:()=>[new URLSearchParams('type='+kind)],Link:Component},
 '../types':load('types.ts',{}),'../hooks/useAuth':{useAuth:()=>({user:{id:'reviewer',role:'Board of Director',roles:[]}})},
 '../hooks/useApprovals':{useApprovals:()=>approvals},'../hooks/useAdditionalApprovals':{useAdditionalApprovals:()=>additional},
 '../services/attendanceIssues':{useAttendanceIssues:()=>({pending:[],rows:[]})},
 '../context/SettingsContext':{useSettings:()=>({approverConfigs:{conditionalTimeApprovals:{valid:true}}})},
 '../services/approvalDeepLinks':{getApprovalRequestId:()=>null,getApprovalReviewUrl:(kind,id)=>'/approvals?type='+kind+'&item='+id},
 '../utils/approvalPresentation':{approvalContextNumber:()=>undefined,getOvertimeWeekDetails:()=>({}),isBodApprovalStatus:()=>false,getApprovalStatusLabel:v=>v},
 '../components/ui/Button':{__esModule:true,default:Button},
 '../services/changeApprovalBatch':{approveChangeBatch:async(items,progress)=>{calls.push(items);await new Promise(resolve=>release=resolve);progress({succeeded:1,skipped:0,failed:0,processed:1});}},
},{get:(t,k)=>k in t?t[k]:{__esModule:true,default:Component}});
const Page=load('pages/ApprovalCenter.tsx',deps).default;
const render=()=>{cursor=0;return Page();};
function all(node,test,hits=[]){if(!React.isValidElement(node))return hits;if(test(node))hits.push(node);for(const c of React.Children.toArray(node.props.children))all(c,test,hits);return hits;}
function text(node){return typeof node==='string'||typeof node==='number'?String(node):React.isValidElement(node)?React.Children.toArray(node.props.children).map(text).join(''):'';}
const button=(tree,label)=>all(tree,e=>e.type===Button&&text(e).startsWith(label))[0];
for(kind of ['pan','requisition','pay_package']){
 state=[];calls=[];
 let tree=render();
 assert.ok(button(tree,'Approve all shown'),kind+' offers approve all.');
 assert.equal(button(tree,'Approve selected').props.disabled,true);
 assert.ok(all(tree,e=>e.props.preview?.kind===kind).length>=2,'Summaries are in the main list.');
 const check=all(tree,e=>e.type==='input'&&e.props['aria-label']?.includes(kind==='pay_package'?'PAY-ALICE':kind+'-Alice'))[0];
 assert.ok(check,kind+' row selection');check.props.onChange({target:{checked:true}});
 tree=render();button(tree,'Approve selected').props.onClick();tree=render();
 const dialog=all(tree,e=>e.props.role==='dialog')[0];
 const selectedPreview=all(dialog,e=>e.props.preview?.id==='Alice')[0];assert.ok(selectedPreview);assert.equal(all(dialog,e=>e.props.preview?.id==='Bea').length,0);
 all(dialog,e=>e.type==='input'&&e.props.type==='checkbox')[0].props.onChange({target:{checked:true}});
 tree=render();const running=all(all(tree,e=>e.props.role==='dialog')[0],e=>e.type===Button&&text(e).startsWith('Approve '))[0].props.onClick();
 tree=render();assert.equal(button(tree,'Approve all shown').props.disabled,true);assert.equal(calls[0].length,1);assert.equal(calls[0][0].snapshot,'original-Alice');
 const stopButton=button(tree,'Stop after current request');assert.ok(stopButton);stopButton.props.onClick();
 tree=render();assert.ok(button(tree,'Stopping after current request'));
 release();await running;tree=render();assert.equal(all(tree,e=>e.props.role==='dialog')[0].props['aria-busy'],false,'A hung queue refresh cannot leave a completed batch spinning.');
 // Filtering changes the exact approve-all scope, including for pay packages.
 state=[];tree=render();all(tree,e=>e.type==='button'&&text(e)==='Filter requests')[0].props.onClick();
 tree=render();all(tree,e=>e.type==='input'&&e.props['aria-label']==='Approval search')[0].props.onChange({target:{value:'Bea'}});
 tree=render();button(tree,'Approve all shown').props.onClick();tree=render();
 const filteredDialog=all(tree,e=>e.props.role==='dialog')[0];assert.equal(all(filteredDialog,e=>e.props.preview?.id==='Bea').length,1);assert.equal(all(filteredDialog,e=>e.props.preview?.id==='Alice').length,0);
}
const helpers=load('utils/approvalChangeSummary.ts',{});
const Summary=load('components/approvals/ApprovalChangeSummary.tsx',{react:React,'../../utils/approvalChangeSummary':helpers}).default;
const html=renderToStaticMarkup(React.createElement(Summary,{preview:preview('requisition','r')}));
assert.match(html,/₱40,000–₱50,000/);assert.match(html,/Salary budget \/ hire/);
console.log('PAN, requisition and pay-package UI selection, filtered approve-all, confirmation and live summaries passed.');
