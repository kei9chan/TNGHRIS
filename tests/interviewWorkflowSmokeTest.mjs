import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const scheduler = read('components/recruitment/InterviewSchedulerModal.tsx');
const calendarApi = read('supabase/functions/schedule-interview/index.ts');
const interviewService = read('services/recruitmentInterviewService.ts');
const detail = read('components/recruitment/InterviewDetailModal.tsx');
const month = read('components/recruitment/MonthView.tsx');
const week = read('components/recruitment/WeekView.tsx');
const day = read('components/recruitment/DayView.tsx');
const applicants = read('pages/recruitment/Applicants.tsx');
const rejection = read('components/recruitment/RejectionEmailModal.tsx');
const migration = read('supabase/migrations/20260822120000_interview_scheduling_workflow.sql');

assert.match(scheduler, /Search applicant by name, position, or email/);
assert.match(scheduler, /Filter applicants by business unit/);
assert.match(scheduler, /Filter applicants by stage/);
assert.match(scheduler, /Filter applicants by department/);
assert.match(scheduler, /selectedPanel\.map/);
assert.match(scheduler, /Generate a real Google Meet link/);

assert.match(calendarApi, /conferenceDataVersion=1&sendUpdates=all/);
assert.match(calendarApi, /conferenceData\s*=/);
assert.match(calendarApi, /conferenceSolutionKey:\s*\{\s*type:\s*'hangoutsMeet'/);
assert.match(calendarApi, /meetLinkFromEvent/);
assert.match(calendarApi, /validMeetLink/);
assert.doesNotMatch(calendarApi, /meet\.google\.com\/\$\{/);

assert.match(interviewService, /functions\.invoke\('schedule-interview'/);
assert.match(calendarApi, /google_meet_link:/);
assert.match(calendarApi, /calendar_invite_status:/);
assert.match(calendarApi, /panel_user_ids:/);

for (const view of [month, week, day]) {
  assert.match(view, /getInterviewLabel/);
  assert.match(view, /getInterviewTime/);
  assert.match(view, /onInterviewClick/);
}
assert.match(detail, /Join Google Meet/);
assert.match(detail, /Copy meeting link/);
assert.match(detail, /No valid meeting link generated/);
assert.match(detail, /Applicant calendar invite/);
assert.match(detail, /Panel calendar invites/);
assert.match(detail, /Confirmation email/);

assert.match(applicants, /Schedule Interview/);
assert.match(applicants, /Reject/);
assert.match(applicants, /openInterviewScheduler/);
assert.match(applicants, /openRejectionEmail/);
assert.match(rejection, /Update on Your Application/);
assert.match(rejection, /\/api\/recruitment-email/);
assert.match(rejection, /marked Rejected only after this email is sent successfully/);

for (const column of [
  'panel_user_ids',
  'calendar_event_id',
  'google_meet_link',
  'calendar_invite_status',
  'applicant_invite_status',
  'panel_invite_status',
  'confirmation_email_status',
  'rejected_at',
  'rejected_by',
  'rejection_reason',
]) {
  assert.match(migration, new RegExp(`add column if not exists ${column}`));
}

console.log('Interview workflow smoke test passed.');
