# Mandatory document acknowledgment gate

Implemented additively for existing announcements and memos (including policies).

## Operation

- Employees: Dashboard → Pending Acknowledgments. Open a version, allow its content and attachments to load, select the exact receipt/review statement, then Acknowledge Document. Receipts download as plain text and retain the unique reference, server timestamp and SHA-256 hash.
- Publishers: Announcements or Memo Library → Mandatory acknowledgment publishing and report. Save the source first; select it, configure publication/audience/coverage, classify the revision, and publish an immutable archive. Attachments are copied as bytes, not mutable links. Supported archived attachments: PDF, PNG, JPEG and plain text, at most 5 MB each / 10 files. Failed attachment retrieval stops publication.
- Settings: Admin → Settings → Mandatory Acknowledgment Gate. The additive installation defaults to disabled until an authorized settings editor selects coverage and enables it. No existing announcement is automatically made mandatory.
- Audience categories combine with OR. The published audience contains the resolved active employee IDs. Personnel changes do not retroactively expand or erase that publication's assignments. Publish another version to change the assigned audience.
- Non-material versions share a requirement group with their predecessor; material versions get a new group. Every receipt still refers to the exact version actually opened. The latest effective publication governs the gate.
- Report access requires existing document edit permission for that source or AuditLog view, plus existing employee data scope. A manager role by itself grants no history access.

## Central enforcement

A private integration registry maps implemented request types to verified table/employee/draft adapters. Every table uses the same submission trigger and acknowledgment_gate RPC. Existing RLS is unchanged. Structured P0001 errors carry ACKNOWLEDGMENT_REQUIRED, document IDs, request type, message and link. The client handles these centrally without discarding mounted forms.

Covered adapters: leave; overtime/offset; WFH; on-call/manpower; COE; assets; benefits; attendance corrections. Offset approval/credit generation is deliberately excluded: the employee's initiating offset request is an OT request. Loans remain an existing unimplemented placeholder; unsupported cash advance, reimbursement, official-business and schedule-change submissions are not falsely advertised as enforced.

Only inserts and draft-to-submission transitions for the authenticated employee are gated. Saved drafts remain editable. Existing pending/completed records and assigned approval updates bypass this new gate and retain their original authorization checks. All request types without a verified adapter, particularly helpdesk and protected reporting channels, cannot be selected in gate settings or publication coverage.

## Evidence and access

Published versions, assignments, deliveries, view events, receipts, settings changes and administrative actions are append-only private tables with RLS enabled and no direct application grants. Security-definer RPCs derive the employee from the active authenticated account. Neither employee IDs nor timestamps are supplied to acknowledgment RPCs. Employees cannot acknowledge on behalf of anyone; publishers cannot impersonate recipients. Administrative corrections/exemptions require a separate reasoned audit record.

A delivery token binds the exact version and authenticated account. The client reports successful content/attachment load; only then can the server record a view, and acknowledgment requires that view plus explicit statement acceptance. Loading alone never acknowledges. These events establish delivery/review opportunity, not reading comprehension. Employee timestamps use Asia/Manila; canonical timestamptz values stay in the database. No IP/device telemetry is collected.

## Verification

- `node tests/mandatoryAcknowledgmentsUiTest.mjs`: component state tests for pre-load disabled controls, failed load, successful load, explicit checkbox, duplicate clicks, receipts/timezone, hidden-but-mounted forms, accessible saved drafts and unrelated modals.
- `tests/mandatoryAcknowledgments.sql`: staging-only transactional tests for no pending / pending, authenticated direct insert rejection, security-definer-context direct write rejection, structured errors, draft save and gated transition, correct identity/version/server times, idempotency, immediate restoration, cross-user and publisher impersonation denial, immutable records, material/non-material revisions, protected settings, scoped reports and unaffected approval processing. All test documents, requests and fixture role assignments roll back.
- Application production build passes. Existing Approval Center smoke checks pass (41/41).
- Existing RBAC source-pattern smoke test fails against an unrelated pre-existing `useApprovals` implementation; no gate-related change to that file. Whole-project TypeScript has existing errors outside the new acknowledgment module; the new module introduces none.
- The cloud browser reaches the production login screen; no authenticated session is available. Full authenticated browser/device PDF rendering is not claimed as verified.

Staging is the separate `payroll-staging` development branch. It lacks the newer attendance subsystem; a staging-only copy of the production attendance-punch request table was created for the common-trigger integration test. That fixture is not included in the production migration.
