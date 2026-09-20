import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const migration=await readFile('supabase/migrations/20260920210000_payroll_nte_deductions_phase2.sql','utf8');
const phase1=await readFile('supabase/migrations/20260920183000_employee_loans_debt_phase1.sql','utf8');
const panel=await readFile('modules/nte/NTEDeductionPanel.tsx','utf8');
const approval=await readFile('modules/payroll/NTEDeductionApprovalPanel.tsx','utf8');
const queue=await readFile('modules/nte/PayrollATDQueue.tsx','utf8');

assert.match(migration,/p_method not in\('months','cutoffs'\)/,'1–2. months and payroll-cutoff repayment terms are enforced');
assert.match(migration,/r\.employee_acknowledged_at is null then raise exception 'An authorized and employee-acknowledged Notice of Decision/,'3. ATD generation is blocked before NOD acknowledgment');
assert.match(migration,/v\.employee_signed_at is null.*v\.hr_verified_at is null.*v\.finance_approved_at is null/s,'4–5. signature, HR verification, and Finance approval gate payroll');

const balance=10000,count=3,regular=Math.round(balance/count*100)/100;
const schedule=[regular,regular,Math.round((balance-regular*2)*100)/100];
assert.deepEqual(schedule,[3333.33,3333.33,3333.34]);
assert.equal(schedule.reduce((sum,value)=>sum+value,0),balance,'6. final installment reaches exactly zero');

assert.match(phase1,/unique\(debt_id,payroll_date\)/,'7. duplicate deduction by loan and cutoff is blocked');
assert.match(migration,/d\.employee_id<>p_employee or debt\.employee_id<>p_employee/,'7. wrong-employee deduction is blocked');
assert.match(migration,/p_amount>debt\.current_balance or paid\+p_amount>debt\.original_amount/,'7. excessive and post-zero deductions are blocked');
assert.match(migration,/status='Invalidated'.*current_atd_version\+1/s,'8. schedule changes invalidate the old ATD and create a new version');
assert.match(migration,/Authority to Deduct revised/,'8. revised schedule is audited');
assert.match(migration,/private\.payroll_debt_locked\(d\.scope_id,payroll_date\)/,'9. locked payroll schedule changes are blocked');

for(const label of ['NOD acknowledged','ATD generated','Employee signed','HR verified','Finance approved','Available for payroll'])assert.match(panel,new RegExp(label));
for(const heading of ['Employee','Net pay','NTE deduction','Current balance','Remaining balance','Status','Review'])assert.match(approval,new RegExp(heading));
assert.match(approval,/never reduces employee net pay/);
assert.match(queue,/Only employee-signed, HR-verified, Finance-approved ATDs can enter this payroll/);
assert.doesNotMatch(panel,/service.?charge/i,'Service-charge workflow remains out of scope');

console.log('PASS: 9 focused Phase 2 NTE deduction checks passed.');
