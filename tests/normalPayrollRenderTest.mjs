import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const code=ts.transpileModule(fs.readFileSync('modules/payroll/RunPayroll.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
const net={id:'net-fixture',current:true,payDate:'2026-09-20',result:{gross:'40000.00',deductions:'2141.99',net:'37858.01',employer:'2000.00',employerTotalCost:'42000.00',employees:[{employeeId:'fixture',employeeName:'Fixture Employee',gross:'40000.00',deductions:'2141.99',net:'37858.01',employer:'2000.00',contributions:[],loans:[],otherDeductions:[]}]}};
for(const step of [0,1,2]){
 let index=0;const overrides={3:step?{id:'gross',result:{gross:'40000.00',employees:[]}}:null,4:step?net:null,6:step};
 const dependencies={
  react:{...React,useEffect:()=>{},useState:initial=>{const n=index++;return [n in overrides?overrides[n]:typeof initial==='function'?initial():initial,()=>{}];}},
  'react-router-dom':{Link:({to,children,...props})=>React.createElement('a',{href:to,...props},children)},
  '../../hooks/useAuth':{useAuth:()=>({user:{id:'fixture-user'}})},
  './scheduleScope':{canImportActualAttendance:()=>true},
  './usePayrollSelection':{usePayrollField:field=>[{scope:'fixture-scope',from:'2026-08-26',to:'2026-09-10'}[field],()=>{}]},
  './useCalculationSelection':{useCalculationSelection:()=>[{},()=>{}]},
  './attendanceReadiness':{},'./grossPay':{},'./netPay':{},'../../services/supabaseClient':{},'./workspace':{},
  './NormalPayrollPeriodSelector':{__esModule:true,default:()=>React.createElement('span',null,'September 20, 2026 · August 26–September 10')},
  './PreviousPaymentCard':{__esModule:true,default:()=>React.createElement('span',null,'Record previous payment')},
  './payrollCycle':{},'./actualAttendanceImport':{},
 };
 const exports={};vm.runInNewContext(code,{exports,require:name=>{if(!(name in dependencies))throw new Error(name);return dependencies[name];}},{filename:'RunPayroll.tsx'});
 const html=renderToStaticMarkup(React.createElement(exports.default));
 assert.match(html,/Save draft/);assert.match(html,/Generate &amp; approve/);assert.doesNotMatch(html,/Historical Payroll Reconciliation/);
 if(step===0){assert.match(html,/Prepare payroll/);assert.match(html,/Import attendance/);assert.match(html,/Additional records, if needed/);}
 else{assert.match(html,/₱40,000.00/);assert.match(html,/₱37,858.01/);assert.match(html,/Fixture Employee/);assert.match(html,/Download draft payslips/);assert.match(html,/DRAFT — NOT RELEASED/);}
 if(step===2)assert.match(html,/Submit for approval/);
}
console.log('PASS: actual Prepare, Review and Generate components render; amounts, draft controls and preserved approval link are present. Auth/network are isolated fixtures.');
