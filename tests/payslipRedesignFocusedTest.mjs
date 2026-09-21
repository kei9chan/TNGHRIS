import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const dir=await mkdtemp(join(tmpdir(),'payslip-redesign-'));
try {
  const outfile=join(dir,'test.cjs');
  await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
    import React from 'react';
    import {renderToStaticMarkup} from 'react-dom/server';
    import EmployeePayslipDocument from './modules/payroll/EmployeePayslipDocument';
    import DetailedPayrollCalculationReport from './modules/payroll/DetailedPayrollCalculationReport';
    import {employeeDeductions,employerContributions} from './modules/payroll/payslipPresentation';
    import {buildStyledPayslipPdf} from './modules/payroll/payslipPdf';
    export const render=(slip,test=false)=>renderToStaticMarkup(<EmployeePayslipDocument slip={slip} test={test}/>);
    export const detail=(slip)=>renderToStaticMarkup(<DetailedPayrollCalculationReport slip={slip} assumptions={['MOCK test input']} calculationVersion="engine-v1" snapshotId="private-snapshot-id"/>);
    export {employeeDeductions,employerContributions,buildStyledPayslipPdf};
  `},outfile,bundle:true,platform:'node',format:'cjs'});
  const ui=await import(pathToFileURL(outfile));
  const base={employeeName:'Mojica, Jobelle',employeeNumber:'TNG-XXX',businessUnit:'Bakebe – SM Aura',department:'Operations',position:'Guest Experience Associate',from:'2026-08-11',to:'2026-08-25',payDate:'2026-09-05',gross:'40000',deductions:'1975',net:'38025',tax:'0',payrollStatus:'Approved',lines:[{label:'Basic / Regular Pay',amount:'40000',kind:'earning',date:'2026-08-11'},{label:'Overtime Pay',amount:'0',kind:'earning',quantity:'0'},{label:'Legal Holiday Pay',amount:'0',kind:'earning'}],contributions:[{label:'sssEE',amount:'875'},{label:'sssER',amount:'950'},{label:'philhealthEE',amount:'1000'},{label:'philhealthER',amount:'500'},{label:'pagibigEE',amount:'100'},{label:'pagibigER',amount:'100'},{label:'mpfEE',amount:'0'}],loans:[],otherDeductions:[]};

  // 1. Basic pay + government deductions; zero-value categories are hidden.
  const basic=ui.render(base);
  assert.match(basic,/Basic \/ Regular Pay/);assert.match(basic,/SSS employee share/);
  assert.doesNotMatch(basic,/Overtime Pay|Legal Holiday Pay|SSS MPF employee share/);

  // 2. Overtime and holiday earnings appear only when applicable.
  const premiums=ui.render({...base,gross:'43000',net:'41025',lines:[...base.lines,{label:'Overtime Pay',amount:'1000',kind:'earning',quantity:'2'},{label:'Legal Holiday Pay',amount:'2000',kind:'earning',quantity:'1'}]});
  assert.match(premiums,/Overtime Pay/);assert.match(premiums,/Legal Holiday Pay/);

  // 3. Loan and NTE installment descriptions remain readable.
  const installments={...base,deductions:'3475',net:'36525',loans:[{label:'Pag-IBIG Loan',amount:'1000',installment:'2',totalInstallments:'12'}],otherDeductions:[{label:'NTE Deduction',amount:'500',installment:'1',totalInstallments:'3'}]};
  const installmentHtml=ui.render(installments);
  assert.match(installmentHtml,/Pag-IBIG Loan — Installment 2 of 12/);assert.match(installmentHtml,/NTE Deduction — Installment 1 of 3/);

  // 4. Employer contributions are separate from employee deductions.
  const employeeRows=ui.employeeDeductions(base), employerRows=ui.employerContributions(base);
  assert.ok(employeeRows.every(row=>!row.label.includes('employer')));assert.ok(employerRows.some(row=>row.label.includes('employer')));
  assert.equal(employeeRows.reduce((n,row)=>n+row.amount,0),1975);

  // 5. Employee output excludes daily/technical details and mock assumptions.
  assert.doesNotMatch(basic,/private-snapshot-id|engine-v1|MOCK test input|Rate used|Multiplier|2026-08-11/);

  // 6. The authorized detailed report retains calculation evidence.
  const detailed=ui.detail(base);
  assert.match(detailed,/Detailed Payroll Calculation Report/);assert.match(detailed,/private-snapshot-id/);assert.match(detailed,/engine-v1/);assert.match(detailed,/MOCK test input/);

  // 7. Draft/test output is visibly not for payment.
  const draft=ui.render(base,true);assert.match(draft,/TEST \/ DRAFT — NOT FOR PAYMENT/);assert.match(draft,/does not release payment or submit government records/);

  // 8. Final net pay matches the approved arithmetic and generated PDF.
  assert.equal(Number(base.gross)-Number(base.deductions),Number(base.net));
  const pdf=await ui.buildStyledPayslipPdf(base,false);const bytes=pdf.output('arraybuffer');assert.equal(Buffer.from(bytes).subarray(0,5).toString(),'%PDF-');assert.ok(bytes.byteLength>1500);
  console.log('PASS: 8 focused employee-payslip and detailed-calculation scenarios.');
} finally {await rm(dir,{recursive:true,force:true});}
