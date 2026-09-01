import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

type MeetingProvider = 'Zoom' | 'Google Meet' | 'Custom';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const requiredSecret = (name: string, provider = 'Google') => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${provider} integration secret ${name} is not configured.`);
  return value;
};

const validEmail = (value?: string | null) => Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));

const isHostOnlyZoomLink = (value: string | URL) => {
  try {
    const url = typeof value === 'string' ? new URL(value.trim()) : value;
    if (!url.hostname.toLowerCase().endsWith('zoom.us')) return false;
    return /^\/(s|wc|launch|start|host|meeting\/schedule)(\/|$)/i.test(url.pathname);
  } catch {
    return false;
  }
};

const isValidHttpsMeetingLink = (value?: string | null) => {
  if (!value) return false;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || !url.hostname || url.hostname === 'example.com') return false;
    const lower = value.trim().toLowerCase();
    if (['https://example.com', 'https://example.com/', 'https://your-link-here.com'].includes(lower)) return false;
    if (lower.includes('placeholder') || lower.includes('your-meeting')) return false;
    return !isHostOnlyZoomLink(url);
  } catch {
    return false;
  }
};

const detectMeetingProvider = (value?: string | null) => {
  if (!value) return 'Other';
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    if (hostname === 'zoom.us' || hostname.endsWith('.zoom.us')) return 'Zoom';
    if (hostname === 'meet.google.com') return 'Google Meet';
    if (hostname === 'teams.microsoft.com' || hostname === 'teams.live.com' || hostname.endsWith('.teams.microsoft.com')) return 'Microsoft Teams';
    if (hostname === 'webex.com' || hostname.endsWith('.webex.com')) return 'Webex';
  } catch {
    return 'Other';
  }
  return 'Other';
};

const validMeetLink = (value?: string | null) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname === 'meet.google.com'
      && /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(url.pathname)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
};

const meetLinkFromEvent = (event: any) => validMeetLink(event?.hangoutLink)
  || (event?.conferenceData?.entryPoints || [])
    .map((entry: any) => validMeetLink(entry?.uri))
    .find(Boolean)
  || null;

const googleErrorMessage = async (response: Response) => {
  const payload = await response.json().catch(() => ({}));
  const reason = payload?.error?.errors?.[0]?.reason;
  const message = payload?.error?.message || payload?.error_description || `Google Calendar returned HTTP ${response.status}.`;
  return reason && !message.includes(reason) ? `${message} (${reason})` : message;
};

const zoomErrorMessage = async (response: Response) => {
  const payload = await response.json().catch(() => ({}));
  const message = payload?.message || payload?.error || `Zoom returned HTTP ${response.status}.`;
  return String(message).replace(/(client_secret|access_token|refresh_token)[^\s,;]*/gi, '$1 redacted');
};

const deterministicGoogleEventId = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const hex = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `tnghris${hex}`;
};

const normalizeInterviewType = (value: string) => {
  if (value === 'Virtual') return 'Remote';
  if (value === 'Phone Screen') return 'Phone';
  return value;
};

const normalizeProvider = (value: unknown, fallback?: MeetingProvider): MeetingProvider | null => {
  if (value === 'Zoom' || value === 'Google Meet' || value === 'Custom') return value;
  return fallback || null;
};

const localDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

const googleClient = async () => {
  const clientId = requiredSecret('GOOGLE_CLIENT_ID');
  const clientSecret = requiredSecret('GOOGLE_CLIENT_SECRET');
  const refreshToken = requiredSecret('GOOGLE_REFRESH_TOKEN');
  const calendarId = requiredSecret('GOOGLE_CALENDAR_ID');
  const timeZone = Deno.env.get('GOOGLE_CALENDAR_TIME_ZONE')?.trim() || 'Asia/Manila';
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!tokenResponse.ok) throw new Error(await googleErrorMessage(tokenResponse));
  const token = await tokenResponse.json();
  if (!token.access_token) throw new Error('Google OAuth did not return an access token.');
  return {
    headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
    calendarEventsUrl: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    timeZone,
  };
};

type ZoomConfig = {
  accountId: string;
  clientId: string;
  clientSecret: string;
  hostUserId: string;
  accountName?: string;
};

const zoomConfig = (): ZoomConfig => ({
  accountId: requiredSecret('ZOOM_ACCOUNT_ID', 'Zoom'),
  clientId: requiredSecret('ZOOM_CLIENT_ID', 'Zoom'),
  clientSecret: requiredSecret('ZOOM_CLIENT_SECRET', 'Zoom'),
  hostUserId: requiredSecret('ZOOM_HOST_USER_ID', 'Zoom'),
  accountName: Deno.env.get('ZOOM_ACCOUNT_NAME')?.trim() || undefined,
});

const zoomAccessToken = async (config: ZoomConfig) => {
  const response = await fetch('https://zoom.us/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'account_credentials', account_id: config.accountId }),
  });
  if (!response.ok) throw new Error(await zoomErrorMessage(response));
  const payload = await response.json();
  if (!payload.access_token) throw new Error('Zoom OAuth did not return an access token.');
  return payload.access_token as string;
};

const zoomRequest = async (token: string, path: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');
  const response = await fetch(`https://api.zoom.us/v2${path}`, { ...init, headers });
  if (!response.ok) throw new Error(await zoomErrorMessage(response));
  return response.status === 204 ? null : response.json();
};

