import { cronAuthorized, runDigest } from '../../server/approvalEmail.js';
export const config = { maxDuration: 300 };
export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (!cronAuthorized(req.headers.authorization)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try { const result = await runDigest(); return res.status(result.status === 'failed' ? 503 : 200).json(result); }
  catch { return res.status(503).json({ error: 'Reminder run failed; review server configuration and delivery logs' }); }
}
