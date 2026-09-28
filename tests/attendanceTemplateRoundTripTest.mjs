import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import JSZip from 'jszip';
const dir=await fs.mkdtemp(path.join(process.cwd(),'node_modules/.attendance-template-test-'));
try{
 const target=path.join(dir,'reader.mjs');await build({entryPoints:['modules/payroll/actualAttendanceImport.ts'],bundle:true,platform:'node',format:'esm',outfile:target,packages:'external'});
 const {readAttendanceFile,prefillAttendanceWorkbook,normalizeAttendance}=await import(pathToFileURL(target));
 const current=await fs.readFile('public/templates/attendance-v4.xlsx');
 assert.deepEqual(Buffer.from((await fs.readFile('public/templates/attendance-v4.xlsx.b64','utf8')).trim(),'base64'),current);
 await assert.rejects(()=>readAttendanceFile(new File([current],'attendance-v4.xlsx'),'Bakebe – SM Aura'),/no attendance records/);
 const prefilled=await prefillAttendanceWorkbook(Uint8Array.from(current).buffer,[{code:'00001',name:'Fixture Employee',businessUnit:'Bakebe – SM Aura',date:'2026-08-27',status:'Rest day'}]);
 const filledRows=await readAttendanceFile(new File([prefilled],'prefilled.xlsx'),'Bakebe – SM Aura');
 assert.equal(filledRows[0].employeeId,'00001');assert.equal(filledRows[0].dayStatus,'Rest day');assert.equal(filledRows[0].events.length,0);
 for(const [classification,canonical] of [['Worked','Workday'],['Absent','Absent (review)'],['Sick or unable to report','Absent (review)'],['Approved leave','Absent (review)'],['Leave without pay','Absent (review)'],['Suspension','Suspended'],['Regular holiday','Legal holiday'],['Special nonworking day','Legal holiday'],['For review','Missing punches (review)']]){
  const cells=['00001','Fixture Employee','Bakebe – SM Aura','2026-08-27',classification,'','','','','','','None',''];
  if(classification==='Worked')cells[5]='2026-08-27 09:00';
  const result=normalizeAttendance([cells],'Bakebe – SM Aura')[0];assert.equal(result.dayStatus,canonical);assert.equal(result.classification,classification);
 }
 const currentZip=await JSZip.loadAsync(current);const currentEntry='xl/worksheets/sheet2.xml';
 const currentXml=await currentZip.file(currentEntry).async('string');
 const populatedRow='<x:row r="2"><x:c r="A2" t="str"><x:v>00001</x:v></x:c><x:c r="B2" t="str"><x:v>Fixture Employee</x:v></x:c><x:c r="C2" t="str"><x:v>Bakebe – SM Aura</x:v></x:c><x:c r="D2" t="str"><x:v>2026-08-27</x:v></x:c><x:c r="E2" t="str"><x:v>Rest day</x:v></x:c></x:row>';
 currentZip.file(currentEntry,currentXml.replace(/<x:row r="2"[\s\S]*?<\/x:row>/,populatedRow));
 const currentRows=await readAttendanceFile(new File([await currentZip.generateAsync({type:'uint8array'})],'prefilled-v4.xlsx'),'Bakebe – SM Aura');
 assert.equal(currentRows[0].employeeId,'00001');assert.equal(currentRows[0].dayStatus,'Rest day');assert.equal(currentRows[0].events.length,0);
 const original=Buffer.from((await fs.readFile('public/templates/attendance-v3.xlsx.b64','utf8')).trim(),'base64');
 await assert.rejects(()=>readAttendanceFile(new File([original],'attendance.xlsx'),'Bakebe – SM Aura'),/no attendance records/);
 // Isolated fixture mutation of the exported template; never uploaded to a server.
 const zip=await JSZip.loadAsync(original);const entry='xl/worksheets/sheet2.xml';
 const xml=await zip.file(entry).async('string');
 const row='<x:row r="2"><x:c r="A2" t="str"><x:v>00001</x:v></x:c><x:c r="B2" t="str"><x:v>Bakebe – SM Aura</x:v></x:c><x:c r="C2" t="str"><x:v>2026-08-26</x:v></x:c><x:c r="D2" t="str"><x:v>Workday</x:v></x:c><x:c r="E2" t="str"><x:v>2026-08-26 22:00</x:v></x:c><x:c r="H2" t="str"><x:v>2026-08-27 06:00</x:v></x:c><x:c r="K2" t="str"><x:v>Overtime</x:v></x:c><x:c r="L2" t="str"><x:v>Review approved duration</x:v></x:c></x:row>';
 zip.file(entry,xml.replace(/<x:row r="2"[\s\S]*?<\/x:row>/,row));
 const populated=await zip.generateAsync({type:'uint8array'});
 const result=await readAttendanceFile(new File([populated],'attendance.xlsx'),'Bakebe – SM Aura');
 assert.equal(result.length,1);assert.equal(result[0].employeeId,'00001');assert.equal(result[0].events[1].timestamp,'2026-08-27T06:00:00+08:00');
 assert.equal(result[0].reviewRequest,'Overtime');
 const restRow=row.replace('2026-08-26','2026-08-27').replace('Workday','Rest day').replace(/<x:c r="E2"[\s\S]*?<\/x:c>/,'').replace(/<x:c r="H2"[\s\S]*?<\/x:c>/,'');
 zip.file(entry,xml.replace(/<x:row r="2"[\s\S]*?<\/x:row>/,restRow));
 const rest=(await readAttendanceFile(new File([await zip.generateAsync({type:'uint8array'})],'rest.xlsx'),'Bakebe – SM Aura'))[0];assert.equal(rest.dayStatus,'Rest day');assert.equal(rest.events.length,0);
 zip.file(entry,xml.replace(/<x:row r="2"[\s\S]*?<\/x:row>/,row.replace('<x:v>00001</x:v>','<x:f>1+1</x:f><x:v>2</x:v>')));
 await assert.rejects(()=>zip.generateAsync({type:'uint8array'}).then(bytes=>readAttendanceFile(new File([bytes],'attendance.xlsx'),'Bakebe – SM Aura')),/Formulas/);
 zip.file(entry,xml.replace(/<x:row r="2"[\s\S]*?<\/x:row>/,row));
 zip.file('xl/worksheets/sheet1.xml',(await zip.file('xl/worksheets/sheet1.xml').async('string')).replace('attendance:3','attendance:999'));
 await assert.rejects(()=>zip.generateAsync({type:'uint8array'}).then(bytes=>readAttendanceFile(new File([bytes],'attendance.xlsx'),'Bakebe – SM Aura')),/Unsupported template/);
 const version2=await fs.readFile('public/templates/attendance-v2.xlsx');const v2Zip=await JSZip.loadAsync(version2);const v2Xml=await v2Zip.file(entry).async('string');
 v2Zip.file(entry,v2Xml.replace(/<x:row r="2"[\s\S]*?<\/x:row>/,row.replace(/<x:c r="K2"[\s\S]*?<\/x:c>/,'').replace(/<x:c r="L2"[\s\S]*?<\/x:c>/,'')));
 const v2Result=await readAttendanceFile(new File([await v2Zip.generateAsync({type:'uint8array'})],'old-v2.xlsx'),'Bakebe – SM Aura');assert.equal(v2Result[0].reviewRequest,'None');
 const legacy=await fs.readFile('public/templates/attendance-v1.xlsx');const oldZip=await JSZip.loadAsync(legacy);const oldXml=await oldZip.file(entry).async('string');
 const legacyRow=row.replace(/<x:c r="D2"[\s\S]*?<\/x:c>/,'').replace('r="E2"','r="D2"').replace('r="H2"','r="G2"').replace(/<x:c r="K2"[\s\S]*?<\/x:c>/,'').replace(/<x:c r="L2"[\s\S]*?<\/x:c>/,'');
 oldZip.file(entry,oldXml.replace(/<x:row r="2"[\s\S]*?<\/x:row>/,legacyRow));
 const oldResult=await readAttendanceFile(new File([await oldZip.generateAsync({type:'uint8array'})],'old.xlsx'),'Bakebe – SM Aura');assert.equal(oldResult[0].dayStatus,'Workday');
 console.log('PASS: official workbook round-trip, leading zeros, examples/instructions excluded, overnight dates, formula rejection and version rejection.');
}finally{await fs.rm(dir,{recursive:true,force:true});}
