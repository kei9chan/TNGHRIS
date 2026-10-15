import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import ExcelJS from 'exceljs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

function load(path,deps={}){
 const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{fileName:path,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
 const exports={};vm.runInNewContext(code,{exports,Date,require:name=>{assert.ok(name in deps,name);return deps[name];}});return exports;
}
const base=load('modules/payroll/payPackageImport.ts');
const {readPayPackageCompletion}=load('modules/payroll/payPackageCompletionImport.ts',{'./payPackageImport':base});
function columnSheet(workbook,name,records,idField='Employee ID'){
 const s=workbook.addWorksheet(name),fields=[idField,...new Set(records.flatMap(record=>Object.keys(record)).filter(key=>key!==idField))];
 s.addRow(['Field','Requirement','Owner','How to complete',...records.map((_,i)=>`Employee ${i+1}`)]);
 fields.forEach((field,i)=>{s.getCell(i+2,1).value=field;records.forEach((record,j)=>{s.getCell(i+2,j+5).value=record[field]||null;});});return s;
}
const workbook=new ExcelJS.Workbook();
columnSheet(workbook,'01 Profiles',[{'Employee ID':'TNG-002','Business unit':'Unit B','Legal full name':'Employee B'},{'Employee ID':'TNG-S-001','Business unit':'Unit A','Legal full name':'Employee A'}]);
const packages=columnSheet(workbook,'02 Pay Packages',[
 {'Employee ID':'TNG S-001','Salary basis':'Monthly','Basic amount (PHP)':25000,'Effective from':new Date('2026-10-01T00:00:00Z'),'Pay treatment':'Gross','Currency':'PHP','Approval status':'Draft'},
 {'Employee ID':'TNG-002','Salary basis':'Daily','Basic amount (PHP)':750,'Effective from':'2026-10-01','Pay treatment':'Gross','Currency':'PHP','Employer-paid withholding tax':'Yes'},
 {'Employee ID':'EX-001','Basic amount (PHP)':99999},
]);
packages.getCell('D1000').value=''; // Formatted empty rows must not become records.
const benefits=workbook.addWorksheet('03 Benefits');
benefits.addRow(['Employee ID','Benefit type','Category / description','Amount PHP','Frequency','Effective from','Tax treatment / policy reference']);
benefits.addRow(['TNG-S-001','Fixed allowance','Transport',500,'Per cutoff','2026-10-01','Approved transport policy']);
const consultant=columnSheet(workbook,'04 Consultant',[{'Employee ID / payee ID':'TNG-C-01','Fee basis':'Monthly','Fee amount (PHP)':'30,000','Payee legal name / entity':'Consultant','Services / deliverables':'Distinct contracted services','Effective from / to':'2026-10-01'}],'Employee ID / payee ID');
columnSheet(workbook,'06 Managerial Gross',[{'Employee ID':'EX-002','Basic amount (PHP)':12345}]);
let rows=readPayPackageCompletion(workbook);
assert.equal(rows.length,3);assert.equal(rows[0].values['Employee code'],'TNG-S-001');
assert.equal(rows[0].values['Business unit / payroll group'],'Unit A','Join by ID, not source column order');
assert.equal(rows[0].values['Effective from'],'2026-10-01');assert.equal(rows[0].values['Basic pay / fee amount'],'25000');
assert.equal(rows[1].values['Amount unit'],'Daily');assert.equal(rows[2].values['Pay stream'],'professional_fee');assert.equal(rows[2].values['Basic pay / fee amount'],'30000');
const context={employeeId:'employee-a',sourceHash:'source-hash',scopes:[{id:'unit-a',name:'Unit A',canEdit:true}],packages:[],sources:[{id:null,baseAmount:25000,conflict:false}]};
const prepared=base.prepareImport(rows[0],context);
assert.equal(prepared.payload.treatment.submissionIntent,'draft');
assert.equal(prepared.payload.components[0].frequency,'Per cutoff');
assert.equal(prepared.payload.components[0].tax,'unreviewed','Missing tax treatment must never silently become a tax exemption');
assert.throws(()=>base.prepareImport(rows[1],context),/Gross pay conflicts/);
assert.equal(base.classifyImportIssue(rows[1].issues[0].message),'review');

// Orphan benefits remain visible as blocked rows, not omitted or invented pay.
benefits.addRow(['TNG-999','De minimis','Meal allowance',100,'Monthly','2026-10-01']);
rows=readPayPackageCompletion(workbook);assert.equal(rows.length,4);
assert.match(rows[3].values.Notes,/Meal allowance/);assert.equal(rows[3].values['Basic pay / fee amount'],'');
assert.throws(()=>base.prepareImport(rows[3],context),/no matching salary package/);
benefits.getCell('F2').value='2026-11-01';rows=readPayPackageCompletion(workbook);
assert.throws(()=>base.prepareImport({...rows[0],values:{...rows[0].values,'Effective from':'2026-11-01'}},context),/benefit dates differ/,'An unrelated row edit must not erase an unresolved source date range');
benefits.getCell('F2').value='2026-10-01';
packages.getCell(3,5).value={formula:'20000+5000',result:25000};
assert.throws(()=>readPayPackageCompletion(workbook),/replace formulas/);
assert.equal(readPayPackageCompletion(new ExcelJS.Workbook()),null,'Existing batch formats retain their reader');

// Exercise the actual file-input handler through to its validation preview.
// No save/submit operation may happen merely from selecting a workbook.
packages.getCell(3,5).value=25000;
let cursor=0,fetching=0,peakFetching=0,writes=0;const states=[],refs=[];
const hooks={...React,useMemo:fn=>fn(),useEffect:()=>{},useRef:value=>{const i=cursor++;return refs[i]??(refs[i]={current:value});},useState:initial=>{const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];}};
const component=tag=>({__esModule:true,default:({children,...props})=>React.createElement(tag,props,children)});
const uploader=load('modules/payroll/PayPackageBatchUpload.tsx',{
 react:hooks,'./readImportWorkbook':{readImportWorkbook:async()=>workbook},'./payPackageImport':base,
 './payPackageCompletionImport':{readPayPackageCompletion},'../../services/biometricImport':{},'./actualAttendanceImport':{},
 '../../components/ui/Button':component('button'),'../../components/ui/Card':component('section'),
 './payPackages':{fetchPayPackages:async employeeId=>{fetching++;peakFetching=Math.max(peakFetching,fetching);await new Promise(setImmediate);fetching--;return{...context,employeeId};},savePayPackage:async()=>{writes++;},submitPayPackageDraft:async()=>{writes++;}},
}).default;
const directory=[{id:'employee-a',employeeCode:'TNG-S-001',name:'Employee A'},{id:'employee-b',employeeCode:'TNG-002',name:'Employee B'}];
const renderUploader=()=>{cursor=0;return uploader({directory,onSubmitted:()=>{writes++;}});};
function findFile(node){if(Array.isArray(node))return node.map(findFile).find(Boolean);if(!node||typeof node!=='object')return null;if(node.type==='input'&&node.props.type==='file')return node;return findFile(node.props?.children);}
findFile(renderUploader()).props.onChange({target:{files:[{name:'completion.xlsx',size:2048,arrayBuffer:async()=>new ArrayBuffer(0)}],value:''}});
for(let i=0;i<8;i++)await new Promise(setImmediate);
const html=renderToStaticMarkup(renderUploader());
assert.match(html,/Employee A/);assert.match(html,/Employee B/);assert.match(html,/Needs review/);
assert.equal(writes,0);assert.ok(peakFetching>1&&peakFetching<=4,'Validation is bounded and concurrent');

