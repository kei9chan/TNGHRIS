import assert from 'node:assert/strict';
import {buildComparisonWorkbook,parseComparisonWorkbook} from '../modules/payroll/comparisonWorkbook.ts';
const t={runId:'local-run',sourceHash:'local-hash',from:'2026-08-11',to:'2026-08-25',rows:[{employeeId:'local-employee',employeeName:'=SUM(1,2)',key:'total:net',label:'Net',amount:'123456789012.90'}]};
async function fill(change=()=>{}){const b=buildComparisonWorkbook(t);b.getWorksheet('Read first').getCell('B5').value='Approved legacy register';b.getWorksheet('Read first').getCell('B6').value='Checked full employee and component coverage';b.getWorksheet('Legacy roster').addRow(['local-employee']);b.getWorksheet('Comparison').getCell('F2').value='123456789012.89';change(b);return b.xlsx.writeBuffer();}
const parsed=await parseComparisonWorkbook(await fill(),t);assert.equal(parsed.rows[0].legacyAmount,'123456789012.89');assert.equal(parsed.legacyEmployees[0],'local-employee');
assert.equal(buildComparisonWorkbook(t).getWorksheet('Comparison').getCell('B2').value,'=SUM(1,2)');
await assert.rejects(parseComparisonWorkbook(await fill(b=>b.getWorksheet('Comparison').getCell('F2').value={formula:'1+1',result:2}),t),/literal/);
await assert.rejects(parseComparisonWorkbook(await fill(b=>b.getWorksheet('Comparison').getCell('F2').value=''),t),/literal PHP/);
await assert.rejects(parseComparisonWorkbook(await fill(b=>b.getWorksheet('Comparison').getCell('E2').value='1.00'),t),/changed/);
await assert.rejects(parseComparisonWorkbook(await fill(b=>b.getWorksheet('Legacy roster').addRow(['extra'])),t),/roster/);
await assert.rejects(parseComparisonWorkbook(await fill(b=>b.getWorksheet('Legacy roster').addRow(['local-employee'])),t),/roster/);
await assert.rejects(parseComparisonWorkbook(await fill(b=>b.getWorksheet('Read first').getCell('B3').value='another'),t),/different payroll/);
await assert.rejects(parseComparisonWorkbook(await fill(b=>b.getWorksheet('Comparison').getCell('F2').value='0.001'),t),/literal PHP/);
console.log('PASS: whole-cutoff exact amounts; source fingerprint; roster, formula, missing, changed and excess-precision rejection. No production fixtures.');
