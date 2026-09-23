import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const modal = readFileSync('components/payroll/OTRequestModal.tsx', 'utf8');
const service = readFileSync('services/approverConfigService.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260923034324_persist_decimal_ot_approval_hours.sql', 'utf8');

assert.match(modal, /step="0\\.25"/);
assert.match(modal, /inputMode="decimal"/);
assert.match(modal, /savedApprovedHours > 0/);
assert.match(service, /process_overtime_request_approval/);
assert.match(service, /p_approved_hours/);
assert.match(migration, /approved_hours = p_approved_hours/);
assert.match(migration, /'approvedHours', p_approved_hours/);

console.log('decimal OT approval hours smoke test passed');
