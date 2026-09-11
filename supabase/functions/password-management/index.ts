import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { decryptRefreshToken, hasExactGmailSendScope, refreshAccessToken, sendGmailMessage } from '../_shared/gmail.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const failureMessage = 'We could not send the password-reset email. Please contact HRIS support.';
const normalize = (value: unknown) => String(value || '').trim().toLowerCase();
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');

// Refresh the connected HR/Admin sender before looking up the recipient. Global
// configuration failures therefore have the same public result for all emails.
async function recoverySender(admin: any) {
  const roles = await admin.from('user_roles').select('user_id,role_id').eq('is_active', true).in('role_id', ['HR Manager', 'Admin']);
  if (roles.error) throw new Error('sender_role_lookup_failed');
  const ids = [...new Set((roles.data || []).map((r: any) => r.user_id))];
  if (!ids.length) throw new Error('sender_not_configured');
  const profiles = await admin.from('hris_users').select('id,auth_user_id,status').in('id', ids).eq('status', 'Active');
  if (profiles.error) throw new Error('sender_profile_lookup_failed');
  const authIds = (profiles.data || []).map((p: any) => p.auth_user_id).filter(Boolean);
  if (!authIds.length) throw new Error('sender_not_configured');
  const connections = await admin.from('gmail_connections').select('user_id,google_email,refresh_token_ciphertext,refresh_token_iv,granted_scopes').in('user_id', authIds).eq('connection_status', 'connected').order('connected_at');
  if (connections.error) throw new Error('sender_connection_lookup_failed');
  // Prefer HR Manager, then Admin; never use an Employee sender.
  const candidates = (connections.data || []).sort((a: any, b: any) => {
    const hr = (c: any) => roles.data.some((r: any) => r.role_id === 'HR Manager' && profiles.data.some((p: any) => p.id === r.user_id && p.auth_user_id === c.user_id));
    return Number(hr(b)) - Number(hr(a));
  });
  let senderFailure = 'gmail_sender_unavailable_reconnect_required';
  for (const connection of candidates) {
    if (!hasExactGmailSendScope(connection.granted_scopes) || !validEmail(normalize(connection.google_email))) continue;
    try {
      const refresh = await decryptRefreshToken(connection.refresh_token_ciphertext, connection.refresh_token_iv);
      const token = await refreshAccessToken(refresh);
      return { accessToken: token.accessToken, senderEmail: connection.google_email };
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      senderFailure = /decrypt/i.test(message) ? 'gmail_credential_decryption_failed'
        : /not configured|must decode|valid base64/i.test(message) ? 'gmail_configuration_missing'
        : /revoked|expired/i.test(message) ? 'gmail_authorization_expired'
        : /permission|scope/i.test(message) ? 'gmail_send_scope_missing'
        : 'gmail_provider_unavailable';
    }
  }
  throw new Error(senderFailure);
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !serviceKey || !anonKey) return json({ error: failureMessage }, 503);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const isPublic = body.action === 'request_reset';
  let actor: any = null;
  let target: any = null;
  let email = normalize(body.email);
  let recordId: string | null = null;
  const generic = { ok: true, message: 'Request received. If an eligible account exists for this email, reset instructions will be emailed. If they do not arrive, please contact HRIS support.' };
  const outcome = async (state: string, code: string | null = null, messageId: string | null = null) => {
    if (!recordId) return;
    const result = await admin.from('password_reset_rate_limits').update({ outcome: state, failure_code: code, hris_user_id: target?.id || null, delivered: state === 'provider_accepted', provider_message_id: messageId }).eq('id', recordId);
    if (result.error) throw new Error('audit_write_failed');
  };
  try {
    if (!isPublic) {
      const authorization = request.headers.get('Authorization');
      if (!authorization) return json({ error: 'Authentication is required.' }, 401);
      const scoped = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await scoped.auth.getUser();
      if (error || !data.user) return json({ error: 'Your session is no longer valid.' }, 401);
      const role = await scoped.rpc('has_active_role', { p_role: 'Admin' });
      if (role.error || !role.data) return json({ error: 'Only an active Admin can manage account access.' }, 403);
      const profile = await admin.from('hris_users').select('id,email,status').eq('auth_user_id', data.user.id).single();
      if (profile.error || profile.data?.status !== 'Active') return json({ error: 'Active Admin access is required.' }, 403);
      actor = profile.data;
      if (body.action !== 'send_reset_link') return json({ error: 'Use an emailed recovery link. Passwords and recovery tokens are never available to administrators.' }, 400);
      const selected = await admin.from('hris_users').select('id,email,auth_user_id,status').eq('id', String(body.targetUserId || '')).single();
      if (selected.error || !selected.data) return json({ error: 'The employee account could not be loaded.' }, 404);
      target = selected.data;
      if (target.status !== 'Active') return json({ error: 'Password actions are unavailable for inactive accounts.' }, 409);
      email = normalize(target.email);
    }
    if (!validEmail(email)) return json({ error: 'Enter a valid email address.' }, 400);
    const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('cf-connecting-ip') || 'unknown';
    const reservation = await admin.rpc('reserve_password_recovery', { p_email_hash: await digest(email), p_ip_hash: await digest(actor ? `admin:${actor.id}` : forwarded) });
    if (reservation.error) return json({ error: failureMessage }, 503);
    recordId = reservation.data;
    if (!recordId) return json({ error: 'Too many reset requests. Please wait 15 minutes before trying again.' }, 429);
    const sender = await recoverySender(admin);
    if (isPublic) {
      // Literal equality prevents wildcard matching against account addresses.
      const found = await admin.from('hris_users').select('id,email,auth_user_id,status').eq('email', email).limit(2);
      if (found.error) throw new Error('profile_lookup_failed');
      if (found.data?.length !== 1 || found.data[0].status !== 'Active') {
        await outcome('not_eligible'); return json(generic);
      }
      target = found.data[0];
    }
    const existing = target.auth_user_id ? await admin.auth.admin.getUserById(target.auth_user_id) : null;
    const authUser = existing?.data?.user;
    if (!authUser || existing?.error || normalize(authUser.email) !== email || ((authUser as { banned_until?: string }).banned_until && new Date((authUser as { banned_until: string }).banned_until).getTime() > Date.now())) {
      await outcome('failed', 'identity_or_status_mismatch');
      return isPublic ? json(generic) : json({ error: 'The account identity requires review in Account diagnostics.' }, 409);
    }
    // Recovery never provisions an account and does not change profile IDs/roles.
    const generated = await admin.auth.admin.generateLink({ type: 'recovery', email: authUser.email!, options: { redirectTo: 'https://hris.thenextperience.com/reset-password' } });
    if (generated.error || !generated.data?.properties?.action_link || generated.data.user?.id !== authUser.id) {
      await outcome('failed', 'recovery_generation_failed');
      return isPublic ? json(generic) : json({ error: failureMessage }, 502);
    }
    const actionLink = generated.data.properties.action_link;
    try {
      const sent = await sendGmailMessage(sender.accessToken, { senderEmail: sender.senderEmail, senderName: 'TNG HRIS', to: authUser.email!, subject: 'Reset your TNG HRIS password', message: `Use this secure link to choose a new password:\n\n${actionLink}\n\nThis link expires and can be used once. If you did not request a reset, ignore this email.` });
      await outcome('provider_accepted', null, sent.messageId);
      if (actor) {
        const audit = await admin.from('audit_logs').insert({ user_id: actor.id, user_email: actor.email, action: 'PASSWORD_RESET_SENT', entity: 'hris_user', entity_id: target.id, details: JSON.stringify({ requestId: recordId, deliveryStatus: 'provider_accepted' }) });
        if (audit.error) throw new Error('audit_write_failed');
      }
      return isPublic ? json(generic) : json({ ok: true, delivered: true });
    } catch {
      await outcome('failed', 'gmail_send_failed');
      return isPublic ? json(generic) : json({ error: failureMessage }, 502);
    }
  } catch (error) {
    const allowedCodes = ['gmail_credential_decryption_failed','gmail_configuration_missing','gmail_authorization_expired','gmail_send_scope_missing','gmail_provider_unavailable','sender_role_lookup_failed','sender_profile_lookup_failed','sender_connection_lookup_failed','sender_not_configured','gmail_sender_unavailable_reconnect_required','profile_lookup_failed','audit_write_failed'];
    const code = error instanceof Error && allowedCodes.includes(error.message) ? error.message : 'recovery_service_failed';
    try { await outcome('failed', code); } catch { /* Fail closed without exposing data. */ }
    console.error('Password recovery failed', { requestId: recordId, code });
    return json({ error: failureMessage }, 503);
  }
});
