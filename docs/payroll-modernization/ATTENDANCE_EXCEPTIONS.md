# Clock dashboard exceptions

Software: implemented. Team validation: pending real manager and employee walkthrough.

- Identical published shift entries display once; existing snapshots remain unchanged. New duplicate employee/date/template assignments are rejected. HR should review historical duplicate schedule assignments before payroll finalization.
- Employees submit actual missed clock-in, break, break-end or clock-out times and a reason beside the clock actions. Requests use the existing Direct Reporting To relationship. Ambiguous/missing manager configuration blocks submission with an error.
- The current direct manager approves or rejects, with an audit note. HR applies approved times using the existing complete-day correction workflow. Approval alone does not change attendance or payroll. An applied request links to the actual HR adjustment.
- Clock-out at least 10 minutes after a published fixed shift end offers an OT application. Both choices save the actual server clock-out. Applying opens the existing OT form; declining creates no OT request. Existing payroll grace, lunch and OT rules remain unchanged.
- Opt-in browser/in-app reminders: arrival +15 minutes, shift midpoint without a logged break, departure +5 minutes. Each reminder verifies current server attendance. Requires HRIS open; no closed-app push delivery. Flexible shifts without fixed boundaries do not trigger fixed-time reminders.

Validation: production build passed; focused timing tests passed including duplicate display and overnight boundaries. Native database tests passed with rollback: request retry, self-approval denial, future-time denial, direct manager approval, mandatory HR correction, linked application audit and anonymous denial. No test requests or notifications retained. Existing 15 unrelated TypeScript diagnostics remain. Authenticated visual/device walkthrough remains a team task.

Team checklist: confirm reporting lines; try one real missed-punch request through manager and HR; enable reminders on intended browsers; review existing duplicate assignments; verify the OT form and approval routing with an actual eligible request.
