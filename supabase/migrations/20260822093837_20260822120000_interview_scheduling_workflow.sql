-- Source-control copy of the additive interview scheduling migration already
-- applied to the production project as version 20260822093837.

alter table public.job_interviews
  add column if not exists panel_user_ids uuid[] not null default '{}'::uuid[],
  add column if not exists calendar_event_id text,
  add column if not exists google_meet_link text,
  add column if not exists calendar_invite_status text not null default 'not_requested',
  add column if not exists applicant_invite_status text not null default 'not_requested',
  add column if not exists panel_invite_status text not null default 'not_requested',
  add column if not exists confirmation_email_status text not null default 'not_requested',
  add column if not exists applicant_invite_sent_at timestamptz,
  add column if not exists panel_invite_sent_at timestamptz,
  add column if not exists confirmation_email_sent_at timestamptz,
  add column if not exists calendar_error text;

create index if not exists job_interviews_calendar_event_id_idx
  on public.job_interviews (calendar_event_id);

create index if not exists job_interviews_google_meet_link_idx
  on public.job_interviews (google_meet_link);
