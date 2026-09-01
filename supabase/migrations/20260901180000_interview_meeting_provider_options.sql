-- Additive interview-provider metadata.
-- Existing interview rows, calendar events, invite history, and RSVP data are
-- preserved.  The scheduler writes the attendee URL separately from provider
-- metadata so host/start URLs are never exposed as candidate-facing links.

alter table public.job_interviews
  add column if not exists meeting_provider text,
  add column if not exists attendee_meeting_url text,
  add column if not exists zoom_meeting_id text,
  add column if not exists zoom_host_user_id text,
  add column if not exists zoom_host_email text,
  add column if not exists zoom_alternative_host_emails text[] not null default '{}',
  add column if not exists custom_provider_name text,
  add column if not exists integration_status jsonb not null default '{}'::jsonb,
  add column if not exists calendar_attendee_statuses jsonb not null default '[]'::jsonb,
  add column if not exists interview_round text not null default 'Round 1',
  add column if not exists created_by_user_id uuid,
  add column if not exists updated_by_user_id uuid,
  add column if not exists updated_at timestamptz,
  add column if not exists calendar_idempotency_key text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'job_interviews_meeting_provider_check'
      and conrelid = 'public.job_interviews'::regclass
  ) then
    alter table public.job_interviews
      add constraint job_interviews_meeting_provider_check
      check (meeting_provider is null or meeting_provider in ('Zoom', 'Google Meet', 'Custom'));
  end if;
end
$$;

-- Backfill only missing metadata.  Existing Google Meet rows retain their
-- original event ID, link, location, timestamps, and invite statuses.
update public.job_interviews
set meeting_provider = 'Google Meet',
    attendee_meeting_url = coalesce(attendee_meeting_url, google_meet_link),
    integration_status = case when integration_status = '{}'::jsonb then '{"provider":"Google Meet","state":"created","source":"legacy"}'::jsonb else integration_status end
where meeting_provider is null
  and google_meet_link is not null;

update public.job_interviews
set meeting_provider = 'Google Meet',
    attendee_meeting_url = coalesce(attendee_meeting_url, location),
    integration_status = case when integration_status = '{}'::jsonb then '{"provider":"Google Meet","state":"created","source":"legacy"}'::jsonb else integration_status end
where meeting_provider is null
  and location ilike 'https://meet.google.com/%';

update public.job_interviews
set meeting_provider = 'Custom',
    attendee_meeting_url = coalesce(attendee_meeting_url, location),
    custom_provider_name = coalesce(custom_provider_name, 'Other'),
    integration_status = case when integration_status = '{}'::jsonb then '{"provider":"Custom","state":"created","source":"legacy"}'::jsonb else integration_status end
where meeting_provider is null
  and location ilike 'https://%';

update public.job_interviews
set interview_round = coalesce(nullif(interview_round, ''), 'Round 1'),
    updated_at = coalesce(updated_at, created_at, now())
where interview_round is null
   or interview_round = ''
   or updated_at is null;

create index if not exists job_interviews_meeting_provider_idx
  on public.job_interviews (meeting_provider);

create index if not exists job_interviews_zoom_meeting_id_idx
  on public.job_interviews (zoom_meeting_id)
  where zoom_meeting_id is not null;

create unique index if not exists job_interviews_calendar_idempotency_key_unique
  on public.job_interviews (calendar_idempotency_key)
  where calendar_idempotency_key is not null;

comment on column public.job_interviews.attendee_meeting_url is
  'Candidate/panel join URL only; never store a Zoom host/start URL here.';

comment on column public.job_interviews.integration_status is
  'Non-secret provider integration outcome, including connection and calendar retry state.';
