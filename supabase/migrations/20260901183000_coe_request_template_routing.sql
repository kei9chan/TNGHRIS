-- COE request routing, explicit purpose/template selection, and return history.
-- Existing requests, templates, versions, snapshots, and audit records remain intact.

-- The live database still has the original COE enum values. Add the canonical
-- values used by the current request form while retaining every legacy value.
alter type public.coe_purpose add value if not exists 'VISA_TRAVEL';
alter type public.coe_purpose add value if not exists 'SCHOOL_EDUCATION';
alter type public.coe_purpose add value if not exists 'GOVERNMENT_LEGAL';
alter type public.coe_purpose add value if not exists 'GENERAL_EMPLOYMENT';
alter type public.coe_request_status add value if not exists 'Pending HR Manager Approval';
alter type public.coe_request_status add value if not exists 'Returned for Revision';

alter table public.coe_templates
  add column if not exists purposes text[] not null default '{}'::text[],
  add column if not exists recommended_purposes text[] not null default '{}'::text[];

alter table public.coe_requests
  add column if not exists return_reason text,
  add column if not exists returned_by uuid references public.hris_users(id) on delete set null,
  add column if not exists returned_at timestamptz;

-- Existing templates remain usable for every purpose until HR narrows their
-- assignment in Template Management.
update public.coe_templates
set purposes = array[
  'LOAN_APPLICATION', 'VISA_TRAVEL', 'SCHOOL_EDUCATION',
  'GOVERNMENT_LEGAL', 'GENERAL_EMPLOYMENT', 'OTHERS'
]::text[]
where coalesce(array_length(purposes, 1), 0) = 0;

update public.coe_templates
set recommended_purposes = purposes
where is_active
  and status = 'Published'
  and coalesce(array_length(recommended_purposes, 1), 0) = 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.coe_templates'::regclass
      and conname = 'coe_templates_purposes_check'
  ) then
    alter table public.coe_templates
      add constraint coe_templates_purposes_check
      check (purposes <@ array[
        'LOAN_APPLICATION', 'VISA_TRAVEL', 'SCHOOL_EDUCATION',
        'GOVERNMENT_LEGAL', 'GENERAL_EMPLOYMENT', 'OTHERS'
      ]::text[])
      not valid;
    alter table public.coe_templates validate constraint coe_templates_purposes_check;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.coe_templates'::regclass
      and conname = 'coe_templates_recommended_purposes_check'
  ) then
    alter table public.coe_templates
      add constraint coe_templates_recommended_purposes_check
      check (recommended_purposes <@ purposes)
      not valid;
    alter table public.coe_templates validate constraint coe_templates_recommended_purposes_check;
  end if;
end
$$;

-- Multiple active cards are required so employees can choose among templates
-- for the same business unit. The selected template is still snapshotted on approval.
drop index if exists public.coe_templates_one_active_per_bu;
create index if not exists coe_templates_purposes_gin_idx
  on public.coe_templates using gin (purposes);
create index if not exists coe_templates_recommended_purposes_gin_idx
  on public.coe_templates using gin (recommended_purposes);
create index if not exists coe_requests_returned_by_idx
  on public.coe_requests(returned_by)
  where returned_by is not null;

-- Build the document from the request's selected template. Legacy requests that
-- have no template_id retain the existing same-business-unit fallback ordering.
create or replace function private.build_coe_document(p_request public.coe_requests)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  employee_row public.hris_users;
  template_row public.coe_templates;
  business_unit_name text;
  business_unit_color text;
  department_name text;
  purpose_text text;
  source_value text := 'template';
  fallback_value text;
  template_value jsonb;
  employee_value jsonb;
  request_business_unit_id uuid;
