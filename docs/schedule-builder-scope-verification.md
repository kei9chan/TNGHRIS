# Schedule Builder scope and save verification

Implemented September 14, 2026.

The builder defaults to the logged-in user's actual `reports_to` IDs, independently of the roster used by the other timekeeping panels. The scope preference is stored per account in session storage and retained through week/view/review changes. Same-BU planning reads return minimal schedule information, with server-derived edit eligibility. Existing broader editing privileges remain authoritative. Missing assignments do not remove employee rows; existing clocking exemptions still apply.

Single-shift saves use an RLS-enforced invoker RPC with employee/date serialization, expected row/template checks, and idempotent retries. Conflicting duplicate rows cause a clear error without deleting historical shifts. Successful saves require a matching server readback. Unsaved selections stay visible after errors; the drawer offers Retry and allows changing the selected preset. Polling responses predating a mutation are discarded. Copy, status, delete and autofill operations share busy/error/retry handling and a confirmed reload. Publication validates the selected scope on the server and reads canonical version/status data back before showing success.

Focused checks:

- `node tests/scheduleBuilderReliabilityTest.mjs`: passed. Actual production functions exercised with simulated network failure, retry, mismatching readback, duplicate clicks, an old pending fetch, server edit flags and publication verification failure.
- `tests/scheduleBuilderScopeRollback.sql`: passed against the connected database with Boj's existing authenticated identity and permissions. 13 direct reports; 21 employees in his business-unit planning view. Seven temporary future shifts saved and reread across weeks/scopes, a lost-response retry caused no duplicate, and publication was confirmed. Default scope blocked an unrelated employee even for Boj's Admin account. An ordinary employee could not save/publish the test schedule. All fixture writes were rolled back.
- Additional scoped rollback check: one manager could view a same-BU peer's schedule status while the server denied editing that peer. No role grants or employee profiles were changed.
- Production build passed. Diff whitespace checks passed.
- Security advisor reviewed: the new read-only definer RPC is intentionally authenticated-callable, with explicit active-actor, builder, scope and week guards; anonymous execution revoked. Save and publish wrappers are security invokers. Existing unrelated advisories were not changed.

No real employee schedules were submitted or published during testing. No authenticated browser session for Boj was used; refresh/week/filter persistence was verified through the real database API and UI handler tests. The original intermittent loss was not reproduced from a live browser trace, so these changes address the observed silent-error, stale-response and unverified-success paths without asserting a single historical root cause.

The three additive database migrations have been applied. Frontend code is committed locally; GitHub publication remains pending after automatic approval review rejected the earlier repository upload and requested fresh authorization for `kei9chan/TNGHRIS`.
