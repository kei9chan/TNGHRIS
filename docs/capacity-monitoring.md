# Capacity measurement and staging gate

Peak windows supplied by the owner: 09:00–11:00 and 18:00–21:00, assumed Asia/Manila
(UTC+8). Current users use phones/computers; shared punch stations are planned.

## Production measurement

`services/performanceTelemetry.ts` samples allowlisted Supabase request timings on
hris.thenextperience.com only. Successes use a 10% sample rate; failures use 100%,
subject to a 60-sample/tab/hour budget and 20-sample queue. Batches flush after ten
seconds without blocking the original request. Monitoring itself is not retried.

`POST /api/performance` validates exact fields, allowed operations, ranges, origin
and content type, then writes an `hris_performance` Vercel runtime log. It does not
query Supabase. Payloads contain operation, durationMs, HTTP status (0 for a fetch
failure) and sampleRate. No employee IDs, URL/query strings, bodies, error messages,
credentials, device evidence or tokens are collected by this code. Platform request
logs may separately include ordinary infrastructure metadata.

A per-instance ceiling accepts at most 200 samples/minute. Origin checks and this
ceiling reduce accidental misuse, but do not authenticate client-supplied metrics.
Treat timings as diagnostic observations, not trusted audit records.

These timings end at response headers, not body parsing or usable dashboard render.
A 2xx RPC response is not necessarily business success. They cannot certify saved
attendance, full login latency, or end-to-end p95. Aggregate successful samples
separately; failure counts need sampling weights and can be clipped by budgets.
There are no user/session IDs for cross-request joins. receivedAt timestamps are
batch receipt times, delayed by approximately ten seconds or browser suspension.

Use Vercel runtime logs filtered by `hris_performance` for a peak window and export
within the account's retention period. Match the same UTC interval to Supabase CPU,
RAM, I/O, connections and the read-only snapshot in performance-snapshot.sql.
No scheduled monitor, log drain, alert delivery or long-term retention is configured
by this change. Logs appear only when real requests qualify for sampling.

## Existing staging readiness

2026-09-14 read-only inspection of payroll-staging (suxncpnerzfkjhkhjwbd) found
get_my_hris_bootstrap and get_my_effective_rbac, but no get_my_attendance or
record_my_attendance_verified. Another preview branch reports MIGRATIONS_FAILED.
No staging reset, schema synchronization, new paid environment or synthetic account
creation was performed. Existing staging contents were not overwritten.

## Controlled staging runner

`scripts/staging-capacity.mjs` refuses any project reference other than the existing
payroll-staging project. It uses a private file of 150 distinct synthetic accounts
and a staging anon key supplied through environment variables. Never commit that
file, credentials or response bodies. Its first single-account request must pass
login, profile, permission and attendance checks before any ramp starts.

After that gate it runs 10, 25, 50 and 150-account stages with 200 ms spacing, stops
on a failed stage, and emits operation-level counts and p50/p95 API durations.
It does not submit clock events. It measures login/read API capacity, not frontend
rendering, sustained traffic, shared-kiosk behavior, or write capacity. Authentication
may encounter provider rate limits; investigate failures rather than disabling them.

    STAGING_PROJECT_REF=kpogfmwsxwikfilxhcqh node scripts/staging-capacity.mjs --check-guard
    # Must refuse before any network request.
    node scripts/staging-capacity.mjs --check-guard
    # Confirms the staging-only target without sending requests.

Before running the ramp: synchronize staging through reviewed migrations without
resetting unrelated work, seed isolated synthetic users/roles/published schedules,
and verify staging email/background jobs cannot message real employees. Then add a
separate same-ID write/persistence exercise against those fixtures. No 150-user
capacity claim is justified until those representative checks pass with headroom.
