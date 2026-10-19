import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
const load=(path,deps={})=>{const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,{exports,Date,Error,require:name=>deps[name]});return exports;};
const base=load('modules/payroll/payPackageImport.ts');
const source=base.simpleImportRows([{row:2,values:{'Employee code':'E-1','Employee name':'Fixture Employee','Business unit':'Fixture Unit','Pay type':'Employee salary','Effective date':'2026-10-01','Amount unit':'Monthly','Approved basic pay / fee':'25000','Existing reimbursable':'1000','Salary source':'Current HRIS record','Source document / note':'Approved salary source','Reason for this record':'Fixture setup'}}])[0];
assert.equal(base.classifyImportIssue('',source),'ready','Standing allowance setup must not require cutoff receipts.');
assert.equal(base.classifyImportIssue('',source,true),'ready');
assert.equal(base.classifyImportIssue('',{...source,values:{...source.values,'Receipt or document reference':'https://example.com/receipt.pdf'}}),'ready');
assert.equal(base.classifyImportIssue('Pay-package editing is not allowed.',source,true),'blocked');
assert.equal(base.classifyImportIssue('Needs review: conflicting terms',source,true),'review');

const context={employeeId:'fixture',sourceHash:'current-hash',legacy:{rateAmount:25000,salaryBasic:25000,reimbursable:1000},scopes:[{id:'scope',name:'Fixture Unit',canEdit:true,employeePayroll:true}],packages:[],sources:[{id:null,baseAmount:25000,rateType:'Monthly',deminimis:0,reimbursable:1000,conflict:false}]};
let cursor=0,states=[],refs=[],calls=[],rejectUpload=false,saved;
const hooks={...React,useMemo:fn=>fn(),useEffect:()=>{},useRef:value=>{const i=cursor++;return refs[i]??(refs[i]={current:value});},useState:initial=>{const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];}};
const Button=()=>null,Card=()=>null;
const Uploader=load('modules/payroll/PayPackageBatchUpload.tsx',{
  react:hooks,'../../components/ui/Button':{__esModule:true,default:Button},'../../components/ui/Card':{__esModule:true,default:Card},
  './readImportWorkbook':{readImportWorkbook:async()=>({})},'./payPackageCompletionImport':{readPayPackageCompletion:()=>[source],completionIdentityIssue:()=>''},
  './payPackageImport':{...base,verifySavedImport:()=>{}},'../../services/biometricImport':{},'./actualAttendanceImport':{},
  './payPackages':{fetchPayDirectory:async()=>[{id:'fixture',employeeCode:'E-1',name:'Fixture Employee'}],fetchPayPackages:async()=>context,savePayPackage:async(_employee,_scope,payload)=>{calls.push('save');saved=payload;return 'draft-id';},uploadPayPackageDocument:async(id,file)=>{calls.push('upload:'+file.name);assert.equal(id,'draft-id');if(rejectUpload)throw Error('Receipt upload failed');return 'document-id';},submitPayPackageDraft:async id=>{assert.equal(id,'draft-id');calls.push('submit');}},
}).default;
const render=()=>{cursor=0;return Uploader({directory:[{id:'fixture',employeeCode:'E-1',name:'Fixture Employee'}],onSubmitted:()=>{calls.push('refresh');}});};
const all=(node,predicate,hits=[])=>{if(!React.isValidElement(node))return hits;if(predicate(node))hits.push(node);for(const child of React.Children.toArray(node.props.children))all(child,predicate,hits);return hits;};
const text=node=>typeof node==='string'?node:React.isValidElement(node)?React.Children.toArray(node.props.children).map(text).join(''):'';
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(setImmediate);};
async function chooseReceipt(){
  all(render(),e=>e.type==='input'&&e.props.type==='file')[0].props.onChange({target:{files:[{name:'fixture.xlsx',size:100,arrayBuffer:async()=>new ArrayBuffer(0)}],value:''}});await settle();
  let tree=render();assert.ok(text(tree).includes('Ready to submit'));assert.equal(calls.length,0);
  all(tree,e=>e.type==='button'&&text(e)==='View')[0].props.onClick();
  tree=render();assert.ok(!text(tree).includes('Reimbursable allowance requires receipt')); all(tree,e=>e.type==='input'&&e.props.type==='file'&&!e.props.accept)[0].props.onChange({target:{files:[{name:'receipt.pdf'}]}});
  tree=render();assert.ok(text(tree).includes('receipt.pdf'));
  all(tree,e=>e.type===Button&&text(e)==='Revalidate and submit')[0].props.onClick();await settle();
}
await chooseReceipt();
assert.deepEqual(calls,['save','upload:receipt.pdf','submit','refresh']);
assert.equal(saved.components[0].receiptRequired,true);
assert.notEqual(saved.components[0].receiptStatus,'approved_and_payable','Attaching evidence must not approve payment.');
states=[];refs=[];calls=[];rejectUpload=true;
await chooseReceipt();
assert.deepEqual(calls,['save','upload:receipt.pdf'],'Failed upload must prevent submission.');
assert.ok(text(render()).includes('Receipt upload failed'));
console.log('PASS: standing reimbursable allowance needs no receipt at package setup; optional documents still save/upload/submit in order; upload failure blocks submission; independent approval retained.');
