# Phase 5 — Approvals and controlled live handover

Payroll Home now shows approval progress for the retained business unit and cutoff and directs the next action to the existing approval workflow once preparation is complete. Compare & Pilot includes the same summary. The current owner is displayed as the responsible role, not a fabricated named assignee. Completed decisions retain actual reviewer names, references and timestamps from the existing approval engine. Payroll Approvals filters on the server before pagination; old direct links remain available under their original authorization checks and clearly identify an out-of-workspace version.

Test approval and live release are separate. Completing all six shadow approval stages leads to formal comparison and pilot evidence, never the Payments page. Current processing mode comes from the backend. Refresh reloads status, and stale/returned versions remain blocked by existing rules. No calculation or approval sequencing was changed.

Live activation/resumption now has a separate review form bound to the proposal, exact BU name and certified handover dates. It requires a fresh explicit checkbox and authorization reference. A new guarded RPC checks these values and scoped access, then calls the exact former activation implementation privately. Its evidence, independent BOD approvals, single-pilot, parent-processing and window checks remain intact. The old public activation signature fails closed with a refresh instruction; authenticated clients cannot call the private underlying implementation. Successful explicit authorization adds an audit entry atomically with the existing activation audit. This deployment does not authorize or enable live payroll.

## Focused verification

- `node tests/payrollApprovalHandoverTest.mjs`: passed. Local PGlite fixtures execute the checked-in six-stage approval and original activation functions plus the new migration. Checks completed decisions after reread, distinct BODs, changed source, scope/date and employee access, filtered pagination, test payment blocking, explicit consent, mismatched BU/window, unauthorized callers, stale evidence, missing BOD decisions, parent-gate rejection/rollback, scoped activation and audit. Auth and evidence dependencies are explicit local substitutes; no production impersonation or live payroll writes were used.
- `node tests/payrollApprovalHandoverUiTest.mjs`: passed. Owner/decision rendering, shadow-to-pilot versus live-to-payment routing, stale-version recovery, separate activation confirmation, required BU/reference/checkbox, exact request payload and busy-submit prevention.
- Production build passed. Repository-wide type checking still reports pre-existing unrelated errors; no diagnostics in changed files at the focused check.
- Production migration applied. Read-only ACL checks confirm anonymous access denied and the underlying activation function inaccessible to authenticated clients. Security advisors report no new warnings.
- Bakebe - SM Aura remains **off**, with zero approval runs, pilot proposals or activation certificates as of this release check. No actual approvals, payments, payroll mode changes or handover authorizations were submitted.

## Remaining acceptance

Signed-in browser operation with authorized HR, Finance and BOD accounts remains unverified; the available browser session is signed out. Bakebe must complete its real source data and existing gated test workflow before a handover can be proposed. Deploying this UI is not permission to activate live payroll. The scoped access manager must obtain explicit authorization and record it through the new confirmation only after all existing gates pass.
