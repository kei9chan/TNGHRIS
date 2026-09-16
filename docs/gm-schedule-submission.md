# GM direct-report schedule submissions

The existing BOD employee-submission workflow now also recognizes the canonical `GeneralManager` role using the current `hris_users.reports_to` relationship. Employees see “Submit your schedule for GM approval.” The GM sees review instructions and submitted schedules instead of the dashboard prompt to plot team schedules. GMs who themselves report to a BOD retain their own BOD submission flow.

Existing RPC names remain compatible. Only the currently assigned, active BOD/GM can review the employee’s proposal. A pending submission under an old reporting line prompts the employee to resubmit. Rejection leaves effective schedules unchanged; approval uses the existing schedule writer and publication workflow. Preset visibility, frozen payroll periods, source/template hashes, version checks, retry idempotency and existing RLS remain intact. Existing authorized HR/support scheduling access is unchanged. No emails were manually sent and no production schedules or reporting relationships were edited.

Focused checks:
- `node tests/gmScheduleSubmissionTest.mjs`: passed with isolated PGlite fixtures. Exercises the existing submit/review functions with the new migration: GM routing, stored status after reload, rejection and resubmission, self/unassigned reviewer denial, reporting-line changes, BOD compatibility, preset access, payroll freezes and one-time publication. Publication itself uses a local fixture, not production employee data.
- `node tests/bodScheduleDashboardRenderTest.mjs`: passed, including GM employee prompts, GM review queue, suppression of the GM plotting reminder and preservation of BOD behavior.
- Production build passed. No changed-component TypeScript diagnostics; unrelated pre-existing repository diagnostics remain.

Read-only production inspection found one active canonical GM account but zero active employees currently reporting to that GM. HR must set the intended employees’ Reporting To field to the GM before those employees receive the submission prompt. No reporting assignments were guessed from department, title or BU. Signed-in real-user submission/approval remains unverified because no authorized test session is available.
