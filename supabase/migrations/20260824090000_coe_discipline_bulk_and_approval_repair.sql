-- COE document resilience, editable branded presets, Code of Discipline
-- category/import workflows, and award approval status normalization.
-- All changes are additive and preserve existing records and historical output.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Certificate of Employment templates and immutable document snapshots
-- ---------------------------------------------------------------------------

alter table public.coe_templates
  add column if not exists name text not null default 'Certificate of Employment',
  add column if not exists description text,
  add column if not exists document_title text not null default 'Certificate of Employment',
  add column if not exists style_key text not null default 'classic-corporate',
  add column if not exists primary_color text not null default '#1e3a8a',
  add column if not exists accent_color text not null default '#64748b',
  add column if not exists font_family text not null default 'Times New Roman',
  add column if not exists signature_url text,
  add column if not exists footer_text text,
  add column if not exists layout_settings jsonb not null default jsonb_build_object(
    'marginTopMm', 20,
    'marginRightMm', 20,
    'marginBottomMm', 20,
    'marginLeftMm', 20,
    'lineHeight', 1.6,
    'textAlignment', 'justify',
    'logoAlignment', 'center',
    'logoHeightMm', 24
  ),
  add column if not exists status text not null default 'Draft',
  add column if not exists version integer not null default 1,
  add column if not exists is_preset boolean not null default false,
  add column if not exists preset_key text,
  add column if not exists created_from_template_id uuid references public.coe_templates(id) on delete set null,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.hris_users(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.coe_templates'::regclass
      and conname = 'coe_templates_status_check'
  ) then
    alter table public.coe_templates
      add constraint coe_templates_status_check
      check (status in ('Draft', 'Published', 'Archived')) not valid;
    alter table public.coe_templates validate constraint coe_templates_status_check;
  end if;
end
$$;

update public.coe_templates
set status = case when is_active then 'Published' else status end,
    name = case
      when nullif(btrim(name), '') is null then 'Certificate of Employment'
      else name
    end,
    document_title = case
      when nullif(btrim(document_title), '') is null then 'Certificate of Employment'
      else document_title
    end;

create unique index if not exists coe_templates_preset_key_unique
  on public.coe_templates(preset_key) where preset_key is not null;
create index if not exists coe_templates_bu_status_idx
  on public.coe_templates(business_unit_id, is_active desc, status, updated_at desc);
create unique index if not exists coe_templates_one_active_per_bu
  on public.coe_templates(business_unit_id)
  where is_active;
create index if not exists coe_templates_created_from_idx
  on public.coe_templates(created_from_template_id)
  where created_from_template_id is not null;
create index if not exists coe_templates_archived_by_idx
  on public.coe_templates(archived_by)
  where archived_by is not null;

alter table public.coe_requests
  add column if not exists template_id uuid references public.coe_templates(id) on delete set null,
  add column if not exists template_snapshot jsonb,
  add column if not exists employee_snapshot jsonb,
  add column if not exists snapshot_created_at timestamptz,
  add column if not exists generation_source text,
  add column if not exists fallback_reason text,
  add column if not exists document_version integer not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.coe_requests'::regclass
      and conname = 'coe_requests_generation_source_check'
  ) then
    alter table public.coe_requests
      add constraint coe_requests_generation_source_check
      check (generation_source is null or generation_source in ('template', 'fallback', 'historical_snapshot')) not valid;
    alter table public.coe_requests validate constraint coe_requests_generation_source_check;
  end if;
end
$$;

create index if not exists coe_requests_template_idx
  on public.coe_requests(template_id) where template_id is not null;
create index if not exists coe_requests_snapshot_idx
  on public.coe_requests(status, snapshot_created_at)
  where status = 'Approved';

