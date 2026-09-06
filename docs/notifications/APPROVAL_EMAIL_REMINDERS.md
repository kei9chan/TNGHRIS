# Weekday approval email reminders

Admin → Settings → Approval Email Notifications controls one consolidated weekday digest per active approver. The schedule is fixed at 08:00 Asia/Manila (`0 0 * * 1-5` UTC). Configuration starts Off.

## Production setup

Set server-only production environment variables in the existing Vercel project:

- `RESEND_API_KEY`: sending API key for the verified Resend domain.
- `APPROVAL_EMAIL_FROM`: sender on that verified domain.
- `CRON_SECRET`: a strong random secret; Vercel supplies it as the cron Authorization bearer token.
- `APP_BASE_URL`: the HTTPS HRIS base URL.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only worker database credential. The existing `SUPABASE_URL` / `SUPABASE_ANON_KEY` (or existing public `VITE_` variants) remain supported for authenticated Admin requests.

Never prefix secret variables with `VITE_`. Redeploy after configuring them. Then use Send Test Email while logged in as an active Admin, confirm acceptance, and turn reminders On. Production email requires a verified sending domain; Resend rejects unverified senders. Settings expose only configuration booleans, never key fragments.

This session's GitHub/Vercel connector can deploy but cannot configure environment secrets; CLI had no authenticated credentials. No sending credentials were invented or stored in the repository. The switch remains Off. Real provider delivery and authenticated visual acceptance are pending configuration/sign-in.

## Shared source and scope

The existing Approval Center queues are exposed through `get_my_actionable_approval_tasks`. Six existing queue RPCs delegate to their extracted parameterized queries. Ordinary callers can query only their own stable HRIS user ID; the protected service worker uses explicit IDs without changing JWT claims or database user context. Existing RLS, table column grants, role memberships, approval handlers and routing transitions are unchanged.

The shared projection covers the Approval Center's existing time requests, manpower, NTE, personnel actions, requisitions, awards, offers and assets. Read-only asset observations stay visible in their existing UI but are excluded from digests. Pending assigned steps qualify; legacy visibility alone does not. Separate payroll authorization screens are not silently added to the Approval Center by this notification update.

The email worker contains no recipient-role or request-type allowlist. It consumes only grouped labels/counts from the shared projection. A future role with an assigned step works automatically. New approval modules should register with the shared projection when they are added to the Approval Center.

## Security and delivery

`/api/cron/approval-reminders` requires the exact `CRON_SECRET` bearer token and rechecks weekday, Manila date/time and the enable switch. Only this server worker uses the service credential. Admin settings and test actions verify the access token with Supabase Auth and require the existing active Admin role. The test recipient comes from that authenticated profile, never the request body.

Delivery uniqueness is notification type + stable user ID + Manila date. Database claims and a short lease prevent concurrent sends. Retries retain the original payload and Resend idempotency key. A successful delivery is never resent. Ambiguous provider acceptance is retried only within the same Manila date and less than 23 hours from the first attempt (inside Resend's 24-hour idempotency window). No earlier-date replay endpoint exists. Resend acceptance is recorded as `sent`; this is not a claim of inbox delivery.

A failed recipient does not stop others. Reinvoking the protected cron endpoint during the same weekday retries unsent recipients; successful rows are skipped. Only one run can be active; an interrupted run can be retried after six minutes. Logs contain only recipient metadata, counts, sanitized failure text and provider message IDs. No request contents or attachments are emailed.

The three new tables have RLS enabled and direct client grants revoked. Their no-policy advisor notices are intentional: Admin reads and settings writes use bounded RPCs, server delivery writes use service access. Signed-in SECURITY DEFINER notices apply to explicit caller checks, not broad client table permissions.

## Verification

- `node tests/approvalEmailTest.mjs`: protected cron, weekday/time guards, disabled state, dynamic grouped template/escaping, no attachments, test-recipient binding, provider acceptance and sanitized failure, continued processing after a failed recipient, and retry without successful-recipient duplicates.
- `tests/approvalEmailRollback.sql`: assigned BU manager / HR manager / HR staff / direct-manager-capable employee / GM / BOD fixtures; waiting steps excluded; unassigned Admin and Auditor excluded; assigned Auditor included; inactive account excluded; another user's IDs cannot be queried; Admin-only settings; service-only RPCs and delivery logs; concurrent/successful claims blocked and retry payload frozen. All fixtures and audit effects rolled back.
- Production build passed; typecheck has pre-existing unrelated errors and no errors in the changed modules.
- Authenticated desktop/mobile visual review and a real Resend test email were not performed because the connected HRIS browser is signed out and sending configuration is unavailable.
