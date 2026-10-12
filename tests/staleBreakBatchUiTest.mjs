import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const noop=()=>{};
function load(path,deps){const exports={};const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;vm.runInNewContext(code,{exports,require:name=>{assert.ok(name in deps,'Unexpected import '+name);return deps[name];},window:{dispatchEvent:noop},Event:class{}});return exports;}
const button=load('components/ui/Button.tsx',{react:React}).default;
const reviews=load('modules/payroll/RecordedBreakApprovals.tsx',{react:React,'../../services/supabaseClient':{supabase:{}},'../../components/ui/Button':{__esModule:true,default:button}});
const batch={id:'old',items:[{employeeId:'employee',employeeName:'Fixture employee',date:'2026-08-26',breakMinutes:20}],status:'pending_hr_manager',canAct:true,stale:true,submitter:'Uploader',submitted_at:'2026-09-30T00:00:00Z',scopeName:'Fixture BU',date_from:'2026-08-26',date_to:'2026-09-10'};
function find(element,predicate){if(!React.isValidElement(element))return; if(predicate(element))return element;for(const child of React.Children.toArray(element.props.children)){const found=find(child,predicate);if(found)return found;}}
const card=props=>reviews.BreakDecisionCard({review:batch,busy:false,note:'',setNote:noop,onDecision:noop,...props});
const tree=card();const getButton=(tree,label)=>find(tree,e=>e.type===button&&e.props.children===label);
assert.equal(getButton(tree,'Approve batch → send to BOD').props.disabled,true);
assert.equal(getButton(tree,'Return outdated batch').props.disabled,false,'Stale batch must have an immediately usable recovery action');
assert.equal(getButton(tree,'Reject').props.disabled,true);
assert.equal(find(tree,e=>e.type==='textarea').props.value,reviews.staleBreakReturnReason);
assert.equal(reviews.breakDecisionNote(batch,'return',''),reviews.staleBreakReturnReason);
assert.equal(reviews.breakDecisionNote(batch,'return','Verified correction needed'),'Verified correction needed');
assert.equal(reviews.breakDecisionNote(batch,'approve',''),'');assert.equal(reviews.breakDecisionNote(batch,'reject',''),'');
assert.equal(getButton(card({busy:true}),'Return outdated batch').props.disabled,true);
assert.ok(!getButton(card({review:{...batch,canAct:false}}),'Return outdated batch'));
assert.equal(getButton(card({review:{...batch,stale:false}}),'Approve batch → send to BOD').props.disabled,false);
assert.equal(getButton(card({review:{...batch,stale:false}}),'Return for correction').props.disabled,true);
assert.match(renderToStaticMarkup(tree),/Return reason \(filled in; editable\)/);

// Exercise the actual inbox action, including its generated reason, and ensure
// it performs a return rather than an approval or payroll write.
let index=0;const calls=[];
const hookReact={...React,useState:initial=>{const i=index++;return[i===0?[batch]:typeof initial==='function'?initial():initial,noop];},useRef:initial=>({current:initial}),useCallback:fn=>fn,useEffect:noop};
const inbox=load('modules/payroll/PayrollAttendanceInbox.tsx',{
 react:hookReact,'../../hooks/useAuth':{useAuth:()=>({user:{id:'hr-manager'}})},'./RecordedBreakApprovals':reviews,
 '../../services/supabaseClient':{supabase:{rpc:async(name,args)=>{calls.push({name,args});return{data:name==='decide_payroll_break_review'?'returned':[]};}}},
});
const inboxTree=inbox.default();
const review=find(inboxTree,e=>e.type===reviews.BreakDecisionCard);
await review.props.onDecision('return');
assert.equal(calls[0].name,'decide_payroll_break_review');assert.equal(calls[0].args.p_action,'return');assert.equal(calls[0].args.p_note,reviews.staleBreakReturnReason);
assert.equal(calls[1].name,'get_payroll_break_review_inbox','Refresh queue after return');
console.log('PASS: immediately usable stale-batch return, visible/editable recorded reason, approve/reject/independence/busy guards, and real inbox return payload/refetch.');
