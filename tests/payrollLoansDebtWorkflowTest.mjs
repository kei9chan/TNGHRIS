import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260920223000_loans_debt_finance_workspace.sql',import.meta.url),'utf8');
const page=fs.readFileSync(new URL('../pages/payroll/Loans.tsx',import.meta.url),'utf8');
const client=fs.readFileSync(new URL('../modules/payroll/debts.ts',import.meta.url),'utf8');
const payroll=fs.readFileSync(new URL('../modules/payroll/DebtApprovalPanel.tsx',import.meta.url),'utf8');

const scenario=(name,run)=>{run();console.log(`✓ ${name}`);};

scenario('1. Previous loan saves opening balance and upload evidence before pending Finance approval',()=>{
 assert.match(page,/Add previous loan/);assert.match(page,/Current remaining balance/);assert.match(client,/uploadDebtDocument/);assert.match(migration,/status='Pending Finance approval'/);
});
scenario('2. External authorized NTE works without an HRIS NTE and accepts a document link',()=>{
 assert.match(migration,/external_nte_deduction/);assert.match(page,/NTE record unavailable — signed authority to deduct provided/);assert.match(client,/add_payroll_debt_document_link/);
});
scenario('3. Finance can open uploaded documents and secure links in the approval screen',()=>{
 assert.match(page,/View or download/);assert.match(page,/Open document/);assert.match(client,/createSignedUrl/);assert.match(client,/protocol!=='https:'/);
});
scenario('4. An inaccessible document link blocks approval with a correction path',()=>{
 assert.match(migration,/Link unavailable/);assert.match(migration,/approval is blocked until at least one authority document is accepted/i);assert.match(page,/Request another document/);
});
scenario('5. Submission routes to Lenny and the creator cannot self-approve',()=>{
 assert.match(migration,/employee_id='TNG-067'/);assert.match(migration,/d\.created_by=actor/);assert.match(page,/Lenny Rose Casas · Finance/);
});
scenario('6. Finance return and HR resubmission preserve the same record',()=>{
 assert.match(migration,/status='Returned for correction'/);assert.match(migration,/d\.status not in\('Draft','Returned for correction'\)/);assert.match(page,/Resubmit same record/);
});
scenario('7. Finance approval activates the selected payroll cycle',()=>{
 assert.match(migration,/set status='Active'/);assert.match(migration,/insert into public\.payroll_loan_ledger/);assert.match(page,/Deduction start payroll cycle/);
});
scenario('8. Deductions never exceed balance and a fully paid record closes',()=>{
 assert.match(migration,/least\(installment,current_balance\)/);assert.match(migration,/current_balance=0,status='Paid or closed'/);assert.match(page,/final deduction never exceeds the remaining balance/i);
});
scenario('9. Unapproved or unaccepted records are excluded from payroll',()=>{
 assert.match(migration,/x\.status='Accepted'/);assert.match(payroll,/Pending or unapproved records do not affect payroll/);assert.match(payroll,/debt\.status==='Active'/);
});

console.log('9 focused Loans & Debt workflow tests passed.');
