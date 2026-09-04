# Gmail send-only connection: deployment and verification

This change adds a per-user Gmail connection used only to send authorized HRIS
documents. It does not add Google as an HRIS login provider and does not reuse or
modify the existing Google Calendar credential.

## Security model

- Requested Google scope: `https://www.googleapis.com/auth/gmail.send` only.
- OAuth mode: server-side authorization-code flow with `access_type=offline`,
  explicit consent, and a hashed, one-time state tied to the authenticated
  Supabase user for ten minutes.
- The browser receives only connection status metadata. Refresh and access
  tokens are never returned to the browser, user metadata, JavaScript-readable
  cookies, or browser storage.
- Refresh tokens are encrypted with AES-256-GCM before storage. The key is an
  Edge Function secret and is not stored in the database.
- The callback verifies the selected address without requesting identity or
  mailbox-read scopes: it sends a one-time message through Gmail using that
  explicit address as the Gmail API `userId`. Google accepts it only for the
  authorized account.
- Each document send authenticates the Supabase session, checks the existing
  feature permission, and reads the exact document through the caller's existing
  RLS context before server-side code accesses the protected Gmail credential.
- Delivery metadata is written to `hris_email_delivery_log` and the existing
  `audit_logs`. Email bodies and credentials are intentionally excluded from the
  delivery ledger.
- The legacy recruitment email endpoints now fail closed so an older browser
  bundle cannot silently fall back to a shared sender.

Official references:

- [Google OAuth 2.0 for web server applications](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Gmail API sending guide](https://developers.google.com/workspace/gmail/api/guides/sending)
- [Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Gmail users.messages.send](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send)
- [Supabase Edge Function authentication](https://supabase.com/docs/guides/functions/auth)
- [Supabase Edge Function secrets](https://supabase.com/docs/guides/functions/secrets)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase backups](https://supabase.com/docs/guides/platform/backups)

## Production gate: confirm backup first

Do not run the migration or deploy functions that depend on it until a current
backup is confirmed for project `kpogfmwsxwikfilxhcqh`.

1. In the Supabase dashboard, open **Database > Backups** for the project.
2. Confirm the latest successful daily backup or Point-in-Time Recovery point is
   recent enough for the deployment window.
3. Record its timestamp in the change ticket and confirm restoration access.
4. If no current successful backup is visible, stop. Do not apply the migration.

The migration is additive and does not update existing HRIS rows, policies,
roles, permissions, or authentication settings.

## Google Cloud configuration

Use a dedicated Web application OAuth client for Gmail sending. Do not reuse the
Calendar client merely because it already exists.

1. Enable the Gmail API in the selected Google Cloud project.
2. Configure the OAuth consent screen and add only `gmail.send`.
3. Complete Google's sensitive-scope verification requirements before broad
   production use.
4. Add this exact authorized redirect URI:

   `https://kpogfmwsxwikfilxhcqh.supabase.co/functions/v1/gmail-oauth-callback`

5. Do not add Gmail read, metadata, modify, or full-mailbox scopes.

## Required Edge Function secrets

Generate a new 32-byte key and retain it in the approved secret manager. Do not
paste the generated value into source control or deployment logs.

```sh
openssl rand -base64 32
```

Set these secrets on the Supabase project through the dashboard or CLI:

```text
GMAIL_GOOGLE_CLIENT_ID=<dedicated Gmail OAuth client ID>
GMAIL_GOOGLE_CLIENT_SECRET=<dedicated Gmail OAuth client secret>
GMAIL_OAUTH_REDIRECT_URI=https://kpogfmwsxwikfilxhcqh.supabase.co/functions/v1/gmail-oauth-callback
GMAIL_TOKEN_ENCRYPTION_KEY=<base64 value that decodes to exactly 32 bytes>
HRIS_APP_URL=https://hris.thenextperience.com
```

Supabase's built-in `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` remain server-side Function secrets. Never copy the
service-role key to frontend environment variables.

## Safe deployment order

After the backup gate is satisfied:

```sh
supabase link --project-ref kpogfmwsxwikfilxhcqh
supabase db push --dry-run
supabase db push
supabase functions deploy gmail-connection --project-ref kpogfmwsxwikfilxhcqh
supabase functions deploy send-hris-email --project-ref kpogfmwsxwikfilxhcqh
supabase functions deploy gmail-oauth-callback --project-ref kpogfmwsxwikfilxhcqh --no-verify-jwt
supabase functions deploy public-offer --project-ref kpogfmwsxwikfilxhcqh --no-verify-jwt
supabase functions deploy send-recruitment-email --project-ref kpogfmwsxwikfilxhcqh
```

The OAuth callback and public candidate-offer endpoint intentionally disable the
platform JWT gate because Google and candidates do not carry an HRIS JWT. Both
routes perform their own narrow authorization: one-time OAuth state for the
callback and the existing secure offer token/status rules for public offers.
`gmail-connection` and `send-hris-email` must retain JWT verification.

Deploy the frontend/backend application after the migration and functions are
healthy. Do not change Supabase Auth providers or the Calendar function secrets.

## Focused verification

Use non-production recipients first, and verify with representative authorized
and unauthorized HRIS roles.

1. Sign in with the existing HRIS credentials and confirm login behavior is
   unchanged.
2. Open **Integrations > Google Gmail**, enter the intended sender, and select
   **Connect Gmail**. Confirm this opens Google consent rather than an HRIS login.
3. Confirm the consent screen requests only permission to send email.
4. Complete consent and confirm **Gmail: Connected as ...** displays the correct
   address.
5. Send a test email and verify it appears in that account's Sent folder and in
   both delivery and HRIS audit history.
6. With an authorized recruitment role, send an approved offer. Verify the
   generated offer PDF is attached, the private candidate link works, and the
   Gmail message ID is recorded.
7. Exercise one COE and another enabled document-email flow. Confirm each screen
   shows the connected sender before sending.
8. Revoke or disconnect Gmail and confirm subsequent sends stop with a reconnect
   message; no fallback sender is used.
9. With an unauthorized role, call a protected document-send action and confirm
   HTTP 403 plus an `EMAIL_SEND_DENIED` audit entry.
10. Schedule a Calendar interview and confirm the existing Calendar event and
    invitation behavior are unchanged and independent of Gmail connection state.

Local regression command:

```sh
npm run test:gmail-sending
npm run build
```

## Reversible rollback

The low-risk rollback is application-only and preserves audit history:

1. Redeploy the previous frontend and previous versions of `public-offer` and
   the email Edge Functions.
2. Remove or hide the Integrations route in that frontend version.
3. Revoke the dedicated Gmail OAuth client or disconnect affected accounts if
   sending must stop immediately.
4. Leave the three new tables in place. They are isolated, RLS-forced, and
   inaccessible to browser roles, so leaving them dormant avoids deleting audit
   records.

Do not drop the tables or erase connection/delivery records as part of an
emergency rollback. A permanent schema removal would require separate approval,
an audit export and retention decision, and its own reviewed migration.
