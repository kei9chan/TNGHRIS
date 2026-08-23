-- Keep the candidate response and final signed status in one database transaction.
-- Existing statuses and records remain valid; new signed responses use the explicit
-- candidate-facing status "Accepted and Signed".

alter table public.job_offers
  drop constraint if exists job_offers_status_check;

alter table public.job_offers
  add constraint job_offers_status_check
  check (status in (
    'Draft',
    'Sent',
    'Viewed',
    'Accepted',
    'Signed',
    'Accepted and Signed',
    'Declined',
    'Expired',
    'Converted'
  ));

create or replace function public.accept_and_sign_job_offer(
  p_offer_id uuid,
  p_signature_name text,
  p_signature_type text,
  p_signature_path text,
  p_responded_at timestamptz,
  p_offer_details jsonb
)
returns public.job_offers
language plpgsql
security invoker
set search_path = ''
as $$
declare
  accepted_offer public.job_offers;
begin
  update public.job_offers
  set status = 'Accepted and Signed',
      accepted_at = coalesce(accepted_at, p_responded_at),
      signed_at = p_responded_at,
      signature_name = p_signature_name,
      signature_type = p_signature_type,
      signature_path = p_signature_path,
      offer_details = p_offer_details,
      last_saved_at = p_responded_at
  where id = p_offer_id
    and status in ('Sent', 'Viewed')
  returning * into accepted_offer;

  -- Make duplicate browser submissions idempotent without creating another response.
  if accepted_offer.id is null then
    select * into accepted_offer
    from public.job_offers
    where id = p_offer_id
      and status in ('Signed', 'Accepted and Signed');
  end if;

  if accepted_offer.id is null then
    raise exception 'This offer has already been answered.' using errcode = 'P0001';
  end if;

  return accepted_offer;
end;
$$;

revoke all on function public.accept_and_sign_job_offer(uuid, text, text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.accept_and_sign_job_offer(uuid, text, text, text, timestamptz, jsonb) to service_role;
