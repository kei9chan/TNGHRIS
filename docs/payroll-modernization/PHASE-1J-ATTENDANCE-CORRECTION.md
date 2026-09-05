# Phase 1J — Attendance Correction Requests

Status: implemented on `payroll-staging` and applied to the staging Supabase project only.

Phase 1J adds a missing-punch and no-show correction request. The requester supplies replacement clock evidence, a reason, and a source reference. An authorized payroll reviewer approves or rejects the request. Approval appends a corrected raw event and builds a new attendance interpretation linked to the original exception; the original raw event, interpretation, and exception evidence are retained for audit.

The correction package does not calculate statutory pay or modify a locked payroll. A later payroll-staging package must decide how approved corrected interpretations enter a run.
