import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const scheduler = read('components/recruitment/InterviewSchedulerModal.tsx');
const service = read('services/recruitmentInterviewService.ts');
const calendar = read('supabase/functions/schedule-interview/index.ts');
const integrations = read('supabase/functions/interview-integrations/index.ts');
const migration = read('supabase/migrations/20260901180000_interview_meeting_provider_options.sql');
const idempotencyMigration = read('supabase/migrations/20260901180500_interview_calendar_idempotency.sql');
const detail = read('components/recruitment/InterviewDetailModal.tsx');

assert.match(scheduler, /grid-cols-1 gap-3 md:grid-cols-3/);
assert.match(scheduler, /aria-pressed=\{selectedProvider === card\.provider\}/);
assert.match(scheduler, /status\.zoom\.connected/);
assert.match(scheduler, /Zoom is not connected yet/);
assert.match(scheduler, /Create a Zoom meeting automatically/);
assert.match(scheduler, /Create Google Meet automatically/);
assert.match(scheduler, /Paste an existing meeting link/);
assert.match(scheduler, /placeholder="Paste Zoom, Google Meet, Teams, Webex, or another meeting link"/);
assert.match(scheduler, /Test Link/);
assert.doesNotMatch(scheduler, /Open\/Test Link/);
assert.doesNotMatch(scheduler, />Paste Link</);
assert.doesNotMatch(scheduler, />Clear Link</);
assert.match(scheduler, /Interview scheduled/);
assert.match(scheduler, /View Calendar Event/);
assert.match(scheduler, /Copy Meeting Link/);
assert.match(scheduler, /Open Meeting Link/);
assert.match(scheduler, /Retry Zoom/);
assert.match(scheduler, /Retry Calendar Invitation/);
assert.match(scheduler, /isHostOnlyZoomLink/);
assert.match(scheduler, /Custom Link/);
assert.match(scheduler, /current\.meetingProvider \|\| 'Custom'/);

assert.match(service, /meetingProvider: getProviderFromInterview/);
assert.match(service, /attendeeMeetingUrl/);
assert.match(service, /meetingLink:/);
assert.match(service, /fetchInterviewIntegrationStatus/);

assert.match(calendar, /provider === 'Zoom'/);
assert.match(calendar, /provider === 'Google Meet'/);
assert.match(calendar, /provider === 'Custom'/);
assert.match(calendar, /createCalendarEvent/);
assert.match(calendar, /zoomMeetingPayload/);
assert.match(calendar, /zoom_alternative_host_emails/);
assert.match(calendar, /attendeeMeetingUrl = meetLinkFromEvent/);
assert.match(calendar, /calendar_attendee_statuses/);
assert.match(calendar, /INTERVIEW_CANCELLED/);
assert.match(calendar, /previousMeetingLink/);
assert.match(calendar, /rescheduled/);
assert.match(calendar, /Zoom meeting could not be created\. You may retry or use a custom meeting link\./);
assert.match(calendar, /Google Calendar could not create the invitation/);
assert.match(calendar, /if \(!validMeetLink\(attendeeMeetingUrl\)/);
assert.match(calendar, /body\.createCalendarEvent !== false/);

assert.match(integrations, /ZOOM_ACCOUNT_ID/);
assert.match(integrations, /ZOOM_HOST_USER_ID/);
assert.match(integrations, /account_id/);
assert.match(integrations, /type \|\| 0/);
assert.doesNotMatch(integrations, /kay@thenextperience\.com/i);

for (const field of ['meeting_provider', 'attendee_meeting_url', 'zoom_meeting_id', 'custom_provider_name']) {
  assert.match(migration, new RegExp(field));
}
assert.match(detail, /calendarAttendeeStatuses/);
assert.match(detail, /Retry Calendar Invitation/);
assert.match(idempotencyMigration, /calendar_idempotency_key/);
assert.match(idempotencyMigration, /job_interviews_calendar_idempotency_key_unique/);

console.log('Interview meeting provider smoke test passed.');
