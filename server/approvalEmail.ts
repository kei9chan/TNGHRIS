import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';

export const env = (key: string) => process.env[key]?.trim() || '';
export function configuration() {
  let app = false;
  try { const u = new URL(env('APP_BASE_URL')); app = u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash; } catch {}
  const sender = /^(?:[^<>\r\n]+\s*<)?[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>?$/.test(env('APPROVAL_EMAIL_FROM')) && !/@resend\.dev>?$/i.test(env('APPROVAL_EMAIL_FROM'));
  return { providerConfigured: Boolean(env('RESEND_API_KEY')), senderConfigured: sender, appConfigured: app,
    cronConfigured: Boolean(env('CRON_SECRET')), databaseConfigured: Boolean(env('SUPABASE_SERVICE_ROLE_KEY')) };
}
export const configured = () => Object.values(configuration()).every(Boolean);
export const validEmail = (s: unknown): s is string => typeof s === 'string' && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(s);
export function cronAuthorized(header: unknown) {
  const secret = env('CRON_SECRET');
  if (!secret || typeof header !== 'string') return false;
  const a = Buffer.from(header), b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function manilaTime(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, allowed: !['Sat', 'Sun'].includes(p.weekday) && Number(p.hour) >= 8 };
}
export const serviceClient = () => {
  const url = env('SUPABASE_URL') || env('VITE_SUPABASE_URL');
  if (!url || !env('SUPABASE_SERVICE_ROLE_KEY')) throw new Error('Server database connection is not configured');
  return createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
};
export async function rpc(client: any, name: string, args = {}) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw Object.assign(new Error('Notification database operation failed'), { code: error.code });
  return data;
}
export async function requireAdmin(req: any) {
  const token = typeof req.headers.authorization === 'string' ? req.headers.authorization.match(/^Bearer (.+)$/)?.[1] : null;
  if (!token) throw Object.assign(new Error('Authentication required'), { status: 401 });
  const client = createClient(env('SUPABASE_URL') || env('VITE_SUPABASE_URL'), env('SUPABASE_ANON_KEY') || env('VITE_SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const auth = await client.auth.getUser(token);
  if (auth.error || !auth.data.user) throw Object.assign(new Error('Authentication required'), { status: 401 });
  const result = await client.rpc('get_approval_email_admin');
  if (result.error || !result.data) throw Object.assign(new Error('Active Admin access required'), { status: 403 });
  return { client, admin: result.data };
}
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export type Group = { type: string; label: string; count: number };
export function emailPayload(recipient: { email: string; name?: string; groups: Group[] }, test = false) {
  const count = recipient.groups.reduce((n, g) => n + Number(g.count), 0);
  const firstName = recipient.name?.trim().split(/\s+/)[0] || 'there';
  const url = new URL('/approvals', env('APP_BASE_URL')).toString();
  const subject = test ? '[TNG HRIS] Test approval reminder' : `[TNG HRIS] You have ${count} approval${count === 1 ? '' : 's'} waiting`;
  const intro = test ? 'This is a test email from Approval Email Notifications. No approval reminders were triggered.' : `You have ${count} item${count === 1 ? '' : 's'} waiting for your review in TNG HRIS.`;
  const lines = recipient.groups.map(g => `${g.count} ${g.label}`);
  return { from: env('APPROVAL_EMAIL_FROM'), to: [recipient.email], subject,
    text: `Good morning, ${firstName}!\n\n${intro}\n\n${lines.join('\n')}\n\nReview Pending Approvals: ${url}\n\nSign in to review the current approval queue.`,
    html: `<html><body style="margin:0;background:#f4f3fa;font-family:Arial,sans-serif;color:#20203b"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:auto;background:white;border-radius:16px"><tr><td style="padding:24px;background:#11172d;color:white;font-size:22px;font-weight:bold">TNG HRIS${test ? ' · TEST' : ''}</td></tr><tr><td style="padding:24px"><h1 style="font-size:22px">Good morning, ${escapeHtml(firstName)}!</h1><p style="line-height:1.6">${intro}</p>${lines.length ? `<ul style="padding-left:20px;line-height:1.9">${lines.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>` : ''}<p style="margin:28px 0"><a href="${escapeHtml(url)}" style="display:inline-block;padding:16px 20px;border-radius:10px;background:#7040ed;color:white;text-decoration:none;font-weight:bold">Review Pending Approvals</a></p><p style="font-size:13px;color:#65617b">Sign in to review the current approval queue.</p></td></tr></table></td></tr></table></body></html>` };
}
export async function sendResend(payload: any, key: string, fetcher = fetch) {
  try {
    const result = await fetcher('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
    const data = await result.json().catch(() => ({})) as any;
    if (!result.ok || !data.id) throw new Error(`Resend did not accept the email (HTTP ${result.status})`);
    return String(data.id);
  } catch (e: any) {
    // Never persist provider bodies, request headers, API keys, or approval details.
    throw new Error(/^Resend did not accept/.test(e?.message) ? e.message : 'Email acceptance could not be confirmed; safe retry is available');
  }
}
export async function deliver(client: any, claim: any, sender = sendResend) {
  try {
    const messageId = await sender(claim.payload, claim.key);
    const result = await client.from('approval_email_deliveries').update({ status: 'sent', resend_message_id: messageId, sent_at: new Date().toISOString(), error_summary: null, lease_until: null }).eq('id', claim.id).eq('lease_token', claim.token);
    if (result.error) return false; // Retry the same persisted payload/key if acceptance could not be saved.
    return true;
  } catch (e: any) {
    const result = await client.from('approval_email_deliveries').update({ status: 'failed', error_summary: e.message, lease_until: null }).eq('id', claim.id).eq('lease_token', claim.token);
    if (result.error) throw new Error('Delivery result could not be recorded');
    return false;
  }
}
export async function runDigest(client = serviceClient(), now = new Date(), sender = sendResend, clock = () => new Date()) {
  const time = manilaTime(now);
  if (!time.allowed) return { skipped: 'Outside weekday reminder window' };
  const settings = await client.from('approval_email_settings').select('enabled').single();
  if (settings.error) throw new Error('Reminder settings could not be loaded');
  if (!settings.data?.enabled) return { skipped: 'Disabled' };
  const runId = await rpc(client, 'start_approval_email_run');
  if (!runId) return { skipped: 'Disabled, outside schedule, or another run is in progress' };
  let failed = 0, sent = 0, skipped = 0, fatal = '', after = '', more = true;
  const deadline = Date.now() + 250000;
  try {
    if (!configured()) throw new Error('Server email configuration is incomplete');
    while (more) {
      let query = client.from('hris_users').select('id').order('id').limit(100);
      if (after) query = query.gt('id', after);
      const users = await query;
      if (users.error) throw new Error('Recipient lookup failed');
      more = users.data.length === 100;
      for (const user of users.data) {
        if (Date.now() > deadline || manilaTime(clock()).date !== time.date) throw new Error('Run paused; retry the same weekday to continue safely');
        after = user.id;
        const key = `approval-digest-${user.id}-${time.date}`;
        try {
          const recipient = await rpc(client, 'get_approval_email_recipient', { p_user_id: user.id });
          const count = (recipient?.groups || []).reduce((n: number, g: Group) => n + Number(g.count), 0);
          const skipReason = recipient?.skip || (!validEmail(recipient?.email) ? 'Missing or invalid active profile email' : '');
          if (skipReason) {
            const logged = await client.from('approval_email_deliveries').upsert({ notification_type: 'approval-digest', scheduled_date: time.date, recipient_user_id: user.id, recipient_email: validEmail(recipient?.email) ? recipient.email : null, pending_count: count, status: 'skipped', idempotency_key: key, run_id: runId, error_summary: skipReason }, { onConflict: 'idempotency_key', ignoreDuplicates: true });
            if (logged.error) throw new Error('Skip could not be recorded');
            skipped++; continue;
          }
          if (!count) { skipped++; continue; }
          const claim = await rpc(client, 'claim_approval_email', { p_key: key, p_user: user.id, p_date: time.date, p_type: 'approval-digest', p_email: recipient.email, p_count: count, p_payload: emailPayload(recipient), p_run: runId });
          if (!claim) { skipped++; continue; }
          if (await deliver(client, claim, sender)) sent++; else failed++;
          // Resend's default rate is two requests/second; keep this worker below it.
          await new Promise(resolve => setTimeout(resolve, 600));
        } catch {
          failed++;
          const logged = await client.from('approval_email_deliveries').upsert({ notification_type: 'approval-digest', scheduled_date: time.date, recipient_user_id: user.id, pending_count: 0, status: 'failed', idempotency_key: key, run_id: runId, error_summary: 'Approval lookup or delivery logging failed; safe retry is available' }, { onConflict: 'idempotency_key', ignoreDuplicates: true });
          if (logged.error) throw new Error('Recipient failure could not be recorded');
        }
      }
    }
  } catch (e: any) { fatal = e.message; }
  const status = fatal ? 'failed' : failed ? 'partial' : 'completed';
  const result = await client.from('approval_email_runs').update({ status, sent, failed, skipped, error_summary: fatal || null, finished_at: new Date().toISOString() }).eq('id', runId);
  if (result.error) throw new Error('Run summary could not be recorded');
  return { status, sent, failed, skipped };
}
