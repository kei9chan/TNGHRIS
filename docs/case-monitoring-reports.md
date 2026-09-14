# Case Monitoring & Reports

Feedback → Disciplinary Cases retains Kanban View and adds Case Register, Reports & Analytics, and Archived Cases. The register uses one row per employee/NTE; an incident without an NTE retains an employee row. All 25 requested register columns can be shown or hidden. Filters apply on submission, with 50 rows per page and bounded requests. No automatic retry or polling is introduced.

## Access and reporting definitions

The register RPC runs as the caller, preserving incident, NTE, resolution and directory RLS. It additionally checks the current organizational data scope. GLOBAL can report across accessible BUs; SPECIFIC is limited to assigned BUs; HOME_ONLY is limited to the home BU. Department/direct-report scopes also retain employee scope and home BU. SELF/NONE cannot use organizational reporting. Individual handler exceptions do not expand the reporting BU scope.

Export requires the existing `IncidentReports: export` permission (or manage). No role permission grants are changed. HR staff/managers without that permission can review accessible records but cannot download reports until their role is configured by an administrator. Archive/restore requires `IncidentReports: manage`; only closed cases may be archived. Archival preserves case data and is audited, including direct table mutations.

Service dates come from documented NTE receipts, not draft or receipt-entry timestamps. Implemented actions are populated only for Completed/Fully Served implementation records. Proposed actions are not represented as completed penalties. Missing closure dates remain blank; resolution averages include only closed cases with valid recorded dates. Counts refer to employee case rows, not unique parent incident reports. Open/closed are lifecycle states; archived records remain closed for workflow totals.

Overdue means an unanswered Issued NTE has reached its response deadline, or an IR without a visible NTE has exceeded its review SLA. Dates and inclusive date-range boundaries use Asia/Manila. Summaries follow the applied filters; cards narrow the register. Total clears lifecycle/stage/deadline filters while retaining other filters.

## Exports

Filtered and selected exports retain table filters. A BU selection cannot override a conflicting table BU filter. Explicit All accessible starts a fresh scope, still checked by the server. Additional date ranges intersect existing bounds. Selected IDs are intersected with the authorized filtered set on the server. Exports above 10,000 rows fail with an instruction to narrow scope.

The server computes and audits the exact returned row set in the same request. Audit details contain actor, timestamp, filters, count, format, report layout, columns, selection and effective scope. Audit insertion errors propagate and no file is released. The audit outcome is `authorized_for_download`: browser file-generation failures cannot be recorded as a completed download. No case content is stored in telemetry.

XLSX uses native numeric cells and hyperlinks; CSV escapes formula-like text and includes a confidentiality preamble before the header. PDF splits wide registers into column bands with matching row numbers and page footers. Summary reports group counts and resolution averages by BU/offense. Every format includes confidentiality and audit metadata. Document links reopen an authorized case or retain an existing HTTPS document reference; no permanent storage token or public attachment grant is generated.

## Focused verification

`npm run test:case-register` runs isolated Postgres/WASM fixtures and file-generation checks. It covers caller RLS exclusion, GLOBAL/HOME_ONLY/SPECIFIC/SELF scopes, filters, pagination, selected export intersection, missing dates/actions, mandatory audit failure, archive guard, editable XLSX values, hyperlinks, CSV formula safety and PDF generation. Fixtures contain no real employee case data. This is not a production load test or a complete reproduction of every existing RLS policy.

`npm run build` validates the production bundle. Excel/PDF code and the register are loaded on demand. Existing repository-wide TypeScript errors remain outside this change.