begin
  select u.* into employee_row
  from public.hris_users u
  where u.id = p_request.employee_id;

  request_business_unit_id := coalesce(p_request.employee_business_unit_id, employee_row.business_unit_id);

  select bu.name, bu.color
    into business_unit_name, business_unit_color
  from public.business_units bu
  where bu.id = request_business_unit_id;

  select d.name into department_name
  from public.departments d
  where d.id = coalesce(p_request.employee_department_id, employee_row.department_id);

  if p_request.template_id is not null then
    select t.* into template_row
    from public.coe_templates t
    where t.id = p_request.template_id
      and t.business_unit_id = request_business_unit_id
    limit 1;
  end if;

  if template_row.id is null then
    select t.* into template_row
    from public.coe_templates t
    where t.business_unit_id = request_business_unit_id
    order by
      case when t.is_active and t.status = 'Published' then 0
           when t.status = 'Published' then 1
           when t.status = 'Draft' then 2
           else 3 end,
      t.updated_at desc,
      t.created_at desc
    limit 1;
  end if;

  purpose_text := case p_request.purpose::text
    when 'LOAN_APPLICATION' then 'loan application'
    when 'VISA_TRAVEL' then 'visa/travel'
    when 'TRAVEL' then 'visa/travel'
    when 'VISA_APPLICATION' then 'visa/travel'
    when 'SCHOOL_EDUCATION' then 'school/education'
    when 'SCHOOL_APPLICATION' then 'school/education'
    when 'GOVERNMENT_LEGAL' then 'government/legal'
    when 'LEGAL_PURPOSES' then 'government/legal'
    when 'GENERAL_EMPLOYMENT' then 'general employment'
    when 'OTHERS' then coalesce(nullif(btrim(p_request.other_purpose_detail), ''), 'personal purposes')
    else lower(replace(p_request.purpose::text, '_', ' '))
  end;

  employee_value := jsonb_build_object(
    'id', p_request.employee_id,
    'name', coalesce(nullif(employee_row.full_name, ''), p_request.employee_name, 'Employee'),
    'email', employee_row.email,
    'position', coalesce(nullif(employee_row.position, ''), nullif(p_request.employee_position, ''), employee_row.role, ''),
    'department', coalesce(department_name, employee_row.department, ''),
    'departmentId', coalesce(p_request.employee_department_id, employee_row.department_id),
    'businessUnit', coalesce(business_unit_name, employee_row.business_unit, 'TNG'),
    'businessUnitId', request_business_unit_id,
    'dateHired', employee_row.date_hired,
    'endDate', employee_row.end_date,
    'employmentStatus', coalesce(nullif(employee_row.employment_status, ''), employee_row.status, ''),
    'salary', coalesce(employee_row.salary_basic, employee_row.rate_amount),
    'purpose', purpose_text,
    'issueDate', coalesce(p_request.approved_at, now()),
    'requestDate', p_request.date_requested
  );

  if template_row.id is not null then
    template_value := jsonb_build_object(
      'id', template_row.id,
      'businessUnitId', template_row.business_unit_id,
      'businessUnitName', coalesce(business_unit_name, 'TNG'),
      'name', template_row.name,
      'description', template_row.description,
      'documentTitle', template_row.document_title,
      'logoUrl', template_row.logo_url,
      'address', coalesce(template_row.address, ''),
      'body', template_row.body,
      'signatoryName', template_row.signatory_name,
      'signatoryPosition', template_row.signatory_position,
      'signatureUrl', template_row.signature_url,
      'footerText', template_row.footer_text,
      'styleKey', template_row.style_key,
      'primaryColor', coalesce(nullif(template_row.primary_color, ''), nullif(business_unit_color, ''), '#1e3a8a'),
      'accentColor', template_row.accent_color,
      'fontFamily', template_row.font_family,
      'layoutSettings', template_row.layout_settings,
      'purposes', to_jsonb(template_row.purposes),
      'recommendedPurposes', to_jsonb(template_row.recommended_purposes),
      'version', template_row.version,
      'presetKey', template_row.preset_key
    );
  else
    source_value := 'fallback';
    fallback_value := format(
      'No COE template was available for business unit %s; the protected system fallback was used.',
      coalesce(business_unit_name, request_business_unit_id::text, 'unknown')
    );
    template_value := jsonb_build_object(
      'id', null,
      'businessUnitId', request_business_unit_id,
      'businessUnitName', coalesce(business_unit_name, employee_row.business_unit, 'TNG'),
      'name', 'Safe Fallback COE',
      'description', 'System fallback used only when no same-business-unit template is available.',
      'documentTitle', 'Certificate of Employment',
      'logoUrl', null,
      'address', '',
      'body', '<p>This is to certify that <strong>{{employee_name}}</strong> is employed by <strong>{{business_unit}}</strong> as <strong>{{position}}</strong> in the {{department}} department from {{date_hired}} {{end_date}}.</p><p>This certification is issued at the employee''s request for {{purpose}}.</p><p>Issued on {{date_today}}.</p>',
      'signatoryName', 'Human Resources Department',
      'signatoryPosition', 'Authorized Signatory',
      'signatureUrl', null,
      'footerText', 'Official document generated by TNG HRIS',
      'styleKey', 'classic-corporate',
      'primaryColor', coalesce(nullif(business_unit_color, ''), '#1e3a8a'),
      'accentColor', '#64748b',
      'fontFamily', 'Times New Roman',
      'layoutSettings', jsonb_build_object(
        'marginTopMm', 20, 'marginRightMm', 20, 'marginBottomMm', 20,
        'marginLeftMm', 20, 'lineHeight', 1.6, 'textAlignment', 'justify',
        'logoAlignment', 'center', 'logoHeightMm', 24
      ),
      'purposes', '[]'::jsonb,
      'recommendedPurposes', '[]'::jsonb,
      'version', 1,
      'presetKey', 'protected-fallback'
    );
  end if;

  return jsonb_build_object(
    'templateId', template_row.id,
    'generationSource', source_value,
    'fallbackReason', fallback_value,
    'template', template_value,
    'employee', employee_value
  );
