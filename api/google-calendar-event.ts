import { authorizeRecruitmentRequest, sendApiError } from './recruitmentAuth';

const getEnv = (key: string) => {
  const value = process.env[key];
  return value && value.trim().length > 0 ? value.trim() : null;
};

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const readGoogleError = async (response: Response, fallback: string) => {
  const body = await response.json().catch(() => ({}));
  return body?.error?.message || body?.error_description || fallback;
};

const getAccessToken = async () => {
  const clientId = getEnv('GOOGLE_CLIENT_ID');
  const clientSecret = getEnv('GOOGLE_CLIENT_SECRET');
  const refreshToken = getEnv('GOOGLE_REFRESH_TOKEN');
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Google Calendar integration is not configured.');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!response.ok) throw new Error(await readGoogleError(response, 'Unable to authenticate with Google Calendar.'));
  const data = await response.json();
  if (!data.access_token) throw new Error('Google Calendar did not return an access token.');
  return data.access_token as string;
};

const findMeetLink = (event: any) => {
  const entryPoints = event?.conferenceData?.entryPoints || [];
  const videoEntry = entryPoints.find((entry: any) => entry.entryPointType === 'video' && typeof entry.uri === 'string');
  return videoEntry?.uri || null;
};

const fetchEvent = async (accessToken: string, calendarId: string, eventId: string) => {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?conferenceDataVersion=1`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) return null;
  return response.json();
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    await authorizeRecruitmentRequest(req);
    const body = req.body || {};
    const applicant = body.applicant || {};
    const panel = Array.isArray(body.panel) ? body.panel : [];
    const attendeeEmails = Array.from(new Set((body.attendeeEmails || [])
      .filter((email: unknown): email is string => typeof email === 'string' && email.includes('@'))));
    const startAt = new Date(body.startAt);
    const endAt = new Date(body.endAt);
    if (!applicant.email || !body.position || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
      throw Object.assign(new Error('Applicant, position, start time, and end time are required.'), { statusCode: 400 });
    }

    const accessToken = await getAccessToken();
    const calendarId = getEnv('GOOGLE_CALENDAR_ID') || 'primary';
    const isVirtual = body.interviewType === 'Virtual';
    const panelNames = panel.map((person: any) => person.name).filter(Boolean).join(', ') || 'Interview panel';
    const meetRequested = isVirtual && body.generateMeet !== false;
    const eventBody: any = {
      summary: `Interview: ${applicant.firstName || applicant.name} — ${body.position}`,
      description: [
        `Applicant: ${applicant.name || applicant.email}`,
        `Position: ${body.position}`,
        `Business Unit: ${body.businessUnit || 'TNG HRIS'}`,
        `Interview Type: ${body.interviewType || 'Interview'}`,
        `Panel: ${panelNames}`,
        isVirtual ? 'Google Meet: Added by Google Calendar conference creation.' : `Location: ${body.location || 'To be confirmed'}`,
      ].join('\n'),
      start: { dateTime: startAt.toISOString(), timeZone: body.timeZone || 'Asia/Manila' },
      end: { dateTime: endAt.toISOString(), timeZone: body.timeZone || 'Asia/Manila' },
      attendees: attendeeEmails.map((email: string) => ({ email })),
    };
    if (!isVirtual && body.location) eventBody.location = body.location;
    if (meetRequested) {
      eventBody.conferenceData = {
        createRequest: {
          requestId: `hris-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventBody),
      },
    );
    if (!response.ok) throw new Error(await readGoogleError(response, 'Unable to create Google Calendar event.'));

    let event = await response.json();
    let meetLink = findMeetLink(event);
    if (meetRequested && !meetLink && event.id) {
      // Google may return the event before the asynchronous conference request
      // is ready. Poll the event instead of inventing a meet.google.com URL.
      for (let attempt = 0; attempt < 5 && !meetLink; attempt += 1) {
        await delay(700);
        event = await fetchEvent(accessToken, calendarId, event.id) || event;
        meetLink = findMeetLink(event);
      }
    }

    const attendeeCount = attendeeEmails.length;
    const responseBody: any = {
      eventId: event.id,
      htmlLink: event.htmlLink,
      meetLink: meetLink || undefined,
      calendarInviteStatus: 'sent',
      applicantInviteStatus: attendeeEmails.includes(applicant.email) ? 'sent' : 'not_requested',
      panelInviteStatus: attendeeCount > (attendeeEmails.includes(applicant.email) ? 1 : 0) ? 'sent' : 'not_requested',
    };
    if (meetRequested && !meetLink) {
      responseBody.warning = 'Google Calendar event was created, but Meet link generation failed. Please retry or add a meeting link manually.';
    }
    res.status(200).json(responseBody);
  } catch (error: any) {
    console.error('Google Calendar interview scheduling failed', error);
    sendApiError(res, error, 'Unable to create Google Calendar event. Please check Google integration settings.');
  }
}
