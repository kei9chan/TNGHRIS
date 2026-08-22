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

const requiredSecret = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Google integration secret ${name} is not configured.`);
  return value;
};

const validEmail = (value?: string | null) => Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));

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
  if (permissionError || !allowed) return json({ error: 'You do not have permission to schedule interviews.' }, 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  const applicationId = String(body.applicationId || '').trim();
  const interviewId = body.interviewId ? String(body.interviewId).trim() : null;
  const panelUserIds = Array.from(new Set((Array.isArray(body.panelUserIds) ? body.panelUserIds : []).filter(Boolean))) as string[];
  const startAt = new Date(body.startAt);
  const endAt = new Date(body.endAt);
  const interviewType = String(body.interviewType || 'Virtual');
  const createCalendarEvent = Boolean(body.createCalendarEvent);

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
    interviewId
      ? supabase.from('job_interviews').select('*').eq('id', interviewId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const application = applicationResult.data;
  const existingInterview = existingResult.data;
  if (applicationResult.error || !application) return json({ error: 'The selected application could not be found.' }, 404);
  if (existingResult.error) return json({ error: existingResult.error.message }, 400);
  if (interviewId && !existingInterview) return json({ error: 'The interview to update could not be found.' }, 404);
  if (existingInterview && existingInterview.application_id !== applicationId) {
    return json({ error: 'The interview does not belong to the selected application.' }, 400);
  }

  const [candidateResult, postResult, requisitionResult, panelResult, schedulerResult] = await Promise.all([
    supabase.from('job_candidates').select('id,first_name,last_name,email').eq('id', application.candidate_id).single(),
    application.job_post_id
      ? supabase.from('job_posts').select('id,title,business_unit_id,department_label').eq('id', application.job_post_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    application.requisition_id
      ? supabase.from('job_requisitions').select('id,title,business_unit_id,department_id').eq('id', application.requisition_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from('hris_users').select('id,full_name,email').in('id', panelUserIds),
    supabase.from('hris_users').select('id,full_name,email').eq('auth_user_id', authData.user.id).maybeSingle(),
  ]);

  const candidate = candidateResult.data;
  const panel = panelResult.data || [];
  if (candidateResult.error || !candidate) return json({ error: 'Applicant details could not be loaded.' }, 404);
  if (panelResult.error || panel.length !== panelUserIds.length) return json({ error: 'One or more panel members could not be loaded.' }, 400);
  if (!validEmail(candidate.email)) return json({ error: 'The applicant does not have a valid email address.' }, 400);
  const invalidPanel = panel.find(member => !validEmail(member.email));
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
  const basePayload = {
    application_id: applicationId,
    interviewer_id: panelUserIds[0],
    panel_user_ids: panelUserIds,
    start_at: startAt.toISOString(),
    end_at: endAt.toISOString(),
    location: interviewType === 'Virtual' ? null : String(body.location || '').trim() || null,
    type: normalizeInterviewType(interviewType),
    status: 'Scheduled',
    notes: body.notes || null,
  };
  const saveInterview = async (calendarFields: Record<string, unknown>) => {
    const payload = { ...basePayload, ...calendarFields };
    return existingInterview
      ? await supabase.from('job_interviews').update(payload).eq('id', existingInterview.id).select().single()
      : await supabase.from('job_interviews').insert(payload).select().single();
  };

  if (!createCalendarEvent) {
    const { data, error } = await saveInterview({
      calendar_event_id: null,
      google_calendar_link: null,
      google_meet_link: null,
      calendar_invite_status: 'not_requested',
      applicant_invite_status: 'not_requested',
      panel_invite_status: 'not_requested',
      confirmation_email_status: 'not_requested',
      applicant_invite_sent_at: null,
      panel_invite_sent_at: null,
      calendar_error: null,
    });
    if (error || !data) return json({ error: error?.message || 'The interview could not be saved.' }, 400);
    await supabase.from('job_applications').update({ stage: 'Interview', updated_at: new Date().toISOString() }).eq('id', applicationId);
    return json({ interview: data });
  }

  let clientId: string;
  let clientSecret: string;
  let refreshToken: string;
  let calendarId: string;
  let timeZone: string;
  try {
    clientId = requiredSecret('GOOGLE_CLIENT_ID');
    clientSecret = requiredSecret('GOOGLE_CLIENT_SECRET');
    refreshToken = requiredSecret('GOOGLE_REFRESH_TOKEN');
    calendarId = requiredSecret('GOOGLE_CALENDAR_ID');
    timeZone = requiredSecret('GOOGLE_CALENDAR_TIME_ZONE');
  } catch (error: any) {
    return json({ error: error.message }, 500);
  }

  const idempotencyValue = interviewId || [
    applicationId,
    startAt.toISOString(),
    endAt.toISOString(),
    interviewType,
    [...panelUserIds].sort().join(','),
  ].join('|');
  const googleEventId = existingInterview?.calendar_event_id || await deterministicGoogleEventId(idempotencyValue);

  if (!existingInterview) {
    const { data: duplicate, error } = await supabase.from('job_interviews')
      .select('*')
      .eq('calendar_event_id', googleEventId)
      .maybeSingle();
    if (error) return json({ error: error.message }, 400);
    if (duplicate) return json({ interview: duplicate, idempotent: true });
  }

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
    });
    if (!tokenResponse.ok) throw new Error(await googleErrorMessage(tokenResponse));
    const token = await tokenResponse.json();
    if (!token.access_token) throw new Error('Google OAuth did not return an access token.');
    const headers = { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' };
    const fullName = [candidate.first_name, candidate.last_name].filter(Boolean).join(' ').trim() || 'Applicant';
    const firstName = candidate.first_name?.trim() || candidate.last_name?.trim() || 'Applicant';
    const attendees = [
      { email: candidate.email, displayName: fullName },
      ...panel.map(member => ({ email: member.email, displayName: member.full_name || member.email })),
      ...(body.includeScheduler && validEmail(schedulerResult.data?.email)
        ? [{ email: schedulerResult.data.email, displayName: schedulerResult.data.full_name || schedulerResult.data.email }]
        : []),
    ].filter((attendee, index, list) => list.findIndex(item => item.email.toLowerCase() === attendee.email.toLowerCase()) === index);
    const description = [
      `Applicant: ${fullName}`,
      `Position: ${position}`,
      `Business Unit: ${businessUnit}`,
      department ? `Department: ${department}` : '',
      `Interview Type: ${interviewType}`,
      `Panel: ${panel.map(member => member.full_name || member.email).join(', ')}`,
    ].filter(Boolean).join('\n');

    const calendarEventsUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
    let existingGoogleEvent: any = null;
    if (existingInterview?.calendar_event_id) {
      const currentResponse = await fetch(`${calendarEventsUrl}/${encodeURIComponent(googleEventId)}?conferenceDataVersion=1`, { headers });
      if (!currentResponse.ok) throw new Error(await googleErrorMessage(currentResponse));
      existingGoogleEvent = await currentResponse.json();
    }

    const eventBody: any = {
      summary: `${firstName} — ${position}`,
      description,
      start: { dateTime: startAt.toISOString(), timeZone },
      end: { dateTime: endAt.toISOString(), timeZone },
      attendees,
      guestsCanInviteOthers: false,
      guestsCanModify: false,
    };
    if (!existingInterview?.calendar_event_id) eventBody.id = googleEventId;
    if (interviewType === 'Onsite') eventBody.location = String(body.location).trim();
    if (interviewType === 'Virtual' && !meetLinkFromEvent(existingGoogleEvent)) {
      eventBody.conferenceData = {
        createRequest: {
          requestId: `${googleEventId}-meet`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    let eventResponse = await fetch(
      existingInterview?.calendar_event_id
        ? `${calendarEventsUrl}/${encodeURIComponent(googleEventId)}?conferenceDataVersion=1&sendUpdates=all`
        : `${calendarEventsUrl}?conferenceDataVersion=1&sendUpdates=all`,
      { method: existingInterview?.calendar_event_id ? 'PATCH' : 'POST', headers, body: JSON.stringify(eventBody) },
    );
    let event: any;
    if (eventResponse.status === 409 && !existingInterview) {
      eventResponse = await fetch(`${calendarEventsUrl}/${encodeURIComponent(googleEventId)}?conferenceDataVersion=1`, { headers });
    }
    if (!eventResponse.ok) throw new Error(await googleErrorMessage(eventResponse));
    event = await eventResponse.json();

    let meetLink = interviewType === 'Virtual' ? meetLinkFromEvent(event) : null;
    for (let attempt = 0; interviewType === 'Virtual' && !meetLink && attempt < 5; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 800));
      const pollResponse = await fetch(`${calendarEventsUrl}/${encodeURIComponent(event.id)}?conferenceDataVersion=1`, { headers });
      if (!pollResponse.ok) throw new Error(await googleErrorMessage(pollResponse));
      event = await pollResponse.json();
      meetLink = meetLinkFromEvent(event);
    }
    if (interviewType === 'Virtual' && !meetLink) {
      throw new Error('Google Calendar created the event but did not generate a valid Google Meet link.');
    }
    if (!event.id || !event.htmlLink) throw new Error('Google Calendar did not return complete event details.');

    if (meetLink && !String(event.description || '').includes(meetLink)) {
      const patchResponse = await fetch(`${calendarEventsUrl}/${encodeURIComponent(event.id)}?conferenceDataVersion=1&sendUpdates=none`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ description: `${description}\nGoogle Meet: ${meetLink}` }),
      });
      if (!patchResponse.ok) throw new Error(await googleErrorMessage(patchResponse));
      event = await patchResponse.json();
    }

    const sentAt = new Date().toISOString();
    const { data: saved, error: saveError } = await saveInterview({
      calendar_event_id: event.id,
      google_calendar_link: event.htmlLink,
      google_meet_link: meetLink,
      location: meetLink || basePayload.location,
      calendar_invite_status: 'created',
      applicant_invite_status: 'sent',
      panel_invite_status: 'sent',
      confirmation_email_status: 'not_requested',
      applicant_invite_sent_at: sentAt,
      panel_invite_sent_at: sentAt,
      calendar_error: null,
    });
    if (saveError || !saved) {
      if (saveError?.code === '23505') {
        const { data: duplicate } = await supabase.from('job_interviews').select('*').eq('calendar_event_id', event.id).maybeSingle();
        if (duplicate) return json({ interview: duplicate, idempotent: true });
      }
      throw new Error(`Google event ${event.id} was created, but the interview could not be saved: ${saveError?.message || 'Unknown database error.'}`);
    }
    const { error: stageError } = await supabase.from('job_applications')
      .update({ stage: 'Interview', updated_at: sentAt })
      .eq('id', applicationId);
    if (stageError) return json({ error: `Google Calendar succeeded, but the application stage could not be updated: ${stageError.message}` }, 500);
    return json({ interview: saved });
  } catch (error: any) {
    console.error('schedule-interview Google integration failed', error?.message || error);
    return json({ error: error?.message || 'Google Calendar request failed.' }, 502);
  }
});
