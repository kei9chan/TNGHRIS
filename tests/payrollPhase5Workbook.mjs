import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import ExcelJS from 'exceljs';
const dir=await mkdtemp(join(tmpdir(),'payroll-workbook-'));
try{
 const bundle=await build({entryPoints:['modules/payroll/netWorkbook.ts'],bundle:true,platform:'node',format:'cjs',write:false,define:{'import.meta.env.VITE_SUPABASE_URL':'"https://example.invalid"','import.meta.env.VITE_SUPABASE_ANON_KEY':'"arithmetic-fixture-only"'}});
 const path=join(dir,'workbook.cjs');await writeFile(path,bundle.outputFiles[0].text);const {downloadNetWorkbook,importNetWorkbook,buildNetWorkbook}=createRequire(import.meta.url)(path);
 const e={employeeId:'fixture',sssBase:'30000',philhealthBase:'30000',pagibigBase:'30000',sssCovered:true,philhealthCovered:true,pagibigCovered:true,coverageRef:'',openingTaxable:'0',openingWithheld:'0',openingPeriods:'0',previousEmployer:false,cumulativeAlready:false,sourceRef:'Reviewed fixture',openingRef:'Reviewed opening',openingContributions:{sssEE:'0',sssER:'0',mpfEE:'0',mpfER:'0',ecER:'0',philhealthEE:'0',philhealthER:'0',pagibigEE:'0',pagibigER:'0'},taxLines:[{taxable:'15000.00',kind:'regular',exemptionRef:''}],deductions:[]};
 const inputs={ruleset:'PH-2026-09-06',employees:[e],payDate:'2026-09-15'};
 const w={gross:{id:'gross-fixture',from:'2026-08-26',to:'2026-09-10',result:{employees:[{employeeId:'fixture',employeeName:'Fixture employee',gross:'15000.00',lines:[{label:'Basic',amount:'15000.00'}]}]}}};
 let blob;globalThis.document={createElement:()=>({click(){}})};URL.createObjectURL=b=>{blob=b;return 'blob:fixture';};URL.revokeObjectURL=()=>{};
 await downloadNetWorkbook(w,inputs);assert.ok(blob);const raw=await blob.arrayBuffer();
 const file=data=>({size:data.byteLength,arrayBuffer:async()=>data});
 const imported=await importNetWorkbook(file(raw),w,inputs);assert.equal(imported.inputs.employees.length,1);assert.equal(imported.inputs.employees[0].taxLines[0].taxable,'15000.00');assert.equal(imported.inputs.employees[0].sssCovered,true);
 const book=new ExcelJS.Workbook();await book.xlsx.load(raw);book.getWorksheet('_version').getCell('B1').value='wrong-version';
 await assert.rejects(importNetWorkbook(file(await book.xlsx.writeBuffer()),w,inputs),/different gross-pay version/);
 await book.xlsx.load(raw);book.getWorksheet('Contributions').getCell('C4').value={formula:'1+1',result:2};
 await assert.rejects(importNetWorkbook(file(await book.xlsx.writeBuffer()),w,inputs),/plain values/);
 await book.xlsx.load(raw);book.getWorksheet('Earnings review').addRow(['pay-0001','Fixture employee','Basic','15000.00','15000.00','regular','','']);
 await assert.rejects(importNetWorkbook(file(await book.xlsx.writeBuffer()),w,inputs),/Keep every earnings group/);
 await book.xlsx.load(raw);
 assert.equal(book.getWorksheet('Contributions').getColumn(1).hidden,true);
 assert.equal(book.getWorksheet('Contributions').getCell('C4').fill.fgColor.argb,'FFF2CC');
 assert.equal(book.getWorksheet('Earnings review').getCell('D4').fill.fgColor.argb,'E8F1FC');
 assert.equal(book.getWorksheet('Other deductions').getCell('A4').dataValidation.type,'list');
 assert.ok(book.getWorksheet('Start here').getCell('B13').value.includes('800.00'));
 assert.equal(imported.inputs.allocation.sss,'0.5');
 await book.xlsx.load(raw);book.getWorksheet('Earnings review').getCell('D4').value=16000;
 await assert.rejects(importNetWorkbook(file(await book.xlsx.writeBuffer()),w,inputs),/cannot be changed/);

 // Daily OT collapses to one input, then maps back to exact cents without losing rows.
 const groupedW=structuredClone(w),groupedInputs=structuredClone(inputs);
 groupedW.gross.result.employees[0].lines=Array.from({length:101},()=>({label:'Approved actual overtime',amount:'0.01'}));
 groupedInputs.employees[0].taxLines=Array.from({length:101},()=>({taxable:'',kind:'supplement',exemptionRef:''}));
 const groupedBook=await buildNetWorkbook(groupedW,groupedInputs);
 assert.equal(groupedBook.getWorksheet('Earnings review').rowCount,4,'101 daily earnings become one group');
 groupedBook.getWorksheet('Earnings review').getCell('E4').value=0.50;
 groupedBook.getWorksheet('Earnings review').getCell('G4').value='Synthetic partial exemption basis';
 const groupedImport=await importNetWorkbook(file(await groupedBook.xlsx.writeBuffer()),groupedW,groupedInputs);
 assert.equal(groupedImport.inputs.employees[0].taxLines.length,101);
 assert.equal(groupedImport.inputs.employees[0].taxLines.reduce((a,x)=>a+Math.round(Number(x.taxable)*100),0),50);
 assert.ok(groupedImport.inputs.employees[0].taxLines.every(x=>Number(x.taxable)<=0.01));
 // Demonstration rows are confined to instructions, never loaded as payroll data.
 assert.equal(groupedImport.loans.length,0);assert.equal(groupedImport.inputs.employees[0].deductions.length,0);
 if(process.env.PAYROLL_WORKBOOK_PREVIEW)await groupedBook.xlsx.writeFile(process.env.PAYROLL_WORKBOOK_PREVIEW);
 console.log('PASS: batch workbook round-trip, explicit boolean/decimal values, wrong-version/formula/duplicate-line rejection; no network or database writes.');
}finally{await rm(dir,{recursive:true,force:true});}
