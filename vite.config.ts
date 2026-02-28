import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import nodemailer from 'nodemailer';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    Object.assign(process.env, env);

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
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        {
          name: 'dev-email-endpoint',
          configureServer(server) {
            server.middlewares.use('/api/send-email', async (req, res) => {
              if (req.method !== 'POST') {
                res.statusCode = 405;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Method not allowed' }));
                return;
              }

              let body = '';
              req.on('data', (chunk) => {
                body += chunk;
              });
              req.on('end', async () => {
                try {
                  const payload = body ? JSON.parse(body) : {};
                  await sendEmail(payload);
                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ ok: true }));
                } catch (error: any) {
                  const message = error?.message || 'Failed to send email';
                  res.statusCode = message === 'Missing required fields' ? 400 : 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: message }));
                }
              });
            });
          },
        },
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
