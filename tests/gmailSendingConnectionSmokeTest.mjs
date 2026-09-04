import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = relativePath => readFile(path.join(root, relativePath), 'utf8');

const [
  app,
  authContext,
  header,
  integrations,
  senderField,
  clientService,
  migration,
  shared,
  connectionFunction,
  callbackFunction,
  sendFunction,
  publicOffer,
  retiredEdge,
  retiredApi,
  calendarFunction,
  offerDrawer,
  offerWorkspace,
  coe,
  contract,
  applicant,
  rejection,
  awards,
  resignation,
] = await Promise.all([
  source('App.tsx'),
  source('context/AuthContext.tsx'),
  source('components/layout/Header.tsx'),
  source('pages/Integrations.tsx'),
  source('components/integrations/GmailSenderField.tsx'),
  source('services/gmailConnectionService.ts'),
  source('supabase/migrations/20260904013302_gmail_sending_connections.sql'),
  source('supabase/functions/_shared/gmail.ts'),
  source('supabase/functions/gmail-connection/index.ts'),
  source('supabase/functions/gmail-oauth-callback/index.ts'),
  source('supabase/functions/send-hris-email/index.ts'),
  source('supabase/functions/public-offer/index.ts'),
  source('supabase/functions/send-recruitment-email/index.ts'),
  source('api/recruitment-email.ts'),
  source('supabase/functions/schedule-interview/index.ts'),
  source('components/recruitment/OfferCreationDrawer.tsx'),
  source('services/jobOfferWorkspaceService.ts'),
  source('components/admin/PrintableCOE.tsx'),
  source('pages/employees/EnvelopeDetail.tsx'),
  source('components/recruitment/ApplicantDetailModal.tsx'),
  source('components/recruitment/RejectionEmailModal.tsx'),
  source('pages/evaluation/Awards.tsx'),
  source('components/employees/ResignationLinkModal.tsx'),
]);

const gmailScope = 'https://www.googleapis.com/auth/gmail.send';
const newServerSources = [shared, connectionFunction, callbackFunction, sendFunction];

// HRIS authentication remains separate from the new connection screen.
assert.match(app, /path="integrations" element=\{<ProtectedRoute><Integrations \/><\/ProtectedRoute>\}/);
assert.match(header, /to="\/integrations"/);
assert.doesNotMatch(authContext, /gmail\.send|gmail-connection|gmail-oauth-callback/);
assert.match(integrations, /Connect services used by HRIS without changing how you sign in/);

// The database stores encrypted credentials and server-only metadata. No new
// table is browser-readable, and this migration does not weaken existing RLS.
for (const table of ['gmail_connections', 'gmail_oauth_states', 'hris_email_delivery_log']) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`));
  assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`));
}
assert.match(migration, /refresh_token_ciphertext text/);
assert.match(migration, /refresh_token_iv text/);
assert.match(migration, /gmail_message_id text/);
assert.match(migration, /delivery_status text not null/);
assert.doesNotMatch(migration, /security definer/i);
assert.doesNotMatch(migration, /\b(drop|truncate|delete from)\b/i);
assert.doesNotMatch(migration, /create policy/i);

