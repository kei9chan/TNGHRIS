alter table public.job_interviews
  add column if not exists google_calendar_link text;

create unique index if not exists job_interviews_calendar_event_id_unique
  on public.job_interviews (calendar_event_id)
  where calendar_event_id is not null;

create index if not exists job_interviews_google_calendar_link_idx
  on public.job_interviews (google_calendar_link);
