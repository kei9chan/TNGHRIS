/**
 * Fail-closed compatibility route for pre-Gmail-connection clients.
 *
 * Current HRIS screens call the authenticated send-hris-email Edge Function,
 * which checks the caller's document permission and record-level RLS before
 * using that caller's encrypted Gmail connection. Keeping this route alive as
 * an SMTP sender would let an old browser bundle silently use another account.
 */
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  res.status(410).json({
    error: 'This email endpoint has been retired. Connect Gmail and retry from the current HRIS screen.',
    reconnect: true,
  });
}
