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
