import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  GmailError,
  encryptRefreshToken,
  exchangeAuthorizationCode,
  hashState,
  normalizeEmail,
  recordDeliveryAudit,
  requiredSecret,
  sendGmailMessage,
} from '../_shared/gmail.ts';

const redirectToIntegrations = (status: 'connected' | 'error', message?: string) => {
  const appUrl = requiredSecret('HRIS_APP_URL').replace(/\/+$/, '');
  const destination = new URL('/integrations', appUrl);
  destination.searchParams.set('gmail', status);
  if (message) destination.searchParams.set('message', message.slice(0, 240));
  return new Response(null, {
    status: 302,
    headers: {
      Location: destination.toString(),
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
};

Deno.serve(async (request: Request) => {
  if (request.method !== 'GET') return new Response('Method not allowed.', { status: 405 });

  let stateRecord: { id: string; user_id: string; expected_email: string } | null = null;
  let hrisUser: { id: string; email: string; status: string } | null = null;
  let adminClient: ReturnType<typeof createClient> | null = null;
  let unsavedRefreshToken: string | null = null;
  try {
    const url = new URL(request.url);
    const rawState = url.searchParams.get('state') || '';
    if (!rawState || rawState.length > 512) throw new GmailError('This Google connection link is invalid or has expired.', 400);

    adminClient = createClient(requiredSecret('SUPABASE_URL'), requiredSecret('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const usedAt = new Date().toISOString();
    const { data, error: stateError } = await adminClient
      .from('gmail_oauth_states')
      .update({ used_at: usedAt })
      .eq('state_hash', await hashState(rawState))
      .is('used_at', null)
      .gt('expires_at', usedAt)
      .select('id,user_id,expected_email')
      .maybeSingle();
    if (stateError || !data) throw new GmailError('This Google connection link is invalid, expired, or already used.', 400);
    stateRecord = data;

    const { data: activeHrisUser, error: hrisUserError } = await adminClient
      .from('hris_users')
      .select('id,email,status')
      .eq('auth_user_id', stateRecord.user_id)
      .maybeSingle();
    if (hrisUserError || !activeHrisUser || activeHrisUser.status !== 'Active') {
      throw new GmailError('Your active HRIS account could not be verified. Sign in again before connecting Gmail.', 403);
    }
    hrisUser = activeHrisUser;

    const googleDenied = url.searchParams.get('error');
    if (googleDenied) {
      const message = googleDenied === 'access_denied'
        ? 'Google connection was cancelled. Gmail remains unchanged.'
        : 'Google did not authorize Gmail sending. Please reconnect.';
      await adminClient.from('gmail_oauth_states').update({ callback_error: message }).eq('id', stateRecord.id);
      return redirectToIntegrations('error', message);
    }

    const code = url.searchParams.get('code') || '';
    if (!code) throw new GmailError('Google did not return an authorization code. Please reconnect.', 400);
    const tokens = await exchangeAuthorizationCode(code);
    unsavedRefreshToken = tokens.refreshToken;
    const expectedEmail = normalizeEmail(stateRecord.expected_email);

    // gmail.send deliberately cannot read a Google profile. Address ownership is
    // verified without adding an identity or mailbox-read scope by sending a
    // one-time message through the explicit Gmail user address. Google accepts
    // this userId only when it belongs to the authorized account.
    const verificationSubject = 'TNG HRIS Gmail connection verified';
    const verification = await sendGmailMessage(tokens.accessToken, {
      senderEmail: expectedEmail,
      to: expectedEmail,
      subject: verificationSubject,
      message: 'Your Google account was connected to TNG HRIS with Gmail send-only permission. TNG HRIS cannot read or modify your mailbox.',
    }, expectedEmail);

    const encrypted = await encryptRefreshToken(tokens.refreshToken);
    const connectedAt = new Date().toISOString();
    const { error: saveError } = await adminClient.from('gmail_connections').upsert({
      user_id: stateRecord.user_id,
      google_email: expectedEmail,
      refresh_token_ciphertext: encrypted.ciphertext,
      refresh_token_iv: encrypted.iv,
      granted_scopes: tokens.scopes,
      token_expiry: tokens.expiresAt,
      connection_status: 'connected',
      last_error: null,
      connected_at: connectedAt,
      disconnected_at: null,
      last_verified_at: connectedAt,
      updated_at: connectedAt,
      encryption_version: 1,
    }, { onConflict: 'user_id' });
    if (saveError) throw new GmailError('Gmail was authorized, but the protected connection record could not be saved.', 500);
    unsavedRefreshToken = null;

    await recordDeliveryAudit(adminClient, {
      authUserId: stateRecord.user_id,
      hrisUserId: hrisUser.id,
      userEmail: hrisUser.email,
      senderEmail: expectedEmail,
      recipientEmail: expectedEmail,
      subject: verificationSubject,
      documentType: 'gmail-connection-verification',
      attemptedAt: connectedAt,
      sentAt: connectedAt,
      messageId: verification.messageId,
      threadId: verification.threadId,
      status: 'sent',
    });
    await adminClient.from('audit_logs').insert({
      user_id: hrisUser.id,
      user_email: hrisUser.email,
      action: 'GMAIL_CONNECTED',
      entity: 'GmailConnection',
      entity_id: hrisUser.id,
      details: `Connected Gmail sender ${expectedEmail} with gmail.send scope only.`,
    });
    return redirectToIntegrations('connected', `Connected as ${expectedEmail}.`);
  } catch (reason) {
    const error = reason instanceof GmailError ? reason : new GmailError('Unable to complete the Gmail connection.', 500);
    console.error('Gmail OAuth callback failed', { message: error.message, status: error.status });
    if (unsavedRefreshToken) {
      await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: unsavedRefreshToken }),
      }).catch(() => undefined);
    }
    if (adminClient && stateRecord) {
      await adminClient.from('gmail_oauth_states').update({ callback_error: error.message.slice(0, 1000) }).eq('id', stateRecord.id);
    }
    return redirectToIntegrations('error', error.message);
  }
});
