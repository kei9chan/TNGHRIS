# HRIS performance baseline — Phase 1

Captured 2026-09-14, approximately 14:28–14:31 UTC. Project kpogfmwsxwikfilxhcqh.
Production checks were read-only. No attendance writes, load tests, billing changes,
query changes, or permission changes were performed.

## Status and limits

The immediate post-upgrade baseline is captured; representative shift-change
measurement remains outstanding. This is not a capacity certification for 150 users.
Micro compute was confirmed by the owner's screenshot. Postgres restarted at
14:18:39 UTC. Login and dashboard session restoration succeeded in the preceding
browser verification. That verification did not capture exact end-to-end timings.

The connector permits SQL diagnostics. It does not expose CPU, memory, disk I/O
time series or Auth service logs. The browser's read-only evaluation surface does
not expose the Resource Timing API. No diagnostic permission rejection occurred.
No continuous browser telemetry has been installed or deployed.

## Current database observations

- At 14:28:27: 39 pg_stat_activity entries, including background processes; this is
  not 39 employee connections. Configured max_connections is 60. No lock waiters.
- Later breakdown: 21 idle authenticator clients, 7 idle admin clients, 1 idle Auth
  client and the diagnostic client, plus background processes. No evidence of
  connection exhaustion in these snapshots.
- Database statistics reset date remains 2025-11-15. Cumulative temp bytes and
  deadlock totals must not be interpreted as post-upgrade pressure.
- Current CPU, RAM and I/O time series still require the provider metrics export.

## Measured query window

Differences between pg_stat_statements snapshots at 14:28:52.443 and 14:31:03.781
UTC (131.338 seconds). Mean = delta total_exec_time / delta calls. These are server
execution times across all callers, not browser latency, percentiles, or peak load.

| Query | Calls in window | Mean execution ms |
| --- | ---: | ---: |
| get_accessible_hris_users | 1 | 1060.8 |
| get_my_actionable_approval_tasks | 6 | 216.4 |
| get_my_pending_time_approval_ids | 1 | 40.7 |
| get_my_attendance | 6 | 13.9 |
| get_my_effective_rbac | 8 | 7.2 |

The directory query and approval work are candidates for Phase 2. Small sample
sizes do not establish sustained bottlenecks or justify an index by themselves.

## Background jobs after restart

Read the latest 300 cron run records, filtered to starts after the restart.

| Job | Runs | Failed | Mean ms | Maximum ms |
| --- | ---: | ---: | ---: | ---: |
| Attendance review (1) | 1 | 0 | 19.1 | 19.1 |
| NTE/NOD processing (8) | 12 | 0 | 47.9 | 105.1 |
| Attendance reminders (10) | 3 | 0 | 216.0 | 564.2 |
| Case correspondence (11) | 1 | 0 | 87.1 | 87.1 |
| Offboarding access expiry (19) | 12 | 0 | 19.5 | 27.2 |

Jobs 8 and 19 run every minute. Outage screenshots previously showed about 10.1
and 10.5 seconds respectively. The improvement is observed, but the effects of
restart and compute upgrade cannot be separated. Do not disable access expiry.

## Request paths and amplification

- Authentication: signInWithPassword, then get_my_hris_bootstrap and
  get_my_effective_rbac, then the authorized dashboard. Do not bypass either check.
- Attendance read: services/employeeAttendance.ts -> get_my_attendance.
- Attendance write: record_my_attendance or record_my_attendance_verified with
  request ID and expected revision. No live write was made for this baseline.
- hooks/useAttendanceClock.ts polls visible tabs every 30 seconds and refreshes
  on focus/online/visibility changes. It guards in-flight polling. At one mounted
  widget per visible tab, 150 tabs imply roughly 300 periodic reads/minute,
  excluding initial reads, focus events and other widgets. This is a calculation,
  not observed traffic.
- hooks/useAdditionalApprovals.ts refreshes visible tabs every 30 seconds;
  hooks/useApprovals.ts every 60 seconds plus focus. Review cross-widget sharing,
  overlap and necessity in Phase 2.
- Attendance reminder's 15-second timer only fetches when a reminder is due and
  not already shown. Do not count every timer tick as a network request.
- Unbounded attendance list reads in services/timekeepingService.ts are used by
  payroll staging and exception reports, not the dashboard attendance widget.
  They are a separate report-growth concern.

## Complete the representative peak baseline

1. Obtain the busiest shift-change time and timezone and whether people use
   individual phones, a shared punch station, or both.
2. Capture provider CPU, RAM, I/O budget/throughput and connection charts for the
   same 15-minute peak interval, including the start/end times and timezone.
3. Run the lightweight snapshot SQL once before and once after the interval.
   Compare counters without resetting shared statistics. Do not poll every second.
4. Capture sanitized client timing for authentication, profile, permissions,
   essential dashboard readiness, and attendance save confirmation. Required
   fields: build, operation label, UTC timestamp, duration, HTTP status/error code,
   outcome and attempt count. Exclude credentials, tokens, request/response bodies,
   employee identifiers, URL query strings, location and attendance evidence.
   A production collection destination and retention are not yet configured.
5. Observe normal authorized use for saves; use synthetic staging data for
   deliberately interrupted or repeated submissions. Do not manufacture payroll
   or attendance events in production to get a timing.
6. Record p50/p95 only when enough samples exist; retain sample counts. Match slow
   operations to the same interval's database and job activity before proposing
   changes or another resize.

Next implementation priority: investigate the directory/approval request work
and duplicate polling while preserving fresh attendance state and authorization.

