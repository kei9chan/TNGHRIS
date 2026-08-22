-- Premium offer builder: keep the existing job_offers record and status flow,
-- while storing the richer editor document as an additive JSON payload.

alter table public.job_offers
  add column if not exists offer_details jsonb not null default '{}'::jsonb,
  add column if not exists draft_step smallint not null default 1,
  add column if not exists offer_expiration_date date,
  add column if not exists logo_url text,
  add column if not exists logo_path text,
  add column if not exists last_saved_at timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists sent_by_user_id uuid references public.hris_users(id) on delete set null,
  add column if not exists recipient_email text,
  add column if not exists email_subject text,
  add column if not exists email_message text,
  add column if not exists secure_token uuid not null default gen_random_uuid(),
  add column if not exists revision integer not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'job_offers_draft_step_check'
      and conrelid = 'public.job_offers'::regclass
  ) then
    alter table public.job_offers
      add constraint job_offers_draft_step_check check (draft_step between 1 and 5);
  end if;
end $$;

create unique index if not exists job_offers_secure_token_idx
  on public.job_offers (secure_token);

create table if not exists public.job_offer_history (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.job_offers(id) on delete cascade,
  action text not null,
  status text,
  revision integer not null,
  snapshot jsonb not null default '{}'::jsonb,
  changed_by_user_id uuid references public.hris_users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists job_offer_history_offer_changed_idx
  on public.job_offer_history (offer_id, changed_at desc);

alter table public.job_offer_history enable row level security;
grant select on public.job_offer_history to authenticated;

drop policy if exists "offer_history_hr_admin_read" on public.job_offer_history;
create policy "offer_history_hr_admin_read"
  on public.job_offer_history for select to authenticated
  using (is_hr_or_admin());

create or replace function public.bump_job_offer_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.revision := old.revision + 1;
  return new;
end;
$$;

create or replace function public.capture_job_offer_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    insert into public.job_offer_history (
      offer_id, action, status, revision, snapshot, changed_by_user_id
    ) values (
      old.id,
      case when old.status is distinct from new.status then 'STATUS_CHANGE' else 'EDIT' end,
      new.status,
      new.revision,
      to_jsonb(new),
      new.sent_by_user_id
    );
  elsif tg_op = 'INSERT' then
    insert into public.job_offer_history (
      offer_id, action, status, revision, snapshot, changed_by_user_id
    ) values (
      new.id, 'CREATE', new.status, new.revision, to_jsonb(new), new.created_by_user_id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists capture_job_offer_history_trigger on public.job_offers;
drop trigger if exists bump_job_offer_revision_trigger on public.job_offers;
create trigger bump_job_offer_revision_trigger
  before update on public.job_offers
  for each row execute function public.bump_job_offer_revision();

create trigger capture_job_offer_history_trigger
  after insert or update on public.job_offers
  for each row execute function public.capture_job_offer_history();

-- Trigger functions are internal implementation details, not public RPCs.
revoke all on function public.bump_job_offer_revision() from public, anon, authenticated;
revoke all on function public.capture_job_offer_history() from public, anon, authenticated;

-- Isolated private bucket for offer branding. Candidate-facing pages receive a
-- short-lived signed URL from the server; bucket contents are never public.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'offer-assets',
  'offer-assets',
  false,
  2097152,
  array['image/png', 'image/jpeg', 'image/svg+xml']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Recruitment users can upload offer assets" on storage.objects;
create policy "Recruitment users can upload offer assets"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'offer-assets' and is_hr_or_admin());

drop policy if exists "Recruitment users can update offer assets" on storage.objects;
create policy "Recruitment users can update offer assets"
  on storage.objects for update to authenticated
  using (bucket_id = 'offer-assets' and is_hr_or_admin())
  with check (bucket_id = 'offer-assets' and is_hr_or_admin());

drop policy if exists "Recruitment users can delete offer assets" on storage.objects;
create policy "Recruitment users can delete offer assets"
  on storage.objects for delete to authenticated
  using (bucket_id = 'offer-assets' and is_hr_or_admin());

drop policy if exists "Recruitment users can read offer assets" on storage.objects;
create policy "Recruitment users can read offer assets"
  on storage.objects for select to authenticated
  using (bucket_id = 'offer-assets' and is_hr_or_admin());

comment on column public.job_offers.offer_details is
  'Structured value-first offer builder document. Existing scalar columns remain canonical for legacy consumers.';
comment on column public.job_offers.secure_token is
  'Opaque identifier used by the candidate-facing offer route; never use sequential offer IDs in shared links.';
