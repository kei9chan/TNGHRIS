-- Protect schedule retries from creating a second Calendar event or meeting
-- when a browser/network response is lost. This is additive and nullable for
-- all existing interviews.

alter table public.job_interviews
  add column if not exists calendar_idempotency_key text;

create unique index if not exists job_interviews_calendar_idempotency_key_unique
  on public.job_interviews (calendar_idempotency_key)
  where calendar_idempotency_key is not null;
