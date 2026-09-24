import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import ExcelJS from 'exceljs';
const target=process.cwd()+'/node_modules/.input-roundtrip.mjs';
await build({entryPoints:['modules/payroll/inputTemplates.ts'],bundle:true,platform:'node',format:'esm',outfile:target,packages:'external'});
const {inputTemplates,readInputFile,validateInputRow,templateCsv}=await import(pathToFileURL(target));
const readTarget=target+'.reader.mjs';await build({entryPoints:['modules/payroll/readImportWorkbook.ts'],bundle:true,platform:'node',format:'esm',outfile:readTarget,packages:'external'});const {readImportWorkbook}=await import(pathToFileURL(readTarget));await fs.unlink(readTarget);
try{for(const schema of Object.values(inputTemplates)){
 const bytes=await fs.readFile(`public/templates/${schema.type}-v1.xlsx`);
 await assert.rejects(()=>readInputFile(new File([bytes],'template.xlsx'),schema),/no records/);
 const book=await readImportWorkbook(bytes);
 assert.deepEqual(book.worksheets.map(s=>s.name),['Instructions','Data Entry','Examples — Do Not Upload','Field Guide']);
 const sheet=book.getWorksheet('Data Entry');const fixture={...schema.sample,employeeId:'00001'};
 schema.fields.forEach((f,i)=>{sheet.getCell(2,i+1).value=fixture[f.key]||null;});
 let populated=await book.xlsx.writeBuffer();let result=await readInputFile(new File([populated],'template.xlsx'),schema);
 assert.equal(result.needsMapping,false,schema.type);assert.equal(result.raw.length,1);assert.equal(result.raw[0].cells[0],'00001');
 assert.deepEqual(validateInputRow(schema,fixture,2).errors,[],schema.type);
 assert.match(validateInputRow(schema,schema.sample,2).errors.join(' '),/Example-only/);
 sheet.getCell('A2').value={formula:'1+1',result:2};
 await assert.rejects(async()=>readInputFile(new File([await book.xlsx.writeBuffer()],'template.xlsx'),schema),/Formulas/);
 sheet.getCell('A2').value='00001';book.getWorksheet('Instructions').getCell('B1').value=schema.type+':999';
 await assert.rejects(async()=>readInputFile(new File([await book.xlsx.writeBuffer()],'template.xlsx'),schema),/Unsupported template/);
 book.getWorksheet('Instructions').getCell('B1').value='';
 result=await readInputFile(new File([await book.xlsx.writeBuffer()],'unversioned.xlsx'),schema);assert.equal(result.needsMapping,true,'Unversioned workbooks must be mapped explicitly');
 result=await readInputFile(new File([templateCsv(schema,[fixture])],'template.csv'),schema);assert.equal(result.needsMapping,false);assert.equal(result.raw.length,1);
 const custom=templateCsv(schema,[fixture]).replace(schema.fields[0].label,'Staff code');assert.equal((await readInputFile(new File([custom],'custom.csv'),schema)).needsMapping,true);
 }
 const s=inputTemplates.schedules;assert.match(validateInputRow(s,{...s.sample,employeeId:'00001',start:'2026-08-26 22:00',end:'2026-08-26 06:00'},2).errors.join(' '),/overnight/);
 assert.match(validateInputRow(s,{...s.sample,employeeId:'00001',workDate:'08/26/2026'},2).errors.join(' '),/YYYY-MM-DD/);
 console.log('PASS: all seven official workbook/CSV round-trips; blank Data Entry; separate examples; exact mapping; leading zeros; formulas, versions, example IDs, ambiguous dates and overnight validation.');
}finally{await fs.unlink(target);}
