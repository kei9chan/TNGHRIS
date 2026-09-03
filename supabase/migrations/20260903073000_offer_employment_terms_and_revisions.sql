-- Additive offer fields and an explicit revision path. Existing offer rows,
-- tokens, approvals, history, and RLS policies remain unchanged.
-- Safe rollback: deploy the previous application, revoke/drop
-- public.create_job_offer_revision(uuid), and leave the additive columns in
-- place so no offer data is discarded. The optional index and check constraint
-- can then be dropped in a short maintenance transaction if required.

alter table public.job_offers
  add column if not exists employment_type_custom_name text,
  add column if not exists employment_end_date date,
  add column if not exists supersedes_offer_id uuid references public.job_offers(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'job_offers_employment_end_after_start_check'
      and conrelid = 'public.job_offers'::regclass
  ) then
    alter table public.job_offers
      add constraint job_offers_employment_end_after_start_check
      check (employment_end_date is null or employment_end_date > start_date)
      not valid;
  end if;
end $$;

alter table public.job_offers
  validate constraint job_offers_employment_end_after_start_check;

create index if not exists job_offers_supersedes_offer_idx
  on public.job_offers (supersedes_offer_id)
  where supersedes_offer_id is not null;

create or replace function private.enforce_job_offer_workspace_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  material_changed boolean := false;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.application_id::text, 0));

  if tg_op = 'INSERT'
    or new.application_id is distinct from old.application_id
    or (old.status in ('Declined', 'Expired') and new.status in ('Draft', 'Sent', 'Viewed', 'Accepted', 'Signed', 'Accepted and Signed', 'Converted')) then
    if exists (
      select 1
      from public.job_offers existing
      where existing.application_id = new.application_id
        and existing.id is distinct from new.id
        and existing.status in ('Draft', 'Sent', 'Viewed', 'Accepted', 'Signed', 'Accepted and Signed', 'Converted')
    ) then
      raise exception 'This application already has a current offer. Open the existing offer instead.'
        using errcode = '23505';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    material_changed := row(
      new.application_id,
      new.base_pay,
      new.allowance_json,
      new.start_date,
      new.probation_months,
      new.employment_type,
      new.employment_type_custom_name,
      new.employment_end_date,
      new.reporting_to,
      new.job_description,
      new.offer_expiration_date,
      new.require_signature,
      new.offer_template_id,
      new.offer_template_snapshot,
      new.offer_details - 'emailDelivery' - 'welcomeEmail'
    ) is distinct from row(
      old.application_id,
      old.base_pay,
      old.allowance_json,
      old.start_date,
      old.probation_months,
      old.employment_type,
      old.employment_type_custom_name,
      old.employment_end_date,
      old.reporting_to,
      old.job_description,
      old.offer_expiration_date,
      old.require_signature,
      old.offer_template_id,
      old.offer_template_snapshot,
      old.offer_details - 'emailDelivery' - 'welcomeEmail'
    );

    if old.status = 'Draft' and new.status = 'Sent' then
      if old.approval_status <> 'Approved' then
        raise exception 'This offer must complete the approval workflow before it can be sent.'
          using errcode = '42501';
      end if;
      if material_changed then
        raise exception 'This offer changed after approval. Save it as a draft and request approval again.'
          using errcode = '42501';
      end if;
    elsif old.status = 'Draft' and new.status = 'Draft'
      and old.approval_status = 'Approved' and material_changed then
      new.approval_status := 'Not Requested';
      new.approval_request_id := null;
    elsif old.status in ('Sent', 'Viewed', 'Accepted', 'Signed', 'Accepted and Signed', 'Converted')
      and (material_changed or new.status = 'Draft') then
      raise exception 'Published offer content is immutable. Create a revised version instead.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_job_offer_workspace_integrity() from public, anon, authenticated;

create or replace function public.create_job_offer_revision(p_offer_id uuid)
returns public.job_offers
language plpgsql
security invoker
set search_path = ''
as $$
declare
  prior_offer public.job_offers%rowtype;
  revised_offer public.job_offers%rowtype;
  actor_id uuid := public.current_hris_user_id();
  next_revision integer;
  base_offer_number text;
begin
  if actor_id is null then
    raise exception 'An authenticated HRIS user is required.' using errcode = '42501';
  end if;

  select *
  into prior_offer
  from public.job_offers
  where id = p_offer_id
  for update;

  if not found then
    raise exception 'Offer not found or not accessible.' using errcode = 'P0002';
  end if;

  if prior_offer.status not in ('Sent', 'Viewed') then
    raise exception 'Only a sent or viewed offer awaiting a candidate response can be revised.' using errcode = '22023';
  end if;

  update public.job_offers
  set status = 'Expired',
      last_saved_at = now(),
      updated_at = now()
  where id = prior_offer.id
  returning * into prior_offer;

  next_revision := greatest(prior_offer.revision, 2);
  base_offer_number := regexp_replace(prior_offer.offer_number, '-R[0-9]+$', '');

  insert into public.job_offers (
    application_id,
    offer_number,
    base_pay,
    allowance_json,
    start_date,
    probation_months,
    employment_type,
    status,
    reporting_to,
    job_description,
    created_by_user_id,
    offer_details,
    draft_step,
    offer_expiration_date,
    logo_url,
    logo_path,
    last_saved_at,
    recipient_email,
    email_subject,
    email_message,
    revision,
    require_signature,
    offer_template_id,
    offer_template_name,
    offer_template_snapshot,
    approval_status,
    approval_request_id,
    employment_type_custom_name,
    employment_end_date,
    supersedes_offer_id
  ) values (
    prior_offer.application_id,
    base_offer_number || '-R' || next_revision::text,
    prior_offer.base_pay,
    prior_offer.allowance_json,
    prior_offer.start_date,
    prior_offer.probation_months,
    prior_offer.employment_type,
    'Draft',
    prior_offer.reporting_to,
    prior_offer.job_description,
    actor_id,
    prior_offer.offer_details - 'candidateResponse' - 'emailDelivery' - 'welcomeEmail',
    prior_offer.draft_step,
    prior_offer.offer_expiration_date,
    prior_offer.logo_url,
    prior_offer.logo_path,
    now(),
    prior_offer.recipient_email,
    prior_offer.email_subject,
    prior_offer.email_message,
    next_revision,
    prior_offer.require_signature,
    prior_offer.offer_template_id,
    prior_offer.offer_template_name,
    prior_offer.offer_template_snapshot,
    'Not Requested',
    null,
    prior_offer.employment_type_custom_name,
    prior_offer.employment_end_date,
    prior_offer.id
  )
  returning * into revised_offer;

  return revised_offer;
end;
$$;

revoke all on function public.create_job_offer_revision(uuid) from public, anon;
grant execute on function public.create_job_offer_revision(uuid) to authenticated;

comment on function public.create_job_offer_revision(uuid) is
  'Creates a new draft with a new secure token while preserving and expiring the previously published offer. Runs with the caller RLS permissions.';

comment on column public.job_offers.employment_end_date is
  'Employment term end date. Separate from the candidate offer acceptance deadline.';

comment on column public.job_offers.supersedes_offer_id is
  'Prior published offer retained for version history when this row is a revised draft.';
