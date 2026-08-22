import nodemailer from 'nodemailer';
import { authorizeRecruitmentRequest, sendApiError } from './recruitmentAuth';

const getEnv = (key: string) => {
  const value = process.env[key];
  return value && value.trim().length > 0 ? value.trim() : null;
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    await authorizeRecruitmentRequest(req);
    const { to, subject, message, html } = req.body || {};
    if (!to || !subject || !message) {
      throw Object.assign(new Error('Recipient, subject, and message are required.'), { statusCode: 400 });
    }
    const host = getEnv('SMTP_HOST');
    const portRaw = getEnv('SMTP_PORT');
    const user = getEnv('SMTP_USER');
    const pass = getEnv('SMTP_PASS');
    const fromEmail = getEnv('SMTP_FROM_EMAIL');
    const fromName = getEnv('SMTP_FROM_NAME') || 'TNG Recruitment Team';
    if (!host || !portRaw || !user || !pass || !fromEmail) throw new Error('SMTP is not configured.');
    const port = Number(portRaw);
    if (!Number.isFinite(port)) throw new Error('SMTP port is invalid.');
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      requireTLS: port === 587,
    });
    const info = await transporter.sendMail({
      from: `${fromName} <${fromEmail}>`,
      to,
      subject,
      text: message,
      html,
    });
    res.status(200).json({ ok: true, messageId: info.messageId });
  } catch (error: any) {
    console.error('Recruitment email failed', error);
    sendApiError(res, error, 'Failed to send recruitment email.');
  }
}
