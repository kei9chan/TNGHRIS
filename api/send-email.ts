import nodemailer from 'nodemailer';

const getEnv = (key: string) => {
  const value = process.env[key];
  return value && value.trim().length > 0 ? value.trim() : null;
};

const sendEmail = async ({
  to,
  subject,
  message,
  html,
  attachments,
}: {
  to: string;
  subject: string;
  message: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    contentBase64: string;
    contentType?: string;
  }>;
}) => {
  const host = getEnv('SMTP_HOST');
  const portRaw = getEnv('SMTP_PORT');
  const user = getEnv('SMTP_USER');
  const pass = getEnv('SMTP_PASS');
  const fromEmail = getEnv('SMTP_FROM_EMAIL');
  const fromName = getEnv('SMTP_FROM_NAME') || 'HR Team';

  if (!host || !portRaw || !user || !pass || !fromEmail) {
    throw new Error('SMTP is not configured');
  }

  const port = Number(portRaw);
  if (!Number.isFinite(port)) {
    throw new Error('SMTP port is invalid');
  }

  if (!to || !subject || !message) {
    throw new Error('Missing required fields');
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
    requireTLS: port === 587,
  });

  const resolvedAttachments = attachments?.map((item) => ({
    filename: item.filename,
    content: Buffer.from(item.contentBase64, 'base64'),
    contentType: item.contentType,
  }));

  return transporter.sendMail({
    from: `${fromName} <${fromEmail}>`,
    to,
    subject,
    text: message,
    html,
    attachments: resolvedAttachments,
  });
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { to, subject, message, html, attachments } = req.body || {};

  try {
    await sendEmail({ to, subject, message, html, attachments });
    res.status(200).json({ ok: true });
  } catch (error: any) {
    const status = error?.message === 'Missing required fields' ? 400 : 500;
    res.status(status).json({ error: error?.message || 'Failed to send email' });
  }
}
