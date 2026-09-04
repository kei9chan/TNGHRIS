import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {
  GmailError,
  authenticateRequest,
  cleanHeader,
  corsHeaders,
  decryptRefreshToken,
  hasExactGmailSendScope,
  json,
  normalizeEmail,
  recordDeliveryAudit,
  refreshAccessToken,
  sendGmailMessage,
  validEmail,
  type GmailAttachment,
} from '../_shared/gmail.ts';

interface AuthorizationRule {
  table: string;
  permissions: Array<[string, string]>;
  select: string;
  validate?: (record: Record<string, unknown>) => void;
}

const requireStatus = (allowed: string[], message: string) => (record: Record<string, unknown>) => {
  if (!allowed.includes(String(record.status || ''))) throw new GmailError(message, 409);
};

const authorizationRules: Record<string, AuthorizationRule> = {
  'job-offer': {
    table: 'job_offers',
    permissions: [['Offers', 'manage']],
    select: 'id,approval_status,status',
    validate: record => {
      if (record.approval_status !== 'Approved') {
        throw new GmailError('This offer must complete the existing approval workflow before it can be sent.', 409);
      }
    },
  },
  'offer-welcome': {
    table: 'job_offers',
    permissions: [['Offers', 'manage']],
    select: 'id,status',
    validate: requireStatus(['Signed', 'Accepted and Signed'], 'Welcome email is available only after the candidate signs the offer.'),
  },
  'candidate': { table: 'job_applications', permissions: [['Applicants', 'manage']], select: 'id,stage' },
  'candidate-rejection': { table: 'job_applications', permissions: [['Applicants', 'manage']], select: 'id,stage' },
  'interview': { table: 'job_interviews', permissions: [['Interviews', 'manage']], select: 'id,status' },
  'coe': {
    table: 'coe_requests',
    permissions: [['COE', 'edit'], ['COE', 'manage']],
    select: 'id,status',
    validate: requireStatus(['Approved'], 'The COE must be approved before it can be emailed.'),
  },
  'nte': {
    table: 'ntes',
    permissions: [['Feedback', 'edit'], ['Feedback', 'manage'], ['NTEs', 'manage']],
    select: 'id,status',
    validate: requireStatus(['Issued'], 'The NTE must be approved and issued before it can be emailed.'),
  },
  'contract': { table: 'envelopes', permissions: [['Employees', 'edit'], ['Employees', 'manage']], select: 'id,status' },
  'award': {
    table: 'employee_awards',
    permissions: [['Evaluation', 'manage']],
    select: 'id,status',
    validate: requireStatus(['Approved', 'Issued'], 'The award must be approved before its certificate can be emailed.'),
  },
  'resignation-guidance': {
    table: 'hris_users',
    permissions: [['Employees', 'edit'], ['Employees', 'manage']],
    select: 'id,status',
    validate: requireStatus(['Active'], 'Resignation guidance can be emailed only to an active HRIS employee.'),
  },
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  let attemptedAt = new Date().toISOString();
  try {
    const context = await authenticateRequest(request);
    const body = await request.json().catch(() => null);
    if (!body) throw new GmailError('Invalid request body.', 400);

    const documentType = cleanHeader(body.documentType).toLowerCase();
    const documentId = cleanHeader(body.documentId);
    const rule = authorizationRules[documentType];
    if (!rule) throw new GmailError('This HRIS document type is not approved for Gmail delivery.', 400);
    if (!uuidPattern.test(documentId)) throw new GmailError('A valid HRIS document ID is required.', 400);

    let permissionGranted = false;
    for (const [resource, action] of rule.permissions) {
      const { data, error } = await context.userClient.rpc('has_feature_permission', {
        p_resource: resource,
        p_action: action,
      });
      if (!error && data === true) {
        permissionGranted = true;
        break;
      }
    }
    if (!permissionGranted) {
      await context.adminClient.from('audit_logs').insert({
        user_id: context.hrisUser.id,
        user_email: context.hrisUser.email,
        action: 'EMAIL_SEND_DENIED',
        entity: 'GmailDelivery',
        entity_id: documentId,
        details: `Denied unauthorized ${documentType} Gmail send attempt.`,
      });
      throw new GmailError('You do not have permission to send this HRIS document.', 403);
    }

    // This read uses the caller's JWT and the table's existing RLS. A service
    // credential is never used to expand which business record can be sent.
    const { data: record, error: recordError } = await context.userClient
      .from(rule.table)
      .select(rule.select)
      .eq('id', documentId)
      .maybeSingle();
    if (recordError || !record) throw new GmailError('This HRIS document is unavailable or outside your authorized record scope.', 403);
    rule.validate?.(record);

    const to = normalizeEmail(body.to);
    const subject = cleanHeader(body.subject);
    const message = String(body.message || '').trim();
    const html = String(body.html || '').trim();
    if (body.attachments !== undefined && !Array.isArray(body.attachments)) {
      throw new GmailError('Attachments must be provided as a list.', 400);
    }
    const attachments: GmailAttachment[] = (body.attachments || []).map((attachment: unknown) => {
      if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)) {
        throw new GmailError('Each attachment must include a filename and base64 content.', 400);
      }
      const item = attachment as Record<string, unknown>;
      return {
        filename: cleanHeader(item.filename),
        contentBase64: String(item.contentBase64 || ''),
        contentType: cleanHeader(item.contentType || 'application/octet-stream'),
      };
    });
    if (!validEmail(to)) throw new GmailError('Enter one valid recipient email address.', 400);

    const { data: connection, error: connectionError } = await context.adminClient
      .from('gmail_connections')
      .select('google_email,refresh_token_ciphertext,refresh_token_iv,granted_scopes,connection_status')
      .eq('user_id', context.authUser.id)
      .maybeSingle();
    if (connectionError) throw new GmailError('Unable to load your protected Gmail connection.', 500);
    if (!connection || connection.connection_status !== 'connected' || !connection.refresh_token_ciphertext || !connection.refresh_token_iv) {
      throw new GmailError('Connect Gmail to send this HRIS email.', 409, true);
    }
    if (!hasExactGmailSendScope(connection.granted_scopes)) {
      throw new GmailError('The Gmail send permission is missing. Reconnect Gmail.', 403, true);
    }

    const senderEmail = normalizeEmail(connection.google_email);
    attemptedAt = new Date().toISOString();
    try {
      const refreshToken = await decryptRefreshToken(connection.refresh_token_ciphertext, connection.refresh_token_iv);
      const token = await refreshAccessToken(refreshToken);
      const sent = await sendGmailMessage(token.accessToken, {
        senderEmail,
        senderName: context.hrisUser.full_name,
        to,
        subject,
        message,
        html,
        attachments,
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
        senderEmail,
        recipientEmail: to,
        subject,
        documentType,
        documentId,
        attemptedAt,
        sentAt,
        messageId: sent.messageId,
        threadId: sent.threadId,
        status: 'sent',
        attachmentNames: attachments.map(attachment => attachment.filename),
      });
      return json({
        ok: true,
        provider: 'google-gmail',
        senderEmail,
        messageId: sent.messageId,
        threadId: sent.threadId,
        auditRecorded,
      });
    } catch (reason) {
      const failure = reason instanceof GmailError ? reason : new GmailError('Unable to send this HRIS email through Gmail.', 500);
      await context.adminClient.from('gmail_connections').update({
        connection_status: failure.reconnect ? 'error' : 'connected',
        last_error: failure.message,
        updated_at: new Date().toISOString(),
      }).eq('user_id', context.authUser.id);
      await recordDeliveryAudit(context.adminClient, {
        authUserId: context.authUser.id,
        hrisUserId: context.hrisUser.id,
        userEmail: context.hrisUser.email,
        senderEmail,
        recipientEmail: to,
        subject,
        documentType,
        documentId,
        attemptedAt,
        status: 'failed',
        error: failure.message,
        attachmentNames: attachments.map(attachment => attachment.filename),
      });
      throw failure;
    }
  } catch (reason) {
    const error = reason instanceof GmailError ? reason : new GmailError(reason instanceof Error ? reason.message : 'HRIS Gmail delivery failed.', 500);
    console.error('HRIS Gmail delivery failed', { message: error.message, status: error.status, attemptedAt });
    return json({ error: error.message, reconnect: error.reconnect }, error.status);
  }
});
