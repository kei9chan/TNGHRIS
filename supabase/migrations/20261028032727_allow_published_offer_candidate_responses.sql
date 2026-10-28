-- Store candidate signatures without treating response metadata as approved offer terms.
-- Keep all material-content checks, approval requirements, and existing grants.
create or replace function private.enforce_job_offer_workspace_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  material_changed boolean := false;
  mutable_detail_keys text[] := array['emailDelivery', 'welcomeEmail'];
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
      new.offer_expiration_date,
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
      old.offer_expiration_date,
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

