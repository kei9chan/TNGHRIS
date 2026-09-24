-- Isolate payroll-debt storage checks, persist BU logos, and keep each of the
-- four HRIS workflows inside its own data and authorization boundary.

-- A storage policy is evaluated for every object query, so a payroll-only
-- SELECT policy must not issue a caller-privileged SELECT against payroll_debts.
create or replace function private.payroll_debt_document_read_allowed(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_hris_user_id() is not null and exists (
    select 1
    from public.payroll_debts d
    where d.document_path = p_object_name
      and (
        private.payroll_debt_manager(d.scope_id)
        or (
          d.employee_id = public.current_hris_user_id()
          and d.status = any(array['Active','Paused','Completed']::text[])
        )
        or private.payroll_debt_oversight_view(d.scope_id)
      )
  )
$$;

create or replace function private.payroll_nte_atd_read_allowed(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_hris_user_id() is not null and exists (
    select 1
    from public.payroll_debts d
    join public.payroll_nte_atd_versions v on v.debt_id = d.id
    where d.id::text = (storage.foldername(p_object_name))[1]
      and (
        public.current_hris_user_id() = d.employee_id
        or private.payroll_nte_hr(d.scope_id)
        or private.payroll_nte_finance(d.scope_id)
      )
  )
$$;

revoke all on function private.payroll_debt_document_read_allowed(text) from public, anon, authenticated;
revoke all on function private.payroll_nte_atd_read_allowed(text) from public, anon, authenticated;
grant execute on function private.payroll_debt_document_read_allowed(text) to authenticated;
grant execute on function private.payroll_nte_atd_read_allowed(text) to authenticated;

drop policy if exists payroll_debt_document_read on storage.objects;
create policy payroll_debt_document_read on storage.objects
for select to authenticated
using (case when bucket_id = 'payroll-debt-documents' then private.payroll_debt_document_read_allowed(name) else false end);

drop policy if exists payroll_debt_document_oversight_read on storage.objects;
-- Oversight is included in the same SECURITY DEFINER check, with the bucket
-- still fixed to debt documents and the record path fixed to the stored key.

drop policy if exists payroll_nte_atd_read on storage.objects;
create policy payroll_nte_atd_read on storage.objects
for select to authenticated
using (case when bucket_id = 'payroll-nte-atd' then private.payroll_nte_atd_read_allowed(name) else false end);

-- Incident filing writes only the incident row and its evidence metadata. This
-- AFTER trigger is in the same transaction as the insert, so audit failure
-- rolls the report insert back as well.
create or replace function private.audit_incident_report_creation_attachments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := coalesce(public.current_hris_user_id(), new.reported_by);
  evidence jsonb := coalesce(new.attachment_urls, '[]'::jsonb);
begin
  if jsonb_typeof(evidence) <> 'array' then
    evidence := '[]'::jsonb;
  end if;
  if new.attachment_url is not null and not exists (
    select 1 from jsonb_array_elements(evidence) item
    where coalesce(item->>'path', item->>'url', item->>'href', item#>>'{}') = new.attachment_url
  ) then
    evidence := evidence || jsonb_build_array(jsonb_build_object(
      'path', new.attachment_url,
      'name', regexp_replace(new.attachment_url, '^.*/', '')
    ));
  end if;
  if new.signature_data_url is not null then
    evidence := evidence || jsonb_build_array(jsonb_build_object(
      'path', new.signature_data_url,
      'name', 'Reporter signature'
    ));
  end if;

  insert into public.audit_logs(user_id, action, entity, entity_id, details)
  values (
    actor::text,
    'INCIDENT_REPORT_CREATED',
    'IncidentReport',
    new.id::text,
    jsonb_build_object(
      'actorId', actor,
      'createdAt', coalesce(new.created_at, clock_timestamp()),
      'caseNumber', new.case_number,
      'status', new.status,
      'attachments', evidence
    )::text
  );
  return new;
end
$$;

drop trigger if exists audit_incident_report_creation_attachments on public.incident_reports;
create trigger audit_incident_report_creation_attachments
after insert on public.incident_reports
for each row execute function private.audit_incident_report_creation_attachments();

revoke all on function private.audit_incident_report_creation_attachments() from public, anon, authenticated;

-- Stable business-unit logo records are independent from temporary offers.
create table if not exists public.business_unit_logos (
  business_unit_id uuid primary key references public.business_units(id) on delete cascade,
  logo_path text,
  logo_url text,
  is_removed boolean not null default false,
  updated_by uuid references public.hris_users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.business_unit_logos add column if not exists is_removed boolean not null default false;
alter table public.business_unit_logos drop constraint if exists business_unit_logo_has_source;
alter table public.business_unit_logos add constraint business_unit_logo_has_source
  check (is_removed or logo_path is not null or logo_url is not null);

insert into public.business_unit_logos(business_unit_id, logo_url, updated_at)
select distinct on (t.business_unit_id) t.business_unit_id, t.logo_url, coalesce(t.updated_at, now())
from public.applicant_page_themes t
where t.business_unit_id is not null and nullif(btrim(t.logo_url), '') is not null
order by t.business_unit_id, t.updated_at desc nulls last
on conflict (business_unit_id) do nothing;

alter table public.business_unit_logos enable row level security;
revoke all on public.business_unit_logos from anon, authenticated;
grant select, insert, update, delete on public.business_unit_logos to authenticated;

drop policy if exists business_unit_logos_recruitment_read on public.business_unit_logos;
create policy business_unit_logos_recruitment_read on public.business_unit_logos
for select to authenticated using (public.has_recruitment_admin_access());

drop policy if exists business_unit_logos_hr_admin_manage on public.business_unit_logos;
create policy business_unit_logos_hr_admin_manage on public.business_unit_logos
for all to authenticated
using (public.has_recruitment_admin_access())
with check (
  public.has_recruitment_admin_access()
  and exists (select 1 from public.business_units b where b.id = business_unit_id)
);

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'business-unit-logos',
  'business-unit-logos',
  true,
  2097152,
  array['image/png','image/jpeg','image/webp','image/svg+xml']
)
on conflict (id) do update set
  name = excluded.name,
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists business_unit_logos_storage_insert on storage.objects;
create policy business_unit_logos_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'business-unit-logos'
  and name ~ '^business-units/[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|jpeg|webp|svg)$'
  and public.has_recruitment_admin_access()
);

drop policy if exists business_unit_logos_storage_update on storage.objects;
create policy business_unit_logos_storage_update on storage.objects
for update to authenticated
using (bucket_id = 'business-unit-logos' and public.has_recruitment_admin_access())
with check (
  bucket_id = 'business-unit-logos'
  and name ~ '^business-units/[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|jpeg|webp|svg)$'
  and public.has_recruitment_admin_access()
);

drop policy if exists business_unit_logos_storage_delete on storage.objects;
create policy business_unit_logos_storage_delete on storage.objects
for delete to authenticated
using (bucket_id = 'business-unit-logos' and public.has_recruitment_admin_access());

-- Offers keep the approved Job Order identity and a generation-time snapshot.
alter table public.job_offers
  add column if not exists job_requisition_id uuid references public.job_requisitions(id) on delete set null,
  add column if not exists job_requisition_snapshot jsonb not null default '{}'::jsonb;

update public.job_offers o
set job_requisition_id = a.requisition_id,
    job_requisition_snapshot = jsonb_build_object(
      'id', r.id,
      'reference', r.req_code,
      'title', r.title,
      'status', r.status,
      'businessUnitId', r.business_unit_id,
      'departmentId', r.department_id,
      'headcount', r.headcount,
      'employmentType', r.employment_type,
      'workLocation', r.work_location,
      'capturedAt', coalesce(o.created_at, now())
    )
from public.job_applications a
join public.job_requisitions r on r.id = a.requisition_id
where a.id = o.application_id
  and (o.job_requisition_id is null or o.job_requisition_snapshot = '{}'::jsonb);

create or replace function private.capture_job_offer_requisition_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requisition public.job_requisitions%rowtype;
  requisition_id uuid;
begin
  if new.job_requisition_id is null and new.application_id is not null then
    select a.requisition_id into requisition_id
    from public.job_applications a where a.id = new.application_id;
    new.job_requisition_id := requisition_id;
  end if;
  if new.job_requisition_id is not null and coalesce(new.job_requisition_snapshot, '{}'::jsonb) = '{}'::jsonb then
    select * into requisition from public.job_requisitions r where r.id = new.job_requisition_id;
    if found then
      new.job_requisition_snapshot := jsonb_build_object(
        'id', requisition.id,
        'reference', requisition.req_code,
        'title', requisition.title,
        'status', requisition.status,
        'businessUnitId', requisition.business_unit_id,
        'departmentId', requisition.department_id,
        'headcount', requisition.headcount,
        'employmentType', requisition.employment_type,
        'workLocation', requisition.work_location,
        'capturedAt', clock_timestamp()
      );
    end if;
  end if;
  return new;
end
$$;

create or replace function private.guard_published_offer_requisition_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status in ('Sent','Viewed','Accepted','Signed','Accepted and Signed','Converted')
     and (
       new.job_requisition_id is distinct from old.job_requisition_id
       or new.job_requisition_snapshot is distinct from old.job_requisition_snapshot
     ) then
    raise exception 'The Job Order snapshot on a published offer is immutable. Create a revised offer from an approved Job Order.' using errcode = '42501';
  end if;
  return new;
end
$$;

revoke all on function private.capture_job_offer_requisition_snapshot() from public, anon, authenticated;
revoke all on function private.guard_published_offer_requisition_snapshot() from public, anon, authenticated;
drop trigger if exists capture_job_offer_requisition_snapshot on public.job_offers;
create trigger capture_job_offer_requisition_snapshot
before insert on public.job_offers
for each row execute function private.capture_job_offer_requisition_snapshot();
drop trigger if exists guard_published_offer_requisition_snapshot on public.job_offers;
create trigger guard_published_offer_requisition_snapshot
before update on public.job_offers
for each row execute function private.guard_published_offer_requisition_snapshot();

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
    if old.status <> 'Draft' then
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
drop trigger if exists guard_job_offer_send_requires_approved_requisition on public.job_offers;
create trigger guard_job_offer_send_requires_approved_requisition
before update of status on public.job_offers
for each row execute function private.guard_job_offer_send_requires_approved_requisition();

create or replace function private.audit_job_offer_sent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from 'Sent' and new.status = 'Sent' then
    insert into public.audit_logs(user_id, action, entity, entity_id, details)
    values (
      new.sent_by_user_id::text,
      'JOB_OFFER_SENT',
      'Offer',
      new.id::text,
      jsonb_build_object(
        'jobOrderId', new.job_requisition_id,
        'jobOrderReference', new.job_requisition_snapshot->>'reference',
        'jobOrderStatusSnapshot', new.job_requisition_snapshot->>'status',
        'offerStatus', new.status,
        'senderId', new.sent_by_user_id,
        'sentAt', new.sent_at,
        'recipients', jsonb_build_array(new.recipient_email)
      )::text
    );
  end if;
  return new;
end
$$;

drop trigger if exists audit_job_offer_sent on public.job_offers;
create trigger audit_job_offer_sent
after update of status on public.job_offers
for each row execute function private.audit_job_offer_sent();
revoke all on function private.audit_job_offer_sent() from public, anon, authenticated;


-- BOD decisions are available at the BOD stage for documented LWOP and
-- probationary exceptions as well as credit shortfalls. Earlier approvals stay
-- in the normal chain because this endpoint still requires PendingBOD.
create or replace function public.process_leave_exception_approval(
  p_request_id uuid,
  p_decision text,
  p_outcome text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.current_hris_user_id();
  request_row public.leave_requests;
  credits jsonb;
  result jsonb;
  prior private.time_approval_decisions;
  action_label text;
  employee_status text;
begin
  if auth.uid() is null
     or actor is null
     or not exists (
       select 1 from public.hris_users user_row
       where user_row.id = actor and lower(user_row.status::text) = 'active'
     )
     or not public.has_active_role('Board of Director') then
    raise exception 'An active Board of Director role is required.' using errcode = '42501';
  end if;

  select * into strict request_row
  from public.leave_requests
  where id = p_request_id
  for update;

  if request_row.employee_id = actor then
    raise exception 'A Board of Director cannot approve their own leave request.' using errcode = '42501';
  end if;

  select * into prior
  from private.time_approval_decisions decision_row
  where decision_row.request_type = 'leave'
    and decision_row.request_id = p_request_id
    and decision_row.stage = 'PendingBOD'
    and decision_row.approver_id = actor
  limit 1;
  if prior.approver_id is not null then
    if prior.decision = lower(p_decision) then
      return prior.result || jsonb_build_object(
        'alreadyDecided', true,
        'notifyEscalation', false,
        'message', case when prior.decision = 'approve' then 'Already approved by you' else 'Decision already recorded' end
      );
    end if;
    raise exception 'You have already recorded a decision for this request.' using errcode = '22023';
  end if;

  credits := private.leave_credit_context(request_row.id);
  select h.employment_status into employee_status
  from public.hris_users h where h.id = request_row.employee_id;
  if request_row.status <> 'PendingBOD'
     or not (
       coalesce((credits->>'creditException')::boolean, false)
       or coalesce(request_row.unpaid_days, 0) > 0
       or lower(coalesce(request_row.final_classification, '')) = 'lwop'
       or lower(coalesce(employee_status, '')) like '%probation%'
       or lower(coalesce(p_outcome, '')) = 'lwop'
     ) then
    raise exception 'This request is not awaiting a BOD leave exception decision.' using errcode = '22023';
  end if;
  if lower(p_decision) not in ('approve', 'reject') then raise exception 'Choose approve or reject.'; end if;
  if lower(p_decision) = 'reject' and nullif(btrim(p_note), '') is null then raise exception 'A rejection reason is required.'; end if;
  if lower(p_decision) = 'approve' and p_outcome not in ('paid_exception', 'lwop') then raise exception 'Choose paid leave exception or Leave Without Pay.'; end if;

  insert into public.time_request_approval_assignments(
    request_type, request_id, approver_user_id, is_bod, is_required,
    status, decision_note, decided_at, updated_at
  ) values (
    'leave', request_row.id, actor, true, true,
    'Pending', null, null, clock_timestamp()
  )
  on conflict (request_type, request_id, approver_user_id) do update
  set is_bod = true,
      is_required = true,
      status = 'Pending',
      decision_note = null,
      decided_at = null,
      updated_at = clock_timestamp();

  update public.time_request_approval_assignments
  set status = case when lower(p_decision) = 'approve' then 'Approved' else 'Rejected' end,
      decision_note = nullif(btrim(p_note), ''),
      decided_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where request_type = 'leave'
    and request_id = request_row.id
    and approver_user_id = actor;

  perform set_config('app.time_request_approval_context', format('leave:%s:%s', request_row.id, actor), true);
  action_label := case
    when lower(p_decision) = 'reject' then 'BOD leave exception rejected'
    when p_outcome = 'paid_exception' then 'BOD paid leave exception approved'
    else 'BOD approved as Leave Without Pay'
  end;

  update public.leave_requests
  set status = case when lower(p_decision) = 'approve' then 'Approved' else 'Rejected' end,
      final_classification = case when lower(p_decision) = 'approve' then p_outcome else final_classification end,
      paid_days = case
        when lower(p_decision) = 'approve' and p_outcome = 'paid_exception' then duration_days
        when lower(p_decision) = 'approve' then 0
        else paid_days
      end,
      unpaid_days = case
        when lower(p_decision) = 'approve' and p_outcome = 'lwop' then duration_days
        when lower(p_decision) = 'approve' then 0
        else unpaid_days
      end,
      approver_id = actor,
      approval_route = 'BOD_REQUIRED',
      approval_routed_at = clock_timestamp(),
      history_log = coalesce(history_log, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'action', action_label,
        'userId', actor,
        'userName', (select full_name from public.hris_users where id = actor),
        'timestamp', clock_timestamp(),
        'details', jsonb_build_object(
          'creditShortfall', credits->'creditShortfall',
          'outcome', case when lower(p_decision) = 'approve' then p_outcome else 'rejected' end,
          'note', nullif(btrim(p_note), ''),
          'employmentStatus', employee_status
        )
      ))
  where id = request_row.id;

  update public.time_request_approval_assignments
  set status = 'Skipped',
      decision_note = coalesce(decision_note, 'Final BOD decision recorded'),
      updated_at = clock_timestamp()
  where request_type = 'leave'
    and request_id = request_row.id
    and approver_user_id <> actor
    and status = 'Pending';

  if lower(p_decision) = 'approve' then
    insert into private.leave_exception_decisions(
      request_id, approver_id, outcome, credit_shortfall,
      available_credits, requested_days, note
    ) values (
      request_row.id, actor, p_outcome,
      (credits->>'creditShortfall')::numeric,
      (credits->>'availableCredits')::numeric,
      (credits->>'requestedCredits')::numeric,
      nullif(btrim(p_note), '')
    ) on conflict (request_id) do nothing;

    if p_outcome = 'paid_exception' then
      insert into private.leave_credit_overrides(request_id, approver_id, credit_snapshot, note)
      values(request_row.id, actor, credits, nullif(btrim(p_note), ''))
      on conflict do nothing;
    end if;
  end if;

  result := jsonb_build_object(
    'requestType', 'leave',
    'requestId', request_row.id,
    'previousStatus', request_row.status,
    'status', case when lower(p_decision) = 'approve' then 'Approved' else 'Rejected' end,
    'route', 'BOD_REQUIRED',
    'notifyEscalation', false,
    'exceptionOutcome', case when lower(p_decision) = 'approve' then p_outcome else null end,
    'creditShortfall', credits->'creditShortfall'
  );

  insert into private.time_approval_decisions(
    request_type, request_id, stage, approver_id, decision, decided_at, result
  ) values (
    'leave', request_row.id, 'PendingBOD', actor, lower(p_decision), clock_timestamp(), result
  );
  insert into public.audit_logs(user_id, action, entity, entity_id, details)
  values(
    actor::text,
    case when lower(p_decision) = 'approve' then 'BOD_LEAVE_EXCEPTION_APPROVED' else 'BOD_LEAVE_EXCEPTION_REJECTED' end,
    'Leave',
    request_row.id::text,
    (credits || jsonb_build_object(
      'role', 'Board of Director',
      'outcome', case when lower(p_decision) = 'approve' then p_outcome else 'rejected' end,
      'note', nullif(btrim(p_note), ''),
      'exceptionReason', coalesce(nullif(btrim(p_note), ''), action_label),
      'employmentStatus', employee_status,
      'timestamp', clock_timestamp()
    ))::text
  );

  perform set_config('app.time_request_approval_context', '', true);
  return result;
exception when others then
  perform set_config('app.time_request_approval_context', '', true);
  raise;
end;
$$;
revoke all on function public.process_leave_exception_approval(uuid,text,text,text) from public, anon;
grant execute on function public.process_leave_exception_approval(uuid,text,text,text) to authenticated;

create or replace function public.get_leave_exception_approval_context(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  context jsonb;
  request_row public.leave_requests%rowtype;
  employee_status text;
  is_probationary boolean;
  is_lwop boolean;
begin
  context := public.get_time_approval_progress('leave', p_request_id);
  select * into strict request_row from public.leave_requests where id = p_request_id;
  select h.employment_status into employee_status from public.hris_users h where h.id = request_row.employee_id;
  is_probationary := lower(coalesce(employee_status, '')) like '%probation%';
  is_lwop := coalesce(request_row.unpaid_days, 0) > 0
    or lower(coalesce(request_row.final_classification, '')) = 'lwop';

  return context || jsonb_build_object(
    'employmentStatus', employee_status,
    'isProbationary', is_probationary,
    'isLwop', is_lwop,
    'paidDays', coalesce(request_row.paid_days, 0),
    'unpaidDays', coalesce(request_row.unpaid_days, 0),
    'finalClassification', request_row.final_classification,
    'currentStage', request_row.status,
    'requiredApprover', case when request_row.status = 'PendingBOD' then 'Authorized Board of Director' else null end,
    'requiresBodException', coalesce((context->>'creditException')::boolean, false)
      or is_lwop
      or (request_row.status = 'PendingBOD' and is_probationary)
  );
end
$$;
revoke all on function public.get_leave_exception_approval_context(uuid) from public, anon;
grant execute on function public.get_leave_exception_approval_context(uuid) to authenticated;

-- Resolve manpower approvals from the current approved reporting relation and
-- the active Business Unit Manager assignment. This single helper is shared by
-- preview, insert validation, workflow creation, assignments, notifications,
-- and the persisted approval-route snapshot.
create or replace function private.resolve_manpower_approval_route(p_requester_id uuid, p_business_unit_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  requester_is_bum boolean := false;
  direct_manager uuid;
  bum uuid;
  gm uuid;
  bod uuid;
  route jsonb := '[]'::jsonb;
  rule text;
  gm_review_required boolean := false;
begin
  if p_requester_id is null or p_business_unit_id is null then
    return jsonb_build_object('valid', false, 'message', 'Select a valid Business Unit.', 'route', route);
  end if;

  select a.reports_to_user_id into direct_manager
  from public.org_chart_assignments a
  where a.user_id = p_requester_id
    and a.business_unit_id = p_business_unit_id
    and a.is_approved
    and current_date between a.effective_from and coalesce(a.effective_until, 'infinity'::date)
  order by a.effective_from desc
  limit 1;

  requester_is_bum := private.workflow_user_has_role(p_requester_id, 'Business Unit Manager')
    and exists (
      select 1 from public.org_chart_assignments a
      where a.user_id = p_requester_id
        and a.business_unit_id = p_business_unit_id
        and a.is_approved
        and a.organizational_level = 'BUSINESS_UNIT_HEAD'
        and current_date between a.effective_from and coalesce(a.effective_until, 'infinity'::date)
    );

  if direct_manager is not null
     and direct_manager <> p_requester_id
     and private.workflow_user_has_role(direct_manager, 'Board of Director')
     and exists (
       select 1 from public.hris_users u
       where u.id = direct_manager and lower(u.status::text) = 'active' and u.auth_user_id is not null
     ) then
    bod := direct_manager;
    rule := 'DIRECT_BOD_REPORT';
  elsif requester_is_bum then
    select u.id into bod
    from public.hris_users u
    where lower(u.status::text) = 'active'
      and u.auth_user_id is not null
      and u.id <> p_requester_id
      and private.workflow_user_has_role(u.id, 'Board of Director')
    order by u.full_name, u.id
    limit 1;
    rule := 'BUM_REQUESTER';
  else
    select a.user_id into bum
    from public.org_chart_assignments a
    join public.hris_users u on u.id = a.user_id
    where a.business_unit_id = p_business_unit_id
      and a.is_approved
      and a.organizational_level = 'BUSINESS_UNIT_HEAD'
      and current_date between a.effective_from and coalesce(a.effective_until, 'infinity'::date)
      and lower(u.status::text) = 'active'
      and u.auth_user_id is not null
      and a.user_id <> p_requester_id
      and private.workflow_user_has_role(a.user_id, 'Business Unit Manager')
    order by a.effective_from desc, u.full_name, u.id
    limit 1;

    if bum is null then
      return jsonb_build_object(
        'valid', false,
        'rule', 'BUM_THEN_BOD',
        'message', 'A Business Unit Manager must be assigned before this request can be submitted.',
        'route', route
      );
    end if;
    select exists (
      select 1 from public.approval_authority_matrix m
      where m.request_type = 'Manpower'
        and m.organizational_level = 'GENERAL_MANAGER'
        and m.authority_kind = 'REVIEW'
        and m.higher_approval_required
        and m.is_active
        and current_date between m.effective_from and coalesce(m.effective_until, 'infinity'::date)
    ) into gm_review_required;
    if gm_review_required then
      select u.id into gm
      from public.hris_users u
      where lower(u.status::text) = 'active'
        and u.auth_user_id is not null
        and u.id not in (p_requester_id, bum)
        and private.workflow_user_has_role(u.id, 'GeneralManager')
      order by u.full_name, u.id
      limit 1;
      if gm is null then
        return jsonb_build_object('valid', false, 'rule', 'BUM_THEN_GM_THEN_BOD', 'message', 'An active General Manager must be assigned for the configured approval rule.', 'route', route);
      end if;
    end if;
    select u.id into bod
    from public.hris_users u
    where lower(u.status::text) = 'active'
      and u.auth_user_id is not null
      and u.id <> p_requester_id
      and private.workflow_user_has_role(u.id, 'Board of Director')
    order by u.full_name, u.id
    limit 1;
    rule := case when gm is not null then 'BUM_THEN_GM_THEN_BOD' else 'BUM_THEN_BOD' end;
  end if;

  if bod is null then
    return jsonb_build_object('valid', false, 'rule', rule, 'message', 'An active Board of Director must be assigned before this request can be submitted.', 'route', route);
  end if;

  if bum is not null then
    route := route || jsonb_build_array(jsonb_build_object(
      'stepIndex', 0,
      'sequence', 10,
      'approverUserId', bum,
      'principalUserId', bum,
      'approverName', (select u.full_name from public.hris_users u where u.id = bum),
      'organizationalLevel', 'BUSINESS_UNIT_HEAD',
      'authorityKind', 'REVIEW',
      'delegated', false,
      'businessUnitId', p_business_unit_id,
      'configurationFallback', false
    ));
  end if;

  if gm is not null then
    route := route || jsonb_build_array(jsonb_build_object(
      'stepIndex', jsonb_array_length(route),
      'sequence', 15,
      'approverUserId', gm,
      'principalUserId', gm,
      'approverName', (select u.full_name from public.hris_users u where u.id = gm),
      'organizationalLevel', 'GENERAL_MANAGER',
      'authorityKind', 'REVIEW',
      'delegated', false,
      'businessUnitId', p_business_unit_id,
      'configurationFallback', false
    ));
  end if;

  route := route || jsonb_build_array(jsonb_build_object(
    'stepIndex', jsonb_array_length(route),
    'sequence', 20,
    'approverUserId', bod,
    'principalUserId', bod,
    'approverName', (select u.full_name from public.hris_users u where u.id = bod),
    'organizationalLevel', 'BOARD_OF_DIRECTORS',
    'authorityKind', 'FINAL_APPROVAL',
    'delegated', false,
    'businessUnitId', p_business_unit_id,
    'configurationFallback', false
  ));

  return jsonb_build_object('valid', true, 'rule', rule, 'message', null, 'route', route);
end
$$;

revoke all on function private.resolve_manpower_approval_route(uuid,uuid) from public, anon, authenticated;

create or replace function public.preview_manpower_approval_route(p_business_unit_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare actor uuid := public.current_hris_user_id();
begin
  if auth.uid() is null or actor is null
     or not public.has_feature_permission('Manpower', 'create')
     or not public.has_workflow_permission('Manpower', 'submit') then
    raise exception 'You are not authorized to submit on-call requests.' using errcode = '42501';
  end if;
  if not private.user_can_request_for_business_unit(actor, p_business_unit_id) then
    raise exception 'You are not authorized to submit an on-call request for this Business Unit.' using errcode = '42501';
  end if;
  return private.resolve_manpower_approval_route(actor, p_business_unit_id);
end
$$;
revoke all on function public.preview_manpower_approval_route(uuid) from public, anon;
grant execute on function public.preview_manpower_approval_route(uuid) to authenticated;

create or replace function private.require_manpower_approval_route()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare route_result jsonb;
begin
  route_result := private.resolve_manpower_approval_route(new.requester_id, new.business_unit_id);
  if not coalesce((route_result->>'valid')::boolean, false) then
    raise exception '%', coalesce(route_result->>'message', 'The required manpower approvers could not be resolved.') using errcode = '23514';
  end if;
  return new;
end
$$;
revoke all on function private.require_manpower_approval_route() from public, anon, authenticated;
drop trigger if exists manpower_require_approval_route on public.manpower_requests;
create trigger manpower_require_approval_route
before insert on public.manpower_requests
for each row execute function private.require_manpower_approval_route();

create or replace function public.initialize_manpower_request_workflow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := coalesce(public.current_hris_user_id(), new.requester_id);
  route_result jsonb;
  route jsonb;
  first_step jsonb;
  approver uuid;
  stage text;
  history_entry jsonb;
  route_rule text;
begin
  route_result := private.resolve_manpower_approval_route(new.requester_id, new.business_unit_id);
  if not coalesce((route_result->>'valid')::boolean, false) then
    raise exception '%', coalesce(route_result->>'message', 'The required manpower approvers could not be resolved.') using errcode = '23514';
  end if;
  route := route_result->'route';
  route_rule := route_result->>'rule';
  first_step := route->0;
  approver := (first_step->>'approverUserId')::uuid;
  stage := case when first_step->>'authorityKind' = 'FINAL_APPROVAL' then 'BOD_GM' else 'BUSINESS_UNIT_MANAGER' end;

  history_entry := jsonb_build_object(
    'stage', stage,
    'action', 'Submitted / Assigned',
    'approverName', new.requester_name,
    'approverRole', private.manpower_role_label(new.requester_id),
    'assignedApproverId', approver,
    'assignedApproverName', first_step->>'approverName',
    'assignedApproverRole', first_step->>'organizationalLevel',
    'authorityKind', first_step->>'authorityKind',
    'routeStep', 0,
    'timestamp', clock_timestamp(),
    'newStatus', 'Pending',
    'newStage', stage,
    'routingBasis', route_rule,
    'route', route
  );

  perform set_config('app.manpower_workflow_mutation', 'on', true);
  update public.manpower_requests
  set approval_stage = stage,
      approval_issue = null,
      approval_history = coalesce(approval_history, '[]'::jsonb) || jsonb_build_array(history_entry),
      approval_route_snapshot = route,
      approval_route_step = 0,
      routing_basis = route_rule
  where id = new.id;

  insert into public.request_approval_route_snapshots(request_type, request_id, requester_id, business_unit_id, department_id, route, routing_basis, created_by)
  values('Manpower', new.id, new.requester_id, new.business_unit_id, new.department_id, route, route_rule, actor)
  on conflict(request_type, request_id) do update set route = excluded.route, routing_basis = excluded.routing_basis;

  insert into public.manpower_request_approval_assignments(request_id, approval_stage, approver_user_id, approver_role, status)
  values(new.id, stage, approver, coalesce(first_step->>'organizationalLevel', 'Configured approver'), 'Pending')
  on conflict(request_id, approval_stage, approver_user_id) do nothing;

  insert into public.notifications(user_id, type, title, message, link, is_read, related_entity_id, dedupe_key)
  values(
    approver::text,
    'MANPOWER_REQUEST_SUBMITTED',
    'New On-Call Request',
    format('A new on-call request for %s was submitted by %s.', coalesce(new.business_unit_name, 'the selected Business Unit'), new.requester_name),
    '/approvals?type=manpower&item=' || new.id,
    false,
    new.id::text,
    format('manpower:%s:%s:%s', new.id, route_rule, approver)
  ) on conflict(user_id, dedupe_key) do nothing;

  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  select actor::text, u.email, 'SUBMIT', 'ManpowerRequest', new.id::text,
    jsonb_build_object('routingBasis', route_rule, 'route', route, 'selectedApprovers', route, 'newStage', stage)::text
  from public.hris_users u where u.id = actor;
  return new;
end
$$;
revoke all on function public.initialize_manpower_request_workflow() from public, anon, authenticated;

notify pgrst, 'reload schema';