end;
$$;

revoke all on function private.build_coe_document(public.coe_requests) from public, anon, authenticated;

-- Require the selected template for new requests while allowing legacy rows to
-- remain readable and historically recoverable.
create or replace function private.ensure_coe_request_template()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  template_row public.coe_templates;
  employee_business_unit_id uuid;
begin
  if new.status::text not in ('Pending HR Manager Approval', 'Pending') then
    return new;
  end if;

  if new.template_id is null then
    if new.status::text = 'Pending HR Manager Approval' then
      raise exception 'A COE template is required before submitting a request.' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.purpose = 'OTHERS' and nullif(btrim(coalesce(new.other_purpose_detail, '')), '') is null then
    raise exception 'A custom purpose is required for an Other COE request.' using errcode = '23514';
  end if;

  select u.business_unit_id into employee_business_unit_id
  from public.hris_users u
  where u.id = new.employee_id;

  select t.* into template_row
  from public.coe_templates t
  where t.id = new.template_id;

  if template_row.id is null then
    raise exception 'The selected COE template could not be found.' using errcode = '23503';
  end if;
  if template_row.business_unit_id is distinct from coalesce(new.employee_business_unit_id, employee_business_unit_id) then
    raise exception 'The selected COE template does not belong to the employee''s business unit.' using errcode = '23514';
  end if;
  if not template_row.is_active or template_row.status <> 'Published' then
    raise exception 'The selected COE template is no longer active.' using errcode = '23514';
  end if;
  if coalesce(array_length(template_row.purposes, 1), 0) > 0
     and not (new.purpose::text = any(template_row.purposes)) then
    raise exception 'The selected COE template is not assigned to this purpose.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists coe_request_template_guard on public.coe_requests;
create trigger coe_request_template_guard
before insert or update of template_id, purpose, employee_business_unit_id, status on public.coe_requests
for each row execute function private.ensure_coe_request_template();

revoke all on function private.ensure_coe_request_template() from public, anon, authenticated;

