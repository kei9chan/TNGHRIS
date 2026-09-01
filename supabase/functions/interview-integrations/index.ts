import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const secret = (name: string) => Deno.env.get(name)?.trim() || '';

const zoomErrorMessage = async (response: Response) => {
  const payload = await response.json().catch(() => ({}));
  return String(payload?.message || payload?.error || `Zoom returned HTTP ${response.status}.`)
    .replace(/(client_secret|access_token|refresh_token)[^\s,;]*/gi, '$1 redacted');
};

const zoomRequest = async (token: string, path: string) => {
  const response = await fetch(`https://api.zoom.us/v2${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new Error(await zoomErrorMessage(response));
  return response.json();
};

const isLicensedActive = (zoomUser: any, accountId: string) => Boolean(
  zoomUser
  && zoomUser.status === 'active'
  && Number(zoomUser.type || 0) >= 2
  && String(zoomUser.account_id || '') === accountId,
);

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ error: 'Authentication is required.' }, 401);
  const supabaseUrl = secret('SUPABASE_URL');
  const supabaseKey = secret('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseKey) return json({ error: 'Supabase function environment is incomplete.' }, 500);

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return json({ error: 'Your session is no longer valid.' }, 401);
  const { data: allowed, error: permissionError } = await supabase.rpc('is_hr_or_admin');
  if (permissionError || !allowed) return json({ error: 'You do not have permission to view interview integrations.' }, 403);

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    // An empty body is valid: it asks only for connection status.
  }
  const panelUserIds = Array.from(new Set((Array.isArray(body.panelUserIds) ? body.panelUserIds : []).filter(Boolean))).slice(0, 100) as string[];
  const disconnected = (error?: string) => ({
    zoom: {
      connected: false,
      error: error || 'Zoom is not connected yet',
      alternativeHostEligibility: {},
    },
  });

  const accountId = secret('ZOOM_ACCOUNT_ID');
  const clientId = secret('ZOOM_CLIENT_ID');
  const clientSecret = secret('ZOOM_CLIENT_SECRET');
  const hostUserId = secret('ZOOM_HOST_USER_ID');
  if (!accountId || !clientId || !clientSecret || !hostUserId) return json(disconnected());

  try {
    const tokenResponse = await fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'account_credentials', account_id: accountId }),
    });
    if (!tokenResponse.ok) throw new Error(await zoomErrorMessage(tokenResponse));
    const tokenPayload = await tokenResponse.json();
    if (!tokenPayload.access_token) throw new Error('Zoom OAuth did not return an access token.');
    const token = tokenPayload.access_token as string;
    const host = await zoomRequest(token, `/users/${encodeURIComponent(hostUserId)}`);
    if (!isLicensedActive(host, accountId)) return json(disconnected('The company Zoom host is not an active licensed user in the connected account.'));

    const { data: panelUsers, error: panelError } = panelUserIds.length
      ? await supabase.from('hris_users').select('id,full_name,email,status,employment_status').in('id', panelUserIds)
      : { data: [], error: null };
    if (panelError) throw new Error(panelError.message);
    const alternativeHostEligibility: Record<string, { eligible: boolean; reason: string; email?: string }> = {};
    for (const panelUserId of panelUserIds) {
      const panelUser = (panelUsers || []).find((candidate: any) => candidate.id === panelUserId);
      if (!panelUser) {
        alternativeHostEligibility[panelUserId] = { eligible: false, reason: 'Panel member could not be loaded.' };
        continue;
      }
      const active = String(panelUser.status || 'Active').toLowerCase() === 'active'
        && String(panelUser.employment_status || 'Active').toLowerCase() !== 'terminated';
      if (!active || !panelUser.email) {
        alternativeHostEligibility[panelUserId] = { eligible: false, reason: 'Panel member is not an active HRIS user.', email: panelUser.email || undefined };
        continue;
      }
      try {
        const zoomUser = await zoomRequest(token, `/users/${encodeURIComponent(panelUser.email)}`);
        const emailMatches = String(zoomUser.email || '').trim().toLowerCase() === String(panelUser.email).trim().toLowerCase();
        const eligible = emailMatches && isLicensedActive(zoomUser, accountId);
        alternativeHostEligibility[panelUserId] = {
          eligible,
          reason: eligible ? 'Active licensed Zoom user in the company account.' : 'HRIS email is not an active licensed user in the company Zoom account.',
          email: panelUser.email,
        };
      } catch {
        alternativeHostEligibility[panelUserId] = {
          eligible: false,
          reason: 'Calendar attendee only — no matching licensed Zoom user found.',
          email: panelUser.email,
        };
      }
    }

    return json({
      zoom: {
        connected: true,
        hostName: host.first_name || host.last_name ? [host.first_name, host.last_name].filter(Boolean).join(' ') : host.email,
        hostEmail: host.email,
        hostUserId: String(host.id || hostUserId),
        accountName: secret('ZOOM_ACCOUNT_NAME') || undefined,
        alternativeHostEligibility,
      },
    });
  } catch (error: any) {
    console.error('interview-integrations Zoom status check failed', error?.message || error);
    return json(disconnected('Zoom connection could not be verified.'));
  }
});
