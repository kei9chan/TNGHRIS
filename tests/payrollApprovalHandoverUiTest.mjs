import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
function compile(path,dependencies={}){const output=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;const exports={};new Function('exports','require',output)(exports,name=>{if(!(name in dependencies))throw new Error(name);return dependencies[name];});return exports;}
const model=compile('modules/payroll/approvalWorkspace.ts',{'../../services/supabaseClient':{supabase:{}}});
const Link=({to,children,...props})=>React.createElement('a',{href:to,...props},children);
const Button=({children,variant,...props})=>React.createElement('button',props,children);
const stages=['HR validation','HR endorsement','HR Manager authorization','Finance authorization','BOD approval 1 of 2','BOD approval 2 of 2'];
const Progress=compile('modules/payroll/ApprovalProgress.tsx',{react:React,'react-router-dom':{Link},'./approvals':{approvalStages:stages},'./approvalWorkspace':model}).default;
const run={id:'test-run',scopeId:'bu-a',from:'2026-06-01',to:'2026-06-15',kind:'regular',version:1,step:2,mode:'shadow',current:true,returned:false,paid:false,actions:[{step:0,action:'approve',actor:'Synthetic HR',at:'2026-09-16T00:00:00Z',reason:'Checked timekeeping'},{step:1,action:'approve',actor:'Synthetic endorser',at:'2026-09-16T01:00:00Z',reason:'Checked PR'}]};
let html=renderToStaticMarkup(React.createElement(Progress,{run:{...run,stage:stages[2]}}));for(const s of ['HR Manager','TEST APPROVAL','Synthetic HR','Checked timekeeping','HR Manager authorization','test-run'])assert.ok(html.includes(s),s);
const complete={...run,step:6};assert.equal(model.nextApproval(complete).path,'/payroll/pilot');assert.ok(!renderToStaticMarkup(React.createElement(Progress,{run:complete})).includes('/payroll/payments'));
assert.match(model.nextApproval({...run,current:false}).label,/Revise/);assert.match(model.nextApproval({...complete,mode:'live'}).path,/payments/);
const args={id:'proposal',scope:'bu-a',from:'2026-10-01',to:'2026-10-15',scopeName:'Synthetic Bakebe',resume:false,busy:false};let calls=[];
function confirmation(values){let i=0;const mockReact={...React,useState:initial=>[i<values.length?values[i++]:initial,()=>{}]};return compile('modules/payroll/LiveActivationConfirmation.tsx',{react:mockReact,'../../components/ui/Button':{default:Button,__esModule:true}}).default;}
let UI=confirmation([false]);html=renderToStaticMarkup(React.createElement(UI,{...args,onAuthorize:async a=>calls.push(a)}));assert.match(html,/Review live activation/);assert.ok(!html.includes('Authorize live activation'));
for(const state of [[true,'Synthetic Bakebe','Approved handover',false],[true,'Wrong BU','Approved handover',true],[true,'Synthetic Bakebe','',true]]){
 UI=confirmation(state);const form=UI({...args,onAuthorize:async a=>calls.push(a)});form.props.onSubmit({preventDefault(){}});assert.equal(calls.length,0);
}
UI=confirmation([true,'Synthetic Bakebe','Approved handover',true]);const form=UI({...args,onAuthorize:async a=>calls.push(a)});form.props.onSubmit({preventDefault(){}});await Promise.resolve();assert.equal(calls.length,1);assert.deepEqual(calls[0],{id:args.id,scope:args.scope,from:args.from,to:args.to,scopeName:args.scopeName,reference:'Approved handover',authorized:true});
UI=confirmation([true,'Synthetic Bakebe','Approved handover',true]);UI({...args,busy:true,onAuthorize:async a=>calls.push(a)}).props.onSubmit({preventDefault(){}});assert.equal(calls.length,1,'Busy requests cannot be duplicated');
console.log('PASS: owner/stage and completed decision rendering; test approvals route to pilot, not payments; stale version recovery; separate explicit activation form; false/mismatched/missing confirmation rejected; exact scope/window authorization payload; busy duplicate blocked.');