// OAuth is a server-side authorization-code flow with a one-time, hashed,
// user-bound state and exactly one requested permission.
assert.match(connectionFunction, /authenticateRequest\(request\)/);
assert.match(connectionFunction, /state_hash: await hashState\(state\)/);
assert.match(connectionFunction, /user_id: context\.authUser\.id/);
assert.match(connectionFunction, /10 \* 60 \* 1000/);
assert.match(connectionFunction, /scope: GMAIL_SEND_SCOPE/);
assert.match(connectionFunction, /access_type: 'offline'/);
assert.match(connectionFunction, /prompt: 'consent'/);
assert.match(connectionFunction, /include_granted_scopes: 'false'/);
assert.match(callbackFunction, /exchangeAuthorizationCode\(code\)/);
assert.match(callbackFunction, /\.eq\('state_hash', await hashState\(rawState\)\)/);
assert.match(callbackFunction, /\.is\('used_at', null\)/);
assert.match(callbackFunction, /\.gt\('expires_at', usedAt\)/);
assert.match(callbackFunction, /activeHrisUser\.status !== 'Active'/);
assert.match(callbackFunction, /encryptRefreshToken\(tokens\.refreshToken\)/);
assert.match(callbackFunction, /sendGmailMessage[\s\S]*expectedEmail\);/);
assert.match(shared, /name: 'AES-GCM'/);
assert.match(shared, /GMAIL_TOKEN_ENCRYPTION_KEY/);
assert.match(shared, /hasExactGmailSendScope/);
assert.match(shared, /scopes\.length === 1/);
assert.match(connectionFunction, /hasExactGmailSendScope\(connection\.granted_scopes\)/);
assert.match(sendFunction, /hasExactGmailSendScope\(connection\.granted_scopes\)/);
assert.match(publicOffer, /hasExactGmailSendScope\(connection\.granted_scopes\)/);
assert.match(shared, /attachment content type is invalid/);
assert.equal((connectionFunction.match(new RegExp(gmailScope.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length, 0, 'Scope should be defined once in the shared module.');
assert.match(shared, new RegExp(gmailScope.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
for (const code of newServerSources) {
  assert.doesNotMatch(code, /https:\/\/www\.googleapis\.com\/auth\/(gmail\.(readonly|modify)|userinfo\.email)|https:\/\/mail\.google\.com\//i);
  assert.doesNotMatch(code, /\buser_metadata\b|localStorage|sessionStorage|document\.cookie/);
}

// All send side effects are re-authorized at the backend and remain subject to
// the existing row policy for the exact document record.
assert.match(sendFunction, /authenticateRequest\(request\)/);
assert.match(sendFunction, /context\.userClient\.rpc\('has_feature_permission'/);
assert.match(sendFunction, /context\.userClient[\s\S]*\.from\(rule\.table\)/);
assert.match(sendFunction, /outside your authorized record scope/);
assert.match(sendFunction, /The COE must be approved before it can be emailed/);
assert.match(sendFunction, /The NTE must be approved and issued before it can be emailed/);
assert.match(sendFunction, /The award must be approved before its certificate can be emailed/);
for (const documentType of ['job-offer', 'offer-welcome', 'candidate', 'candidate-rejection', 'interview', 'coe', 'nte', 'contract', 'award', 'resignation-guidance']) {
  assert.ok(sendFunction.includes(`'${documentType}'`), `Missing protected email document type: ${documentType}`);
}
assert.match(sendFunction, /\.eq\('user_id', context\.authUser\.id\)/);
assert.match(sendFunction, /sendGmailMessage\(token\.accessToken/);
assert.match(shared, /users\/\$\{encodeURIComponent\(userId\)\}\/messages\/send/);
assert.match(shared, /userId = 'me'/);
assert.match(shared, /Content-Disposition: attachment/);
assert.match(shared, /hris_email_delivery_log/);
assert.match(shared, /gmail_message_id/);
assert.match(shared, /delivery_status/);
assert.doesNotMatch(sendFunction, /SMTP_|nodemailer|GOOGLE_REFRESH_TOKEN/);

// Browser code receives connection metadata only and cannot persist tokens.
assert.match(clientService, /safe|GmailConnectionStatus/);
assert.match(clientService, /supabase\.functions\.invoke\('gmail-connection'/);
assert.match(clientService, /supabase\.functions\.invoke\('send-hris-email'/);
assert.match(clientService, /statusCache: \{ userId: string/);
assert.match(clientService, /statusRequest\?\.userId === userId/);
assert.doesNotMatch(clientService, /refreshToken|refresh_token|accessToken|access_token|localStorage|sessionStorage|document\.cookie/);

// Required settings states and per-send sender disclosure are present.
for (const label of ['Gmail: Not connected', 'Connect Gmail', 'Reconnect Gmail', 'Disconnect Gmail', 'Send test email']) {
  assert.ok(`${integrations}\n${senderField}`.includes(label), `Missing Gmail UI state/action: ${label}`);
}
assert.match(integrations, /Connected as \$\{connection\.email\}/);
assert.match(senderField, /Send from/);
assert.match(senderField, /Connect Gmail to send/);

// Existing user-triggered document email screens use the protected Gmail
// sender. The offer attaches the generated PDF and has no shared-sender fallback.
for (const [name, code] of Object.entries({ coe, contract, applicant, rejection, awards, resignation })) {
  assert.match(code, /GmailSenderField/, `${name} must display the sender`);
  assert.match(code, /sendHrisEmail/, `${name} must use the protected Gmail endpoint`);
  assert.doesNotMatch(code, /fetch\('\/api\/(send-email|recruitment-email)'/, `${name} must not silently use a shared sender`);
}
assert.match(offerDrawer, /Gmail: Connected as \{gmailConnection\.email\}/);
assert.match(offerDrawer, /buildOfferPdf/);
assert.match(offerDrawer, /contentType: 'application\/pdf'/);
assert.match(offerWorkspace, /documentType: 'job-offer'/);
assert.match(offerWorkspace, /attachments/);
assert.doesNotMatch(offerWorkspace, /send-recruitment-email|\/api\/recruitment-email/);
assert.match(retiredEdge, /status: 410/);
assert.match(retiredApi, /res\.status\(410\)/);

// Candidate acceptance confirmations use the original offer sender's own
// connection, while Calendar retains its separate existing credential path.
assert.match(publicOffer, /offer\.sent_by_user_id/);
assert.match(publicOffer, /documentType: 'offer-welcome'/);
assert.match(publicOffer, /sendConnectedOfferEmail/);
assert.doesNotMatch(publicOffer, /GOOGLE_REFRESH_TOKEN|GOOGLE_CALENDAR_ID|GOOGLE_GMAIL_FROM_EMAIL/);
assert.match(calendarFunction, /GOOGLE_REFRESH_TOKEN/);
assert.match(calendarFunction, /calendar\/v3\/calendars/);
assert.doesNotMatch(calendarFunction, /GMAIL_TOKEN_ENCRYPTION_KEY|gmail_connections/);

console.log('Gmail sending connection smoke test passed.');
