import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const getEnv = (...keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key];
    if (value?.trim()) return value.trim();
  }
  return null;
};

const sendError = (res: any, status: number, error: string) => {
  res.status(status).json({ error });
};

const sendRejectionEmail = async (to: string, subject: string, message: string) => {
  const host = getEnv('SMTP_HOST');
  const portRaw = getEnv('SMTP_PORT');
  const user = getEnv('SMTP_USER');
  const pass = getEnv('SMTP_PASS');
  const fromEmail = getEnv('SMTP_FROM_EMAIL');
  const fromName = getEnv('SMTP_FROM_NAME') || 'TNG Recruitment Team';
  const port = Number(portRaw);

  if (!host || !portRaw || !user || !pass || !fromEmail || !Number.isFinite(port)) {
    throw new Error('SMTP is not configured');
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    requireTLS: port === 587,
  });

  return transporter.sendMail({
    from: `${fromName} <${fromEmail}>`,
    to,
    subject,
    text: message,
  });
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    sendError(res, 405, 'Method not allowed.');
    return;
  }

  const authorization = req.headers?.authorization || '';
  if (!authorization.startsWith('Bearer ')) {
    sendError(res, 401, 'Authentication is required.');
    return;
  }

  const supabaseUrl = getEnv('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const supabaseKey = getEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseKey) {
    sendError(res, 500, 'The HRIS server integration is not configured.');
    return;
  }

  const token = authorization.slice('Bearer '.length);
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) {
    sendError(res, 401, 'Your session is no longer valid.');
    return;
  }

  const { data: allowed, error: permissionError } = await supabase.rpc('is_hr_or_admin');
  if (permissionError || !allowed) {
    sendError(res, 403, 'You do not have permission to reject applicants.');
    return;
  }

  const applicationId = String(req.body?.applicationId || '').trim();
  const subject = String(req.body?.subject || '').trim();
  const message = String(req.body?.message || '').trim();
  const rejectionReason = String(req.body?.rejectionReason || '').trim() || 'Current role fit';
  if (!applicationId || !subject || !message) {
    sendError(res, 400, 'Application, subject, and email message are required.');
    return;
  }
  if (subject.length > 200 || message.length > 10000 || rejectionReason.length > 1000) {
    sendError(res, 400, 'The rejection email or internal reason is too long.');
    return;
  }

  const [applicationResult, profileResult] = await Promise.all([
    supabase.from('job_applications')
      .select('id,candidate_id,stage,rejection_email_sent_at')
      .eq('id', applicationId)
      .single(),
    supabase.from('hris_users')
      .select('id,email,role')
      .eq('auth_user_id', authData.user.id)
      .single(),
  ]);

  if (applicationResult.error || !applicationResult.data) {
    sendError(res, 404, 'The selected application could not be found.');
    return;
  }
  if (profileResult.error || !profileResult.data) {
    sendError(res, 403, 'Your HRIS user profile could not be verified.');
    return;
  }

  const application = applicationResult.data;
  const profile = profileResult.data;
  if (application.stage === 'Rejected') {
    sendError(res, 409, application.rejection_email_sent_at
      ? 'This applicant has already been rejected and emailed.'
      : 'This application is already marked Rejected.');
    return;
  }
  if (application.stage === 'Hired' || application.stage === 'Withdrawn') {
    sendError(res, 409, `A ${application.stage.toLowerCase()} application cannot be rejected from this action.`);
    return;
  }

  const { data: candidate, error: candidateError } = await supabase
    .from('job_candidates')
    .select('id,first_name,last_name,email')
    .eq('id', application.candidate_id)
    .single();
  if (candidateError || !candidate?.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate.email)) {
    sendError(res, 400, 'The applicant does not have a valid email address.');
    return;
  }

  try {
    await sendRejectionEmail(candidate.email, subject, message);
  } catch (error: any) {
    console.error('Rejection email failed', error);
    sendError(res, 502, 'Email failed to send. The applicant status was not changed.');
    return;
  }

  const sentAt = new Date().toISOString();
  const { data: updatedApplication, error: updateError } = await supabase
    .from('job_applications')
    .update({
      stage: 'Rejected',
      rejected_at: sentAt,
      rejected_by: profile.id,
      rejection_reason: rejectionReason,
      rejection_email_sent_at: sentAt,
      rejection_email_subject: subject,
      updated_at: sentAt,
    })
    .eq('id', applicationId)
    .select('id,stage,rejected_at,rejected_by,rejection_reason,rejection_email_sent_at,rejection_email_subject,updated_at')
    .single();

  if (updateError || !updatedApplication) {
    console.error('Rejection status update failed after email delivery', updateError);
    sendError(res, 500, 'Email was sent, but the application status failed to update. Please contact IT before retrying.');
    return;
  }

  const applicantName = [candidate.first_name, candidate.last_name].filter(Boolean).join(' ') || candidate.email;
  const { error: auditError } = await supabase.from('audit_logs').insert({
    user_id: profile.id,
    user_email: profile.email || authData.user.email,
    action: 'REJECT',
    entity: 'Application',
    entity_id: applicationId,
    details: `Rejected ${applicantName}; rejection email sent to ${candidate.email}`,
  });

  res.status(200).json({
    ok: true,
    application: updatedApplication,
    warning: auditError ? 'Applicant rejected and emailed, but the activity log could not be saved.' : undefined,
  });
}
