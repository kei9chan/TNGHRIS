# Operations Station Phase 3

In Operations Station, select a business unit, then **Scheduling → Create recurring rule**. Choose a published task/checklist version, recurrence, employee pool, shared or individual execution, timing, owner and optional ordered backups. Preview staffing before saving. Rules default to Paused; Active rules generate in the backend once per minute. **Generate / retry now** is an authorized manual retry.

**Today → Today’s coverage & responsibility** shows an operating date, actual staffing labels, the responsible owner, due times and coverage. Shared checklists have one owner and multiple helpers. Individual executions retain a separate run for each person. Employee claims must be enabled by the rule and require an active assignment; competing claims use revision checks. Managers can select owners, add/remove helpers, hand over started work, confirm presence/flexible timing, reschedule, skip or cancel with a reason. Handovers preserve prior answers, evidence and authors. Operational presence confirmation never changes attendance or pay.

Only effective approved schedule publications count. Draft schedule edits do not replace approved shifts. Full-day/overlapping leave, rest days, suspension and approved absence cannot count as coverage. Pending absence reports show review risk. Missing clock-in does not prove absence. Confirmed imported attendance takes precedence over raw attendance. Overnight work belongs to the shift’s operating date. Unpublished/flexible/reference-shift timing remains visible for manager attention. Configured non-operating dates are excluded; monthly rules choose skip or last-day behavior, and interval 3 supports quarterly recurrence.

Before execution, published staffing changes can update automatic assignees. Once a response, evidence reservation or In Progress state exists, staffing stays intact until explicit audited handover. Manual overrides are preserved. Published execution instructions and responses stay frozen; newly generated dates use the rule’s selected published version. Pause/archive stops generation; existing work remains actionable. Resume generates from today rather than backfilling missed closed days.

Assignments, due-soon reminders, overdue reminders and coverage notices use existing HRIS notifications. A private outbox deduplicates and retries failed deliveries. Completion/skip/cancellation stops reminders. Security is checked on every mutation and read; delegated supervisors retain their direct-report scope. No guest submission endpoint or client-accessible cron function is introduced. Phase 4 independent approvals remain pending; Completed/Submitted is not an approval.

`ops-recurring-work` runs each minute. Health and per-rule errors are visible in Scheduling. Generation locks and a unique rule/date key prevent overlap duplicates. Existing `ops-evidence-retention` cleanup continues unchanged, retaining photos for no more than 60 days. Deploying this foundation does not activate employee rules automatically.

Validation:
- `node tests/operationsPhase3Test.mjs`
- `TNG_TEST_CHROMIUM_PATH=/path/to/chromium node tests/operationsPhase3BrowserTest.mjs`
- Existing Operations Phase 1/2, shared checklist, evidence cleanup, attendance, scheduling, payroll completion/access and manager approval regressions.
- Production migration, cron health and rollback-only authenticated generation/execution/isolation test.

The repository has unrelated existing TypeScript errors; the new Operations files have no TypeScript diagnostics. Production Vite build succeeds.
