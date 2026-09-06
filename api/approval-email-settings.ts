import { configuration, configured, deliver, emailPayload, manilaTime, requireAdmin, rpc, serviceClient, validEmail } from '../server/approvalEmail.js';
export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { client, admin } = await requireAdmin(req);
    if (req.method === 'GET') return res.status(200).json({ ...admin, ...configuration() });
    if (req.body?.action === 'enabled' && typeof req.body.enabled === 'boolean') {
      if (req.body.enabled && !configured()) return res.status(409).json({ error: 'Configure the server email settings before enabling reminders' });
      await rpc(client, 'set_approval_email_enabled', { p_enabled: req.body.enabled });
      return res.status(200).json({ ok: true });
    }
    if (req.body?.action !== 'test' || !/^[0-9a-f-]{36}$/i.test(req.body.requestId || '')) return res.status(400).json({ error: 'Invalid action' });
    if (!configured() || !validEmail(admin.email)) return res.status(409).json({ error: 'Complete server configuration and your active profile email before sending a test' });
    const service = serviceClient();
    const claim = await rpc(service, 'claim_approval_email', { p_key: `approval-test-${admin.id}-${req.body.requestId}`, p_user: admin.id, p_date: manilaTime().date, p_type: 'approval-test', p_email: admin.email, p_count: 0, p_payload: emailPayload({ ...admin, groups: [] }, true), p_run: null });
    if (!claim) return res.status(200).json({ ok: true, message: 'This test is already accepted or being processed' });
    const ok = await deliver(service, claim);
    return res.status(ok ? 200 : 502).json(ok ? { ok: true, message: 'Test email accepted by Resend for your account' } : { error: 'Resend could not confirm acceptance. Check run details and sending-domain configuration' });
  } catch (e: any) { return res.status(e.status || 503).json({ error: e.status ? e.message : 'Notification request failed. Check configuration or wait one minute before another test.' }); }
}
