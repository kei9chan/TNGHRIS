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
 const path=join(dir,'workbook.cjs');await writeFile(path,bundle.outputFiles[0].text);const {downloadNetWorkbook,importNetWorkbook}=createRequire(import.meta.url)(path);
 const e={employeeId:'fixture',sssBase:'30000',philhealthBase:'30000',pagibigBase:'30000',sssCovered:true,philhealthCovered:true,pagibigCovered:true,coverageRef:'',openingTaxable:'0',openingWithheld:'0',openingPeriods:'0',previousEmployer:false,cumulativeAlready:false,sourceRef:'Reviewed fixture',openingRef:'Reviewed opening',openingContributions:{sssEE:'0',sssER:'0',mpfEE:'0',mpfER:'0',ecER:'0',philhealthEE:'0',philhealthER:'0',pagibigEE:'0',pagibigER:'0'},taxLines:[{taxable:'15000.00',kind:'regular',exemptionRef:''}],deductions:[]};
 const inputs={ruleset:'PH-2026-09-06',employees:[e],payDate:'2026-09-15'};
 const w={gross:{id:'gross-fixture',from:'2026-08-26',to:'2026-09-10',result:{employees:[{employeeId:'fixture',employeeName:'Fixture employee',lines:[{label:'Basic',amount:'15000.00'}]}]}}};
 let blob;globalThis.document={createElement:()=>({click(){}})};URL.createObjectURL=b=>{blob=b;return 'blob:fixture';};URL.revokeObjectURL=()=>{};
 await downloadNetWorkbook(w,inputs);assert.ok(blob);const raw=await blob.arrayBuffer();
 const file=data=>({size:data.byteLength,arrayBuffer:async()=>data});
 const imported=await importNetWorkbook(file(raw),w,inputs);assert.equal(imported.inputs.employees.length,1);assert.equal(imported.inputs.employees[0].taxLines[0].taxable,'15000.00');assert.equal(imported.inputs.employees[0].sssCovered,true);
 const book=new ExcelJS.Workbook();await book.xlsx.load(raw);book.getWorksheet('Instructions').getCell('B1').value='wrong-version';
 await assert.rejects(importNetWorkbook(file(await book.xlsx.writeBuffer()),w,inputs),/different gross-pay version/);
 await book.xlsx.load(raw);book.getWorksheet('Employee review').getCell('C2').value={formula:'1+1',result:2};
 await assert.rejects(importNetWorkbook(file(await book.xlsx.writeBuffer()),w,inputs),/plain values/);
 await book.xlsx.load(raw);book.getWorksheet('Tax lines').addRow(['fixture','Fixture employee',0,'Basic','15000.00','15000.00','regular','']);
 await assert.rejects(importNetWorkbook(file(await book.xlsx.writeBuffer()),w,inputs),/Keep every gross line/);
 console.log('PASS: batch workbook round-trip, explicit boolean/decimal values, wrong-version/formula/duplicate-line rejection; no network or database writes.');
}finally{await rm(dir,{recursive:true,force:true});}