const isLicensedActiveZoomUser = (zoomUser: any, accountId: string) => (
  zoomUser
  && zoomUser.status === 'active'
  && Number(zoomUser.type || 0) >= 2
  && String(zoomUser.account_id || '') === accountId
);

const zoomMeetingPayload = ({
  candidateName,
  position,
  startAt,
  endAt,
  timeZone,
  alternativeHosts,
}: {
  candidateName: string;
  position: string;
  startAt: Date;
  endAt: Date;
  timeZone: string;
  alternativeHosts: string[];
}) => ({
  topic: `TNG HRIS Interview — ${candidateName} — ${position}`,
  type: 2,
  start_time: startAt.toISOString(),
  duration: Math.max(1, Math.ceil((endAt.getTime() - startAt.getTime()) / 60000)),
  timezone: timeZone,
  agenda: 'TNG HRIS interview',
  settings: {
    waiting_room: true,
    join_before_host: false,
    host_video: true,
    participant_video: true,
    alternative_hosts: alternativeHosts.join(';'),
  },
});

const auditInterview = async (supabase: any, authUser: any, action: string, interviewId: string, details: Record<string, unknown>) => {
  const { error } = await supabase.from('audit_logs').insert({
    user_id: authUser.id,
    user_email: authUser.email || null,
    action,
    entity: 'job_interviews',
    entity_id: interviewId,
    details: JSON.stringify(details),
  });
  if (error) console.error('Interview audit write failed', error.message);
};

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ error: 'Authentication is required.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseKey) return json({ error: 'Supabase function environment is incomplete.' }, 500);

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return json({ error: 'Your session is no longer valid.' }, 401);

  const { data: allowed, error: permissionError } = await supabase.rpc('is_hr_or_admin');
  if (permissionError || !allowed) return json({ error: 'You do not have permission to manage interviews.' }, 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  const action = String(body.action || 'schedule').trim().toLowerCase();
  const interviewId = body.interviewId ? String(body.interviewId).trim() : null;
  const { data: currentUser } = await supabase.from('hris_users')
    .select('id,full_name,email')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();

  if (action === 'cancel') {
    if (!interviewId) return json({ error: 'The interview to cancel was not specified.' }, 400);
    const { data: existing, error: existingError } = await supabase.from('job_interviews')
      .select('*')
      .eq('id', interviewId)
      .maybeSingle();
    if (existingError) return json({ error: existingError.message }, 400);
    if (!existing) return json({ error: 'The interview to cancel could not be found.' }, 404);
    if (existing.status === 'Cancelled') return json({ interview: existing, idempotent: true });

    try {
      if (existing.calendar_event_id) {
        const google = await googleClient();
        const response = await fetch(`${google.calendarEventsUrl}/${encodeURIComponent(existing.calendar_event_id)}?sendUpdates=all`, {
          method: 'DELETE',
          headers: google.headers,
        });
        if (!response.ok && response.status !== 404) throw new Error(await googleErrorMessage(response));
      }
      if (existing.zoom_meeting_id) {
        const zoom = zoomConfig();
        const token = await zoomAccessToken(zoom);
        await zoomRequest(token, `/meetings/${encodeURIComponent(existing.zoom_meeting_id)}`, { method: 'DELETE' });
      }
    } catch (error: any) {
      await supabase.from('job_interviews').update({
        calendar_error: error?.message || 'The external meeting could not be cancelled.',
        updated_by_user_id: currentUser?.id || authData.user.id,
        updated_at: new Date().toISOString(),
      }).eq('id', interviewId);
      return json({ error: error?.message || 'The external meeting could not be cancelled.' }, 502);
    }

    const cancelledAt = new Date().toISOString();
    const { data: cancelled, error: cancelError } = await supabase.from('job_interviews').update({
      status: 'Cancelled',
      calendar_invite_status: existing.calendar_event_id ? 'cancelled' : existing.calendar_invite_status || 'not_requested',
      applicant_invite_status: existing.calendar_event_id ? 'cancelled' : existing.applicant_invite_status || 'not_requested',
      panel_invite_status: existing.calendar_event_id ? 'cancelled' : existing.panel_invite_status || 'not_requested',
      integration_status: { ...(existing.integration_status || {}), state: 'cancelled', cancelledAt },
      calendar_error: null,
      updated_by_user_id: currentUser?.id || authData.user.id,
      updated_at: cancelledAt,
    }).eq('id', interviewId).select().single();
    if (cancelError || !cancelled) return json({ error: cancelError?.message || 'The interview could not be cancelled.' }, 400);
    await auditInterview(supabase, authData.user, 'INTERVIEW_CANCELLED', interviewId, {
      previousStatus: existing.status,
      newStatus: 'Cancelled',
      calendarEventId: existing.calendar_event_id || null,
      zoomMeetingId: existing.zoom_meeting_id || null,
      attendeesNotified: Boolean(existing.calendar_event_id),
    });
    return json({ interview: cancelled });
  }

  const applicationId = String(body.applicationId || '').trim();
  const panelUserIds = Array.from(new Set((Array.isArray(body.panelUserIds) ? body.panelUserIds : []).filter(Boolean))) as string[];
  const startAt = new Date(body.startAt);
  const endAt = new Date(body.endAt);
  const localStart = typeof body.localStart === 'string' && localDateTimePattern.test(body.localStart) ? body.localStart : null;
  const localEnd = typeof body.localEnd === 'string' && localDateTimePattern.test(body.localEnd) ? body.localEnd : null;
  const interviewType = String(body.interviewType || 'Virtual');
  const createCalendarEvent = body.createCalendarEvent !== false;
  const existingInterviewId = interviewId;

  if (!applicationId || !panelUserIds.length || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
    return json({ error: 'Select an applicant and panel, then enter a valid interview time.' }, 400);
  }
  if (interviewType === 'Onsite' && !String(body.location || '').trim()) {
    return json({ error: 'An onsite interview location is required.' }, 400);
  }

  const [applicationResult, existingResult] = await Promise.all([
    supabase.from('job_applications')
      .select('id,candidate_id,job_post_id,requisition_id,role_title_snapshot,department_snapshot')
      .eq('id', applicationId)
      .single(),
    existingInterviewId
      ? supabase.from('job_interviews').select('*').eq('id', existingInterviewId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const application = applicationResult.data;
  const existingInterview = existingResult.data;
  if (applicationResult.error || !application) return json({ error: 'The selected application could not be found.' }, 404);
  if (existingResult.error) return json({ error: existingResult.error.message }, 400);
  if (existingInterviewId && !existingInterview) return json({ error: 'The interview to update could not be found.' }, 404);
  if (existingInterview && existingInterview.application_id !== applicationId) return json({ error: 'The interview does not belong to the selected application.' }, 400);
  if (existingInterview?.status === 'Cancelled') return json({ error: 'A cancelled interview cannot be updated. Schedule a new interview instead.' }, 409);

  const [candidateResult, postResult, requisitionResult, panelResult] = await Promise.all([
    supabase.from('job_candidates').select('id,first_name,last_name,email').eq('id', application.candidate_id).single(),
    application.job_post_id
      ? supabase.from('job_posts').select('id,title,business_unit_id,department_label').eq('id', application.job_post_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    application.requisition_id
      ? supabase.from('job_requisitions').select('id,title,business_unit_id,department_id').eq('id', application.requisition_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from('hris_users').select('id,full_name,email,status,employment_status').in('id', panelUserIds),
  ]);
  const candidate = candidateResult.data;
  const panel = (panelResult.data || []).filter((member: any) => (
    String(member.status || 'Active').toLowerCase() === 'active'
    && String(member.employment_status || 'Active').toLowerCase() !== 'terminated'
  ));
  if (candidateResult.error || !candidate) return json({ error: 'Applicant details could not be loaded.' }, 404);
  if (panelResult.error || panel.length !== panelUserIds.length) return json({ error: 'One or more selected panel members are inactive or could not be loaded.' }, 400);
  if (!validEmail(candidate.email)) return json({ error: 'The applicant does not have a valid email address.' }, 400);
  const invalidPanel = panel.find((member: any) => !validEmail(member.email));
  if (invalidPanel) return json({ error: `${invalidPanel.full_name || 'A panel member'} does not have a valid email address.` }, 400);

  const post = postResult.data;
  const requisition = requisitionResult.data;
  const position = post?.title || requisition?.title || application.role_title_snapshot || 'Position';
  const businessUnitId = post?.business_unit_id || requisition?.business_unit_id;
  const departmentId = requisition?.department_id;
  const [businessUnitResult, departmentResult] = await Promise.all([
    businessUnitId
      ? supabase.from('business_units').select('name').eq('id', businessUnitId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    departmentId
      ? supabase.from('departments').select('name').eq('id', departmentId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const businessUnit = businessUnitResult.data?.name || 'Not specified';
  const department = departmentResult.data?.name || post?.department_label || application.department_snapshot || '';
  const fullName = [candidate.first_name, candidate.last_name].filter(Boolean).join(' ').trim() || 'Applicant';
  const firstName = candidate.first_name?.trim() || candidate.last_name?.trim() || 'Applicant';
  const existingProvider = normalizeProvider(existingInterview?.meeting_provider)
    || (existingInterview?.google_meet_link ? 'Google Meet' : undefined)
    || (isValidHttpsMeetingLink(existingInterview?.attendee_meeting_url || existingInterview?.location) ? 'Custom' : undefined);
  const provider = interviewType === 'Virtual'
    ? normalizeProvider(body.meetingProvider, existingProvider || 'Custom')
    : null;
  if (interviewType === 'Virtual' && !provider) return json({ error: 'Choose Zoom, Google Meet, or Custom Meeting Link.' }, 400);
  if (provider === 'Google Meet' && !createCalendarEvent) return json({ error: 'Google Meet can only be created with a Google Calendar event.' }, 400);

  const suppliedMeetingLink = String(body.meetingLink || '').trim();
  const existingMeetingLink = String(existingInterview?.attendee_meeting_url || existingInterview?.google_meet_link || (isValidHttpsMeetingLink(existingInterview?.location) ? existingInterview.location : '')).trim();
  const customMeetingLink = provider === 'Custom' ? suppliedMeetingLink || existingMeetingLink : '';
  if (provider === 'Custom' && !isValidHttpsMeetingLink(customMeetingLink)) return json({ error: 'Please enter a valid attendee meeting link.' }, 400);
  if (provider === 'Custom' && isHostOnlyZoomLink(customMeetingLink)) return json({ error: 'Please enter a valid attendee meeting link.' }, 400);

  const round = String(body.interviewRound || existingInterview?.interview_round || 'Round 1').trim() || 'Round 1';
  const now = new Date().toISOString();
  const actorId = currentUser?.id || authData.user.id;
  const calendarIdempotencyKey = existingInterview?.calendar_idempotency_key || existingInterviewId || [
    applicationId,
    localStart || startAt.toISOString(),
    localEnd || endAt.toISOString(),
    interviewType,
    provider || 'none',
    [...panelUserIds].sort().join(','),
  ].join('|');
  const requestedGoogleEventId = createCalendarEvent ? await deterministicGoogleEventId(calendarIdempotencyKey) : null;
  if (!existingInterview && createCalendarEvent) {
    const { data: duplicateInterview, error: duplicateError } = await supabase.from('job_interviews')
      .select('*')
      .eq('calendar_idempotency_key', calendarIdempotencyKey)
      .maybeSingle();
    if (duplicateError) return json({ error: duplicateError.message }, 400);
    if (duplicateInterview) return json({
      interview: duplicateInterview,
      idempotent: true,
      warning: duplicateInterview.calendar_invite_status === 'created'
        ? undefined
        : 'An earlier scheduling attempt is already being used. The existing interview was reopened so you can retry the Google Calendar invitation.',
    });
  }
  const existingMeetLink = validMeetLink(existingInterview?.google_meet_link)
    || validMeetLink(existingInterview?.attendee_meeting_url)
    || validMeetLink(existingInterview?.location);
  const basePayload = {
    application_id: applicationId,
    interviewer_id: panelUserIds[0],
    panel_user_ids: panelUserIds,
    start_at: startAt.toISOString(),
    end_at: endAt.toISOString(),
    location: interviewType === 'Virtual' ? (customMeetingLink || (provider === 'Google Meet' && existingMeetLink) || null) : String(body.location || '').trim() || null,
    type: normalizeInterviewType(interviewType),
    status: 'Scheduled',
    notes: body.notes || null,
    meeting_provider: provider,
    attendee_meeting_url: provider === 'Custom' ? customMeetingLink : provider === 'Google Meet' ? existingMeetLink : null,
    google_meet_link: provider === 'Google Meet' ? existingMeetLink : null,
    custom_provider_name: provider === 'Custom' ? detectMeetingProvider(customMeetingLink) : null,
    interview_round: round,
    created_by_user_id: existingInterview?.created_by_user_id || actorId,
    updated_by_user_id: actorId,
    updated_at: now,
    calendar_idempotency_key: existingInterview?.calendar_idempotency_key || (createCalendarEvent ? calendarIdempotencyKey : null),
  };
  const saveInterview = async (fields: Record<string, unknown>) => {
    const payload = { ...basePayload, ...fields };
    return existingInterview
      ? await supabase.from('job_interviews').update(payload).eq('id', existingInterview.id).select().single()
      : await supabase.from('job_interviews').insert(payload).select().single();
  };

  const initialIntegrationStatus = {
    provider,
    state: provider === 'Custom' ? 'link_saved' : provider === 'Google Meet' && existingMeetLink ? 'ready' : provider ? 'pending' : 'not_applicable',
    updatedAt: now,
  };
  const initialFields: Record<string, unknown> = {
    meeting_provider: provider,
    attendee_meeting_url: provider === 'Custom' ? customMeetingLink : provider === 'Google Meet' ? existingMeetLink : null,
    google_meet_link: provider === 'Google Meet' ? existingMeetLink : null,
    zoom_meeting_id: provider === 'Zoom' ? existingInterview?.zoom_meeting_id || null : null,
    zoom_host_user_id: provider === 'Zoom' ? existingInterview?.zoom_host_user_id || null : null,
    zoom_host_email: provider === 'Zoom' ? existingInterview?.zoom_host_email || null : null,
    zoom_alternative_host_emails: provider === 'Zoom' ? existingInterview?.zoom_alternative_host_emails || [] : [],
    integration_status: initialIntegrationStatus,
    calendar_attendee_statuses: existingInterview?.calendar_attendee_statuses || [],
    calendar_event_id: existingInterview?.calendar_event_id || null,
    google_calendar_link: existingInterview?.google_calendar_link || null,
    calendar_invite_status: createCalendarEvent ? 'pending' : 'not_requested',
    applicant_invite_status: createCalendarEvent ? 'pending' : 'not_requested',
    panel_invite_status: createCalendarEvent ? 'pending' : 'not_requested',
    confirmation_email_status: existingInterview?.confirmation_email_status || 'not_requested',
    calendar_error: null,
  };

  let saved: any;
  const firstSave = await saveInterview(initialFields);
  if (firstSave.error || !firstSave.data) return json({ error: firstSave.error?.message || 'The interview could not be saved.' }, 400);
  saved = firstSave.data;
  const savedInterviewId = saved.id as string;
  const googleEventId = existingInterview?.calendar_event_id || requestedGoogleEventId || await deterministicGoogleEventId(savedInterviewId);

  const updateSaved = async (fields: Record<string, unknown>) => {
    const result = await supabase.from('job_interviews').update({ ...fields, updated_by_user_id: actorId, updated_at: new Date().toISOString() }).eq('id', savedInterviewId).select().single();
    if (result.error || !result.data) throw new Error(result.error?.message || 'The interview could not be updated.');
    saved = result.data;
    return saved;
  };

  let zoomDetails: any = null;
  let zoomAttempted = false;
  try {
    if (provider === 'Zoom') {
      zoomAttempted = true;
      const config = zoomConfig();
      const token = await zoomAccessToken(config);
      const host = await zoomRequest(token, `/users/${encodeURIComponent(config.hostUserId)}`);
      if (!isLicensedActiveZoomUser(host, config.accountId)) throw new Error('The dedicated company Zoom host is not an active licensed user in the company account.');

      const eligibleAlternativeHosts: string[] = [];
      for (const panelMember of panel) {
        const panelEmail = String(panelMember.email || '').trim().toLowerCase();
        try {
          const zoomUser = await zoomRequest(token, `/users/${encodeURIComponent(panelEmail)}`);
          if (isLicensedActiveZoomUser(zoomUser, config.accountId) && String(zoomUser.email || '').trim().toLowerCase() === panelEmail) {
            eligibleAlternativeHosts.push(panelEmail);
          }
        } catch {
          // A panel member who is not a licensed user remains a Calendar attendee.
        }
      }
      const payload = zoomMeetingPayload({
        candidateName: fullName,
        position,
        startAt,
        endAt,
        timeZone: Deno.env.get('GOOGLE_CALENDAR_TIME_ZONE')?.trim() || 'Asia/Manila',
        alternativeHosts: eligibleAlternativeHosts,
      });
      let zoomMeeting: any;
      if (existingInterview?.zoom_meeting_id) {
        await zoomRequest(token, `/meetings/${encodeURIComponent(existingInterview.zoom_meeting_id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
        zoomMeeting = await zoomRequest(token, `/meetings/${encodeURIComponent(existingInterview.zoom_meeting_id)}`);
      } else {
        zoomMeeting = await zoomRequest(token, `/users/${encodeURIComponent(config.hostUserId)}/meetings`, { method: 'POST', body: JSON.stringify(payload) });
      }
      const attendeeUrl = String(zoomMeeting?.join_url || existingInterview?.attendee_meeting_url || '').trim();
      if (!isValidHttpsMeetingLink(attendeeUrl) || isHostOnlyZoomLink(attendeeUrl)) throw new Error('Zoom returned an invalid attendee meeting link.');
      zoomDetails = {
        zoom_meeting_id: String(zoomMeeting.id || existingInterview?.zoom_meeting_id || ''),
        zoom_host_user_id: String(host.id || config.hostUserId),
        zoom_host_email: host.email || null,
        zoom_alternative_host_emails: eligibleAlternativeHosts,
        attendee_meeting_url: attendeeUrl,
        location: attendeeUrl,
        integration_status: {
          provider: 'Zoom',
          state: 'created',
          hostName: host.first_name || host.last_name ? [host.first_name, host.last_name].filter(Boolean).join(' ') : host.email,
          hostEmail: host.email || null,
          accountName: config.accountName || null,
          alternativeHosts: eligibleAlternativeHosts,
          updatedAt: new Date().toISOString(),
        },
      };
      await updateSaved(zoomDetails);
    }

    if (!createCalendarEvent) {
      if (provider === 'Google Meet') throw new Error('Google Meet can only be created with a Google Calendar event.');
      await updateSaved({
        calendar_event_id: null,
        google_calendar_link: null,
        calendar_invite_status: 'not_requested',
        applicant_invite_status: 'not_requested',
        panel_invite_status: 'not_requested',
        calendar_error: null,
        integration_status: { ...(saved.integration_status || {}), state: provider === 'Zoom' ? 'meeting_created' : provider === 'Custom' ? 'link_saved' : 'not_requested', updatedAt: new Date().toISOString() },
      });
      await supabase.from('job_applications').update({ stage: 'Interview', updated_at: new Date().toISOString() }).eq('id', applicationId);
      await auditInterview(supabase, authData.user, existingInterview ? 'INTERVIEW_UPDATED' : 'INTERVIEW_SCHEDULED', savedInterviewId, {
        provider,
        meetingLink: saved.attendee_meeting_url || null,
        calendarEventId: null,
        calendarInvitations: false,
      });
      return json({ interview: saved });
    }

    const google = await googleClient();
    const attendees = [
      { email: candidate.email, displayName: fullName },
      ...panel.map((member: any) => ({ email: member.email, displayName: member.full_name || member.email })),
      ...(body.includeScheduler && validEmail(currentUser?.email)
        ? [{ email: currentUser.email, displayName: currentUser.full_name || currentUser.email }]
        : []),
    ].filter((attendee, index, list) => list.findIndex(item => item.email.toLowerCase() === attendee.email.toLowerCase()) === index);
    let attendeeMeetingUrl = provider === 'Zoom' ? saved.attendee_meeting_url : provider === 'Custom' ? customMeetingLink : existingMeetLink;
    let existingGoogleEvent: any = null;
    let hasExistingGoogleEvent = false;
    if (existingInterview?.calendar_event_id) {
      const currentResponse = await fetch(`${google.calendarEventsUrl}/${encodeURIComponent(googleEventId)}?conferenceDataVersion=1`, { headers: google.headers });
      if (currentResponse.ok) {
        existingGoogleEvent = await currentResponse.json();
        hasExistingGoogleEvent = true;
        attendeeMeetingUrl = provider === 'Google Meet' ? meetLinkFromEvent(existingGoogleEvent) || attendeeMeetingUrl : attendeeMeetingUrl;
      } else if (currentResponse.status !== 404) {
        throw new Error(await googleErrorMessage(currentResponse));
      } else if (provider === 'Google Meet') {
        // A deleted Calendar event cannot carry its old conference. Ask Google
        // for a fresh conference instead of persisting a stale link.
        attendeeMeetingUrl = null;
      }
    }

    const buildDescription = (link?: string | null) => [
      'TNG HRIS Interview',
      `Candidate: ${fullName}`,
      `Position: ${position}`,
      `Business Unit: ${businessUnit}`,
      `Interview Round: ${round}`,
      `Date: ${startAt.toLocaleDateString('en-US')}`,
      `Time: ${startAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – ${endAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
      '',
      'Join the virtual interview:',
      link || 'Google Meet link will be added by Google Calendar.',
      `Meeting Provider: ${provider || 'Not applicable'}`,
      '',
      'Interview Panel:',
      ...panel.map((member: any) => `- ${member.full_name || member.email}`),
      '',
      'Please join five minutes before the scheduled interview.',
    ].join('\n');

    const eventBody: any = {
      summary: `${firstName} — ${position}`,
      description: buildDescription(attendeeMeetingUrl),
      start: { dateTime: localStart || startAt.toISOString(), timeZone: google.timeZone },
      end: { dateTime: localEnd || endAt.toISOString(), timeZone: google.timeZone },
      attendees,
      guestsCanInviteOthers: false,
      guestsCanModify: false,
      location: interviewType === 'Virtual' ? (attendeeMeetingUrl || 'Virtual interview') : String(body.location || '').trim(),
    };
    if (!hasExistingGoogleEvent) eventBody.id = googleEventId;
    if (provider === 'Google Meet' && (!hasExistingGoogleEvent || (!attendeeMeetingUrl && !meetLinkFromEvent(existingGoogleEvent)))) {
      eventBody.conferenceData = {
        createRequest: {
          requestId: `${googleEventId}-meet`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    let eventResponse = await fetch(
      hasExistingGoogleEvent
        ? `${google.calendarEventsUrl}/${encodeURIComponent(googleEventId)}?conferenceDataVersion=1&sendUpdates=all`
        : `${google.calendarEventsUrl}?conferenceDataVersion=1&sendUpdates=all`,
      { method: hasExistingGoogleEvent ? 'PATCH' : 'POST', headers: google.headers, body: JSON.stringify(eventBody) },
    );
    if (eventResponse.status === 409 && !hasExistingGoogleEvent) {
      eventResponse = await fetch(`${google.calendarEventsUrl}/${encodeURIComponent(googleEventId)}?conferenceDataVersion=1`, { headers: google.headers });
    }
    if (!eventResponse.ok) throw new Error(await googleErrorMessage(eventResponse));
    let event = await eventResponse.json();

    if (provider === 'Google Meet') {
      attendeeMeetingUrl = meetLinkFromEvent(event);
      for (let attempt = 0; !attendeeMeetingUrl && attempt < 6; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 800));
        const pollResponse = await fetch(`${google.calendarEventsUrl}/${encodeURIComponent(event.id || googleEventId)}?conferenceDataVersion=1`, { headers: google.headers });
        if (!pollResponse.ok) throw new Error(await googleErrorMessage(pollResponse));
        event = await pollResponse.json();
        attendeeMeetingUrl = meetLinkFromEvent(event);
      }
      if (!validMeetLink(attendeeMeetingUrl)) throw new Error('Google Calendar created the event but did not generate a valid Google Meet link.');
    }
    if (provider === 'Zoom' || provider === 'Custom') {
      if (!isValidHttpsMeetingLink(attendeeMeetingUrl)) throw new Error('Please enter a valid attendee meeting link.');
    }
    if (!event.id || !event.htmlLink) throw new Error('Google Calendar did not return complete event details.');

    const finalDescription = buildDescription(attendeeMeetingUrl);
    if (String(event.description || '') !== finalDescription || (interviewType === 'Virtual' && event.location !== attendeeMeetingUrl)) {
      const patchResponse = await fetch(`${google.calendarEventsUrl}/${encodeURIComponent(event.id)}?conferenceDataVersion=1&sendUpdates=all`, {
        method: 'PATCH',
        headers: google.headers,
        body: JSON.stringify({ description: finalDescription, location: interviewType === 'Virtual' ? attendeeMeetingUrl : String(body.location || '').trim() }),
      });
      if (!patchResponse.ok) throw new Error(await googleErrorMessage(patchResponse));
      event = await patchResponse.json();
    }

    const sentAt = new Date().toISOString();
    saved = await updateSaved({
      start_at: new Date(event.start?.dateTime || startAt).toISOString(),
      end_at: new Date(event.end?.dateTime || endAt).toISOString(),
      location: interviewType === 'Virtual' ? attendeeMeetingUrl : String(body.location || '').trim(),
      meeting_provider: provider,
      attendee_meeting_url: attendeeMeetingUrl,
      google_meet_link: provider === 'Google Meet' ? attendeeMeetingUrl : null,
      custom_provider_name: provider === 'Custom' ? detectMeetingProvider(attendeeMeetingUrl) : null,
      calendar_event_id: event.id,
      google_calendar_link: event.htmlLink,
      calendar_attendee_statuses: (event.attendees || []).map((attendee: any) => ({ email: attendee.email, displayName: attendee.displayName, responseStatus: attendee.responseStatus })),
      calendar_invite_status: 'created',
      applicant_invite_status: 'sent',
      panel_invite_status: 'sent',
      applicant_invite_sent_at: sentAt,
      panel_invite_sent_at: sentAt,
      calendar_error: null,
      integration_status: { ...(saved.integration_status || {}), provider, state: 'created', calendar: 'created', updatedAt: sentAt },
    });
    await supabase.from('job_applications').update({ stage: 'Interview', updated_at: sentAt }).eq('id', applicationId);
    await auditInterview(supabase, authData.user, existingInterview ? 'INTERVIEW_UPDATED' : 'INTERVIEW_SCHEDULED', savedInterviewId, {
      provider,
      previousProvider: existingInterview?.meeting_provider || null,
      previousMeetingLink: existingMeetingLink || null,
      meetingLink: attendeeMeetingUrl,
      customProviderName: provider === 'Custom' ? detectMeetingProvider(attendeeMeetingUrl) : null,
      calendarEventId: event.id,
      attendeeEmails: attendees.map(attendee => attendee.email),
      zoomMeetingId: saved.zoom_meeting_id || null,
      rescheduled: Boolean(existingInterview),
    });
    return json({ interview: saved });
  } catch (error: any) {
    const message = error?.message || 'The interview integration request failed.';
    console.error('schedule-interview integration failed', message);
    try {
      saved = await updateSaved({
        calendar_invite_status: createCalendarEvent ? 'failed' : 'not_requested',
        applicant_invite_status: createCalendarEvent ? 'failed' : 'not_requested',
        panel_invite_status: createCalendarEvent ? 'failed' : 'not_requested',
        calendar_error: message,
        integration_status: {
          ...(saved?.integration_status || {}),
          provider,
          state: zoomDetails ? 'meeting_created_calendar_failed' : 'failed',
          calendar: createCalendarEvent ? 'failed' : 'not_requested',
          updatedAt: new Date().toISOString(),
        },
      });
      return json({
        interview: saved,
        warning: zoomDetails
          ? 'Zoom meeting was created, but the Google Calendar invitation could not be completed. The meeting information was preserved. Use Retry Calendar Invitation.'
          : zoomAttempted
            ? 'Zoom meeting could not be created. You may retry or use a custom meeting link.'
          : createCalendarEvent
            ? 'Google Calendar could not create the invitation. The interview information was preserved. Use Retry Calendar Invitation.'
            : message,
      });
    } catch (saveError: any) {
      return json({ error: `${message} The interview record could not be updated: ${saveError?.message || 'database error'}.` }, 502);
    }
  }
});
