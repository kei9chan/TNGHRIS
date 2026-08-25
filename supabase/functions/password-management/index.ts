import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const cleanHeader = (value: string) => value.replace(/[\r\n]+/g, ' ').trim();
const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strongPassword = (value: string) => value.length >= 12
  && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);

const digest = async (value: string) => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
};
const encodeBase64 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
};
const encodeBase64Url = (value: string) => encodeBase64(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const encodeHeader = (value: string) => `=?UTF-8?B?${encodeBase64(value)}?=`;

const googleError = async (response: Response) => {
  const payload = await response.json().catch(() => ({}));
  const reason = payload?.error?.errors?.[0]?.reason;
  const message = payload?.error?.message || payload?.error_description || `Google Gmail returned HTTP ${response.status}.`;
  if (response.status === 403 && ['insufficientPermissions', 'forbidden'].includes(reason)) {
    return 'Google is connected, but the saved authorization does not include Gmail send permission. Reconnect Google with the Gmail send scope.';
  }
  if (reason === 'accessNotConfigured') return 'Gmail API is not enabled for the connected Google Cloud project.';
  return reason && !message.includes(reason) ? `${message} (${reason})` : message;
};

const allowedRedirect = (raw: unknown) => {
  try {
    const url = new URL(String(raw || 'https://hris.thenextperience.com/reset-password'));
    const productionHosts = new Set(['hris.thenextperience.com', 'tnghris-omega.vercel.app']);
    const local = ['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol === 'http:';
    if ((!productionHosts.has(url.hostname) || url.protocol !== 'https:') && !local) throw new Error('Invalid redirect origin.');
    url.pathname = '/reset-password';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return 'https://hris.thenextperience.com/reset-password';
  }
};

const sendRecoveryEmail = async (to: string, actionLink: string) => {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')?.trim();
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')?.trim();
  const refreshToken = Deno.env.get('GOOGLE_REFRESH_TOKEN')?.trim();
  if (!clientId || !clientSecret || !refreshToken) throw new Error('Password email delivery is not configured.');
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  });
  if (!tokenResponse.ok) throw new Error(await googleError(tokenResponse));
  const tokenPayload = await tokenResponse.json();
  if (!tokenPayload?.access_token) throw new Error('Google did not return an access token for password email delivery.');

  const safeLink = escapeHtml(actionLink);
  const plainText = `Reset your TNG HRIS password\n\nOpen this secure link to choose a new password:\n${actionLink}\n\nThis link expires and can be used only for password recovery. If you did not request this, you can ignore this email.`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#111827"><h1 style="font-size:24px">Reset your TNG HRIS password</h1><p>Use the button below to choose a new password.</p><p style="margin:28px 0"><a href="${safeLink}" style="display:inline-block;background:#6d28d9;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700">Reset password</a></p><p style="font-size:13px;color:#4b5563">If the button does not work, copy and paste this URL into your browser:</p><p style="font-size:12px;word-break:break-all"><a href="${safeLink}">${safeLink}</a></p><p style="font-size:13px;color:#4b5563">This link expires. If you did not request it, you can ignore this email.</p></div>`;
  const boundary = `tng-password-${crypto.randomUUID()}`;
  const sender = cleanHeader(Deno.env.get('GOOGLE_GMAIL_FROM_EMAIL')?.trim() || '');
  const mime = [
    sender ? `From: TNG HRIS <${sender}>` : '', `To: ${cleanHeader(to)}`, `Subject: ${encodeHeader('Reset your TNG HRIS password')}`,
    'MIME-Version: 1.0', `Content-Type: multipart/alternative; boundary="${boundary}"`, '',
    `--${boundary}`, 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: 8bit', '', plainText,
    `--${boundary}`, 'Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: 8bit', '', html,
    `--${boundary}--`, '',
  ].filter((value, index) => value !== '' || index > 4).join('\r\n');
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST', headers: { Authorization: `Bearer ${tokenPayload.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encodeBase64Url(mime) }),
  });
  if (!response.ok) throw new Error(await googleError(response));
};

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: 'Password service is not configured.' }, 500);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const action = String(body?.action || '');
  const redirectTo = allowedRedirect(body?.redirectTo);

  if (action === 'request_reset') {
    const email = String(body?.email || '').trim().toLowerCase();
    const generic = { ok: true, message: 'If an active account matches that email, a reset link has been sent.' };
    if (!validEmail(email)) return json(generic);
    const emailHash = await digest(email);
    const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('cf-connecting-ip') || 'unknown';
    const ipHash = await digest(forwarded);
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const [{ count: emailCount }, { count: ipCount }] = await Promise.all([
      admin.from('password_reset_rate_limits').select('*', { count: 'exact', head: true }).eq('email_hash', emailHash).gte('requested_at', since),
      admin.from('password_reset_rate_limits').select('*', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('requested_at', since),
    ]);
    if ((emailCount || 0) >= 3 || (ipCount || 0) >= 10) return json(generic);
    const record = await admin.from('password_reset_rate_limits').insert({ email_hash: emailHash, ip_hash: ipHash }).select('id').single();
    const generated = await admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } });
    if (!generated.error && generated.data?.properties?.action_link) {
      try {
        await sendRecoveryEmail(email, generated.data.properties.action_link);
        if (record.data?.id) await admin.from('password_reset_rate_limits').update({ delivered: true }).eq('id', record.data.id);
      } catch (error) {
        console.error('Password recovery delivery failed', error);
      }
    }
    return json(generic);
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ error: 'Authentication is required.' }, 401);
  const scoped = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const [{ data: authData, error: authError }, { data: isAdmin, error: roleError }] = await Promise.all([
    scoped.auth.getUser(), scoped.rpc('has_active_role', { p_role: 'Admin' }),
  ]);
  if (authError || !authData.user) return json({ error: 'Your session is no longer valid.' }, 401);
  if (roleError || !isAdmin) return json({ error: 'Only an active Admin can manage user passwords.' }, 403);
  const targetUserId = String(body?.targetUserId || '');
  const { data: target, error: targetError } = await admin.from('hris_users').select('id,auth_user_id,email,full_name,status').eq('id', targetUserId).single();
  if (targetError || !target?.auth_user_id) return json({ error: 'The selected HRIS user has no linked login account.' }, 404);
  if (target.status !== 'Active') return json({ error: 'Password actions are unavailable for inactive accounts.' }, 409);
  const { data: actor } = await admin.from('hris_users').select('id,email').eq('auth_user_id', authData.user.id).single();
  let result: Record<string, unknown> = { ok: true };

  if (action === 'send_reset_link') {
    const generated = await admin.auth.admin.generateLink({ type: 'recovery', email: target.email, options: { redirectTo } });
    if (generated.error || !generated.data?.properties?.action_link) {
      console.error('Admin recovery-link generation failed', generated.error?.message || 'No action link returned.');
      return json({ error: generated.error?.message || 'A reset link could not be generated for this account.' }, 502);
    }
    try {
      await sendRecoveryEmail(target.email, generated.data.properties.action_link);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Password reset email could not be delivered.';
      console.error('Admin password recovery delivery failed:', reason);
      result = {
        ok: true,
        delivered: false,
        warning: `${reason} The secure reset link was generated and can be copied below.`,
        manualResetLink: generated.data.properties.action_link,
      };
    }
    if (!('delivered' in result)) result.delivered = true;
  } else if (action === 'set_temporary_password') {
    const temporaryPassword = String(body?.temporaryPassword || '');
    if (!strongPassword(temporaryPassword)) return json({ error: 'Temporary password must be at least 12 characters and include uppercase, lowercase, number, and symbol.' }, 400);
    const existing = await admin.auth.admin.getUserById(target.auth_user_id);
    if (existing.error) return json({ error: 'The linked login account could not be loaded.' }, 502);
    const updated = await admin.auth.admin.updateUserById(target.auth_user_id, {
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { ...(existing.data.user.user_metadata || {}), must_change_password: true },
    });
    if (updated.error) return json({ error: 'The temporary password could not be saved.' }, 502);
  } else {
    return json({ error: 'Unsupported password action.' }, 400);
  }

  if (actor?.id) await admin.from('audit_logs').insert({
    user_id: actor.id, user_email: actor.email,
    action: action === 'send_reset_link'
      ? (result.delivered ? 'PASSWORD_RESET_SENT' : 'PASSWORD_RESET_LINK_GENERATED')
      : 'TEMPORARY_PASSWORD_SET',
    entity: 'hris_user', entity_id: target.id,
    details: JSON.stringify({ targetEmail: target.email, sourceModule: 'Admin/UserManagement' }),
  });
  return json(result);
});
