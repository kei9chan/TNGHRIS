-- COE review-before-approval workflow.
-- Employees choose only a purpose; the database selects the configured default
-- template by business unit and purpose. HR may change the template and edit a
-- request-scoped snapshot before the final approval is recorded.

alter table public.coe_requests
  add column if not exists approval_content_edited boolean not null default false;

create or replace function private.normalize_coe_purpose(p_purpose text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_purpose
    when 'TRAVEL' then 'VISA_TRAVEL'
    when 'VISA_APPLICATION' then 'VISA_TRAVEL'
    when 'SCHOOL_APPLICATION' then 'SCHOOL_EDUCATION'
    when 'LEGAL_PURPOSES' then 'GOVERNMENT_LEGAL'
    else p_purpose
  end
$$;

revoke all on function private.normalize_coe_purpose(text) from public, anon, authenticated;

create or replace function private.resolve_coe_template(
  p_business_unit_id uuid,
  p_purpose text,
  p_requested_template_id uuid default null
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_purpose text := private.normalize_coe_purpose(p_purpose);
  resolved_id uuid;
begin
  if p_business_unit_id is null or normalized_purpose is null then
    return null;
  end if;

  if p_requested_template_id is not null then
    select t.id into resolved_id
    from public.coe_templates t
    where t.id = p_requested_template_id
      and t.business_unit_id = p_business_unit_id
      and t.is_active
      and t.status = 'Published'
      and (
        coalesce(array_length(t.purposes, 1), 0) = 0
        or normalized_purpose = any(t.purposes)
      );
    return resolved_id;
  end if;

  select t.id into resolved_id
  from public.coe_templates t
  where t.business_unit_id = p_business_unit_id
    and t.is_active
    and t.status = 'Published'
    and (
      coalesce(array_length(t.purposes, 1), 0) = 0
      or normalized_purpose = any(t.purposes)
    )
  order by
    case when normalized_purpose = any(coalesce(t.recommended_purposes, '{}'::text[])) then 0 else 1 end,
    t.updated_at desc,
    t.created_at desc,
    t.id
  limit 1;

  return resolved_id;
end;
$$;

revoke all on function private.resolve_coe_template(uuid, text, uuid) from public, anon, authenticated;

create or replace function private.ensure_coe_request_template()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  employee_business_unit_id uuid;
  request_business_unit_id uuid;
  resolved_template_id uuid;
begin
  if new.status::text not in ('Pending HR Manager Approval', 'Pending') then
    return new;
  end if;

  if new.purpose::text = 'OTHERS'
     and nullif(btrim(coalesce(new.other_purpose_detail, '')), '') is null then
    raise exception 'A custom purpose is required for an Other COE request.' using errcode = '23514';
  end if;

  select u.business_unit_id into employee_business_unit_id
  from public.hris_users u
  where u.id = new.employee_id;

  request_business_unit_id := coalesce(new.employee_business_unit_id, employee_business_unit_id);
  if request_business_unit_id is null then
    raise exception 'The employee must have a business unit before requesting a COE.' using errcode = '23514';
  end if;
  new.employee_business_unit_id := request_business_unit_id;

  if new.template_id is not null then
    resolved_template_id := private.resolve_coe_template(
      request_business_unit_id,
      new.purpose::text,
      new.template_id
    );
    if resolved_template_id is null then
      raise exception 'The selected COE template is not active for this business unit and purpose.' using errcode = '23514';
    end if;
  else
    resolved_template_id := private.resolve_coe_template(
      request_business_unit_id,
      new.purpose::text,
      null
    );
    if resolved_template_id is null then
      raise exception 'No active COE template is configured for this business unit and purpose.' using errcode = '23514';
    end if;
  end if;

  new.template_id := resolved_template_id;
  return new;
end;
$$;

drop trigger if exists coe_request_template_guard on public.coe_requests;
create trigger coe_request_template_guard
before insert or update of template_id, purpose, employee_business_unit_id, status on public.coe_requests
for each row execute function private.ensure_coe_request_template();

revoke all on function private.ensure_coe_request_template() from public, anon, authenticated;

-- Existing pending requests are preserved and receive the same default that a
-- newly submitted request would receive. No status, dates, or history change.
with defaults as (
  select
    r.id,
    private.resolve_coe_template(
      coalesce(r.employee_business_unit_id, u.business_unit_id),
      r.purpose::text,
      null
    ) as template_id
  from public.coe_requests r
  left join public.hris_users u on u.id = r.employee_id
  where r.status::text in ('Pending', 'Pending HR Manager Approval')
    and r.template_id is null
)
update public.coe_requests r
set template_id = d.template_id,
    updated_at = r.updated_at
from defaults d
where r.id = d.id
  and d.template_id is not null;

create or replace function public.get_coe_review_document(
  p_request_id uuid,
  p_template_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  request_row public.coe_requests;
  employee_business_unit_id uuid;
  request_business_unit_id uuid;
  selected_template_id uuid;
  document_value jsonb;
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
  if request_row.status::text not in ('Pending', 'Pending HR Manager Approval') then
    raise exception 'Only a pending COE request can be reviewed.';
  end if;
  if not private.is_coe_approval_authorized(actor_id, request_row.employee_id, 'approve') then
    raise exception 'You do not have permission to review this COE request.' using errcode = '42501';
  end if;

  select u.business_unit_id into employee_business_unit_id
  from public.hris_users u
  where u.id = request_row.employee_id;
  request_business_unit_id := coalesce(request_row.employee_business_unit_id, employee_business_unit_id);

  if p_template_id is not null then
    selected_template_id := private.resolve_coe_template(
      request_business_unit_id,
      request_row.purpose::text,
      p_template_id
    );
    if selected_template_id is null then
      raise exception 'The selected COE template is not active for this business unit and purpose.' using errcode = '23514';
    end if;
  else
    selected_template_id := private.resolve_coe_template(
      request_business_unit_id,
      request_row.purpose::text,
      request_row.template_id
    );
    if selected_template_id is null then
      selected_template_id := private.resolve_coe_template(
        request_business_unit_id,
        request_row.purpose::text,
        null
      );
    end if;
  end if;

  if selected_template_id is null then
    raise exception 'No active COE template is configured for this business unit and purpose.' using errcode = '23514';
  end if;

  request_row.template_id := selected_template_id;
  document_value := private.build_coe_document(request_row);

  return jsonb_build_object(
    'request', to_jsonb(request_row) - 'template_snapshot' - 'employee_snapshot',
    'template', document_value->'template',
    'employee', document_value->'employee',
    'meta', jsonb_build_object(
      'generationSource', document_value->>'generationSource',
      'fallbackReason', document_value->>'fallbackReason',
      'snapshotCreatedAt', null,
      'documentVersion', request_row.document_version
    )
  );
end;
$$;

revoke all on function public.get_coe_review_document(uuid, uuid) from public, anon;
grant execute on function public.get_coe_review_document(uuid, uuid) to authenticated;

create or replace function public.approve_coe_request_with_review(
  p_request_id uuid,
  p_template_id uuid,
  p_content_override text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_email text;
  request_row public.coe_requests;
  employee_business_unit_id uuid;
  request_business_unit_id uuid;
  selected_template_id uuid;
  content_value text := nullif(btrim(coalesce(p_content_override, '')), '');
  content_was_edited boolean := false;
  document_value jsonb;
  approved_time timestamptz := now();
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
  if request_row.status::text not in ('Pending', 'Pending HR Manager Approval') then
    raise exception 'Only a pending COE request can be approved.';
  end if;
  if not private.is_coe_approval_authorized(actor_id, request_row.employee_id, 'approve') then
    raise exception 'Only the configured HR approval authority can approve this COE request.' using errcode = '42501';
  end if;

  select u.business_unit_id into employee_business_unit_id
  from public.hris_users u
  where u.id = request_row.employee_id;
  request_business_unit_id := coalesce(request_row.employee_business_unit_id, employee_business_unit_id);
  selected_template_id := private.resolve_coe_template(
    request_business_unit_id,
    request_row.purpose::text,
    p_template_id
  );
  if selected_template_id is null then
    raise exception 'The selected COE template is not active for this business unit and purpose.' using errcode = '23514';
  end if;

  if content_value is not null then
    if length(content_value) > 50000 then
      raise exception 'The edited COE content is too long.' using errcode = '22001';
    end if;
    if content_value ~* '<[[:space:]]*(script|iframe|object|embed|form)'
       or content_value ~* 'javascript[[:space:]]*:'
       or content_value ~* '[[:space:]]on[a-z]+[[:space:]]*=' then
      raise exception 'The edited COE content contains unsupported HTML.' using errcode = '22023';
    end if;
    content_was_edited := true;
  end if;

  request_row.template_id := selected_template_id;
  request_row.approved_at := approved_time;
  document_value := private.build_coe_document(request_row);
  if content_was_edited then
    document_value := jsonb_set(document_value, '{template,body}', to_jsonb(content_value), true);
  end if;

  update public.coe_requests
     set status = 'Approved',
         approved_by = actor_id,
         approved_at = approved_time,
         rejection_reason = null,
         return_reason = null,
         returned_by = null,
         returned_at = null,
         generated_document_url = 'coe://request/' || p_request_id::text || '/document',
         template_id = selected_template_id,
         template_snapshot = document_value->'template',
         employee_snapshot = document_value->'employee',
         snapshot_created_at = approved_time,
         generation_source = document_value->>'generationSource',
         fallback_reason = document_value->>'fallbackReason',
         document_version = greatest(document_version, 1),
         approval_content_edited = content_was_edited,
         updated_at = approved_time
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
      'Approved and sent COE after review (template=%s, template_name=%s, content_edited=%s, approved_at=%s).',
      selected_template_id,
      coalesce(document_value->'template'->>'name', 'Certificate of Employment'),
      content_was_edited,
      approved_time
    )
  );

  return jsonb_build_object(
    'request', to_jsonb(request_row),
    'template', document_value->'template',
    'employee', document_value->'employee',
    'meta', jsonb_build_object(
      'generationSource', document_value->>'generationSource',
      'fallbackReason', document_value->>'fallbackReason',
      'snapshotCreatedAt', request_row.snapshot_created_at,
      'documentVersion', request_row.document_version
    )
  );
end;
$$;

revoke all on function public.approve_coe_request_with_review(uuid, uuid, text) from public, anon;
grant execute on function public.approve_coe_request_with_review(uuid, uuid, text) to authenticated;

-- Prevent older cached clients from bypassing the mandatory review step.
create or replace function public.approve_coe_request_with_snapshot(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_hris_user_id() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  raise exception 'Review the COE template and generated content before approval.' using errcode = '55000';
end;
$$;

revoke all on function public.approve_coe_request_with_snapshot(uuid) from public, anon;
grant execute on function public.approve_coe_request_with_snapshot(uuid) to authenticated;

comment on column public.coe_requests.approval_content_edited is
  'True when the approver changed the generated body for this request-scoped COE snapshot.';

notify pgrst, 'reload schema';