-- Build a complete document payload from one request. This is private so the
-- public RPCs remain the only client entry points and can enforce access rules.
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
begin
  select u.* into employee_row
  from public.hris_users u
  where u.id = p_request.employee_id;

  select bu.name, bu.color
    into business_unit_name, business_unit_color
  from public.business_units bu
  where bu.id = coalesce(p_request.employee_business_unit_id, employee_row.business_unit_id);

  select d.name into department_name
  from public.departments d
  where d.id = coalesce(p_request.employee_department_id, employee_row.department_id);

  -- A template is always selected within the request's business unit. An
  -- archived/replaced same-unit template may be used for legacy recovery; a
  -- template from another brand is never used as a fallback.
  select t.* into template_row
  from public.coe_templates t
  where t.business_unit_id = coalesce(p_request.employee_business_unit_id, employee_row.business_unit_id)
  order by
    case when t.is_active and t.status = 'Published' then 0
         when t.status = 'Published' then 1
         when t.status = 'Draft' then 2
         else 3 end,
    t.updated_at desc,
    t.created_at desc
  limit 1;

  purpose_text := case p_request.purpose::text
    when 'LOAN_APPLICATION' then 'loan application'
    when 'TRAVEL' then 'travel requirements'
    when 'VISA_APPLICATION' then 'visa application'
    when 'SCHOOL_APPLICATION' then 'school application'
    when 'LEGAL_PURPOSES' then 'legal purposes'
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
    'businessUnitId', coalesce(p_request.employee_business_unit_id, employee_row.business_unit_id),
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
      'version', template_row.version,
      'presetKey', template_row.preset_key
    );
  else
    source_value := 'fallback';
    fallback_value := format(
      'No COE template was available for business unit %s; the protected system fallback was used.',
      coalesce(business_unit_name, p_request.employee_business_unit_id::text, 'unknown')
    );
    template_value := jsonb_build_object(
      'id', null,
      'businessUnitId', coalesce(p_request.employee_business_unit_id, employee_row.business_unit_id),
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

-- Compatibility guard: an older application client that changes a request to
-- Approved still receives immutable snapshots before the row is written.
create or replace function private.ensure_coe_approval_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  document_value jsonb;
begin
  if new.status in ('Approved', 'Rejected')
     and (
       tg_op = 'INSERT'
       or old.status is distinct from new.status
     )
     and not (
       public.is_hr_or_admin()
       or (
         public.has_feature_permission('COE', 'approve')
         and public.can_access_hris_user(new.employee_id)
       )
       or (
         public.has_feature_permission('COE', 'manage')
         and public.can_access_hris_user(new.employee_id)
       )
     ) then
    raise exception 'You do not have permission to approve or reject this COE request.' using errcode = '42501';
  end if;

  if new.status = 'Approved'
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

-- Backfill every approved historical record without changing its original
-- generated URL, approval timestamp, status, or approver.
do $$
declare
  request_row public.coe_requests;
  document_value jsonb;
begin
  for request_row in
    select * from public.coe_requests
    where status = 'Approved'
      and (template_snapshot is null or employee_snapshot is null)
    order by created_at
  loop
    document_value := private.build_coe_document(request_row);
    update public.coe_requests
       set template_id = nullif(document_value->>'templateId', '')::uuid,
           template_snapshot = document_value->'template',
           employee_snapshot = document_value->'employee',
           snapshot_created_at = coalesce(request_row.approved_at, request_row.updated_at, now()),
           generation_source = case
             when document_value->>'generationSource' = 'fallback' then 'fallback'
             else 'historical_snapshot'
           end,
           fallback_reason = document_value->>'fallbackReason'
     where id = request_row.id;

    if document_value->>'generationSource' = 'fallback' then
      insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
      values (
        'system:migration', null, 'GENERATE', 'COE', request_row.id::text,
        format(
          'Created a protected fallback snapshot while recovering historical COE data. %s',
          coalesce(document_value->>'fallbackReason', '')
        )
      );
    end if;
  end loop;
end
$$;

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

  if not (
    public.is_hr_or_admin()
    or (
      public.has_feature_permission('COE', 'approve')
      and public.can_access_hris_user(request_row.employee_id)
    )
    or (
      public.has_feature_permission('COE', 'manage')
      and public.can_access_hris_user(request_row.employee_id)
    )
  ) then
    raise exception 'You do not have permission to approve this COE request.' using errcode = '42501';
  end if;

  if request_row.status = 'Rejected' then
    raise exception 'A rejected COE request cannot be approved without reopening the existing workflow.';
  end if;

  if request_row.status = 'Approved'
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

    select email into actor_email from public.hris_users where id = actor_id;
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

create or replace function public.get_coe_document(p_request_id uuid)
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
  employee_value jsonb;
  may_view_salary boolean := false;
  regenerated_document boolean := false;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select * into request_row
  from public.coe_requests
  where id = p_request_id;
  if request_row.id is null then
    raise exception 'COE request not found.' using errcode = 'P0002';
  end if;
  if request_row.status <> 'Approved' then
    raise exception 'The COE is not approved yet.';
  end if;

  if not (
    request_row.employee_id = actor_id
    or public.is_hr_or_admin()
    or (
      public.has_feature_permission('COE', 'view')
      and public.can_access_hris_user(request_row.employee_id)
    )
  ) then
    raise exception 'You do not have access to this COE document.' using errcode = '42501';
  end if;

  if request_row.template_snapshot is null or request_row.employee_snapshot is null then
    document_value := private.build_coe_document(request_row);
    update public.coe_requests
       set template_id = nullif(document_value->>'templateId', '')::uuid,
           template_snapshot = document_value->'template',
           employee_snapshot = document_value->'employee',
           snapshot_created_at = now(),
           generation_source = document_value->>'generationSource',
           fallback_reason = document_value->>'fallbackReason'
     where id = p_request_id
     returning * into request_row;
    regenerated_document := true;
  else
    document_value := jsonb_build_object(
      'generationSource', coalesce(request_row.generation_source, 'historical_snapshot'),
      'fallbackReason', request_row.fallback_reason,
      'template', request_row.template_snapshot,
      'employee', request_row.employee_snapshot
    );
  end if;

  may_view_salary := request_row.employee_id = actor_id
    or public.is_hr_or_admin()
    or public.has_sensitive_permission('salary_compensation', 'view');
  employee_value := document_value->'employee';
  if not may_view_salary then
    employee_value := employee_value - 'salary';
  end if;

  select email into actor_email from public.hris_users where id = actor_id;
  if regenerated_document then
    insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
    values (
      actor_id::text,
      actor_email,
      'GENERATE',
      'COE',
      p_request_id::text,
      format(
        'Recovered a missing immutable COE snapshot (source=%s). %s',
        document_value->>'generationSource',
        coalesce(document_value->>'fallbackReason', '')
      )
    );
  end if;

  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  values (
    actor_id::text,
    actor_email,
    'VIEW',
    'COE',
    p_request_id::text,
    format('Viewed approved COE document version %s.', request_row.document_version)
  );

  return jsonb_build_object(
    'request', to_jsonb(request_row) - 'template_snapshot' - 'employee_snapshot',
    'template', document_value->'template',
    'employee', employee_value,
    'meta', jsonb_build_object(
      'generationSource', document_value->>'generationSource',
      'fallbackReason', document_value->>'fallbackReason',
      'snapshotCreatedAt', request_row.snapshot_created_at,
      'documentVersion', request_row.document_version,
      'salaryRedacted', not may_view_salary
    )
  );
end;
$$;

revoke all on function public.get_coe_document(uuid) from public, anon;
grant execute on function public.get_coe_document(uuid) to authenticated;

create or replace function public.record_coe_document_event(p_request_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_email text;
  request_row public.coe_requests;
  normalized_action text := upper(btrim(coalesce(p_action, '')));
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if normalized_action not in ('PRINT', 'DOWNLOAD', 'EMAIL') then
    raise exception 'Unsupported COE document event.';
  end if;

  select * into request_row from public.coe_requests where id = p_request_id;
  if request_row.id is null or request_row.status <> 'Approved' then
    raise exception 'Approved COE document not found.' using errcode = 'P0002';
  end if;
  if not (
    request_row.employee_id = actor_id
    or public.is_hr_or_admin()
    or (public.has_feature_permission('COE', 'view') and public.can_access_hris_user(request_row.employee_id))
  ) then
    raise exception 'You do not have access to this COE document.' using errcode = '42501';
  end if;

  select email into actor_email from public.hris_users where id = actor_id;
  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  values (
    actor_id::text,
    actor_email,
    normalized_action,
    'COE',
    p_request_id::text,
    format('%s approved COE document version %s.', initcap(lower(normalized_action)), request_row.document_version)
  );
end;
$$;

revoke all on function public.record_coe_document_event(uuid,text) from public, anon;
grant execute on function public.record_coe_document_event(uuid,text) to authenticated;

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

  if v_template_status = 'Published' then
    update public.coe_templates
       set is_active = false,
           updated_at = now()
     where business_unit_id = v_business_unit_id
       and is_active
       and (v_template_id is null or id <> v_template_id);
  end if;

  if v_template_id is null then
    insert into public.coe_templates(
      business_unit_id, name, description, document_title, logo_url, address, body,
      signatory_name, signatory_position, signature_url, footer_text, style_key,
      primary_color, accent_color, font_family, layout_settings, status, is_active,
      version, is_preset, preset_key, created_from_template_id, created_by
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
     set status = 'Archived', is_active = false, archived_at = now(),
         archived_by = actor_id, updated_at = now(), version = version + 1
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

-- Four editable styles for every configured business unit. Existing active
-- templates remain active; only units without an active template receive a
-- Classic Corporate default. No brand is copied across business units.
with styles(style_key, style_name, description, title, body, primary_color, accent_color, font_family, layout_settings) as (
  values
    (
      'classic-corporate', 'Classic Corporate COE', 'Traditional official employment certificate layout.',
      'Certificate of Employment',
      '<p>This is to certify that <strong>{{employee_name}}</strong> is a bona fide employee of <strong>{{business_unit}}</strong> and currently holds the position of <strong>{{position}}</strong> in the {{department}} department. The employee has served from {{date_hired}} {{end_date}}.</p><p>This certification is issued upon the employee''s request for {{purpose}}.</p><p>Issued this {{date_today}}.</p>',
      '#1e3a8a', '#64748b', 'Times New Roman',
      jsonb_build_object('marginTopMm',22,'marginRightMm',22,'marginBottomMm',22,'marginLeftMm',22,'lineHeight',1.65,'textAlignment','justify','logoAlignment','center','logoHeightMm',24)
    ),
    (
      'modern-minimal', 'Modern Minimal COE', 'Contemporary whitespace-led official certificate.',
      'Certificate of Employment',
      '<p>This letter confirms that <strong>{{employee_name}}</strong> is employed by <strong>{{business_unit}}</strong> as <strong>{{position}}</strong>, {{department}}. Employment commenced on {{date_hired}} and the current status is {{employment_status}}.</p><p>This certificate is provided for {{purpose}}.</p><p>Issued on {{date_today}}.</p>',
      '#111827', '#94a3b8', 'Arial',
      jsonb_build_object('marginTopMm',24,'marginRightMm',24,'marginBottomMm',24,'marginLeftMm',24,'lineHeight',1.55,'textAlignment','left','logoAlignment','left','logoHeightMm',20)
    ),
    (
      'branded-accent', 'Branded Accent COE', 'Modern business-unit color accents with an official A4 layout.',
      'Certificate of Employment',
      '<p>To whom it may concern:</p><p>This is to certify that <strong>{{employee_name}}</strong> is employed with <strong>{{business_unit}}</strong> as <strong>{{position}}</strong> under {{department}}, beginning {{date_hired}}. Employment status: {{employment_status}}.</p><p>This certificate is issued for {{purpose}} on {{date_today}}.</p>',
      '#4f46e5', '#c7d2fe', 'Arial',
      jsonb_build_object('marginTopMm',18,'marginRightMm',22,'marginBottomMm',20,'marginLeftMm',22,'lineHeight',1.6,'textAlignment','justify','logoAlignment','left','logoHeightMm',22)
    ),
    (
      'business-unit-signature', 'Business-Unit Signature COE', 'Strong header, signature block, and business-unit footer treatment.',
      'Certification',
      '<p>This is to certify that <strong>{{employee_name}}</strong> has been employed by <strong>{{business_unit}}</strong> as <strong>{{position}}</strong> in {{department}} from {{date_hired}} {{end_date}}.</p><p>This certification is issued at the employee''s request for {{purpose}} and may be used for lawful purposes.</p><p>Given this {{date_today}} at {{business_address}}.</p>',
      '#0f172a', '#f59e0b', 'Georgia',
      jsonb_build_object('marginTopMm',20,'marginRightMm',20,'marginBottomMm',18,'marginLeftMm',20,'lineHeight',1.65,'textAlignment','justify','logoAlignment','center','logoHeightMm',26)
    )
)
insert into public.coe_templates(
  business_unit_id, name, description, document_title, logo_url, address, body,
  signatory_name, signatory_position, signature_url, footer_text, style_key,
  primary_color, accent_color, font_family, layout_settings, status, is_active,
  is_preset, preset_key
)
select
  bu.id,
  styles.style_name,
  styles.description,
  styles.title,
  brand.logo_url,
  coalesce(brand.address, ''),
  styles.body,
  coalesce(nullif(brand.signatory_name, ''), 'Human Resources Department'),
  coalesce(nullif(brand.signatory_position, ''), 'Authorized Signatory'),
  brand.signature_url,
  coalesce(bu.name, 'TNG') || ' · Official Certificate of Employment',
  styles.style_key,
  case
    when nullif(bu.color, '') is not null then bu.color
    when lower(bu.name) like '%dessert museum%' then '#ec4899'
    when lower(bu.name) like '%gootopia%' then '#d946ef'
    when lower(bu.name) like '%bakebe%' then '#a855f7'
    when lower(bu.name) like '%inflatable island%' then '#0891b2'
    when lower(bu.name) like '%fun roof%' then '#7c3aed'
    else styles.primary_color
  end,
  case
    when lower(bu.name) like '%dessert museum%' then '#fbcfe8'
    when lower(bu.name) like '%gootopia%' then '#fde047'
    when lower(bu.name) like '%bakebe%' then '#f9a8d4'
    when lower(bu.name) like '%inflatable island%' then '#facc15'
    when lower(bu.name) like '%fun roof%' then '#fb923c'
    else styles.accent_color
  end,
  styles.font_family,
  styles.layout_settings,
  'Published',
  styles.style_key = 'classic-corporate' and not exists (
    select 1 from public.coe_templates active_template
    where active_template.business_unit_id = bu.id and active_template.is_active
  ),
  true,
  'coe-' || bu.id::text || '-' || styles.style_key
from public.business_units bu
cross join styles
left join lateral (
  select t.logo_url, t.address, t.signatory_name, t.signatory_position, t.signature_url
  from public.coe_templates t
  where t.business_unit_id = bu.id
  order by t.is_active desc, t.updated_at desc
  limit 1
) brand on true
on conflict (preset_key) where preset_key is not null do nothing;

-- ---------------------------------------------------------------------------
-- Code of Discipline categories, flexible entries, version history, imports
-- ---------------------------------------------------------------------------

alter table public.discipline_categories
  add column if not exists description text,
  add column if not exists display_order integer not null default 0,
  add column if not exists is_active boolean not null default true,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.hris_users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

with ordered as (
  select name, row_number() over (order by lower(name), name) * 10 as desired_order
  from public.discipline_categories
)
update public.discipline_categories categories
set display_order = ordered.desired_order
from ordered
where categories.name = ordered.name and categories.display_order = 0;

create unique index if not exists discipline_categories_name_ci_unique
  on public.discipline_categories(lower(btrim(name)));
create index if not exists discipline_categories_display_idx
  on public.discipline_categories(is_active desc, display_order, lower(name));
create index if not exists discipline_categories_archived_by_idx
  on public.discipline_categories(archived_by)
  where archived_by is not null;

alter table public.discipline_entries
  add column if not exists business_unit_id uuid references public.business_units(id) on delete set null,
  add column if not exists is_active boolean not null default true,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.hris_users(id) on delete set null,
  add column if not exists last_modified_by_user_id uuid references public.hris_users(id) on delete set null;

create index if not exists discipline_entries_category_active_idx
  on public.discipline_entries(category, is_active, code);
create unique index if not exists discipline_entries_code_ci_unique
  on public.discipline_entries(lower(btrim(code)));
create index if not exists discipline_entries_business_unit_idx
  on public.discipline_entries(business_unit_id) where business_unit_id is not null;
create index if not exists discipline_entries_archived_by_idx
  on public.discipline_entries(archived_by) where archived_by is not null;
create index if not exists discipline_entries_modified_by_idx
  on public.discipline_entries(last_modified_by_user_id)
  where last_modified_by_user_id is not null;

create table if not exists public.discipline_entry_versions (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.discipline_entries(id) on delete restrict,
  version_number integer not null,
  snapshot jsonb not null,
  changed_by uuid references public.hris_users(id) on delete set null,
  changed_at timestamptz not null default now(),
  change_source text not null default 'editor',
  unique(entry_id, version_number)
);

alter table public.discipline_entry_versions enable row level security;
create index if not exists discipline_entry_versions_entry_idx
  on public.discipline_entry_versions(entry_id, version_number desc);
create index if not exists discipline_entry_versions_changed_by_idx
  on public.discipline_entry_versions(changed_by)
  where changed_by is not null;

drop policy if exists discipline_entry_versions_read on public.discipline_entry_versions;
create policy discipline_entry_versions_read on public.discipline_entry_versions
for select to authenticated
using (
  public.is_hr_or_admin()
  or public.has_feature_permission('CodeOfDiscipline', 'view')
);

revoke all on table public.discipline_entry_versions from public, anon, authenticated;
grant select on table public.discipline_entry_versions to authenticated;

create or replace function private.capture_discipline_entry_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_version integer;
begin
  if to_jsonb(old) is distinct from to_jsonb(new) then
    select coalesce(max(version_number), 0) + 1 into next_version
    from public.discipline_entry_versions
    where entry_id = old.id;

    insert into public.discipline_entry_versions(
      entry_id, version_number, snapshot, changed_by, change_source
    ) values (
      old.id,
      next_version,
      to_jsonb(old),
      public.current_hris_user_id(),
      coalesce(current_setting('app.discipline_change_source', true), 'editor')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists discipline_entry_version_guard on public.discipline_entries;
create trigger discipline_entry_version_guard
before update on public.discipline_entries
for each row execute function private.capture_discipline_entry_version();

revoke all on function private.capture_discipline_entry_version() from public, anon, authenticated;

create table if not exists public.discipline_import_runs (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid not null references public.hris_users(id) on delete restrict,
  file_name text not null,
  import_mode text not null check (import_mode in ('add_only', 'update_only', 'add_update')),
  total_rows integer not null default 0,
  imported_rows integer not null default 0,
  updated_rows integer not null default 0,
  skipped_rows integer not null default 0,
  failed_rows integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.discipline_import_runs enable row level security;
create index if not exists discipline_import_runs_uploader_idx
  on public.discipline_import_runs(uploaded_by, created_at desc);

drop policy if exists discipline_import_runs_read on public.discipline_import_runs;
create policy discipline_import_runs_read on public.discipline_import_runs
for select to authenticated
using (
  uploaded_by = public.current_hris_user_id()
  or public.is_hr_or_admin()
  or public.has_feature_permission('CodeOfDiscipline', 'manage')
);

revoke all on table public.discipline_import_runs from public, anon, authenticated;
grant select on table public.discipline_import_runs to authenticated;

create or replace function public.save_discipline_categories(p_categories jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_email text;
  item jsonb;
  original_name text;
  category_name text;
  category_description text;
  order_value integer;
  active_value boolean;
  archived_value boolean;
  saved_count integer := 0;
begin
  if actor_id is null or not (
    public.is_hr_or_admin()
    or public.has_feature_permission('CodeOfDiscipline', 'manage')
    or public.has_feature_permission('CodeOfDiscipline', 'edit')
  ) then
    raise exception 'You do not have permission to manage discipline categories.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_categories) <> 'array' then
    raise exception 'Category payload must be an array.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_categories) value
    group by lower(btrim(value->>'name'))
    having count(*) > 1
  ) then
    raise exception 'Duplicate category names are not allowed.';
  end if;

  for item in select value from jsonb_array_elements(p_categories)
  loop
    original_name := nullif(btrim(item->>'originalName'), '');
    category_name := nullif(btrim(item->>'name'), '');
    category_description := nullif(btrim(item->>'description'), '');
    order_value := greatest(coalesce((item->>'displayOrder')::integer, 0), 0);
    active_value := coalesce((item->>'isActive')::boolean, true);
    archived_value := coalesce((item->>'archived')::boolean, false);
    if category_name is null then
      raise exception 'Category name is required.';
    end if;
    if exists (
      select 1 from public.discipline_categories c
      where lower(btrim(c.name)) = lower(category_name)
        and (original_name is null or c.name <> original_name)
    ) then
      raise exception 'Category "%" already exists.', category_name;
    end if;

    if original_name is not null and exists (
      select 1 from public.discipline_categories where name = original_name
    ) then
      update public.discipline_categories
         set name = category_name,
             description = category_description,
             display_order = order_value,
             is_active = case when archived_value then false else active_value end,
             archived_at = case when archived_value then coalesce(archived_at, now()) else null end,
             archived_by = case when archived_value then actor_id else null end,
             updated_at = now()
       where name = original_name;
    else
      insert into public.discipline_categories(
        name, description, display_order, is_active, archived_at, archived_by
      ) values (
        category_name, category_description, order_value,
        case when archived_value then false else active_value end,
        case when archived_value then now() else null end,
        case when archived_value then actor_id else null end
      );
    end if;
    saved_count := saved_count + 1;
  end loop;

  select email into actor_email from public.hris_users where id = actor_id;
  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  values (
    actor_id::text, actor_email, 'UPDATE', 'DisciplineCategory', null,
    format('Saved %s Code of Discipline category record(s).', saved_count)
  );

  return jsonb_build_object('saved', saved_count);
end;
$$;

revoke all on function public.save_discipline_categories(jsonb) from public, anon;
grant execute on function public.save_discipline_categories(jsonb) to authenticated;

create or replace function public.archive_discipline_entry(p_entry_id uuid)
returns public.discipline_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_email text;
  saved_row public.discipline_entries;
begin
  if actor_id is null or not (
    public.is_hr_or_admin()
    or public.has_feature_permission('CodeOfDiscipline', 'manage')
    or public.has_feature_permission('CodeOfDiscipline', 'edit')
  ) then
    raise exception 'You do not have permission to archive discipline entries.' using errcode = '42501';
  end if;

  perform set_config('app.discipline_change_source', 'archive', true);
  update public.discipline_entries
     set is_active = false, archived_at = now(), archived_by = actor_id,
         last_modified_at = now(), last_modified_by_user_id = actor_id
   where id = p_entry_id
   returning * into saved_row;
  if saved_row.id is null then
    raise exception 'Discipline entry not found.' using errcode = 'P0002';
  end if;

  select email into actor_email from public.hris_users where id = actor_id;
  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  values (
    actor_id::text, actor_email, 'UPDATE', 'DisciplineEntry', saved_row.id::text,
    format('Archived Code of Discipline entry %s; version history was preserved.', saved_row.code)
  );
  return saved_row;
end;
$$;

revoke all on function public.archive_discipline_entry(uuid) from public, anon;
grant execute on function public.archive_discipline_entry(uuid) to authenticated;

create or replace function public.bulk_import_discipline_entries(
  p_rows jsonb,
  p_mode text,
  p_file_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_email text;
  import_id uuid;
  row_value jsonb;
  row_number_value integer := 0;
  reported_row_number integer;
  total_count integer := 0;
  inserted_count integer := 0;
  updated_count integer := 0;
  skipped_count integer := 0;
  failed_count integer := 0;
  errors_value jsonb := '[]'::jsonb;
  seen_codes text[] := array[]::text[];
  code_value text;
  category_input text;
  category_value text;
  severity_value text;
  description_value text;
  status_value text;
  business_unit_input text;
  business_unit_value uuid;
  existing_row public.discipline_entries;
  sanctions_value jsonb;
  sanction_text text;
  sanction_index integer;
  sanction_gap_found boolean;
begin
  if actor_id is null or not (
    public.is_hr_or_admin()
    or public.has_feature_permission('CodeOfDiscipline', 'manage')
    or public.has_feature_permission('CodeOfDiscipline', 'edit')
  ) then
    raise exception 'You do not have permission to import discipline entries.' using errcode = '42501';
  end if;
  if p_mode not in ('add_only', 'update_only', 'add_update') then
    raise exception 'Import mode must be add_only, update_only, or add_update.';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Import rows must be a JSON array.';
  end if;
  if coalesce(jsonb_array_length(p_rows), 0) > 5000 then
    raise exception 'A maximum of 5,000 rows may be imported at one time.';
  end if;

  total_count := coalesce(jsonb_array_length(p_rows), 0);
  insert into public.discipline_import_runs(uploaded_by, file_name, import_mode, total_rows)
  values (actor_id, coalesce(nullif(btrim(p_file_name), ''), 'unnamed import'), p_mode, total_count)
  returning id into import_id;

  perform set_config('app.discipline_change_source', 'bulk_import:' || import_id::text, true);

  for row_value in select value from jsonb_array_elements(p_rows)
  loop
    row_number_value := row_number_value + 1;
    reported_row_number := row_number_value;
    begin
      reported_row_number := coalesce(nullif(row_value->>'source_row_number', '')::integer, row_number_value);
      code_value := nullif(btrim(row_value->>'code'), '');
      category_input := nullif(btrim(row_value->>'category'), '');
      severity_value := initcap(lower(btrim(coalesce(row_value->>'severity_level', row_value->>'severity'))));
      description_value := nullif(btrim(row_value->>'description'), '');
      status_value := lower(btrim(coalesce(row_value->>'status', 'active')));
      business_unit_input := nullif(btrim(row_value->>'business_unit'), '');
      business_unit_value := null;
      sanctions_value := '[]'::jsonb;
      sanction_gap_found := false;

      if code_value is null then raise exception 'Code is required.'; end if;
      if category_input is null then raise exception 'Category is required.'; end if;
      if description_value is null then raise exception 'Description is required.'; end if;
      if severity_value not in ('Low', 'Medium', 'High', 'Critical') then
        raise exception 'Severity must be Low, Medium, High, or Critical.';
      end if;
      if status_value not in ('active', 'inactive') then
        raise exception 'Status must be Active or Inactive.';
      end if;
      if lower(code_value) = any(seen_codes) then
        raise exception 'Duplicate code appears more than once in this upload.';
      end if;
      seen_codes := array_append(seen_codes, lower(code_value));

      select c.name into category_value
      from public.discipline_categories c
      where lower(btrim(c.name)) = lower(category_input) and c.is_active
      limit 1;
      if category_value is null then
        raise exception 'Category does not exist or is inactive.';
      end if;

      if business_unit_input is not null then
        select bu.id into business_unit_value
        from public.business_units bu
        where bu.id::text = business_unit_input
           or lower(btrim(bu.name)) = lower(business_unit_input)
           or lower(btrim(coalesce(bu.code, ''))) = lower(business_unit_input)
        limit 1;
        if business_unit_value is null then
          raise exception 'Business unit was not found.';
        end if;
      end if;

      if exists (
        select 1
        from public.discipline_entries duplicate_entry
        where lower(btrim(duplicate_entry.category)) = lower(category_value)
          and lower(btrim(duplicate_entry.description)) = lower(description_value)
          and lower(btrim(duplicate_entry.code)) <> lower(code_value)
      ) then
        raise exception 'A duplicate entry with the same category and description already exists.';
      end if;

      if jsonb_typeof(row_value->'sanctions') = 'array' then
        sanctions_value := row_value->'sanctions';
      else
        for sanction_index in 1..10 loop
          sanction_text := nullif(btrim(row_value->>('sanction_' || sanction_index::text)), '');
          if sanction_text is not null then
            if sanction_gap_found then
              raise exception 'Sanction levels cannot contain gaps.';
            end if;
            sanctions_value := sanctions_value || jsonb_build_array(jsonb_build_object(
              'offense', jsonb_array_length(sanctions_value) + 1,
              'action', sanction_text
            ));
          else
            sanction_gap_found := true;
          end if;
        end loop;
      end if;
      if exists (
        select 1 from jsonb_array_elements(sanctions_value) sanction
        where nullif(btrim(sanction->>'action'), '') is null
      ) then
        raise exception 'Sanction values cannot be empty.';
      end if;

      select * into existing_row
      from public.discipline_entries
      where lower(btrim(code)) = lower(code_value)
      for update;

      if existing_row.id is not null and p_mode = 'add_only' then
        skipped_count := skipped_count + 1;
        errors_value := errors_value || jsonb_build_array(jsonb_build_object(
          'rowNumber', reported_row_number, 'code', code_value, 'field', 'code',
          'reason', 'An entry with this code already exists.',
          'suggestion', 'Choose Update matching entries or Add and update.'
        ));
      elsif existing_row.id is null and p_mode = 'update_only' then
        skipped_count := skipped_count + 1;
        errors_value := errors_value || jsonb_build_array(jsonb_build_object(
          'rowNumber', reported_row_number, 'code', code_value, 'field', 'code',
          'reason', 'No matching entry exists to update.',
          'suggestion', 'Choose Add and update or Add new entries only.'
        ));
      elsif existing_row.id is not null then
        update public.discipline_entries
           set code = code_value,
               category = category_value,
               description = description_value,
               severity = severity_value::public.severity_level,
               sanctions = sanctions_value,
               business_unit_id = business_unit_value,
               is_active = status_value = 'active',
               archived_at = case when status_value = 'inactive' then coalesce(archived_at, now()) else null end,
               archived_by = case when status_value = 'inactive' then actor_id else null end,
               last_modified_at = now(),
               last_modified_by_user_id = actor_id
         where id = existing_row.id;
        updated_count := updated_count + 1;
      else
        insert into public.discipline_entries(
          code, category, description, severity, sanctions, business_unit_id,
          is_active, archived_at, archived_by, last_modified_at, last_modified_by_user_id
        ) values (
          code_value, category_value, description_value,
          severity_value::public.severity_level, sanctions_value, business_unit_value,
          status_value = 'active',
          case when status_value = 'inactive' then now() else null end,
          case when status_value = 'inactive' then actor_id else null end,
          now(), actor_id
        );
        inserted_count := inserted_count + 1;
      end if;
    exception when others then
      failed_count := failed_count + 1;
      errors_value := errors_value || jsonb_build_array(jsonb_build_object(
        'rowNumber', coalesce(reported_row_number, row_number_value),
        'code', coalesce(code_value, row_value->>'code', ''),
        'field', case
          when sqlerrm ilike '%category%' then 'category'
          when sqlerrm ilike '%severity%' then 'severity_level'
          when sqlerrm ilike '%business unit%' then 'business_unit'
          when sqlerrm ilike '%description%' then 'description'
          when sqlerrm ilike '%duplicate entry%' then 'description'
          when sqlerrm ilike '%sanction%' then 'sanctions'
          else 'row'
        end,
        'reason', sqlerrm,
        'suggestion', 'Correct the highlighted value and import the row again.'
      ));
    end;
  end loop;

  update public.discipline_import_runs
     set imported_rows = inserted_count,
         updated_rows = updated_count,
         skipped_rows = skipped_count,
         failed_rows = failed_count,
         errors = errors_value,
         completed_at = now()
   where id = import_id;

  select email into actor_email from public.hris_users where id = actor_id;
  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  values (
    actor_id::text, actor_email, 'IMPORT', 'DisciplineEntry', import_id::text,
    format(
      'Imported Code of Discipline file "%s" using %s mode: %s total, %s added, %s updated, %s skipped, %s failed.',
      coalesce(nullif(btrim(p_file_name), ''), 'unnamed import'), p_mode, total_count,
      inserted_count, updated_count, skipped_count, failed_count
    )
  );

  return jsonb_build_object(
    'importId', import_id,
    'total', total_count,
    'imported', inserted_count,
    'updated', updated_count,
    'skipped', skipped_count,
    'failed', failed_count,
    'errors', errors_value
  );
end;
$$;

revoke all on function public.bulk_import_discipline_entries(jsonb,text,text) from public, anon;
grant execute on function public.bulk_import_discipline_entries(jsonb,text,text) to authenticated;

-- The dashboard must query enum values that actually exist. Normalize the
-- legacy spelling while retaining the enum labels for backward compatibility.
update public.employee_awards
set status = 'PendingApproval'::public.award_status
where status::text = 'Pending Approval';
