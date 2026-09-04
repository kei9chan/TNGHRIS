import { createClient, type SupabaseClient, type User } from 'jsr:@supabase/supabase-js@2';

export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

export const hasExactGmailSendScope = (scopes: unknown): scopes is string[] => (
  Array.isArray(scopes)
  && scopes.length === 1
  && scopes[0] === GMAIL_SEND_SCOPE
);

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export const requiredSecret = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Required Gmail integration secret ${name} is not configured.`);
  return value;
};

export const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
export const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export const cleanHeader = (value: unknown) => String(value || '').replace(/[\r\n]+/g, ' ').trim();

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
};

const base64ToBytes = (value: string) => {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
};

const utf8ToBase64 = (value: string) => bytesToBase64(new TextEncoder().encode(value));
const base64Url = (value: string) => value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const wrapBase64 = (value: string) => value.match(/.{1,76}/g)?.join('\r\n') || '';
const encodeHeader = (value: string) => `=?UTF-8?B?${utf8ToBase64(value)}?=`;
const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

export const randomState = () => base64Url(bytesToBase64(crypto.getRandomValues(new Uint8Array(32))));

export const hashState = async (state: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(state));
  return base64Url(bytesToBase64(new Uint8Array(digest)));
};

const encryptionKey = async () => {
  let keyBytes: Uint8Array;
  try {
    keyBytes = base64ToBytes(requiredSecret('GMAIL_TOKEN_ENCRYPTION_KEY'));
  } catch {
    throw new Error('GMAIL_TOKEN_ENCRYPTION_KEY must be a valid base64 value.');
  }
  if (keyBytes.byteLength !== 32) throw new Error('GMAIL_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.');
  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
};

export const encryptRefreshToken = async (refreshToken: string) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await encryptionKey(),
    new TextEncoder().encode(refreshToken),
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
  };
};

export const decryptRefreshToken = async (ciphertext: string, iv: string) => {
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(iv) },
      await encryptionKey(),
      base64ToBytes(ciphertext),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error('The saved Gmail credential could not be decrypted. Reconnect Gmail.');
  }
};

export interface AuthenticatedContext {
  authUser: User;
  hrisUser: { id: string; email: string; full_name: string; status: string };
  userClient: SupabaseClient;
  adminClient: SupabaseClient;
}

export const authenticateRequest = async (request: Request): Promise<AuthenticatedContext> => {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) throw new GmailError('Authentication is required.', 401);

  const supabaseUrl = requiredSecret('SUPABASE_URL');
  const userClient = createClient(supabaseUrl, requiredSecret('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) throw new GmailError('Your HRIS session is no longer valid.', 401);

  const adminClient = createClient(supabaseUrl, requiredSecret('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: hrisUser, error: hrisError } = await adminClient
    .from('hris_users')
    .select('id,email,full_name,status')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();
  if (hrisError || !hrisUser || hrisUser.status !== 'Active') {
    throw new GmailError('An active HRIS employee account is required.', 403);
  }

  return { authUser: authData.user, hrisUser, userClient, adminClient };
};

export class GmailError extends Error {
  status: number;
  reconnect: boolean;

  constructor(message: string, status = 400, reconnect = false) {
    super(message);
    this.name = 'GmailError';
    this.status = status;
    this.reconnect = reconnect;
  }
}

const googleFailure = async (response: Response) => {
  const payload = await response.json().catch(() => ({}));
  const reason = payload?.error?.errors?.[0]?.reason || payload?.error;
  const sourceMessage = payload?.error?.message || payload?.error_description || '';
  if (reason === 'invalid_grant' || /invalid_grant|revoked|expired/i.test(sourceMessage)) {
    return new GmailError('Google access was revoked or expired. Reconnect Gmail and try again.', 401, true);
  }
  if (response.status === 403 && ['insufficientPermissions', 'forbidden'].includes(reason)) {
    return new GmailError('The connected Google account did not grant Gmail send permission. Reconnect Gmail.', 403, true);
  }
  if (reason === 'accessNotConfigured') {
    return new GmailError('Gmail API is not enabled for the configured Google Cloud project.', 503);
  }
  if (response.status === 429) return new GmailError('Gmail rate-limited this send. Wait briefly and retry.', 429);
  return new GmailError(sourceMessage || `Google Gmail returned HTTP ${response.status}.`, 502);
};

export const exchangeAuthorizationCode = async (code: string) => {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: requiredSecret('GMAIL_GOOGLE_CLIENT_ID'),
      client_secret: requiredSecret('GMAIL_GOOGLE_CLIENT_SECRET'),
      redirect_uri: requiredSecret('GMAIL_OAUTH_REDIRECT_URI'),
      grant_type: 'authorization_code',
    }),
  });
  if (!response.ok) throw await googleFailure(response);
  const payload = await response.json();
  if (!payload?.access_token || !payload?.refresh_token) {
    throw new GmailError('Google did not issue an offline Gmail credential. Reconnect and grant consent again.', 400, true);
  }
  const scopes = String(payload.scope || '').split(/\s+/).filter(Boolean);
  if (!hasExactGmailSendScope(scopes)) {
    throw new GmailError('Google returned unexpected permissions. This connection accepts Gmail send permission only.', 403, true);
  }
  return {
    accessToken: String(payload.access_token),
    refreshToken: String(payload.refresh_token),
    scopes,
    expiresAt: new Date(Date.now() + Math.max(0, Number(payload.expires_in || 3600) - 60) * 1000).toISOString(),
  };
};

export const refreshAccessToken = async (refreshToken: string) => {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: requiredSecret('GMAIL_GOOGLE_CLIENT_ID'),
      client_secret: requiredSecret('GMAIL_GOOGLE_CLIENT_SECRET'),
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!response.ok) throw await googleFailure(response);
  const payload = await response.json();
  if (!payload?.access_token) throw new GmailError('Google did not return a Gmail access token.', 502);
  if (payload.scope) {
    const scopes = String(payload.scope).split(/\s+/).filter(Boolean);
    if (!hasExactGmailSendScope(scopes)) {
      throw new GmailError('The Gmail send permission is missing or unexpected permissions were returned. Reconnect Gmail.', 403, true);
    }
  }
  return {
    accessToken: String(payload.access_token),
    expiresAt: new Date(Date.now() + Math.max(0, Number(payload.expires_in || 3600) - 60) * 1000).toISOString(),
  };
};

export interface GmailAttachment {
  filename: string;
  contentBase64: string;
  contentType?: string;
}

export interface GmailMessage {
  to: string;
  subject: string;
  message: string;
  html?: string;
  attachments?: GmailAttachment[];
  senderEmail: string;
  senderName?: string;
}

const validateAttachments = (attachments: GmailAttachment[]) => {
  if (attachments.length > 10) throw new GmailError('A maximum of 10 attachments is allowed.', 413);
  let decodedBytes = 0;
  for (const attachment of attachments) {
    const content = String(attachment.contentBase64 || '').replace(/\s/g, '');
    if (!content || content.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(content)) {
      throw new GmailError('An attachment is not valid base64 content.', 400);
    }
    const contentType = cleanHeader(attachment.contentType || 'application/octet-stream');
    if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(contentType)) {
      throw new GmailError('An attachment content type is invalid.', 400);
    }
    decodedBytes += Math.floor(content.length * 0.75);
  }
  if (decodedBytes > 18 * 1024 * 1024) throw new GmailError('Combined attachments must be 18 MB or smaller.', 413);
};

export const buildMimeMessage = (input: GmailMessage) => {
  const to = normalizeEmail(input.to);
  const senderEmail = normalizeEmail(input.senderEmail);
  const subject = cleanHeader(input.subject);
  const message = String(input.message || '').trim();
  const html = String(input.html || '').trim() || `<p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`;
  const attachments = input.attachments || [];
  if (!validEmail(to)) throw new GmailError('Enter one valid recipient email address.', 400);
  if (!validEmail(senderEmail)) throw new GmailError('The connected Gmail sender address is invalid. Reconnect Gmail.', 400, true);
  if (!subject || !message) throw new GmailError('Email subject and message are required.', 400);
  if (subject.length > 250 || message.length > 100_000 || html.length > 250_000) throw new GmailError('The email content is too large.', 413);
  validateAttachments(attachments);

  const mixedBoundary = `tng-mixed-${crypto.randomUUID()}`;
  const alternativeBoundary = `tng-alternative-${crypto.randomUUID()}`;
  const displayName = cleanHeader(input.senderName || '');
  const from = displayName ? `${encodeHeader(displayName)} <${senderEmail}>` : senderEmail;
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    '',
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
    '',
    `--${alternativeBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    message,
    `--${alternativeBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    html,
    `--${alternativeBoundary}--`,
  ];

  for (const attachment of attachments) {
    const filename = cleanHeader(attachment.filename || 'attachment').slice(0, 180) || 'attachment';
    const asciiName = filename.replace(/[^a-zA-Z0-9._ -]/g, '_');
    const contentType = cleanHeader(attachment.contentType || 'application/octet-stream');
    lines.push(
      `--${mixedBoundary}`,
      `Content-Type: ${contentType}; name="${asciiName}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      '',
      wrapBase64(String(attachment.contentBase64).replace(/\s/g, '')),
    );
  }
  lines.push(`--${mixedBoundary}--`, '');
  return base64Url(utf8ToBase64(lines.join('\r\n')));
};

