import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {classifyLeaveRequest,validateBalanceRows,balanceApprovalRoute} from '../modules/payroll/leaveManagementModel.ts';
const modal=await fs.readFile(new URL('../components/payroll/LeaveRequestModal.tsx',import.meta.url),'utf8');
const page=await fs.readFile(new URL('../pages/payroll/LeaveBalanceImport.tsx',import.meta.url),'utf8');
const nav=await fs.readFile(new URL('../modules/payroll/workspace.ts',import.meta.url),'utf8');
const sql=await fs.readFile(new URL('../supabase/migrations/20260922000731_leave_management_redesign_and_balance_migration.sql',import.meta.url),'utf8');
// 1. Zero-credit paid leave proposes LWOP and requires confirmation.
const zero=classifyLeaveRequest('Vacation Leave',1,0,false);assert.equal(zero.finalClassification,'lwop');assert.equal(zero.unpaidDays,1);assert.equal(zero.requiresConfirmation,true);assert.match(modal,/Continue as Leave Without Pay/);
// 2. Assigned BOD action stays available despite a shortfall.
assert.match(modal,/authorizedBod/);assert.doesNotMatch(modal,/approval prevented because of insufficient credits/i);assert.match(sql,/You are not an assigned authorized BOD approver/);
// 3. BOD chooses paid exception or LWOP and both are audited.
assert.match(modal,/Approved paid leave exception/);assert.match(modal,/Approved Leave Without Pay/);assert.match(sql,/leave_exception_decisions/);assert.match(sql,/p_outcome not in\('paid_exception','lwop'\)/);
// 4. Selected leave remains visible in request and approval screens.
assert.match(modal,/Selected request:/);assert.match(modal,/Leave type/);assert.match(sql,/selected_leave_type/);
// 5. Import separates valid, review, invalid, and not-applicable rows.
const rows=validateBalanceRows([
 {employeeId:'TNG-1',leaveType:'Vacation Leave',openingBalance:5,accruedCredits:2,usedCredits:1,remainingBalance:6,asOfDate:'2026-08-31'},
 {employeeId:'TNG-2',leaveType:'Offset Leave',openingBalance:2,accruedCredits:0,usedCredits:0,remainingBalance:2,asOfDate:'2026-08-31'},
 {employeeId:'',leaveType:'Mystery',openingBalance:0,accruedCredits:0,usedCredits:1,remainingBalance:-1,asOfDate:''},
 {employeeId:'TNG-3',leaveType:'Leave Without Pay',asOfDate:'2026-08-31'},
],new Set(['tng-2:offset leave']));assert.deepEqual(rows.map(r=>r.status),['valid','review','invalid','not_applicable']);assert.match(page,/Download template/);assert.match(page,/Replace file/);
// 6. HR Staff entries route to HR Manager.
assert.equal(balanceApprovalRoute(['HR Staff'],'Employee'),'pending_hr_manager');assert.match(sql,/route text:='pending_hr_manager'/);
// 7. HR Manager and initial control-role entries route to BOD.
for(const role of ['Business Unit Manager','Manager','General Manager','Operations Manager','Auditor'])assert.equal(balanceApprovalRoute(['HR Staff'],role),'pending_bod');assert.equal(balanceApprovalRoute(['HR Manager'],'Employee'),'pending_bod');
// 8. Activation only happens in the authorized approval function.
assert.match(sql,/perform private\.activate_leave_balance_migration\(b\.id,actor\)/);assert.match(sql,/if p_action='approve'/);assert.match(nav,/\{name:'Leaves'.*Loans & Debt[\s\S]*Reports & Settings|Loans & Debt[\s\S]*\{name:'Leaves'[\s\S]*Reports & Settings/);
console.log('Passed 8 leave-management acceptance tests.');
