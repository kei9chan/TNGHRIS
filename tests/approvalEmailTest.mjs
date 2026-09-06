import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = await mkdtemp(join(tmpdir(), 'approval-email-'));
await build({ entryPoints: ['server/approvalEmail.ts', 'api/cron/approval-reminders.ts'], outdir: dir, bundle: true, platform: 'node', format: 'esm', outExtension: { '.js': '.mjs' } });
const m = await import(pathToFileURL(join(dir, 'server/approvalEmail.mjs')));
Object.assign(process.env, { RESEND_API_KEY: 'test-secret-do-not-display', APPROVAL_EMAIL_FROM: 'HRIS <notify@example.com>', CRON_SECRET: 'test-cron', APP_BASE_URL: 'https://example.com', SUPABASE_SERVICE_ROLE_KEY: 'test-service' });
assert.equal(m.configured(), true);
assert.equal(JSON.stringify(m.configuration()).includes('secret'), false);
assert.equal(m.cronAuthorized(undefined), false);
assert.equal(m.cronAuthorized('Bearer bad'), false);
assert.equal(m.cronAuthorized('Bearer test-cron'), true);
assert.equal(m.manilaTime(new Date('2026-09-07T00:00:00Z')).allowed, true);
assert.equal(m.manilaTime(new Date('2026-09-06T23:59:00Z')).allowed, false);
assert.equal(m.manilaTime(new Date('2026-09-05T00:00:00Z')).allowed, false);
assert.equal(m.manilaTime(new Date('2026-09-06T00:00:00Z')).allowed, false);
const payload = m.emailPayload({ email: 'approver@example.com', name: '<Kay>', groups: [{ type: 'leave', label: 'Leave Requests', count: 2 }, { type: 'future', label: 'Future Requests', count: 1 }] });
assert.match(payload.subject, /3 approvals/); assert.match(payload.text, /2 Leave Requests/); assert.match(payload.text, /1 Future Requests/);
assert.match(payload.html, /&lt;Kay&gt;/); assert.match(payload.html, /https:\/\/example.com\/approvals/);
assert.equal(payload.to.length, 1); assert.equal('attachments' in payload, false);
const test = m.emailPayload({ email: 'admin@example.com', name: 'Admin', groups: [] }, true);
assert.match(test.subject, /Test/); assert.match(test.text, /No approval reminders were triggered/);
let calls = 0;
const sender = async (_url, req) => { calls++; assert.equal(req.headers['Idempotency-Key'], 'stable-key'); return { ok: true, status: 200, json: async () => ({ id: 'resend-id' }) }; };
assert.equal(await m.sendResend(payload, 'stable-key', sender), 'resend-id');assert.equal(calls, 1);
await assert.rejects(m.sendResend(payload, 'stable-key', async () => { throw new Error(process.env.RESEND_API_KEY); }), e => !e.message.includes(process.env.RESEND_API_KEY));
await assert.rejects(m.sendResend(payload, 'stable-key', async () => ({ ok: false, status: 429, json: async () => ({ message: process.env.RESEND_API_KEY }) })), /HTTP 429/);
let saved;
const client = { from: () => ({ update: patch => ({ eq: () => ({ eq: async () => { saved = patch; return { error: null }; } }) }) }) };
assert.equal(await m.deliver(client, { id: 'id', token: 'lease', payload, key: 'key' }, async () => 'accepted'), true);
assert.equal(saved.status, 'sent');assert.equal(saved.resend_message_id, 'accepted');
assert.equal(await m.deliver(client, { id: 'id', token: 'lease', payload, key: 'key' }, async () => { throw new Error('safe failure'); }), false);
assert.equal(saved.status, 'failed');assert.equal(saved.sent_at, undefined);
const cron = (await import(pathToFileURL(join(dir, 'api/cron/approval-reminders.mjs')))).default;
let status;
const response = { setHeader() {}, status(n) { status = n; return this; }, json(v) { return v; } };
await cron({ headers: {}, method: 'GET' }, response);assert.equal(status, 401);
await cron({ headers: { authorization: 'Bearer bad' }, method: 'GET' }, response);assert.equal(status, 401);
await cron({ headers: { authorization: 'Bearer test-cron' }, method: 'POST' }, response);assert.equal(status, 405);
let databaseTouched = false;
assert.equal((await m.runDigest({ from() { databaseTouched = true; } }, new Date('2026-09-05T00:00:00Z'))).skipped, 'Outside weekday reminder window');
assert.equal(databaseTouched, false);
const disabled = { from: () => ({ select: () => ({ single: async () => ({ data: { enabled: false } }) }) }) };
assert.equal((await m.runDigest(disabled, new Date('2026-09-07T00:00:00Z'))).skipped, 'Disabled');
// Run the actual worker with a fake transport/database: one failure does not stop others.
const recipients = [
  { id: 'a', email: 'a@example.com', name: 'A', groups: [{ type: 'leave', label: 'Leave Requests', count: 2 }, { type: 'other', label: 'Other Requests', count: 1 }] },
  { id: 'b', email: 'b@example.com', name: 'B', groups: [{ type: 'leave', label: 'Leave Requests', count: 1 }] },
  { id: 'c', email: 'c@example.com', name: 'C', groups: [{ type: 'other', label: 'Other Requests', count: 1 }] },
  { id: 'd', email: 'd@example.com', groups: [] },
  { id: 'e', skip: 'Inactive or unlinked account' },
  { id: 'f', email: 'invalid', groups: [{ type: 'leave', label: 'Leave Requests', count: 1 }] },
];
const deliveries = new Map(), runs = [];let failures = true;const sentKeys = [];
const fake = {
  async rpc(name, args) {
    if (name === 'start_approval_email_run') { runs.push({});return { data: `run${runs.length}` }; }
    if (name === 'get_approval_email_recipient') return { data: recipients.find(x => x.id === args.p_user_id) };
    if (name === 'claim_approval_email') {
      const prior = deliveries.get(args.p_key);if (prior?.status === 'sent') return { data: null };
      const d = prior || { id: args.p_key, key: args.p_key, payload: args.p_payload };d.status = 'sending';deliveries.set(args.p_key, d);return { data: d };
    }
    throw new Error(name);
  },
  from(table) {
    let patch, filter;const q = {
      select() { return q; },single: async () => ({ data: { enabled: true } }),order() { return q; },limit() { return q; },gt() { return q; },
      update(p) { patch = p;return q; },eq(k, v) { if (k === 'id') filter = v;return q; },
      upsert(p) { patch = p;return q; },
      then(resolve) {
        if (table === 'hris_users') return Promise.resolve({ data: recipients.map(x => ({ id: x.id })) }).then(resolve);
        if (table === 'approval_email_runs') Object.assign(runs.at(-1), patch);
        else if (filter) Object.assign(deliveries.get(filter), patch);
        else if (!deliveries.has(patch.idempotency_key)) deliveries.set(patch.idempotency_key, patch);
        return Promise.resolve({ error: null }).then(resolve);
      },
    };return q;
  },
};
const monday = new Date('2026-09-07T00:00:00Z');
const transport = async (p, key) => { if (p.to[0] === 'b@example.com' && failures) throw new Error('Temporary provider failure');sentKeys.push(key);return key; };
const first = await m.runDigest(fake, monday, transport, () => monday);
assert.equal(first.sent, 2);assert.equal(first.failed, 1);assert.equal(first.status, 'partial');
failures = false;
const second = await m.runDigest(fake, monday, transport, () => monday);
assert.equal(second.sent, 1);assert.equal(second.failed, 0);assert.equal(new Set(sentKeys).size, sentKeys.length);
assert.equal(deliveries.get('approval-digest-a-2026-09-07').payload.subject, '[TNG HRIS] You have 3 approvals waiting');
assert.equal([...deliveries.values()].filter(x => x.status === 'skipped').length, 2);
const route = await readFile('api/approval-email-settings.ts', 'utf8');
assert.doesNotMatch(route, /req\.body\.(to|email|recipient)/);
assert.match(route, /p_email: admin.email/);
assert.doesNotMatch(await readFile('components/admin/ApprovalEmailSettings.tsx', 'utf8'), /RESEND_API_KEY|SERVICE_ROLE_KEY/);
await rm(dir, { recursive: true, force: true });
console.log('Approval email tests passed: weekday/window, authorization, grouped safe template, test identity, provider acceptance/failure, disabled job. SQL rollback test covers RLS, task assignments and durable idempotency.');