export const sendGmailMessage = async (accessToken: string, input: GmailMessage, userId = 'me') => {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(userId)}/messages/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: buildMimeMessage(input) }),
  });
  if (!response.ok) throw await googleFailure(response);
  const payload = await response.json();
  return { messageId: String(payload.id || ''), threadId: String(payload.threadId || '') };
};

export interface DeliveryAuditInput {
  authUserId: string;
  hrisUserId: string;
  userEmail: string;
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  documentType: string;
  documentId?: string;
  attemptedAt: string;
  sentAt?: string;
  messageId?: string;
  threadId?: string;
  status: 'sent' | 'failed';
  error?: string;
  attachmentNames?: string[];
}

export const recordDeliveryAudit = async (adminClient: SupabaseClient, input: DeliveryAuditInput) => {
  const safeError = input.error?.slice(0, 1000) || null;
  const { error: deliveryError } = await adminClient.from('hris_email_delivery_log').insert({
    auth_user_id: input.authUserId,
    hris_user_id: input.hrisUserId,
    sender_email: normalizeEmail(input.senderEmail),
    recipient_email: normalizeEmail(input.recipientEmail),
    subject: cleanHeader(input.subject),
    document_type: input.documentType,
    document_id: input.documentId || null,
    attempted_at: input.attemptedAt,
    sent_at: input.sentAt || null,
    gmail_message_id: input.messageId || null,
    gmail_thread_id: input.threadId || null,
    delivery_status: input.status,
    error_message: safeError,
    attachment_names: input.attachmentNames || [],
  });
  const detail = input.status === 'sent'
    ? `Sent ${input.documentType} email from ${normalizeEmail(input.senderEmail)} to ${normalizeEmail(input.recipientEmail)} through Gmail. Gmail message ID: ${input.messageId || 'unavailable'}.`
    : `Failed ${input.documentType} email from ${normalizeEmail(input.senderEmail)} to ${normalizeEmail(input.recipientEmail)} through Gmail. ${safeError || 'Unknown Gmail error.'}`;
  const { error: auditError } = await adminClient.from('audit_logs').insert({
    user_id: input.hrisUserId || input.authUserId,
    user_email: normalizeEmail(input.userEmail),
    action: input.status === 'sent' ? 'EMAIL_SENT' : 'EMAIL_FAILED',
    entity: 'GmailDelivery',
    entity_id: input.documentId || null,
    details: detail,
  });
  if (deliveryError || auditError) {
    console.error('Gmail delivery audit write failed', {
      delivery: deliveryError?.message || null,
      audit: auditError?.message || null,
    });
    return false;
  }
  return true;
};

export const safeConnection = (connection: Record<string, unknown> | null) => ({
  connected: connection?.connection_status === 'connected',
  status: String(connection?.connection_status || 'not_connected'),
  email: connection?.google_email ? String(connection.google_email) : null,
  scopes: Array.isArray(connection?.granted_scopes) ? connection.granted_scopes : [],
  expiry: connection?.token_expiry ? String(connection.token_expiry) : null,
  connectedAt: connection?.connected_at ? String(connection.connected_at) : null,
  lastVerifiedAt: connection?.last_verified_at ? String(connection.last_verified_at) : null,
  lastError: connection?.last_error ? String(connection.last_error) : null,
});
