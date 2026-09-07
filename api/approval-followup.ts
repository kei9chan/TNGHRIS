import { serviceClient } from '../server/approvalEmail.js';
import { followupOwner, loadFollowup } from '../server/approvalFollowup.js';
export const createFollowupHandler = (makeClient = serviceClient) => async (req: any, res: any) => {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const token = typeof req.headers.authorization === 'string' ? req.headers.authorization.match(/^Bearer (.+)$/)?.[1] : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  let authorized = false;
  try {
    const client = makeClient();
    const { data: auth, error: authError } = await client.auth.getUser(token);
    if (authError || !auth.user) return res.status(401).json({ error: 'Authentication required' });
    const { data: profile, error } = await client.from('hris_users').select('id,status,is_duplicate,auth_user_id').eq('auth_user_id', auth.user.id).eq('is_duplicate', false).maybeSingle();
    if (error) throw new Error('Account lookup failed');
    const owner = followupOwner(profile);
    if (!owner) return res.status(403).json({ error: 'Follow-up access not granted' });
    authorized = true;
    // No caller-selected owner, role bypass, request details, or mutation is supported.
    return res.status(200).json(await loadFollowup(client, owner));
  } catch { return res.status(503).json({ ...(authorized ? { allowed: true } : {}), error: 'Unable to load Regine’s approval summary.' }); }
}

export default createFollowupHandler();
