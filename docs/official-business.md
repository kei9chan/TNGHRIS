# Official Business requests

Employees open **Dashboard → Quick Links → Official Business (OB)**. Save a draft, specify one destination (coordinates and radius), Philippine work date/time window, purpose, client/event and expected travel minutes. Attach PDF or image support when applicable. A request can replace the regular shift or keep it. The existing unpaid-lunch rule applies to replacement shifts.

Submission resolves the employee's assigned Immediate Head. That head approves first; a separate, scoped HR Staff/HR Manager approves second. No self-approval. HR can amend, cancel or complete requests with a required reason. Amendments restart both approvals and suspend the old exception. Completion is available after the approved window ends and does not manufacture missing punches. Requested statuses are retained, including For Review.

Approved dates appear as Official Business in the attendance clock/history and new payroll attendance previews. The employee clock requires device GPS and a selfie for each OB action. Server time, date, approval state, location radius including GPS uncertainty, fresh evidence, suspension and the existing clock permissions/state checks must pass. Invalid location/time attempts are retained for review, with no time event added. The employee can submit the actual missing punch through the existing HR correction workflow. Biometric file imports cannot silently apply an OB exception.

Raw events, private selfie references, coordinates, approval snapshots and request history remain auditable. Attachments are private and served through short-lived authorized links. Ordinary web/GPS/QR rules remain in place when no OB applies. OB does not rewrite a published schedule or create OT, allowance, holiday/rest-day compensation requests. New payroll previews require independent compensation review for OB premium/extra regular time; For Review OB days block attendance readiness. Existing saved payroll snapshots are not rewritten.

## Verification

`npm run test:official-business` executes the migration in isolated PGlite with fixture actors, storage and schedule data, using captured production clock core, GPS/web verifier, current-day resolver and time interpreter. It checks ordered approvals, role separation, RLS/storage isolation, immutable client access, required documents, GPS/selfie enforcement, rejected-attempt audit, idempotency, amendments/cancellation, payroll source assembly/pay isolation and ordinary clock behavior. Scope-resolution dependencies are fixture substitutes; live role-specific device punches are not exercised.

`npm run build` checks production bundling. Full repository TypeScript checking has existing unrelated errors; no new OB-related diagnostics remained. Live browser verification is read-only; no employee attendance or payroll transactions are created for testing.

## Operational boundaries

- One active OB window and destination per employee/work date; overnight windows must be shorter than 24 hours.
- GPS is device-reported; this feature does not claim spoof-proof location or biometric liveness.
- Missing GPS/selfie, expired authorization or suspension never bypasses clock checks. HR uses the audited correction process for an unrecorded punch.
- The request list shows the newest 200 authorized matches, with status and own/approval/all-authorized filters.
- HR should maintain Immediate Head assignments and its existing BU access scope. This feature does not grant broader HR access.
