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

const normalizeInterviewType = (value: string) => {
  if (value === 'Virtual') return 'Remote';
  if (value === 'Phone Screen') return 'Phone';
  if (value === 'Onsite') return 'Onsite';
  return value;
};

const firstNameFrom = (candidate: { first_name?: string | null; last_name?: string | null }) =>
  candidate.first_name?.trim() || candidate.last_name?.trim() || 'Applicant';

const fullNameFrom = (candidate: { first_name?: string | null; last_name?: string | null }) =>
  [candidate.first_name, candidate.last_name].filter(Boolean).join(' ').trim() || 'Applicant';

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
  return payload?.error?.message || payload?.error_description || `Google Calendar returned ${response.status}.`;
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
    auth: { persistSession: false },
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

  const applicationId = String(body.applicationId || '');
  const panelUserIds = Array.from(new Set((body.panelUserIds || []).filter(Boolean))) as string[];
  const startAt = new Date(body.startAt);
  const endAt = new Date(body.endAt);
  const interviewType = String(body.interviewType || 'Virtual');
  const createCalendarEvent = Boolean(body.createCalendarEvent);
  const includeScheduler = Boolean(body.includeScheduler);

  if (!applicationId || !panelUserIds.length || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
    return json({ error: 'Select an applicant and panel, then enter a valid interview time.' }, 400);
  }
  if (interviewType === 'Onsite' && !String(body.location || '').trim()) {
    return json({ error: 'An onsite interview location is required.' }, 400);
  }

  const { data: application, error: applicationError } = await supabase
    .from('job_applications')
    .select('id,candidate_id,job_post_id,requisition_id,role_title_snapshot,department_snapshot')
    .eq('id', applicationId)
    .single();
  if (applicationError || !application) return json({ error: 'The selected application could not be found.' }, 404);

  const [candidateResult, postResult, requisitionResult, panelResult, schedulerResult] = await Promise.all([
    supabase.from('job_candidates').select('id,first_name,last_name,email').eq('id', application.candidate_id).single(),
    application.job_post_id
      ? supabase.from('job_posts').select('id,title,business_unit_id,requisition_id,department_label').eq('id', application.job_post_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    application.requisition_id
      ? supabase.from('job_requisitions').select('id,title,business_unit_id,department_id').eq('id', application.requisition_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from('hris_users').select('id,full_name,email,position,department').in('id', panelUserIds),
    supabase.from('hris_users').select('id,full_name,email').eq('auth_user_id', authData.user.id).maybeSingle(),
  ]);

  const candidate = candidateResult.data;
  if (candidateResult.error || !candidate) return json({ error: 'Applicant details could not be loaded.' }, 404);
  if (panelResult.error || (panelResult.data || []).length !== panelUserIds.length) {
    return json({ error: 'One or more selected panel members could not be loaded.' }, 400);
  }

  const post = postResult.data;
  const requisition = requisitionResult.data;
  const panel = panelResult.data || [];
  const scheduler = schedulerResult.data;
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

  const position = post?.title || requisition?.title || application.role_title_snapshot || 'Position';
  const businessUnit = businessUnitResult.data?.name || 'Not specified';
  const department = departmentResult.data?.name || post?.department_label || application.department_snapshot || '';
  const pendingStatus = createCalendarEvent ? 'pending' : 'not_requested';
  const interviewPayload = {
    application_id: applicationId,
    interviewer_id: panelUserIds[0],
    panel_user_ids: panelUserIds,
    start_at: startAt.toISOString(),
    end_at: endAt.toISOString(),
    location: interviewType === 'Virtual' ? null : String(body.location || '').trim() || null,
    type: normalizeInterviewType(interviewType),
    status: 'Scheduled',
    notes: body.notes || null,
    calendar_event_id: null,
    google_meet_link: null,
    calendar_invite_status: pendingStatus,
    applicant_invite_status: pendingStatus,
    panel_invite_status: pendingStatus,
    confirmation_email_status: 'pending',
    applicant_invite_sent_at: null,
    panel_invite_sent_at: null,
    confirmation_email_sent_at: null,
    calendar_error: null,
  };

  const existingId = body.interviewId ? String(body.interviewId) : null;
  const saveQuery = existingId
    ? supabase.from('job_interviews').update(interviewPayload).eq('id', existingId).select().single()
    : supabase.from('job_interviews').insert(interviewPayload).select().single();
  const { data: savedInterview, error: saveError } = await saveQuery;
  if (saveError || !savedInterview) return json({ error: saveError?.message || 'The interview could not be saved.' }, 400);

  await supabase.from('job_applications').update({ stage: 'Interview', updated_at: new Date().toISOString() }).eq('id', applicationId);
  if (!createCalendarEvent) return json({ interview: savedInterview });

  const failCalendar = async (message: string) => {
    const { data: failed } = await supabase.from('job_interviews').update({
      calendar_invite_status: 'failed',
      applicant_invite_status: 'failed',
      panel_invite_status: 'failed',
      calendar_event_id: null,
      google_meet_link: null,
      calendar_error: message,
    }).eq('id', savedInterview.id).select().single();
    return json({ interview: failed || { ...savedInterview, calendar_error: message }, warning: message });
  };

  if (!validEmail(candidate.email) || panel.some(member => !validEmail(member.email))) {
    return await failCalendar('Interview scheduled, but one or more invite recipients do not have a valid email address.');
  }

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  const refreshToken = Deno.env.get('GOOGLE_REFRESH_TOKEN');
  const calendarId = Deno.env.get('GOOGLE_CALENDAR_ID') || 'primary';
  const timeZone = Deno.env.get('GOOGLE_CALENDAR_TIME_ZONE') || 'Asia/Manila';
  if (!clientId || !clientSecret || !refreshToken) {
    return await failCalendar('Unable to create Google Calendar event. Please check Google integration settings.');
  }

  try {
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
    const tokenPayload = await tokenResponse.json();
    if (!tokenPayload.access_token) throw new Error('Google did not return an access token.');

    const attendees = [
      { email: candidate.email, displayName: fullNameFrom(candidate) },
      ...panel.map(member => ({ email: member.email, displayName: member.full_name || member.email })),
      ...(includeScheduler && validEmail(scheduler?.email)
        ? [{ email: scheduler.email, displayName: scheduler.full_name || scheduler.email }]
        : []),
    ].filter((attendee, index, list) => list.findIndex(item => item.email.toLowerCase() === attendee.email.toLowerCase()) === index);

    const title = `Interview: ${firstNameFrom(candidate)} — ${position}`;
    const description = [
      `Applicant: ${fullNameFrom(candidate)}`,
      `Position: ${position}`,
      `Business Unit: ${businessUnit}`,
      department ? `Department: ${department}` : '',
      `Interview Type: ${interviewType}`,
      `Panel: ${panel.map(member => member.full_name || member.email).join(', ')}`,
    ].filter(Boolean).join('\n');
    const eventBody: any = {
      summary: title,
      description,
      start: { dateTime: startAt.toISOString(), timeZone },
      end: { dateTime: endAt.toISOString(), timeZone },
      attendees,
      guestsCanInviteOthers: false,
      guestsCanModify: false,
    };
    if (interviewType === 'Onsite' && body.location) eventBody.location = String(body.location).trim();
    if (interviewType === 'Virtual') {
      eventBody.conferenceData = {
        createRequest: {
          requestId: `tnghris-${savedInterview.id}-${crypto.randomUUID()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    const eventResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenPayload.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(eventBody),
      },
    );
    if (!eventResponse.ok) throw new Error(await googleErrorMessage(eventResponse));
    let event = await eventResponse.json();

    let meetLink = interviewType === 'Virtual' ? meetLinkFromEvent(event) : null;
    for (let attempt = 0; interviewType === 'Virtual' && !meetLink && attempt < 3; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 700));
      const pollResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(event.id)}?conferenceDataVersion=1`,
        { headers: { Authorization: `Bearer ${tokenPayload.access_token}` } },
      );
      if (pollResponse.ok) {
        event = await pollResponse.json();
        meetLink = meetLinkFromEvent(event);
      }
    }

    if (interviewType === 'Virtual' && !meetLink) {
      if (event.id) {
        await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(event.id)}?sendUpdates=all`,
          { method: 'DELETE', headers: { Authorization: `Bearer ${tokenPayload.access_token}` } },
        );
      }
      throw new Error('Google Calendar did not generate a valid Google Meet link.');
    }

    if (meetLink) {
      const descriptionResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(event.id)}?conferenceDataVersion=1&sendUpdates=all`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${tokenPayload.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: `${description}\nGoogle Meet: ${meetLink}` }),
        },
      );
      if (!descriptionResponse.ok) {
        await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(event.id)}?sendUpdates=all`,
          { method: 'DELETE', headers: { Authorization: `Bearer ${tokenPayload.access_token}` } },
        );
        throw new Error(await googleErrorMessage(descriptionResponse));
      }
    }

    const sentAt = new Date().toISOString();
    const { data: completed, error: updateError } = await supabase.from('job_interviews').update({
      calendar_event_id: event.id,
      google_meet_link: meetLink,
      location: meetLink || interviewPayload.location,
      calendar_invite_status: 'created',
      applicant_invite_status: 'sent',
      panel_invite_status: 'sent',
      applicant_invite_sent_at: sentAt,
      panel_invite_sent_at: sentAt,
      calendar_error: null,
    }).eq('id', savedInterview.id).select().single();
    if (updateError || !completed) {
      await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(event.id)}?sendUpdates=all`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${tokenPayload.access_token}` } },
      );
      throw new Error(updateError?.message || 'Calendar event was created but the interview could not be updated.');
    }

    return json({ interview: completed });
  } catch (error: any) {
    return await failCalendar(`Unable to create Google Calendar event. ${error?.message || 'Please check Google integration settings.'}`);
  }
});
