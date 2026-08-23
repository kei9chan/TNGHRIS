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

const requiredSecret = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Google integration secret ${name} is not configured.`);
  return value;
};

const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const cleanHeader = (value: string) => value.replace(/[\r\n]+/g, ' ').trim();

const encodeBase64 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
};

const encodeHeader = (value: string) => `=?UTF-8?B?${encodeBase64(value)}?=`;
const encodeBase64Url = (value: string) => encodeBase64(value)
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/g, '');

const googleError = async (response: Response) => {
  const payload = await response.json().catch(() => ({}));
  const reason = payload?.error?.errors?.[0]?.reason;
  const message = payload?.error?.message || payload?.error_description || `Google Gmail returned HTTP ${response.status}.`;
  if (response.status === 403 && ['insufficientPermissions', 'forbidden'].includes(reason)) {
    return 'Google is connected for Calendar, but the saved refresh token does not include Gmail send permission. Reconnect Google once with the Gmail send scope, then retry.';
  }
  if (reason === 'accessNotConfigured') {
    return 'Gmail API is not enabled for the Google Cloud project. Enable Gmail API, then retry.';
  }
  return reason && !message.includes(reason) ? `${message} (${reason})` : message;
};

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ error: 'Authentication is required.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) return json({ error: 'Supabase function environment is incomplete.' }, 500);

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return json({ error: 'Your session is no longer valid.' }, 401);

  const { data: allowed, error: permissionError } = await supabase.rpc('is_hr_or_admin');
  if (permissionError || !allowed) return json({ error: 'You do not have permission to send recruitment emails.' }, 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  const to = cleanHeader(String(body?.to || ''));
  const subject = cleanHeader(String(body?.subject || ''));
  const message = String(body?.message || '').trim();
  const html = String(body?.html || '').trim();
  if (!validEmail(to)) return json({ error: 'Enter one valid recipient email address.' }, 400);
  if (!subject || !message) return json({ error: 'Email subject and message are required.' }, 400);
  if (subject.length > 250 || message.length > 100_000 || html.length > 250_000) return json({ error: 'The email content is too large.' }, 413);

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: requiredSecret('GOOGLE_CLIENT_ID'),
        client_secret: requiredSecret('GOOGLE_CLIENT_SECRET'),
        refresh_token: requiredSecret('GOOGLE_REFRESH_TOKEN'),
        grant_type: 'refresh_token',
      }),
    });
    if (!tokenResponse.ok) return json({ error: await googleError(tokenResponse) }, 502);
    const tokenPayload = await tokenResponse.json();
    if (!tokenPayload?.access_token) return json({ error: 'Google did not return an access token.' }, 502);

    const boundary = `tng-hris-${crypto.randomUUID()}`;
    const senderEmail = Deno.env.get('GOOGLE_GMAIL_FROM_EMAIL')?.trim()
      || (validEmail(Deno.env.get('GOOGLE_CALENDAR_ID')?.trim() || '') ? Deno.env.get('GOOGLE_CALENDAR_ID')!.trim() : '');
    const headers = [
      senderEmail ? `From: TNG Recruitment Team <${cleanHeader(senderEmail)}>` : '',
      `To: ${to}`,
      `Subject: ${encodeHeader(subject)}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ].filter(Boolean);
    const mime = [
      ...headers,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 8bit',
      '',
      message,
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: 8bit',
      '',
      html || `<p>${message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`,
      `--${boundary}--`,
      '',
    ].join('\r\n');

    const gmailResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenPayload.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: encodeBase64Url(mime) }),
    });
    if (!gmailResponse.ok) return json({ error: await googleError(gmailResponse) }, 502);
    const sent = await gmailResponse.json();
    return json({ ok: true, provider: 'google-gmail', messageId: sent.id, threadId: sent.threadId });
  } catch (error) {
    console.error('Recruitment Gmail send failed', error);
    return json({ error: error instanceof Error ? error.message : 'Unable to send the recruitment email.' }, 500);
  }
});
