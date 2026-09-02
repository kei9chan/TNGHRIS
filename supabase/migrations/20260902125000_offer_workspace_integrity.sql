-- Keep the existing offer records and approval workflow, while preventing new
-- duplicate active offers and direct publication of unapproved drafts.

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
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_job_offer_workspace_integrity() from public, anon, authenticated;

drop trigger if exists enforce_job_offer_workspace_integrity on public.job_offers;
create trigger enforce_job_offer_workspace_integrity
before insert or update on public.job_offers
for each row execute function private.enforce_job_offer_workspace_integrity();

comment on function private.enforce_job_offer_workspace_integrity() is
  'Preserves historical offers while preventing new active duplicates and unapproved Draft-to-Sent transitions.';