-- Keep the existing role and business-unit permission model, adding Return as
-- an authorization action rather than identifying a specific approver account.
create or replace function private.is_coe_approval_authorized(
  p_actor_id uuid,
  p_employee_id uuid,
  p_action text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  authority text;
  has_allowed_role boolean := false;
begin
  if p_actor_id is null
     or p_employee_id is null
     or p_actor_id is distinct from public.current_hris_user_id()
     or p_action not in ('approve', 'reject', 'return') then
    return false;
  end if;

  authority := public.get_coe_approval_authority();

  if authority = 'HR_MANAGER' then
    has_allowed_role := private.coe_user_has_role(p_actor_id, 'HR Manager');
  elsif authority = 'HR_STAFF' then
    has_allowed_role := private.coe_user_has_role(p_actor_id, 'HR Staff');
  elsif authority = 'HR_MANAGER_OR_HR_STAFF' then
    has_allowed_role :=
      private.coe_user_has_role(p_actor_id, 'HR Manager')
      or private.coe_user_has_role(p_actor_id, 'HR Staff');
  end if;

  return has_allowed_role
    and private.coe_user_has_workflow_permission(p_actor_id, p_action)
    and private.coe_user_can_access_employee(p_actor_id, p_employee_id);
end;
$$;

revoke all on function private.is_coe_approval_authorized(uuid, uuid, text) from public, anon, authenticated;

create or replace function private.coe_notify_approvers(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.coe_requests;
  authority text;
  approver_row record;
begin
  select * into request_row
  from public.coe_requests
  where id = p_request_id;

  if request_row.id is null
     or request_row.status::text not in ('Pending', 'Pending HR Manager Approval') then
    return;
  end if;

  authority := public.get_coe_approval_authority();

  update public.notifications
     set is_read = true
   where related_entity_id = request_row.id::text
     and type = 'COE_UPDATE'
     and title not in (
       'COE Request Approved',
       'COE Request Rejected',
       'COE Request Returned for Revision'
     );

  for approver_row in
    select u.id
    from public.hris_users u
    where lower(coalesce(u.status, '')) = 'active'
      and (
        (authority = 'HR_MANAGER' and private.coe_user_has_role(u.id, 'HR Manager'))
        or (authority = 'HR_STAFF' and private.coe_user_has_role(u.id, 'HR Staff'))
        or (
          authority = 'HR_MANAGER_OR_HR_STAFF'
          and (
            private.coe_user_has_role(u.id, 'HR Manager')
            or private.coe_user_has_role(u.id, 'HR Staff')
          )
        )
      )
      and private.coe_user_has_workflow_permission(u.id, 'approve')
      and private.coe_user_can_access_employee(u.id, request_row.employee_id)
  loop
    insert into public.notifications(
      user_id, type, title, message, link, is_read, related_entity_id, dedupe_key
    )
    values (
      approver_row.id::text,
      'COE_UPDATE',
      'COE Request Approval Required',
      format('%s has requested a Certificate of Employment.', request_row.employee_name),
      format('/employees/coe/requests?requestId=%s', request_row.id),
      false,
      request_row.id::text,
      format('coe-approval:%s:%s', request_row.id, approver_row.id)
    )
    on conflict (user_id, dedupe_key) do update
      set type = excluded.type,
          title = excluded.title,
          message = excluded.message,
          link = excluded.link,
          is_read = false,
          related_entity_id = excluded.related_entity_id,
          created_at = now();
  end loop;
end;
$$;

create or replace function private.coe_sync_pending_notifications()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_id uuid;
begin
  for request_id in
    select id from public.coe_requests
    where status::text in ('Pending', 'Pending HR Manager Approval')
  loop
    perform private.coe_notify_approvers(request_id);
  end loop;
end;
$$;

revoke all on function private.coe_notify_approvers(uuid) from public, anon, authenticated;
revoke all on function private.coe_sync_pending_notifications() from public, anon, authenticated;

create or replace function private.notify_coe_approvers_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status
     and new.status::text in ('Pending', 'Pending HR Manager Approval') then
    perform private.coe_notify_approvers(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists coe_notify_approvers_after_update on public.coe_requests;
create trigger coe_notify_approvers_after_update
after update of status on public.coe_requests
for each row execute function private.notify_coe_approvers_after_update();

revoke all on function private.notify_coe_approvers_after_update() from public, anon, authenticated;

create or replace function private.resolve_coe_notifications_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status
     and new.status::text in ('Approved', 'Rejected', 'Returned for Revision') then
    update public.notifications
       set is_read = true
     where related_entity_id = new.id::text
       and type = 'COE_UPDATE'
       and title not in (
         'COE Request Approved',
         'COE Request Rejected',
         'COE Request Returned for Revision'
       );

    insert into public.notifications(
      user_id, type, title, message, link, is_read, related_entity_id, dedupe_key
    )
    values (
      new.employee_id::text,
      'COE_UPDATE',
      case new.status::text
        when 'Approved' then 'COE Request Approved'
        when 'Rejected' then 'COE Request Rejected'
        else 'COE Request Returned for Revision'
      end,
      case new.status::text
        when 'Approved' then 'Your Certificate of Employment request has been approved.'
        when 'Rejected' then format('Your Certificate of Employment request has been rejected. Reason: %s', coalesce(new.rejection_reason, ''))
        else format('Your Certificate of Employment request was returned for revision. Notes: %s', coalesce(new.return_reason, ''))
      end,
      format('/employees/coe/requests?requestId=%s', new.id),
      false,
      new.id::text,
      format('coe-decision:%s:%s', new.id, lower(new.status::text))
    )
    on conflict (user_id, dedupe_key) do update
      set type = excluded.type,
          title = excluded.title,
          message = excluded.message,
          link = excluded.link,
          is_read = false,
          related_entity_id = excluded.related_entity_id,
          created_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists coe_resolve_approval_notifications on public.coe_requests;
create trigger coe_resolve_approval_notifications
after update of status on public.coe_requests
for each row execute function private.resolve_coe_notifications_after_update();

revoke all on function private.resolve_coe_notifications_after_update() from public, anon, authenticated;

-- Ensure the configured HR Manager role has the existing Return action. The
-- authority setting and scope still determine which active users can act.
insert into public.role_workflow_permissions(role_id, workflow_key, actions, updated_at)
values ('HR Manager', 'COE', array['approve', 'reject', 'return']::text[], now())
on conflict (role_id, workflow_key) do update
set actions = array(
  select distinct action
  from unnest(public.role_workflow_permissions.actions || excluded.actions) action
  order by action
), updated_at = now();

-- Include Return in the same row-level authorization policy used by the other
-- HR Manager/HR Staff COE decisions.
drop policy if exists coe_req_hr_approval_update on public.coe_requests;
create policy coe_req_hr_approval_update on public.coe_requests
  for update to authenticated
  using (
    public.can_approve_coe_request(employee_id, 'approve')
    or public.can_approve_coe_request(employee_id, 'reject')
    or public.can_approve_coe_request(employee_id, 'return')
  )
  with check (
    public.can_approve_coe_request(employee_id, 'approve')
    or public.can_approve_coe_request(employee_id, 'reject')
    or public.can_approve_coe_request(employee_id, 'return')
  );

-- Reject direct approval/rejection from unconfigured roles, and keep the
-- immutable snapshot behavior for approved documents.
create or replace function private.ensure_coe_approval_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  document_value jsonb;
  action_value text;
begin
  action_value := case when new.status::text = 'Approved' then 'approve' else 'reject' end;

  if new.status::text in ('Approved', 'Rejected')
     and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and not private.is_coe_approval_authorized(
       public.current_hris_user_id(), new.employee_id, action_value
     ) then
    raise exception 'You do not have permission to approve or reject this COE request.' using errcode = '42501';
  end if;

  if new.status::text = 'Approved'
     and (new.template_snapshot is null or new.employee_snapshot is null) then
    new.approved_at := coalesce(new.approved_at, now());
    document_value := private.build_coe_document(new);
    new.template_id := nullif(document_value->>'templateId', '')::uuid;
    new.template_snapshot := document_value->'template';
    new.employee_snapshot := document_value->'employee';
    new.snapshot_created_at := now();
    new.generation_source := document_value->>'generationSource';
    new.fallback_reason := document_value->>'fallbackReason';
    new.generated_document_url := coalesce(
      nullif(new.generated_document_url, ''),
      'coe://request/' || new.id::text || '/document'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists coe_approval_snapshot_guard on public.coe_requests;
create trigger coe_approval_snapshot_guard
before insert or update on public.coe_requests
for each row execute function private.ensure_coe_approval_snapshot();

revoke all on function private.ensure_coe_approval_snapshot() from public, anon, authenticated;

create or replace function public.approve_coe_request_with_snapshot(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_email text;
  request_row public.coe_requests;
  document_value jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select * into request_row
  from public.coe_requests
  where id = p_request_id
  for update;
  if request_row.id is null then
    raise exception 'COE request not found.' using errcode = 'P0002';
  end if;

  if not private.is_coe_approval_authorized(actor_id, request_row.employee_id, 'approve') then
    raise exception 'Only the configured HR Manager or HR Staff authority can approve this COE request.' using errcode = '42501';
  end if;

  if request_row.status::text = 'Rejected' then
    raise exception 'A rejected COE request cannot be approved without reopening the existing workflow.';
  end if;
  if request_row.status::text = 'Returned for Revision' then
    raise exception 'A returned COE request must be resubmitted before it can be approved.';
  end if;
  if request_row.status::text not in ('Pending', 'Pending HR Manager Approval', 'Approved') then
    raise exception 'Only a pending COE request can be approved.';
  end if;

  if request_row.status::text = 'Approved'
     and request_row.template_snapshot is not null
     and request_row.employee_snapshot is not null then
    document_value := jsonb_build_object(
      'templateId', request_row.template_id,
      'generationSource', coalesce(request_row.generation_source, 'historical_snapshot'),
      'fallbackReason', request_row.fallback_reason,
      'template', request_row.template_snapshot,
      'employee', request_row.employee_snapshot
    );
  else
    request_row.approved_at := coalesce(request_row.approved_at, now());
    document_value := private.build_coe_document(request_row);

    update public.coe_requests
       set status = 'Approved',
           approved_by = actor_id,
           approved_at = request_row.approved_at,
           rejection_reason = null,
           return_reason = null,
           returned_by = null,
           returned_at = null,
           generated_document_url = 'coe://request/' || p_request_id::text || '/document',
           template_id = nullif(document_value->>'templateId', '')::uuid,
           template_snapshot = document_value->'template',
           employee_snapshot = document_value->'employee',
           snapshot_created_at = now(),
           generation_source = document_value->>'generationSource',
           fallback_reason = document_value->>'fallbackReason',
           document_version = greatest(document_version, 1),
           updated_at = now()
     where id = p_request_id
     returning * into request_row;

    select email into actor_email
    from public.hris_users
    where id = actor_id;

    insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
    values (
      actor_id::text,
      actor_email,
      'APPROVE',
      'COERequest',
      p_request_id::text,
      format(
        'Approved COE with immutable document snapshot (source=%s, template=%s).',
        document_value->>'generationSource',
        coalesce(document_value->>'templateId', 'protected fallback')
      )
    );
  end if;

  return jsonb_build_object(
    'request', to_jsonb(request_row),
    'template', document_value->'template',
    'employee', document_value->'employee',
    'meta', jsonb_build_object(
      'generationSource', document_value->>'generationSource',
      'fallbackReason', document_value->>'fallbackReason',
      'snapshotCreatedAt', coalesce(request_row.snapshot_created_at, now()),
      'documentVersion', request_row.document_version
    )
  );
end;
$$;

revoke all on function public.approve_coe_request_with_snapshot(uuid) from public, anon;
grant execute on function public.approve_coe_request_with_snapshot(uuid) to authenticated;

create or replace function public.reject_coe_request(p_request_id uuid, p_reason text)
returns public.coe_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_email text;
  request_row public.coe_requests;
  reason_value text := btrim(coalesce(p_reason, ''));
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if length(reason_value) < 1 then
    raise exception 'A rejection reason is required.';
  end if;

  select * into request_row
  from public.coe_requests
  where id = p_request_id
  for update;
  if request_row.id is null then
    raise exception 'COE request not found.' using errcode = 'P0002';
  end if;
  if request_row.status::text not in ('Pending', 'Pending HR Manager Approval') then
    raise exception 'Only a pending COE request can be rejected.';
  end if;
  if not private.is_coe_approval_authorized(actor_id, request_row.employee_id, 'reject') then
    raise exception 'Only the configured HR Manager or HR Staff authority can reject this COE request.' using errcode = '42501';
  end if;

  update public.coe_requests
     set status = 'Rejected',
         rejection_reason = reason_value,
         approved_by = actor_id,
         approved_at = now(),
         return_reason = null,
         returned_by = null,
         returned_at = null,
         generated_document_url = null,
         updated_at = now()
   where id = p_request_id
   returning * into request_row;

  select email into actor_email from public.hris_users where id = actor_id;
  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  values (
    actor_id::text,
    actor_email,
    'REJECT',
    'COERequest',
    p_request_id::text,
    format('Rejected COE request. Reason: %s', reason_value)
  );

  return request_row;
end;
$$;

revoke all on function public.reject_coe_request(uuid, text) from public, anon;
grant execute on function public.reject_coe_request(uuid, text) to authenticated;

create or replace function public.return_coe_request(p_request_id uuid, p_reason text)
returns public.coe_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_email text;
  request_row public.coe_requests;
  reason_value text := btrim(coalesce(p_reason, ''));
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if length(reason_value) < 1 then
    raise exception 'Revision notes are required to return a COE request.';
  end if;

  select * into request_row
  from public.coe_requests
  where id = p_request_id
  for update;
  if request_row.id is null then
    raise exception 'COE request not found.' using errcode = 'P0002';
  end if;
  if request_row.status::text not in ('Pending', 'Pending HR Manager Approval') then
    raise exception 'Only a pending COE request can be returned.';
  end if;
  if not private.is_coe_approval_authorized(actor_id, request_row.employee_id, 'return') then
    raise exception 'Only the configured HR Manager or HR Staff authority can return this COE request.' using errcode = '42501';
  end if;

  update public.coe_requests
     set status = 'Returned for Revision',
         return_reason = reason_value,
         returned_by = actor_id,
         returned_at = now(),
         rejection_reason = null,
         updated_at = now()
   where id = p_request_id
   returning * into request_row;

  select email into actor_email from public.hris_users where id = actor_id;
  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  values (
    actor_id::text,
    actor_email,
    'RETURN',
    'COERequest',
    p_request_id::text,
    format('Returned COE request for revision. Notes: %s', reason_value)
  );

  return request_row;
end;
$$;

revoke all on function public.return_coe_request(uuid, text) from public, anon;
grant execute on function public.return_coe_request(uuid, text) to authenticated;

create or replace function public.save_coe_template(p_template jsonb)
returns public.coe_templates
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_email text;
  v_template_id uuid := nullif(p_template->>'id', '')::uuid;
  v_business_unit_id uuid := nullif(p_template->>'businessUnitId', '')::uuid;
  v_template_status text := coalesce(nullif(p_template->>'status', ''), 'Draft');
  v_template_body text := coalesce(p_template->>'body', '');
  v_all_purposes text[] := array[
    'LOAN_APPLICATION', 'VISA_TRAVEL', 'SCHOOL_EDUCATION',
    'GOVERNMENT_LEGAL', 'GENERAL_EMPLOYMENT', 'OTHERS'
  ]::text[];
  v_purposes text[] := v_all_purposes;
  v_recommended_purposes text[] := '{}'::text[];
  unsupported_placeholders text[];
  saved_row public.coe_templates;
  action_value text;
begin
  if actor_id is null or not (
    public.is_hr_or_admin()
    or public.has_feature_permission('COE', 'manage')
    or public.has_feature_permission('COE', 'edit')
  ) then
    raise exception 'You do not have permission to manage COE templates.' using errcode = '42501';
  end if;
  if v_business_unit_id is null or not exists (select 1 from public.business_units where id = v_business_unit_id) then
    raise exception 'A valid business unit is required.';
  end if;
  if v_template_status not in ('Draft', 'Published') then
    raise exception 'Template status must be Draft or Published.';
  end if;
  if nullif(btrim(v_template_body), '') is null then
    raise exception 'Certificate body is required.';
  end if;
  if nullif(btrim(coalesce(p_template->>'signatoryName', '')), '') is null then
    raise exception 'Signatory name is required.';
  end if;

  if jsonb_typeof(coalesce(p_template->'purposes', 'null'::jsonb)) = 'array' then
    v_purposes := array(select jsonb_array_elements_text(p_template->'purposes'));
  end if;
  if jsonb_typeof(coalesce(p_template->'recommendedPurposes', 'null'::jsonb)) = 'array' then
    v_recommended_purposes := array(select jsonb_array_elements_text(p_template->'recommendedPurposes'));
  end if;
  if coalesce(array_length(v_purposes, 1), 0) = 0 then
    raise exception 'Assign at least one purpose to the COE template.';
  end if;
  if not (v_purposes <@ v_all_purposes) then
    raise exception 'The COE template contains an unsupported purpose.';
  end if;
  if not (v_recommended_purposes <@ v_purposes) then
    raise exception 'Recommended purposes must be assigned to the template.';
  end if;
  if v_template_status <> 'Published' then
    v_recommended_purposes := '{}'::text[];
  end if;

  select array_agg(distinct (match_value.captures)[1])
    into unsupported_placeholders
  from regexp_matches(v_template_body, '\{\{\s*([a-zA-Z0-9_]+)\s*\}\}', 'g') as match_value(captures)
  where (match_value.captures)[1] <> all(array[
    'employee_name', 'position', 'department', 'business_unit', 'date_hired',
    'end_date', 'employment_status', 'salary', 'purpose', 'date_today',
    'business_address', 'signatory_name', 'signatory_position'
  ]::text[]);
  if coalesce(array_length(unsupported_placeholders, 1), 0) > 0 then
    raise exception 'Unsupported placeholder(s): %', array_to_string(unsupported_placeholders, ', ');
  end if;

  -- One template may be recommended for a purpose at a time within a BU;
  -- publishing a new recommendation removes only those purpose flags elsewhere.
  if v_template_status = 'Published' then
    update public.coe_templates t
       set recommended_purposes = coalesce((
         select array_agg(existing_purpose)
         from unnest(coalesce(t.recommended_purposes, '{}'::text[])) existing_purpose
         where existing_purpose <> all(v_recommended_purposes)
       ), '{}'::text[]),
           updated_at = now()
     where t.business_unit_id = v_business_unit_id
       and (v_template_id is null or t.id <> v_template_id);
  end if;

  if v_template_id is null then
    insert into public.coe_templates(
      business_unit_id, name, description, document_title, logo_url, address, body,
      signatory_name, signatory_position, signature_url, footer_text, style_key,
      primary_color, accent_color, font_family, layout_settings, purposes,
      recommended_purposes, status, is_active, version, is_preset, preset_key,
      created_from_template_id, created_by
    ) values (
      v_business_unit_id,
      coalesce(nullif(btrim(p_template->>'name'), ''), 'Certificate of Employment'),
      nullif(p_template->>'description', ''),
      coalesce(nullif(btrim(p_template->>'documentTitle'), ''), 'Certificate of Employment'),
      nullif(p_template->>'logoUrl', ''),
      coalesce(p_template->>'address', ''),
      v_template_body,
      btrim(p_template->>'signatoryName'),
      coalesce(p_template->>'signatoryPosition', ''),
      nullif(p_template->>'signatureUrl', ''),
      nullif(p_template->>'footerText', ''),
      coalesce(nullif(p_template->>'styleKey', ''), 'classic-corporate'),
      coalesce(nullif(p_template->>'primaryColor', ''), '#1e3a8a'),
      coalesce(nullif(p_template->>'accentColor', ''), '#64748b'),
      coalesce(nullif(p_template->>'fontFamily', ''), 'Times New Roman'),
      coalesce(p_template->'layoutSettings', '{}'::jsonb),
      v_purposes,
      v_recommended_purposes,
      v_template_status,
      v_template_status = 'Published',
      1,
      coalesce((p_template->>'isPreset')::boolean, false),
      nullif(p_template->>'presetKey', ''),
      nullif(p_template->>'createdFromTemplateId', '')::uuid,
      actor_id
    ) returning * into saved_row;
    action_value := 'CREATE';
  else
    update public.coe_templates
       set business_unit_id = v_business_unit_id,
           name = coalesce(nullif(btrim(p_template->>'name'), ''), name),
           description = nullif(p_template->>'description', ''),
           document_title = coalesce(nullif(btrim(p_template->>'documentTitle'), ''), 'Certificate of Employment'),
           logo_url = nullif(p_template->>'logoUrl', ''),
           address = coalesce(p_template->>'address', ''),
           body = v_template_body,
           signatory_name = btrim(p_template->>'signatoryName'),
           signatory_position = coalesce(p_template->>'signatoryPosition', ''),
           signature_url = nullif(p_template->>'signatureUrl', ''),
           footer_text = nullif(p_template->>'footerText', ''),
           style_key = coalesce(nullif(p_template->>'styleKey', ''), 'classic-corporate'),
           primary_color = coalesce(nullif(p_template->>'primaryColor', ''), '#1e3a8a'),
           accent_color = coalesce(nullif(p_template->>'accentColor', ''), '#64748b'),
           font_family = coalesce(nullif(p_template->>'fontFamily', ''), 'Times New Roman'),
           layout_settings = coalesce(p_template->'layoutSettings', layout_settings),
           purposes = v_purposes,
           recommended_purposes = v_recommended_purposes,
           status = v_template_status,
           is_active = v_template_status = 'Published',
           version = version + 1,
           archived_at = null,
           archived_by = null,
           updated_at = now()
     where id = v_template_id
     returning * into saved_row;
    if saved_row.id is null then
      raise exception 'COE template not found.' using errcode = 'P0002';
    end if;
    action_value := 'UPDATE';
  end if;

  select email into actor_email from public.hris_users where id = actor_id;
  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  values (
    actor_id::text, actor_email, action_value, 'COETemplate', saved_row.id::text,
    format('%s COE template "%s" version %s (%s).', initcap(lower(action_value)), saved_row.name, saved_row.version, saved_row.status)
  );
  return saved_row;
end;
$$;

revoke all on function public.save_coe_template(jsonb) from public, anon;
grant execute on function public.save_coe_template(jsonb) to authenticated;

create or replace function public.archive_coe_template(p_template_id uuid)
returns public.coe_templates
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_email text;
  saved_row public.coe_templates;
begin
  if actor_id is null or not (
    public.is_hr_or_admin()
    or public.has_feature_permission('COE', 'manage')
    or public.has_feature_permission('COE', 'edit')
  ) then
    raise exception 'You do not have permission to archive COE templates.' using errcode = '42501';
  end if;

  update public.coe_templates
     set status = 'Archived', is_active = false, recommended_purposes = '{}'::text[],
         archived_at = now(), archived_by = actor_id, updated_at = now(), version = version + 1
   where id = p_template_id
   returning * into saved_row;
  if saved_row.id is null then
    raise exception 'COE template not found.' using errcode = 'P0002';
  end if;

  select email into actor_email from public.hris_users where id = actor_id;
  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  values (
    actor_id::text, actor_email, 'UPDATE', 'COETemplate', saved_row.id::text,
    format('Archived COE template "%s"; existing document snapshots remain unchanged.', saved_row.name)
  );
  return saved_row;
end;
$$;

revoke all on function public.archive_coe_template(uuid) from public, anon;
grant execute on function public.archive_coe_template(uuid) to authenticated;

-- Reconcile any pending legacy rows with the currently configured authority.
do $$
begin
  perform private.coe_sync_pending_notifications();
end;
$$;
