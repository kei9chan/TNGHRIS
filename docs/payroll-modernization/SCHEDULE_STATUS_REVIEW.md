# Schedule status and attendance review

Delivered on the existing scheduling module. Presets, grid, role/area/timeline views, copy-week and publish controls remain in place. Existing HRIS roles and RLS policies are unchanged; new records have their own restrictions.

## Implemented

- Employee profile photo upload and live status share a private, versioned photo source. Missing or unavailable photos display initials, never a random portrait. Profile editing and database authorization both apply.
- Status Presets support drag/drop and select-then-tap on the existing grid. Rest Day is gray; Skeletal is orange and retains required working hours. Company Holiday requires a registered holiday. Absence retains the expected shift and is not leave approval.
- Approved paid/unpaid leave takes display precedence automatically, including on the employee clock card. Partial leave retains working hours. Rejected leave retains the original shift. The original assignment and published/frozen versions are preserved; payroll continues consuming its existing approved leave source.
- Status edits create versions and flow through existing publication and frozen-schedule override controls. Copy Week is atomic and copies working shifts, Rest Day and Skeletal; it does not carry leave, holiday or absence into a different date.
- Live attendance uses server time and published schedules. Rest days and approved full-day leave are not shown as scheduled late arrivals.
- Per-BU, effective-dated attendance review rules support a late-minutes threshold, occurrence count and rolling window, with optional automatic IR submission. Checks run every 15 minutes. No production BU rules were enabled by this release.
- Potential unexcused absence is detected only after a valid published shift ends with no recorded punches and no applicable approved leave, unresolved leave/correction request or clocking exemption. Flexible shifts without a fixed end do not trigger this automatic check.
- Tardiness checks retain the existing five-minute company grace. The example form values are not adopted company policy. Minutes beyond grace and occurrence counts are evaluated against the saved rule.
- Flags appear to authorized managers/HR. Automatic IRs use the existing Submitted / IR review workflow and contain schedule and attendance evidence. Repeated scans do not duplicate a flag or IR. HR can resolve/dismiss a flag with a recorded reason. This does not dispose of the linked IR or create an NTE decision.

## Team checklist — waiting on team

1. Employees/authorized HR: upload actual profile photos where missing.
2. BU/department managers: assign and review the weekly shifts/statuses, then publish. Register actual company holidays using the existing calendar before assigning the tag.
3. HR: verify paid/unpaid leave type settings and complete existing approvals. Review partial days, missed-punch requests and attendance corrections before finalizing payroll.
4. HR/Admin: open Timekeeping → Attendance flags & review; choose the BU, confirm actual thresholds and effective date, then enable checks and optionally automatic IR submission. Defaults remain off until saved.
5. Managers/HR: review incident evidence and employee explanations through the existing IR process. Resolve erroneous attendance evidence through the existing correction workflow.
6. Complete an authenticated phone/desktop walkthrough using actual authorized accounts. No fabricated production attendance or test employees are retained.

## Verification

- Production database rollback fixtures passed: Rest Day/Skeletal snapshots, source-assignment preservation, paid/unpaid/rejected leave, absence and tardiness detection, existing IR submission, duplicate prevention, week copy, live status RPC and unauthorized-user/photo access restrictions.
- UI rendering checks passed for paid/unpaid/rejected leave precedence, Rest Day/Skeletal display and initials without random photos.
- Production build passed. Type checking retains pre-existing errors in unrelated modules; no new errors remain in changed files.
- Read-only checks confirmed no test employees/flags/statuses/photos remained and existing drafts matched the prior implementation. Security advisors were reviewed for the additive tables and guarded functions.
- Authenticated device interactions and actual photo uploads remain team acceptance checks; no signed-in browser walkthrough is claimed.
