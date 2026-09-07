import { allRows, reportProfiles } from '../server/approvalEmailReports.js';
import { configuration, configured, deliver, emailPayload, manilaTime, requireAdmin, rpc, serviceClient, validEmail } from '../server/approvalEmail.js';
export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { client, admin } = await requireAdmin(req);
    if (req.method === 'GET') {
      if (!configuration().databaseConfigured) return res.status(200).json({ ...admin, ...configuration(), runs: [] });
      const service = serviceClient();
      const runId = req.query?.run;
      if (runId !== undefined) {
        if (typeof runId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId)) return res.status(400).json({ error: 'Invalid run' });
        const run = await service.from('approval_email_runs').select('id,scheduled_date,started_at,finished_at,status,sent,failed,skipped,error_summary').eq('id', runId).single();
        if (run.error) return res.status(404).json({ error: 'Run not found' });
        const deliveries = await allRows(() => service.from('approval_email_deliveries').select('id,run_id,notification_type,scheduled_date,recipient_user_id,recipient_email,pending_count,status,resend_message_id,attempted_at,sent_at,error_summary').eq('run_id', runId).order('id'));
        return res.status(200).json({ run: run.data, deliveries: await reportProfiles(service, deliveries) });
      }
      const runs = await allRows(() => service.from('approval_email_runs').select('id,scheduled_date,started_at,status,sent,failed,skipped,error_summary').order('started_at', { ascending: false }).order('id'));
      return res.status(200).json({ ...admin, ...configuration(), runs, deliveries: await reportProfiles(service, admin.deliveries || []) });
    }
    if (req.body?.action === 'enabled' && typeof req.body.enabled === 'boolean') {
      if (req.body.enabled && !configured()) return res.status(409).json({ error: 'Configure the server email settings before enabling reminders' });
      // requireAdmin has already verified the caller's active Admin status. Use
      // the server-side client for the settings write so production RLS cannot
      // make an otherwise authorized toggle appear to do nothing.
      const service = serviceClient();
      const { error } = await service.from('approval_email_settings')
        .update({ enabled: req.body.enabled, updated_by: admin.id, updated_at: new Date().toISOString() })
        .eq('singleton', true);
      if (error) throw new Error('Reminder setting could not be saved');
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
