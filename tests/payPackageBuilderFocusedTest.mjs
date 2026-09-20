import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';

async function loadTypeScriptModule(path){
 const source=await fs.readFile(new URL(path,import.meta.url),'utf8');
 const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

const {calculatePackagePreview,payBasisOptions,arrangementSummary}=await loadTypeScriptModule('../modules/payroll/payPackageBuilderModel.ts');
const {prepareImport,simpleImportRows,classifyImportIssue}=await loadTypeScriptModule('../modules/payroll/payPackageImport.ts');

const employeeContext={
 employeeId:'employee-1',sourceHash:'hash',legacy:{rateAmount:25000,salaryBasic:25000},packages:[],
 scopes:[{id:'aura',name:'SM Aura',canEdit:true,employeePayroll:true},{id:'metro',name:'Metro Manila',canEdit:true,employeePayroll:false}],
 sources:[{id:null,label:'Current HRIS record',baseAmount:25000,rateType:'Monthly',deminimis:0,reimbursable:0,conflict:false}],
};
const baseRow={'Employee code':'E-1','Business unit':'SM Aura','Pay type':'Employee salary','Effective date':'2026-10-01','Amount unit':'Monthly','Approved basic pay / fee':'25000','Salary source':'Current HRIS record','Source document / note':'Approved HRIS salary','Reason for this record':'Initial setup'};
const row=(values,rowNumber=2)=>simpleImportRows([{row:rowNumber,values}])[0];

// 1. One person can keep employee payroll and consultant fees in separate scopes and streams.
const payroll=prepareImport(row(baseRow),employeeContext);
const consultant=prepareImport(row({...baseRow,'Business unit':'Metro Manila','Pay type':'Consultant fee','Amount unit':'Per invoice','Approved basic pay / fee':'15000','Salary source':'Approved consultant agreement','Consultant agreement':'Gootopia launch project','Consultant tax document':'Reviewed withholding profile','Source document / note':'Signed consulting agreement'},3),employeeContext);
assert.equal(payroll.payload.stream,'employee_payroll');assert.equal(payroll.scopeId,'aura');
assert.equal(consultant.payload.stream,'professional_fee');assert.equal(consultant.scopeId,'metro');

// 2. Gross pay keeps employee-paid tax and benefits in the employee column.
const gross=calculatePackagePreview({baseAmount:25000,treatment:{payBasis:'gross',taxResponsibility:'employee',benefitResponsibility:'employee'},employeeTax:2000,components:[{name:'Health plan',amount:'500',category:'employee_paid_benefit',employeeShare:'500',recurrence:'recurring',legacyField:'',payableDate:''}]});
assert.equal(gross.employee.estimatedNet,22500);assert.equal(gross.company.employerTax,0);

// 3. Net of tax records employer-paid tax without subtracting it from employee receipts.
const netTax=calculatePackagePreview({baseAmount:25000,treatment:{payBasis:'net_tax',taxResponsibility:'employer'},employerTax:2400,components:[]});
assert.equal(netTax.employee.estimatedNet,25000);assert.equal(netTax.company.employerTax,2400);

// 4. Selected-component coverage is a structured basis with a plain-language summary.
assert(payBasisOptions.some(option=>option.value==='gross_selected'));
assert.match(arrangementSummary({taxResponsibility:'employer',taxCoverage:'selected_components',benefitResponsibility:'employee'}),/selected components.*employee-paid/i);

// 5. De minimis retains its policy limit and surfaces an over-limit review item.
const deMinimis=calculatePackagePreview({baseAmount:25000,treatment:{taxResponsibility:'employee'},employeeTax:0,components:[{name:'Rice benefit',amount:'2500',category:'de_minimis',policyLimit:'2000',recurrence:'recurring',legacyField:'deminimis',payableDate:''}]});
assert.equal(deMinimis.employee.deMinimis,2500);assert(deMinimis.pending.some(value=>value.includes('exceeds policy limit')));

// 6. A reimbursement stays out of payable totals until receipt approval.
const pendingReceipt=calculatePackagePreview({baseAmount:25000,treatment:{taxResponsibility:'employee'},employeeTax:0,components:[{name:'Travel receipt',amount:'1800',category:'reimbursable_allowance',receiptStatus:'under_review',recurrence:'recurring',legacyField:'reimbursable',payableDate:''}]});
assert.equal(pendingReceipt.employee.reimbursements,0);assert.equal(pendingReceipt.excludedReimbursements,1800);

// 7. Employee receipts, employer-paid items, and actual company cost reconcile once.
const reconciliation=calculatePackagePreview({baseAmount:30000,treatment:{taxResponsibility:'employer'},employerTax:3000,thirteenthMonthAccrual:2500,components:[{name:'Allowance',amount:'1000',category:'fixed_allowance',recurrence:'recurring',legacyField:'',payableDate:''},{name:'Employer SSS',amount:'1500',category:'employer_contribution',employerShare:'1500',recurrence:'recurring',legacyField:'',payableDate:''},{name:'Service charge',amount:'2000',category:'service_charge',recurrence:'recurring',legacyField:'',payableDate:''}]});
assert.equal(reconciliation.company.totalActualCost,reconciliation.company.grossEmployeePay+reconciliation.company.serviceCharge+reconciliation.employerPays);

// 8. Batch rows classify independently as Ready, Needs review, and Blocked.
assert.equal(classifyImportIssue('',row(baseRow)),'ready');
assert.equal(classifyImportIssue('Reimbursable allowance requires receipt.'),'review');
assert.equal(classifyImportIssue('Employee and business unit do not match the approved salary source.'),'blocked');

// 9. Save logic processes only Ready rows and retains failed rows for correction.
const batchSource=await fs.readFile(new URL('../modules/payroll/PayPackageBatchUpload.tsx',import.meta.url),'utf8');
assert.match(batchSource,/status!=='ready'\)continue/);assert.match(batchSource,/status:'saved'/);assert.match(batchSource,/status:'blocked',error/);

// 10. Missing, invalid, conflicting, and unauthorized salary-source errors remain distinct.
assert.throws(()=>prepareImport(row({...baseRow,'Salary source':''}),employeeContext),/Missing salary source/);
assert.throws(()=>prepareImport(row({...baseRow,'Salary source':'Mystery source'}),employeeContext),/Invalid salary source/);
assert.throws(()=>prepareImport(row({...baseRow,'Business unit':'Unknown BU'}),employeeContext),/Conflicting salary source/);
assert.throws(()=>prepareImport(row(baseRow),{...employeeContext,scopes:employeeContext.scopes.map(scope=>({...scope,canEdit:false}))}),/editing is not allowed/);

console.log('Passed 10 focused pay-package builder and Excel workflow scenarios.');
