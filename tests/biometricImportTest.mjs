import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
const temp=await mkdtemp(`${tmpdir()}/biometric-import-`);
try{await build({entryPoints:['services/biometricImport.ts'],bundle:true,platform:'node',format:'esm',outfile:`${temp}/parser.mjs`});const {parseDelimited,normalizeBiometricRows}=await import(pathToFileURL(`${temp}/parser.mjs`));
const m={code:0,stamp:1,action:2,date:-1,time:-1,workDate:-1,dateOrder:'YMD'};const actions={IN:'CLOCK_IN',OUT:'CLOCK_OUT'};
const rows=parseDelimited('"007","2026-09-06 09:00:00","IN"\r\n"007","2026-09-06 18:00:00","OUT"',',');const normalized=normalizeBiometricRows(rows,m,actions);assert.equal(normalized[0].code,'007');assert.equal(normalized[0].timestamp,'2026-09-06T09:00:00+08:00');assert.equal(normalized[1].action,'CLOCK_OUT');
assert.equal(parseDelimited('007\t2026-09-06 09:00:00\tIN','\t')[0].length,3);assert.equal(normalizeBiometricRows([['007','09/06/2026 9:00 PM','IN']],{...m,dateOrder:'MDY'},actions)[0].timestamp,'2026-09-06T21:00:00+08:00');
assert.throws(()=>normalizeBiometricRows([['007','02/30/2026 09:00','IN']],{...m,dateOrder:'MDY'},actions),/Invalid exported date/);assert.throws(()=>normalizeBiometricRows([['007','2026-09-06 09:00','0']],m,actions),/Unmapped/);assert.throws(()=>normalizeBiometricRows([['007','2026-09-06 25:00','IN']],m,actions),/Invalid clock time/);console.log('PASS: quoted CSV, text DAT/TSV, leading-zero device IDs, explicit date order, timezone, invalid times/dates and unknown punch-code rejection.');}finally{await rm(temp,{recursive:true,force:true});}
