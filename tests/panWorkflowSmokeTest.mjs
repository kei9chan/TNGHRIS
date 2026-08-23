import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = path => fs.readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20260824050000_repair_pan_workflow.sql');
const page = read('pages/employees/PersonnelActionNotice.tsx');
const modal = read('components/employees/PANModal.tsx');
const printable = read('components/employees/PrintablePAN.tsx');
const notifications = read('services/notificationService.ts');

assert.match(migration, /create or replace function public\.submit_pan/);
assert.match(migration, /Every PAN requires at least one active Board of Director approver/);
assert.match(migration, /case when step_number = 0 then 'Pending' else 'Waiting'/);
assert.match(migration, /format\('\/approvals\?type=pan&item=%s'/);
assert.match(migration, /create or replace function public\.approve_pan/);
assert.match(migration, /create or replace function public\.reject_pan/);
assert.match(migration, /create or replace function public\.cancel_pan/);
assert.match(migration, /create or replace function public\.accept_pan/);
assert.match(migration, /status='Cancelled'.*cancelled_at=now\(\)/s);
assert.match(migration, /workflow_version >= 2 and \(not all_approved or not bod_approved\)/);
assert.match(migration, /update public\.hris_users/);
assert.match(migration, /where id=pan_row\.employee_id/);
assert.match(migration, /No notification is[\s\S]*deleted/);

assert.match(page, /supabase\.rpc\('submit_pan'/);
assert.match(page, /supabase\.rpc\('approve_pan'/);
assert.match(page, /supabase\.rpc\('reject_pan'/);
assert.match(page, /supabase\.rpc\('cancel_pan'/);
assert.match(page, /supabase\.rpc\('accept_pan'/);
assert.match(page, /Are you sure you want to cancel this PAN request\?/);
assert.match(modal, /Board of Director approval included/);
assert.match(modal, /Business Unit \/ Company/);
assert.match(modal, /Cancellation reason|Cancelled/);
assert.match(printable, /Business Unit \/ Company/);
assert.match(printable, /displayToValue/);
assert.match(printable, /Not Applicable/);
assert.match(notifications, /title\.includes\('pan approval'\).*\/approvals\?type=pan/s);

console.log('PAN workflow smoke tests passed.');
