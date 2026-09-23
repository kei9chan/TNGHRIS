import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync(new URL('../supabase/migrations/20260923024539_universal_bod_leave_final_authority.sql',import.meta.url),'utf8');
const modal=readFileSync(new URL('../components/payroll/LeaveRequestModal.tsx',import.meta.url),'utf8');

assert.match(migration,/public\.has_active_role\('Board of Director'\)/);
assert.match(migration,/request\.status = 'PendingBOD'/);
assert.match(migration,/bod_leave_queue/);
assert.match(migration,/request\.employee_id <> actor\.id/);
assert.match(migration,/A Board of Director cannot approve their own leave request/);
assert.match(migration,/Final BOD decision recorded/);
assert.match(migration,/BOD_LEAVE_EXCEPTION_APPROVED/);
assert.match(migration,/status = case when lower\(p_decision\) = 'approve' then 'Approved' else 'Rejected' end/);
assert.doesNotMatch(migration,/You are not an assigned authorized BOD approver/);
assert.match(modal,/progress\?\.creditException\?\?request\?\.approvalContext\?\.creditException/);

console.log('universal BOD leave authority smoke test passed');
