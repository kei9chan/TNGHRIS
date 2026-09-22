import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260922130000_org_chart_request_routing_and_on_call_scope.sql', import.meta.url),
  'utf8',
);
const hardening = readFileSync(
  new URL('../supabase/migrations/20260922131500_harden_org_route_level_order.sql', import.meta.url),
  'utf8',
);

assert.match(migration, /v_department_id uuid/i, 'department IDs use an unambiguous PL/pgSQL variable');
assert.doesNotMatch(migration, /where department\.id=department_id\b/i, 'the ambiguous department lookup is gone');
assert.match(migration, /private\.user_can_request_for_business_unit\(actor,v_bu\)/i, 'submission enforces BU scope server-side');
assert.match(migration, /Bakebe - S Maison/);
assert.match(migration, /Bakebe - SM Aura/);
assert.match(migration, /org_chart_assignments/);
assert.match(migration, /approval_authority_matrix/);
assert.match(migration, /temporary_approval_authorities/);
assert.match(migration, /request_approval_route_snapshots/);
assert.match(migration, /admin_upsert_org_chart_assignment/);
assert.match(migration, /Requesters cannot approve their own on-call request/);
assert.match(hardening, /v_candidate_rank>v_requester_rank/i, 'routes cannot move downward in the org chart');
assert.match(hardening, /authorityKind','FINAL_APPROVAL'/i, 'incomplete branches receive a recorded final approver');
assert.match(hardening, /configurationFallback',true/i, 'fallback routing is explicit in the audit snapshot');

console.log('Org-chart on-call routing migration checks passed.');