// Optional private regression check; source HR records are never committed.
if(process.env.COMPLETION_SOURCE){
 const actual=new ExcelJS.Workbook();await actual.xlsx.readFile(process.env.COMPLETION_SOURCE);
 const imported=readPayPackageCompletion(actual),salary=imported.filter(row=>row.values['Pay stream']==='employee_payroll'&&!row.values['Package key'].startsWith('ORPHAN-'));
 assert.equal(salary.length,129);assert.equal(imported.filter(row=>row.values['Pay stream']==='professional_fee').length,3);
 assert.equal(imported.filter(row=>row.values['Package key'].startsWith('ORPHAN-')).length,2);
 assert.equal(imported.flatMap(row=>row.components).length,61);
 assert.equal(salary.filter(row=>row.issues.some(issue=>issue.message.includes('Gross pay conflicts'))).length,13);
 assert.ok(!imported.some(row=>/^EX-|^DEMO-/i.test(row.values['Employee code'])));
 console.log('PASS: exact supplied workbook — 129 salaries, 3 separate consultant entries, 61 attached benefits, 2 orphan benefits retained for review, and 13 conflicting gross arrangements flagged.');
}
console.log('PASS: employee-ID joins, exact dates and amounts, benefit frequency, draft-only intent, unreviewed tax, examples excluded, conflicts and orphan benefits surfaced, formula rejection and legacy fallthrough.');
