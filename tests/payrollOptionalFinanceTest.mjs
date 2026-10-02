import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import vm from 'node:vm';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'optional-finance-'));
try{
 const bundle=await build({stdin:{contents:"export * from './modules/payroll/financeInputs';export * from './modules/payroll/netPay';export {default as FinanceExceptions} from './modules/payroll/FinanceExceptions';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',external:['react'],write:false,define:{'import.meta.env.VITE_SUPABASE_URL':'"https://example.invalid"','import.meta.env.VITE_SUPABASE_ANON_KEY':'"fixture"'}});
 const filename=path.join(process.cwd(),'node_modules','.optional-finance-test.cjs');fs.writeFileSync(filename,bundle.outputFiles[0].text);
 let api;try{api=createRequire(import.meta.url)(filename);}finally{fs.unlinkSync(filename);}
 const {initialNetInputs,financeIssues,taxGroups,updateTaxGroup,updateField,FinanceExceptions,arrangementLabel}=api;
 const w={gross:{id:'fixture',from:'2026-08-26',to:'2026-09-10',current:true,result:{employees:[{employeeId:'person',employeeName:'Synthetic person',gross:'100.01',lines:[{label:'Basic',amount:'60.01'},{label:'Basic',amount:'40.00'}]}]}},loans:[],runs:[],defaults:{payDate:'2026-09-20',contributionMonth:'2026-09-01',cutoff:'2',previousRunId:'',sourceRef:'Automatic calendar'},review:null};
 const blank=initialNetInputs(w);assert.equal(blank.employees[0].openingTaxable,'');assert.equal(financeIssues(w,blank).length,1);
 let row={...blank.employees[0],sssBase:'20000',philhealthBase:'20000',pagibigBase:'20000',sssCovered:true,philhealthCovered:true,pagibigCovered:true,sourceRef:'Approved basis',openingTaxable:'100000',openingWithheld:'2000',openingPeriods:'10',previousEmployer:false,cumulativeAlready:false,openingRef:'Earlier actual payroll',openingContributions:Object.fromEntries(Object.keys(blank.employees[0].openingContributions).map(k=>[k,'0'])),taxLines:[{taxable:'60.01',kind:'regular',exemptionRef:''},{taxable:'40.00',kind:'regular',exemptionRef:''}]};
 const ready={...blank,employees:[row]};assert.deepEqual(financeIssues(w,ready),[],'No workbook flag is required for complete figures');
 row=updateField(row,'openingContributions.sssEE','50.25');assert.equal(row.openingContributions.sssEE,'50.25');assert.equal(ready.employees[0].openingContributions.sssEE,'0','Editing does not mutate saved inputs');
 const group=taxGroups(w,row)[0];const split=updateTaxGroup(w,row,group,'50.00','regular','Synthetic exemption authority');assert.equal(split.taxLines.reduce((n,t)=>n+Math.round(Number(t.taxable)*100),0),5000);assert.deepEqual(financeIssues(w,{...ready,employees:[split]}),[]);
 assert.throws(()=>updateTaxGroup(w,row,{...group,treatment:'included'},'0','regular',''),/approved package/);
 assert.equal(financeIssues(w,{...ready,employees:[{...row,sssCovered:false,coverageRef:''}]}).length,1,'Coverage exclusion still needs authority');
 assert.equal(financeIssues(w,{...ready,employees:[{...row,openingContributions:{}}]}).length,1,'Missing previous deductions are never silently zeroed');
 const html=renderToStaticMarkup(React.createElement(FinanceExceptions,{w,p:ready,disabled:false,onChange(){}}));assert.match(html,/ready to calculate/);assert.match(html,/Edit only if changed/);assert.doesNotMatch(html,/<input|<select/,'Complete records do not show mandatory entry fields');
 const incomplete=renderToStaticMarkup(React.createElement(FinanceExceptions,{w,p:blank,disabled:false,onChange(){}}));assert.match(incomplete,/Fill missing records/);assert.match(incomplete,/Earlier payroll/);
 const page=fs.readFileSync('modules/payroll/NetPayPage.tsx','utf8'),ast=ts.createSourceFile('review.tsx',page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let init;const visit=n=>{if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='ReviewForm')init=n.initializer.getText(ast);ts.forEachChild(n,visit);};visit(ast);
 let index=0;const component=vm.runInNewContext(ts.transpileModule('('+init+')',{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText,{React,useState:v=>React.useState(index++===1?true:v),initialNetInputs,arrangementLabel,financeIssues,FinanceExceptions,input:'input',Card:({title,children})=>React.createElement('section',null,title,children),Button:({children,disabled,type})=>React.createElement('button',{disabled,type},children),PayrollATDQueue:()=>null});
 const render=renderToStaticMarkup(React.createElement(component,{w:{...w,review:{inputs:ready}},busy:false,onWorking(){},save:async()=>{}}));assert.match(render,/<button type="submit">Record Finance review<\/button>/,'Confirmed complete review can be calculated without an upload');assert.match(render,/Optional workbook/);
 console.log('PASS: complete review submits without upload; missing history/coverage remains explicit; inline edits preserve saved input; grouped tax cents reconcile and approved treatment is enforced.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
