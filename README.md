# TNG HRIS System

This project is the backbone for a modern Human Resource Information System (HRIS), featuring a comprehensive Employee 201 File, an onboarding module, and an incident resolution system with role-based access control (RBAC).

## Core Features (Wave 1 - MVP)

*   **Employee Management**: Core 201 file, employee list, and profile management with an approval workflow for changes.
*   **Onboarding**: Customizable onboarding checklists and task management for new hires.
*   **Disciplinary System**: A robust incident reporting pipeline, from initial report to NTE issuance and final resolution, complete with a chat thread for case collaboration.
*   **Role-Based Access Control (RBAC)**: A sophisticated permissions system that tailors the UI and access rights based on user roles (e.g., Employee, Manager, HR, Admin).
*   **Payroll Essentials**: Modules for timekeeping, clock-in/out, overtime, leave requests, and payroll preparation.
*   **Performance Evaluation**: Tools for creating, conducting, and reviewing employee performance evaluations.
*   **Recruitment Module**: A complete pipeline from job requisition and posting to applicant tracking, interviews, and offers.
*   **Helpdesk & Corporate Comms**: Includes ticketing, announcements, a company calendar, and an organizational chart.
*   **Admin Dashboard**: Centralized control over roles, permissions, users, and system settings.

## Tech Stack

*   **Frontend**: React 19 with functional components and hooks.
*   **Routing**: `react-router-dom` for client-side navigation.
*   **Styling**: Tailwind CSS for a utility-first design approach.
*   **State Management**: React Context API for authentication and global settings.
*   **Backend**: Currently simulated with a mock API (`/services/mockApi.ts`) and an in-memory database (`/services/mockData.ts`) for rapid prototyping. User session is persisted in `localStorage`.

## Getting Started

This application is designed to run in a browser-based development environment. No local installation or build process is required. All dependencies are managed via an `importmap` in `index.html`.

1.  Open `index.html` in the development environment.
2.  The application will automatically load the entry point `index.tsx`.
3.  Use the default login credentials provided in `Login.tsx` to explore different user roles.


## Operations Station — Phase 2

The authenticated `/operations` module uses existing HRIS users, roles, business units and reporting relationships. New assignments request `phase: '2'`; historical Phase 1 runs retain their original confirmation workflow. Shared runs use one response set with named actors; individual checklists and standalone tasks have a separate frozen run per recipient.

Published snapshots configure checkbox, Yes/No, numeric, text or photo responses, optional Not Applicable with a reason, required photos, and expected numeric ranges. Responses are explicitly saved as drafts. Revision checks and run locks prevent lost simultaneous edits. Submission validates all required fields and photos, freezes responses, and records Clear or Issues; it does not record independent approval. Authorized managers review read-only results and can reopen with an audited reason. Import and Export Sample include these rules.

Evidence is uploaded as a JPEG, at most 1,280 pixels on its long edge and 500 KB (400 KB target), after a clarity preview. The private `ops-evidence` bucket permits only reserved, authorized uploads and authenticated downloads; there are no guest submissions, public links or client overwrite/delete permissions. Files expire no later than 60 days after reservation. Checklist answers and audit history remain. Removed files and abandoned uploads also enter cleanup.

Apply `20261010021423_operations_phase2_execution_evidence.sql`, deploy `ops-evidence-cleanup` with JWT verification disabled **only because its handler validates a private cleanup token through a service-role RPC**, and configure `operations_private.evidence_worker.endpoint` to the function URL. The private token must never be copied into browser code, logs, or cron text. The five-minute `ops-evidence-retention` database cron calls a private enqueue function. Cleanup uses the Storage API to delete actual bytes before marking metadata deleted; failures retain retry/error information. Monitor the private worker's last attempt, last success and error, plus cron run details. Bucket creation is idempotent through the worker's Storage API. No attendance, payroll, scheduling or asset master behavior is changed.

Validation:

- `node tests/operationsPhase2Test.mjs`
- `node tests/operationsEvidenceCleanupTest.mjs`
- `node tests/operationsChecklistImportTest.mjs`
- `TNG_TEST_CHROMIUM_PATH=/path/to/chromium node tests/operationsPhase2BrowserTest.mjs`
- Historical compatibility: `operationsStationTest.mjs`, `operationsSharedChecklistTest.mjs`, and `operationsStationBrowserTest.mjs`.

Browser tests execute the real UI and photo compressor against an authenticated PostgreSQL/RLS fixture and Storage HTTP fixture, covering phone, tablet and desktop. Live smoke tests should use rolled-back records, check service-only cleanup permissions, and verify the scheduled worker and private bucket before publishing the UI.


### Operations event checklists

Managers and BOD/admin users can use **Operations Station → Events** to plan one event per authorized business unit, with preparation, event operations and closing stages. Each stage pins a published checklist version, uses either a fixed Manila start or an offset before/after event start/end, and accepts a duration or fixed deadline. Preparation windows may span multiple days and event/closing work may cross midnight.

Drafts create no employee work. Publishing atomically creates one-time Operations occurrences and normal task assignments. Shared execution has one responsible owner, multiple helpers and the existing per-response actor audit; individual execution keeps separate employee runs. Published shifts, approved leave/absence, attendance and ordered backups determine coverage. Missing staffing produces visible warnings and is re-evaluated by the existing minute worker when schedules change. Event work appears in normal Tasks/Today and retains Snooze/Confirm. No attendance/payroll/schedule writers are changed.

Event revisions and published checklist versions remain immutable. Editing unstarted work updates relative stage dates together, while fixed dates/deadlines stay fixed and need review when duplicating. Started or manually managed stages cannot be rewritten; use existing responsibility handover to preserve responses. Saved stages cannot be removed. Cancellation stops open assignments and reminders while retaining answers, evidence and audit records; archiving requires completed/cancelled work. Event planning tables are private, deny direct client access and are accessed only by guarded authenticated RPCs.

Validation:
```
node tests/operationsEventTest.mjs
TNG_TEST_CHROMIUM_PATH=/path/to/chromium node tests/operationsEventBrowserTest.mjs
```
These cover multi-day/overnight staffing, fixed/relative timing and deadlines, drafts/publishing, shared/individual runs, normal task completion/progress, absence backups, department changes, cancellation, stale revisions, business-unit isolation, anonymous/employee denial, duplication, browser layouts and disk persistence.
