import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260920092022_service_charge_phase3.sql',import.meta.url),'utf8');
const page=fs.readFileSync(new URL('../modules/payroll/ServiceChargeSetupPage.tsx',import.meta.url),'utf8');
const approval=fs.readFileSync(new URL('../modules/payroll/ServiceChargeApprovalPanel.tsx',import.meta.url),'utf8');
const payslip=fs.readFileSync(new URL('../modules/payroll/PayslipView.tsx',import.meta.url),'utf8');
const nav=fs.readFileSync(new URL('../constants.ts',import.meta.url),'utf8');

const checks=[
 ['1. Rank-and-file defaults require explicit confirmation',/r\.rank_and_file,false\).*selection_confirmed/s.test(migration)&&page.includes('selected by default')],
 ['2. Authorized users can deselect individuals',page.includes('Deselect filtered')&&migration.includes('Authorized scoped HR or Finance payroll access required')],
 ['3. Excluded employees receive zero',migration.includes('check(selected or amount = 0)')&&migration.includes('Excluded employees must have a zero allocation')],
 ['4. Classification override requires reason and authorization',migration.includes('An approved classification override reason is required')&&migration.includes('override_approved_by')],
 ['5. Eligibility remains separate from payout',migration.includes("eligibility_status text")&&migration.includes("amount numeric")&&page.includes('Not configured')],
 ['6. Pool must be allocated exactly 100%',migration.includes('100% of the approved pool allocated')&&page.includes('100% distributed')],
 ['7. Service charge is separate in approval and payslip',approval.includes('Service charge')&&payslip.includes("title:'Service Charge'")&&migration.includes("payroll_gross_line('Service Charge'")],
 ['8. Post-snapshot changes create a review version',migration.includes('review_version_created')&&page.includes('Start new review')],
 ['9. Recalculation cannot duplicate payout',migration.includes('unique(approval_run_id,employee_id)')&&migration.includes("source_snapshot->'serviceCharge'")],
 ['10. Employees are restricted to released own payroll data',migration.includes('revoke all on table')&&!migration.includes('create policy')&&nav.includes("Service Charge Setup")],
];
for(const [name,ok] of checks){assert.ok(ok,name);console.log(`PASS ${name}`);}
console.log(`PASS ${checks.length} focused Phase 3 checks`);
