import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20260824020000_followups_benefits_correspondence_announcements.sql');
const incidentPage = read('pages/feedback/MyIncidentReports.tsx');
const incidentService = read('services/incidentReportService.ts');
const ticketsPage = read('pages/helpdesk/Tickets.tsx');
const ticketService = read('services/ticketService.ts');
const contracts = read('pages/employees/Contracts.tsx');
const envelopeDrawer = read('components/contracts/EnvelopeCreationDrawer.tsx');
const announcements = read('pages/helpdesk/Announcements.tsx');
const announcementService = read('services/announcementService.ts');
const recipientModal = read('components/helpdesk/AnnouncementRecipientStatusModal.tsx');

assert.match(migration, /follow_up_incident_report/);
assert.match(migration, /follow_up_ticket/);
assert.match(migration, /interval '12 hours'/, 'follow-ups need a server-enforced cooldown');
assert.match(migration, /insert into public\.audit_logs/i, 'follow-ups and reminders need audit records');
assert.match(migration, /'Employee', 'Benefits', array\['view', 'create', 'submit'\]/, 'rank-and-file employees need Benefits access');
assert.match(migration, /employee_correspondence_attachments/, 'correspondence bucket is missing');
assert.match(migration, /announcement_recipients/, 'normalized recipient tracking is missing');
assert.match(migration, /announcements_sync_recipients/, 'announcement notification trigger is missing');
assert.match(migration, /revoke all on function public\.send_announcement_reminders/, 'reminder RPC must be locked down');
assert.doesNotMatch(migration, /drop\s+table/i, 'migration must remain additive');

assert.match(incidentPage, /handleFollowUp/);
assert.match(incidentService, /follow_up_incident_report/);
assert.match(ticketsPage, /handleFollowUpTicket/);
assert.match(ticketService, /follow_up_ticket/);
assert.match(contracts, /attachments:/);
assert.match(envelopeDrawer, /employee_correspondence_attachments/);
assert.match(announcements, /markAnnouncementRead/);
assert.match(announcementService, /send_announcement_reminders/);
assert.match(recipientModal, /Remind All Outstanding/);
assert.match(recipientModal, /Read — Awaiting Acknowledgement/);

console.log('Follow-up, Benefits, correspondence, and announcement smoke tests passed.');
