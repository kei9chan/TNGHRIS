import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import JSZip from 'jszip';
const dir=await fs.mkdtemp(path.join(process.cwd(),'node_modules/.attendance-template-test-'));
try{
 const target=path.join(dir,'reader.mjs');await build({entryPoints:['modules/payroll/actualAttendanceImport.ts'],bundle:true,platform:'node',format:'esm',outfile:target,packages:'external'});
 const {readAttendanceFile}=await import(pathToFileURL(target));
 const original=await fs.readFile('public/templates/attendance-v1.xlsx');
 await assert.rejects(()=>readAttendanceFile(new File([original],'attendance.xlsx'),'Bakebe – SM Aura'),/no attendance records/);
 // Isolated fixture mutation of the exported template; never uploaded to a server.
 const zip=await JSZip.loadAsync(original);const entry='xl/worksheets/sheet2.xml';
 const xml=await zip.file(entry).async('string');
 const row='<x:row r="2"><x:c r="A2" t="str"><x:v>00001</x:v></x:c><x:c r="B2" t="str"><x:v>Bakebe – SM Aura</x:v></x:c><x:c r="C2" t="str"><x:v>2026-08-26</x:v></x:c><x:c r="D2" t="str"><x:v>2026-08-26 22:00</x:v></x:c><x:c r="G2" t="str"><x:v>2026-08-27 06:00</x:v></x:c></x:row>';
 zip.file(entry,xml.replace(/<x:row r="2"[\s\S]*?<\/x:row>/,row));
 const populated=await zip.generateAsync({type:'uint8array'});
 const result=await readAttendanceFile(new File([populated],'attendance.xlsx'),'Bakebe – SM Aura');
 assert.equal(result.length,1);assert.equal(result[0].employeeId,'00001');assert.equal(result[0].events[1].timestamp,'2026-08-27T06:00:00+08:00');
 zip.file(entry,xml.replace(/<x:row r="2"[\s\S]*?<\/x:row>/,row.replace('<x:v>00001</x:v>','<x:f>1+1</x:f><x:v>2</x:v>')));
 await assert.rejects(()=>zip.generateAsync({type:'uint8array'}).then(bytes=>readAttendanceFile(new File([bytes],'attendance.xlsx'),'Bakebe – SM Aura')),/Formulas/);
 zip.file(entry,xml.replace(/<x:row r="2"[\s\S]*?<\/x:row>/,row));
 zip.file('xl/worksheets/sheet1.xml',(await zip.file('xl/worksheets/sheet1.xml').async('string')).replace('attendance:1','attendance:999'));
 await assert.rejects(()=>zip.generateAsync({type:'uint8array'}).then(bytes=>readAttendanceFile(new File([bytes],'attendance.xlsx'),'Bakebe – SM Aura')),/Unsupported template/);
 console.log('PASS: official workbook round-trip, leading zeros, examples/instructions excluded, overnight dates, formula rejection and version rejection.');
}finally{await fs.rm(dir,{recursive:true,force:true});}
