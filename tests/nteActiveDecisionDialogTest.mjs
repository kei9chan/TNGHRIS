import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import React from 'react';
const noop=()=>{};
const load=(path,deps)=>{const exports={};const js=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;vm.runInNewContext(js,{exports,require:n=>deps[n],alert:m=>{throw Error(m);}});return exports;};
const types=load('types.ts',{});
const user={id:'reviewer',name:'Fixture reviewer'};
const notice={id:'nte',nteNumber:'NTE-TEST',employeeId:'subject',employeeName:'Fixture subject',issuedByUserId:'issuer',status:types.NTEStatus.PendingApproval,body:'<p>Fixture notice</p>',disciplineCodeIds:[],approverSteps:[{userId:user.id,userName:user.name,status:types.ApproverStatus.Pending,role:'Manager'}]};
const incident={id:'incident',caseNumber:'IR-TEST',category:'Fixture case',chatThread:[]};
let state=[],cursor=0,refCursor=0;const refs=[];const calls=[];
const hooks={...React,useEffect:noop,useMemo:fn=>fn(),useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],next=>{state[i]=typeof next==='function'?next(state[i]):next;}];},useRef:initial=>{const i=refCursor++;return refs[i]||(refs[i]={current:initial});}};
const Button=()=>null,Reason=()=>null;
const components={__esModule:true,default:()=>null};
const deps=new Proxy({
 react:hooks,'react-router-dom':{useParams:()=>({nteId:'nte'}),useNavigate:()=>noop,Link:()=>null},'react-dom':{createPortal:()=>null},'../../types':types,
 '../../hooks/useAuth':{useAuth:()=>({user})},'../../hooks/usePermissions':{usePermissions:()=>({can:()=>false})},
 '../../components/ui/Button':{__esModule:true,default:Button},'../../components/feedback/RejectReasonModal':{__esModule:true,default:Reason},
 '../../services/nteService':{processNTEApproval:async(id,outcome,reason)=>{calls.push({id,outcome,reason});return{...notice,status:types.NTEStatus.Draft};}},'../../services/approvalNavigation':{decisionSaved:noop},
 '../../utils/formatCaseId':{formatIRDisplayId:v=>v,formatNTEDisplayId:v=>v},'../../utils/urlUtils':{formatExternalUrl:v=>v},
},{get:(target,key)=>key in target?target[key]:key.includes('components/')||key.includes('NTEWorkflowPanel')?components:{}});
const page=load('pages/feedback/NTEDetail.tsx',deps).default;
function find(node,test){if(!React.isValidElement(node))return;if(test(node))return node;for(const child of React.Children.toArray(node.props.children)){const hit=find(child,test);if(hit)return hit;}}
function render(){cursor=0;refCursor=0;return page();}
function reset(){state=[];state[8]=notice;state[9]=incident;state[11]=[];state[12]=[];state[13]=false;refs.length=0;}
for(const [label,outcome,title]of[['Return for Revision','return','Return NTE for Revision'],['Reject','reject','Reject NTE']]){
 reset();let tree=render();const action=find(tree,e=>e.type===Button&&e.props.children===label);assert.ok(action);
 action.props.onClick();tree=render();let reason=find(tree,e=>e.type===Reason);assert.ok(reason,'Reason dialog is mounted in the active layout');assert.equal(reason.props.isOpen,true);assert.equal(reason.props.title,title);
 await reason.props.onSubmit('Fixture required reason');assert.deepEqual(calls.at(-1),{id:'nte',outcome,reason:'Fixture required reason'});
 tree=render();reason=find(tree,e=>e.type===Reason);assert.equal(reason.props.isOpen,false);
}
console.log('PASS: active NTE Return/Reject buttons open the correct reason dialog, submit distinct outcomes/reasons, and close after a successful save.');
