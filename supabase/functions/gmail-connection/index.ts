import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {
  GMAIL_SEND_SCOPE,
  GmailError,
  authenticateRequest,
  cleanHeader,
  corsHeaders,
  decryptRefreshToken,
  hasExactGmailSendScope,
  hashState,
  json,
  normalizeEmail,
  randomState,
  recordDeliveryAudit,
  refreshAccessToken,
  requiredSecret,
  safeConnection,
  sendGmailMessage,
  validEmail,
} from '../_shared/gmail.ts';

const connectionColumns = 'google_email,granted_scopes,token_expiry,connection_status,last_error,connected_at,last_verified_at';

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const context = await authenticateRequest(request);
    const body = await request.json().catch(() => ({}));
    const action = cleanHeader(body?.action || 'status').toLowerCase();

    if (action === 'status') {
      const { data, error } = await context.adminClient
        .from('gmail_connections')
        .select(connectionColumns)
        .eq('user_id', context.authUser.id)
        .maybeSingle();
      if (error) throw new GmailError('Unable to load the Gmail connection status.', 500);
      return json(safeConnection(data));
    }

    if (action === 'start') {
      const expectedEmail = normalizeEmail(body?.expectedEmail || context.hrisUser.email);
      if (!validEmail(expectedEmail)) throw new GmailError('Enter the Gmail or Google Workspace address you want to connect.', 400);

      const now = new Date().toISOString();
      await context.adminClient
        .from('gmail_oauth_states')
        .update({ used_at: now, callback_error: 'Superseded by a newer connection attempt.' })
        .eq('user_id', context.authUser.id)
        .is('used_at', null);

      const state = randomState();
      const { error: stateError } = await context.adminClient.from('gmail_oauth_states').insert({
        state_hash: await hashState(state),
        user_id: context.authUser.id,
        expected_email: expectedEmail,
        return_path: '/integrations',
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
      if (stateError) throw new GmailError('Unable to start the secure Google connection. Please retry.', 500);

      const parameters = new URLSearchParams({
        client_id: requiredSecret('GMAIL_GOOGLE_CLIENT_ID'),
        redirect_uri: requiredSecret('GMAIL_OAUTH_REDIRECT_URI'),
        response_type: 'code',
        scope: GMAIL_SEND_SCOPE,
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'false',
        state,
        login_hint: expectedEmail,
      });
      return json({ authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${parameters.toString()}` });
    }

    if (action === 'disconnect') {
      const { data: connection, error } = await context.adminClient
        .from('gmail_connections')
        .select('google_email,refresh_token_ciphertext,refresh_token_iv,connection_status')
        .eq('user_id', context.authUser.id)
        .maybeSingle();
      if (error) throw new GmailError('Unable to load the Gmail connection.', 500);
      if (!connection) return json(safeConnection(null));

      let revokeWarning: string | null = null;
      if (connection.refresh_token_ciphertext && connection.refresh_token_iv) {
        try {
          const refreshToken = await decryptRefreshToken(connection.refresh_token_ciphertext, connection.refresh_token_iv);
          const revokeResponse = await fetch('https://oauth2.googleapis.com/revoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token: refreshToken }),
          });
          if (!revokeResponse.ok) revokeWarning = 'The local connection was removed, but Google did not confirm token revocation.';
        } catch {
          revokeWarning = 'The local connection was removed. Revoke TNG HRIS from your Google Account if it is still listed.';
        }
      }

      const disconnectedAt = new Date().toISOString();
      const { data: updated, error: updateError } = await context.adminClient
        .from('gmail_connections')
        .update({
          refresh_token_ciphertext: null,
          refresh_token_iv: null,
          token_expiry: null,
          connection_status: 'revoked',
          disconnected_at: disconnectedAt,
          updated_at: disconnectedAt,
          last_error: revokeWarning,
        })
        .eq('user_id', context.authUser.id)
        .select(connectionColumns)
        .single();
      if (updateError) throw new GmailError('Unable to disconnect Gmail safely.', 500);

      await context.adminClient.from('audit_logs').insert({
        user_id: context.hrisUser.id,
        user_email: context.hrisUser.email,
        action: 'GMAIL_DISCONNECTED',
        entity: 'GmailConnection',
        entity_id: context.hrisUser.id,
        details: `Disconnected Gmail sender ${normalizeEmail(connection.google_email)}.${revokeWarning ? ` ${revokeWarning}` : ''}`,
      });
      return json({ ...safeConnection(updated), warning: revokeWarning });
    }

    if (action === 'test') {
      const { data: connection, error } = await context.adminClient
        .from('gmail_connections')
        .select('google_email,refresh_token_ciphertext,refresh_token_iv,granted_scopes,connection_status')
        .eq('user_id', context.authUser.id)
        .maybeSingle();
      if (error) throw new GmailError('Unable to load the Gmail connection.', 500);
      if (!connection || connection.connection_status !== 'connected' || !connection.refresh_token_ciphertext || !connection.refresh_token_iv) {
        throw new GmailError('Connect Gmail before sending a test email.', 409, true);
      }
      if (!hasExactGmailSendScope(connection.granted_scopes)) {
        throw new GmailError('The Gmail send permission is missing. Reconnect Gmail.', 403, true);
      }

      const attemptedAt = new Date().toISOString();
      const recipient = normalizeEmail(connection.google_email);
      try {
        const refreshToken = await decryptRefreshToken(connection.refresh_token_ciphertext, connection.refresh_token_iv);
        const token = await refreshAccessToken(refreshToken);
        const sent = await sendGmailMessage(token.accessToken, {
          senderEmail: recipient,
          senderName: context.hrisUser.full_name,
          to: recipient,
          subject: 'TNG HRIS Gmail connection test',
          message: 'Your Gmail account is connected to TNG HRIS for sending authorized HRIS emails. No mailbox read or modify permission was requested.',
        });
        const sentAt = new Date().toISOString();
        await context.adminClient.from('gmail_connections').update({
          token_expiry: token.expiresAt,
          connection_status: 'connected',
          last_error: null,
          last_verified_at: sentAt,
          updated_at: sentAt,
        }).eq('user_id', context.authUser.id);
        const auditRecorded = await recordDeliveryAudit(context.adminClient, {
          authUserId: context.authUser.id,
          hrisUserId: context.hrisUser.id,
          userEmail: context.hrisUser.email,
          senderEmail: recipient,
          recipientEmail: recipient,
          subject: 'TNG HRIS Gmail connection test',
          documentType: 'gmail-test',
          attemptedAt,
          sentAt,
          messageId: sent.messageId,
          threadId: sent.threadId,
          status: 'sent',
        });
        return json({ ok: true, provider: 'google-gmail', senderEmail: recipient, ...sent, auditRecorded });
      } catch (reason) {
        const failure = reason instanceof GmailError ? reason : new GmailError('Unable to send the Gmail test email.', 500);
        await context.adminClient.from('gmail_connections').update({
          connection_status: failure.reconnect ? 'error' : 'connected',
          last_error: failure.message,
          updated_at: new Date().toISOString(),
        }).eq('user_id', context.authUser.id);
        await recordDeliveryAudit(context.adminClient, {
          authUserId: context.authUser.id,
          hrisUserId: context.hrisUser.id,
          userEmail: context.hrisUser.email,
          senderEmail: recipient,
          recipientEmail: recipient,
          subject: 'TNG HRIS Gmail connection test',
          documentType: 'gmail-test',
          attemptedAt,
          status: 'failed',
          error: failure.message,
        });
        throw failure;
      }
    }

    throw new GmailError('Unsupported Gmail connection action.', 400);
  } catch (reason) {
    const error = reason instanceof GmailError ? reason : new GmailError(reason instanceof Error ? reason.message : 'Gmail integration failed.', 500);
    console.error('Gmail connection action failed', { message: error.message, status: error.status });
    return json({ error: error.message, reconnect: error.reconnect }, error.status);
  }
});
