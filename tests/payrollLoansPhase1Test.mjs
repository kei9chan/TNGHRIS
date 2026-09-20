import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260920183000_employee_loans_debt_phase1.sql',import.meta.url),'utf8');
const page=fs.readFileSync(new URL('../pages/payroll/Loans.tsx',import.meta.url),'utf8');
const approval=fs.readFileSync(new URL('../modules/payroll/DebtApprovalPanel.tsx',import.meta.url),'utf8');

function preview(balance,method,term){const count=method==='months'?term*2:term;const regular=Math.round(balance/count*100)/100;let remaining=balance;const amounts=Array.from({length:count},(_,index)=>{const amount=index===count-1?remaining:Math.min(regular,remaining);remaining=Math.max(0,Math.round((remaining-amount)*100)/100);return amount;});return {count,regular,amounts,remaining};}

const month=preview(30000,'months',3);
assert.equal(month.count,6,'1. month term expands to semi-monthly cutoffs');
assert.deepEqual(month.amounts,[5000,5000,5000,5000,5000,5000]);
const cutoffs=preview(10000,'cutoffs',3);
assert.equal(cutoffs.count,3,'2. cutoff term keeps requested cutoff count');
assert.deepEqual(cutoffs.amounts,[3333.33,3333.33,3333.34]);
assert.equal(cutoffs.amounts.reduce((a,b)=>a+b,0),10000,'3. final installment reconciles exactly');
assert.equal(cutoffs.remaining,0,'4. balance stops at zero');
assert.match(migration,/unique\(debt_id,payroll_date\)/,'5. duplicate debt/cutoff posting is blocked');
assert.match(migration,/payroll_debt_audit/);assert.match(migration,/p_action='pause'/);assert.match(migration,/p_action='resume'/);assert.match(migration,/p_action='change_schedule'/,'6. pause, resume and corrections are audited');
assert.match(migration,/private\.payroll_debt_locked/);assert.match(migration,/Locked payroll cannot be silently changed/,'7. locked payroll mutations are blocked');
assert.match(migration,/enable row level security/g);assert.match(migration,/revoke all on public\.%I from public,anon,authenticated/);assert.match(migration,/d\.employee_id=public\.current_hris_user_id\(\) and d\.status in\('Active','Paused','Completed'\)/,'8. employee self-read is limited to own approved debt');
assert.match(page,/Add loan or debt/);assert.match(page,/Change schedule & request reapproval/);assert.match(approval,/This payroll deduction/);
assert.doesNotMatch(page,/Add service charge|Configure service charge|Distribute service charge/,'Service-charge functionality remains out of scope');
console.log('8 focused employee-loan/debt checks passed.');
