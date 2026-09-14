# Login loading incident — September 14, 2026

## Observed

- The public production `/dashboard` redirected a signed-out browser to `/login`; the sign-in form rendered.
- Database diagnostics intermittently timed out. An activity snapshot included a request running for about 46 seconds with a temporary-file write wait. This does not establish the underlying resource bottleneck.
- Later database diagnostic calls returned permission errors, including a basic account-count read. Server diagnosis could not be completed through the connection available in this session.
- No production Vercel error/fatal logs were returned for the preceding hour. Browser-to-Supabase operations do not run in a Vercel function, so this is not evidence of a healthy database.
- Startup awaited `auth.getUser()` and subsequent profile/permission requests without a deadline or outer catch/finally. A hung request could leave the full-screen spinner indefinitely. Auth events could repeat hydration even for an already verified, unchanged session.

## Changes

- Use the existing session as an identity hint, then require both existing server profile and RBAC checks before exposing a user. No authorization from browser storage alone.
- Bound session retrieval, credential sign-in and profile/permission loading; provide retry after a stalled initial verification. Abort stalled Auth HTTP requests. Do not automatically repeat credential submissions.
- Ignore redundant initial/token-refresh events, retain forced reads for actual permission changes, and share the existing short-lived permission cache for ordinary focus checks.
- Reject obsolete results after logout, account switch or a superseding startup attempt.
- Split role dashboards and WFH into lazy modules; keep the attendance/dashboard shell visible while the role section loads. Defer editor, map and legacy PDF scripts so they no longer block HTML parsing.
- No database schema, RLS, role assignment, employment, attendance or payroll changes.

## Focused validation

- `node tests/authStartupReliabilityTest.mjs`: production AuthProvider and deadline code executed with controlled backend responses/timers. Verified authorization gate, valid startup/sign-in, duplicate sign-in prevention, inactive/unauthorized denial, hung session/profile, retry, late response isolation, logout and account switching.
- `node tests/authorizationInitialRenderTest.mjs`: permissions start closed and are isolated by account.
- `node tests/dashboardAuthResilienceSmokeTest.mjs`: existing authentication resilience checks.
- Production Vite build.
- Dashboard chunk reduced from 177,058 to approximately 27,600 bytes uncompressed; role chunks now load separately. This is a bundle-size comparison, not a measured end-to-end login speedup.

Authenticated production sign-in and the database resource bottleneck remain unverified. The separate Czarina schedule incident remains open: saved shift assignments existed, but no publication existed for her active employee record for September 14–20. No schedules or attendance were created during these diagnostics.
