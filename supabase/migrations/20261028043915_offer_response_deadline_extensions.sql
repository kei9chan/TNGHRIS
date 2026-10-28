-- Let authorized offer managers extend unsigned response deadlines using the existing offer link.
-- Preserve all other approved terms and the server-only candidate-response exception.
create or replace function private.enforce_job_offer_workspace_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  material_changed boolean := false;
  mutable_detail_keys text[] := array['emailDelivery', 'welcomeEmail'];
  deadline_extension boolean := false;
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
    deadline_extension := public.current_hris_user_id() is not null
      and public.has_recruitment_admin_access()
      and public.has_feature_permission('Offers', 'manage')
      and old.approval_status = 'Approved'
      and new.approval_status = old.approval_status
      and new.approval_request_id is not distinct from old.approval_request_id
      and old.status in ('Draft', 'Sent', 'Viewed', 'Expired')
      and (new.status = old.status or (old.status = 'Expired' and new.status = case when old.viewed_at is null then 'Sent' else 'Viewed' end))
      and old.accepted_at is null and new.accepted_at is null
      and old.signed_at is null and new.signed_at is null
      and old.offer_expiration_date is not null
      and new.offer_expiration_date > old.offer_expiration_date
      and new.offer_expiration_date >= (now() at time zone 'Asia/Manila')::date;
    -- Candidate responses and notification results are written only by the
    -- token-validated server endpoint. Client roles cannot edit these records.
    if current_setting('role', true) = 'service_role' then
      mutable_detail_keys := mutable_detail_keys || array['candidateResponse', 'hrAcceptanceEmails'];
    end if;
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
      case when deadline_extension then null else new.offer_expiration_date end,
      new.require_signature,
      new.offer_template_id,
      new.offer_template_snapshot,
      new.offer_details - mutable_detail_keys
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
      case when deadline_extension then null else old.offer_expiration_date end,
      old.require_signature,
      old.offer_template_id,
      old.offer_template_snapshot,
      old.offer_details - mutable_detail_keys
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
    elsif old.status in ('Sent', 'Viewed', 'Accepted', 'Signed', 'Accepted and Signed', 'Converted', 'Expired')
      and (material_changed or new.status = 'Draft') then
      raise exception 'Published offer content is immutable. Create a revised version instead.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_job_offer_workspace_integrity() from public, anon, authenticated;


create or replace function private.guard_job_offer_send_requires_approved_requisition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requisition_status text;
begin
  if old.status is distinct from new.status and new.status = 'Sent' then
    if old.status <> 'Draft' and not (
      old.status = 'Expired' and old.sent_at is not null
      and old.accepted_at is null and old.signed_at is null
      and old.approval_status = 'Approved'
      and public.current_hris_user_id() is not null
      and public.has_recruitment_admin_access()
      and public.has_feature_permission('Offers', 'manage')
      and new.offer_expiration_date > old.offer_expiration_date
      and new.offer_expiration_date >= (now() at time zone 'Asia/Manila')::date
    ) then
      raise exception 'Only a draft offer can be sent. Create a new offer revision to send again.' using errcode = '23514';
    end if;
    if new.approval_status is distinct from 'Approved' then
      raise exception 'The offer must complete its existing approval workflow before it can be sent.' using errcode = '42501';
    end if;
    if new.job_requisition_id is null
       or new.job_requisition_snapshot->>'id' is distinct from new.job_requisition_id::text
       or lower(coalesce(new.job_requisition_snapshot->>'status', '')) <> 'approved' then
      raise exception 'The offer must include a matching snapshot of an approved Job Order.' using errcode = '23514';
    end if;
    select lower(r.status::text) into requisition_status
    from public.job_requisitions r
    where r.id = new.job_requisition_id;
    if requisition_status is distinct from 'approved' then
      raise exception 'The linked Job Order is no longer approved. No offer was sent.' using errcode = '23514';
    end if;
  end if;
  return new;
end
$$;
revoke all on function private.guard_job_offer_send_requires_approved_requisition() from public, anon, authenticated;

-- Uses the caller's existing SELECT/UPDATE policies; never bypasses offer scope.
create or replace function public.extend_job_offer_deadline(p_offer_id uuid, p_deadline date, p_revision integer)
returns public.job_offers
language plpgsql security invoker set search_path = '' as $$
declare
  prior_offer public.job_offers;
  updated_offer public.job_offers;
begin
  if public.current_hris_user_id() is null
    or not public.has_recruitment_admin_access()
    or not public.has_feature_permission('Offers', 'manage') then
    raise exception 'You do not have permission to extend offer deadlines.' using errcode = '42501';
  end if;
  select * into prior_offer from public.job_offers where id = p_offer_id for update;
  if not found then raise exception 'Offer not found or not accessible.' using errcode = 'P0002'; end if;
  if prior_offer.revision is distinct from p_revision then
    raise exception 'This offer changed. Refresh it before extending the deadline.' using errcode = 'PT409';
  end if;
  if prior_offer.approval_status is distinct from 'Approved'
    or prior_offer.status not in ('Draft','Sent','Viewed','Expired')
    or prior_offer.signed_at is not null or prior_offer.accepted_at is not null then
    raise exception 'Only an approved offer awaiting a candidate response can be extended.' using errcode = '22023';
  end if;
  if p_deadline is null or prior_offer.offer_expiration_date is null
    or p_deadline <= prior_offer.offer_expiration_date
    or p_deadline < (now() at time zone 'Asia/Manila')::date then
    raise exception 'Choose a future date later than the current response deadline.' using errcode = '22023';
  end if;
  update public.job_offers set offer_expiration_date = p_deadline,
    status = case when status = 'Expired' then case when viewed_at is null then 'Sent' else 'Viewed' end else status end,
    last_saved_at = now()
  where id = p_offer_id returning * into updated_offer;
  return updated_offer;
end;
$$;
revoke all on function public.extend_job_offer_deadline(uuid,date,integer) from public, anon;
grant execute on function public.extend_job_offer_deadline(uuid,date,integer) to authenticated;
