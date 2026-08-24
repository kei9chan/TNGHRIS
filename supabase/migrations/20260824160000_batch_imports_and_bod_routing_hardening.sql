-- Batch asset/memo imports and the final hardening pass for conditional BOD routing.
-- Import RPCs are atomic and enforce the existing RBAC permissions server-side.

alter table public.assets
  add column if not exists brand text,
  add column if not exists model text,
  add column if not exists description text,
  add column if not exists condition text,
  add column if not exists warranty_expiry date;

alter table public.memos
  add column if not exists memo_number text,
  add column if not exists memo_type text,
  add column if not exists target_employee_ids uuid[] not null default '{}'::uuid[],
  add column if not exists publication_date date,
  add column if not exists notes text;

create unique index if not exists assets_asset_tag_normalized_key
  on public.assets (lower(btrim(asset_tag)));

create unique index if not exists assets_serial_number_normalized_key
  on public.assets (lower(btrim(serial_number)))
  where nullif(btrim(serial_number), '') is not null;

create unique index if not exists memos_memo_number_normalized_key
  on public.memos (lower(btrim(memo_number)))
  where nullif(btrim(memo_number), '') is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'memo_attachments',
  'memo_attachments',
  false,
  20971520,
  array['application/pdf','image/*','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/msword','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists memo_attachments_authorized_read on storage.objects;
create policy memo_attachments_authorized_read
on storage.objects for select to authenticated
using (
  bucket_id = 'memo_attachments'
  and (
    public.has_feature_permission('Feedback', 'edit')
    or public.has_feature_permission('Feedback', 'manage')
    or exists (
      select 1
      from public.memos m
      join public.hris_users viewer on viewer.id = public.current_hris_user_id()
      where (
          m.memo_number = (storage.foldername(name))[2]
          or name = any(m.attachments)
        )
        and lower(m.status::text) = 'published'
        and (
          coalesce(array_length(m.target_employee_ids, 1), 0) = 0
          and coalesce(array_length(m.target_business_units, 1), 0) = 0
          and coalesce(array_length(m.target_departments, 1), 0) = 0
          or viewer.id = any(m.target_employee_ids)
          or 'All' = any(m.target_business_units)
          or 'All' = any(m.target_departments)
          or viewer.business_unit = any(m.target_business_units)
          or viewer.business_unit_id::text = any(m.target_business_units)
          or viewer.department = any(m.target_departments)
          or viewer.department_id::text = any(m.target_departments)
        )
    )
  )
);

drop policy if exists memo_attachments_authorized_insert on storage.objects;
create policy memo_attachments_authorized_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'memo_attachments'
  and (
    public.has_feature_permission('Feedback', 'edit')
    or public.has_feature_permission('Feedback', 'manage')
  )
);

drop policy if exists memo_attachments_authorized_update on storage.objects;
create policy memo_attachments_authorized_update
on storage.objects for update to authenticated
using (
  bucket_id = 'memo_attachments'
  and (
    public.has_feature_permission('Feedback', 'edit')
    or public.has_feature_permission('Feedback', 'manage')
  )
)
with check (
  bucket_id = 'memo_attachments'
  and (
    public.has_feature_permission('Feedback', 'edit')
    or public.has_feature_permission('Feedback', 'manage')
  )
);

drop policy if exists memo_attachments_authorized_delete on storage.objects;
create policy memo_attachments_authorized_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'memo_attachments'
  and (
    public.has_feature_permission('Feedback', 'edit')
    or public.has_feature_permission('Feedback', 'manage')
  )
);

create or replace function private.is_time_approval_bod(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists (
    select 1
    from public.hris_users u
    where u.id = p_user_id
      and lower(btrim(coalesce(u.status, ''))) = 'active'
      and (
        lower(btrim(coalesce(u.role, ''))) in ('board of director', 'board of directors', 'bod')
        or exists (
          select 1
          from public.user_roles ur
          where ur.user_id = u.id
            and ur.is_active
            and lower(btrim(coalesce(ur.role_id, ''))) in ('board of director', 'board of directors', 'bod')
        )
      )
  )
$$;

create or replace function public.get_conditional_time_approval_config()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  cfg jsonb := private.conditional_time_approval_config();
  selected_active_bods integer;
  required_active_bods integer;
  required_count integer := greatest(1, coalesce((cfg->>'required_bod_approvals')::integer, 1));
begin
  select count(*) into selected_active_bods
  from pg_catalog.jsonb_array_elements_text(coalesce(cfg->'user_ids', '[]'::jsonb)) selected(user_id)
  where private.is_time_approval_bod(selected.user_id::uuid);

  select count(*) into required_active_bods
  from pg_catalog.jsonb_array_elements_text(coalesce(cfg->'required_user_ids', '[]'::jsonb)) required(user_id)
  where private.is_time_approval_bod(required.user_id::uuid);

  return cfg || jsonb_build_object(
    'selected_active_bod_count', selected_active_bods,
    'required_active_bod_count', required_active_bods,
    'valid', required_active_bods >= required_count,
    'invalid_reason', case
      when required_active_bods >= required_count then null
      when selected_active_bods = 0 then 'No selected approver is an active BOD. Check the user role, active status, and saved configuration.'
      else 'At least one selected active BOD approver must be marked as required.'
    end
  );
end;
$$;

create or replace function public.save_conditional_time_approval_config(p_config jsonb, p_change_note text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  selected_ids uuid[] := coalesce(array(
    select distinct value::uuid
    from pg_catalog.jsonb_array_elements_text(coalesce(p_config->'user_ids', '[]'::jsonb)) items(value)
  ), '{}'::uuid[]);
  required_ids uuid[] := coalesce(array(
    select distinct value::uuid
    from pg_catalog.jsonb_array_elements_text(coalesce(p_config->'required_user_ids', '[]'::jsonb)) items(value)
  ), '{}'::uuid[]);
  active_count integer;
  required_active_bod_count integer;
  required_bod_count integer := greatest(1, coalesce((p_config->>'required_bod_approvals')::integer, 1));
  previous_value jsonb;
  normalized jsonb;
begin
  if actor_id is null or not public.is_system_admin() then
    raise exception 'Only an active system Admin can change conditional approval routing.' using errcode='42501';
  end if;
  if nullif(btrim(p_change_note), '') is null then
    raise exception 'A reason or change note is required.' using errcode='22023';
  end if;
  if coalesce(array_length(selected_ids, 1), 0) = 0 then
    raise exception 'Select at least one escalated approver.' using errcode='22023';
  end if;
  if not required_ids <@ selected_ids then
    raise exception 'Every required approver must also be selected.' using errcode='22023';
  end if;

  select count(*) into active_count
  from public.hris_users
  where id = any(selected_ids)
    and lower(btrim(coalesce(status, ''))) = 'active';
  if active_count <> coalesce(array_length(selected_ids, 1), 0) then
    raise exception 'All configured approvers must have active accounts.' using errcode='22023';
  end if;

  select count(*) into required_active_bod_count
  from pg_catalog.unnest(required_ids) candidate(id)
  where private.is_time_approval_bod(candidate.id);
  if required_active_bod_count < required_bod_count then
    raise exception 'At least one selected active BOD approver must be marked as required.' using errcode='22023';
  end if;

  normalized := jsonb_build_object(
    'user_ids', to_jsonb(selected_ids),
    'user_names', coalesce((select jsonb_agg(u.full_name order by u.full_name) from public.hris_users u where u.id = any(selected_ids)), '[]'::jsonb),
    'required_user_ids', to_jsonb(required_ids),
    'required_bod_approvals', required_bod_count,
    'leave_days_per_remaining_month', greatest(0.1, coalesce((p_config->>'leave_days_per_remaining_month')::numeric, 1)),
    'wfh_days_per_month', greatest(0, coalesce((p_config->>'wfh_days_per_month')::integer, 4)),
    'weekly_total_hours', greatest(1, coalesce((p_config->>'weekly_total_hours')::numeric, 50))
  );

  select config_value into previous_value
  from public.approver_configs
  where config_key = 'conditional_time_approvals';

  insert into public.approver_configs(config_key, config_value, updated_at)
  values ('conditional_time_approvals', normalized, now())
  on conflict (config_key) do update set config_value = excluded.config_value, updated_at = excluded.updated_at;

  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  select actor_id::text, u.email, 'UPDATE', 'ConditionalApprovalConfig', 'conditional_time_approvals',
    format('Conditional approval config changed from %s to %s. Change note: %s', coalesce(previous_value, '{}'::jsonb), normalized, p_change_note)
  from public.hris_users u
  where u.id = actor_id;

  return public.get_conditional_time_approval_config();
end;
$$;

create or replace function public.import_assets_batch(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_email text;
  row_value jsonb;
  row_number integer := 0;
  total_rows integer := coalesce(pg_catalog.jsonb_array_length(p_rows), 0);
  imported_rows integer := 0;
  assigned_rows integer := 0;
  asset_tag_value text;
  serial_value text;
  employee_identifier text;
  business_unit_identifier text;
  name_value text;
  type_value text;
  status_value text;
  condition_value text;
  purchase_date_value date;
  date_assigned_value date;
  warranty_expiry_value date;
  purchase_cost_value numeric;
  business_unit_id_value text;
  employee_id_value uuid;
  employee_auth_id uuid;
  asset_id_value uuid;
  assignment_id_value uuid;
begin
  if actor_id is null or not (public.is_system_admin() or public.has_feature_permission('Assets', 'manage')) then
    raise exception 'You do not have permission to batch upload assets.' using errcode='42501';
  end if;
  if p_rows is null or pg_catalog.jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Asset import rows must be a JSON array.' using errcode='22023';
  end if;
  if total_rows = 0 then raise exception 'The asset import file contains no data rows.' using errcode='22023'; end if;
  if total_rows > 500 then raise exception 'Asset imports are limited to 500 rows per operation.' using errcode='22023'; end if;

  select email into actor_email from public.hris_users where id = actor_id;

  for row_value in select value from pg_catalog.jsonb_array_elements(p_rows) loop
    row_number := row_number + 1;
    asset_tag_value := nullif(btrim(row_value->>'asset_tag'), '');
    name_value := nullif(btrim(row_value->>'name'), '');
    type_value := nullif(btrim(row_value->>'type'), '');
    business_unit_identifier := nullif(btrim(row_value->>'business_unit_id'), '');
    serial_value := nullif(btrim(row_value->>'serial_number'), '');
    status_value := coalesce(nullif(btrim(row_value->>'status'), ''), 'Available');
    condition_value := coalesce(nullif(btrim(row_value->>'condition'), ''), 'New');
    employee_identifier := coalesce(
      nullif(btrim(row_value->>'assigned_employee_id'), ''),
      nullif(btrim(row_value->>'employee_id'), ''),
      nullif(btrim(row_value->>'employee_email'), ''),
      nullif(btrim(row_value->>'assigned_employee'), '')
    );

    if asset_tag_value is null then raise exception 'Asset row %: asset_tag is required.', row_number using errcode='22023'; end if;
    if name_value is null then raise exception 'Asset row %: asset name is required.', row_number using errcode='22023'; end if;
    if type_value is null then raise exception 'Asset row %: asset type is required.', row_number using errcode='22023'; end if;
    if business_unit_identifier is null then raise exception 'Asset row %: business unit is required.', row_number using errcode='22023'; end if;
    if status_value not in ('Available', 'Assigned', 'In Repair', 'Retired') then raise exception 'Asset row %: invalid asset status “%”.', row_number, status_value using errcode='22023'; end if;
    if nullif(btrim(row_value->>'purchase_date'), '') is null then raise exception 'Asset row %: purchase_date is required.', row_number using errcode='22023'; end if;

    select bu.id::text into business_unit_id_value
    from public.business_units bu
    where bu.id::text = business_unit_identifier
       or lower(btrim(coalesce(bu.name, ''))) = lower(business_unit_identifier)
       or lower(btrim(coalesce(bu.code, ''))) = lower(business_unit_identifier)
    limit 1;
    if business_unit_id_value is null then raise exception 'Asset row %: business unit “%” was not found.', row_number, business_unit_identifier using errcode='22023'; end if;

    employee_id_value := null;
    employee_auth_id := null;
    if employee_identifier is not null then
      select u.id, u.auth_user_id into employee_id_value, employee_auth_id
      from public.hris_users u
      where lower(btrim(coalesce(u.status, ''))) = 'active'
        and (
          u.id::text = employee_identifier
          or lower(btrim(coalesce(u.email, ''))) = lower(employee_identifier)
          or lower(btrim(coalesce(u.employee_id, ''))) = lower(employee_identifier)
        )
      limit 1;
      if employee_id_value is null then raise exception 'Asset row %: employee “%” was not found as an active employee ID or email.', row_number, employee_identifier using errcode='22023'; end if;
    end if;

    if exists (select 1 from public.assets a where lower(btrim(a.asset_tag)) = lower(asset_tag_value)) then
      raise exception 'Asset row %: duplicate asset tag “%”.', row_number, asset_tag_value using errcode='23505';
    end if;
    if serial_value is not null and exists (select 1 from public.assets a where lower(btrim(coalesce(a.serial_number, ''))) = lower(serial_value)) then
      raise exception 'Asset row %: duplicate serial number “%”.', row_number, serial_value using errcode='23505';
    end if;

    purchase_date_value := (row_value->>'purchase_date')::date;
    date_assigned_value := coalesce(nullif(btrim(row_value->>'date_assigned'), '')::date, current_date);
    warranty_expiry_value := nullif(btrim(row_value->>'warranty_expiry'), '')::date;
    purchase_cost_value := coalesce(nullif(btrim(coalesce(row_value->>'purchase_cost', '')), '')::numeric, 0);
    if employee_id_value is not null then status_value := 'Assigned'; end if;
    if employee_id_value is null and status_value = 'Assigned' then raise exception 'Asset row %: an Assigned asset must have an active employee identifier.', row_number using errcode='22023'; end if;

    insert into public.assets(
      asset_tag, name, type, brand, model, serial_number, description, business_unit_id,
      purchase_date, value, status, notes, condition, warranty_expiry, updated_at
    ) values (
      asset_tag_value, name_value, type_value, nullif(btrim(row_value->>'brand'), ''), nullif(btrim(row_value->>'model'), ''),
      serial_value, nullif(btrim(row_value->>'description'), ''), business_unit_id_value,
      purchase_date_value, purchase_cost_value, status_value::public.asset_status, nullif(btrim(row_value->>'notes'), ''),
      nullif(btrim(row_value->>'condition'), ''), warranty_expiry_value, now()
    ) returning id into asset_id_value;

    if employee_id_value is not null then
      insert into public.asset_assignments(asset_id, employee_id, date_assigned, condition_on_assign, is_acknowledged)
      values (asset_id_value, employee_id_value, date_assigned_value, condition_value, false)
      returning id into assignment_id_value;
      assigned_rows := assigned_rows + 1;

      insert into public.notifications(user_id, type, title, message, link, related_entity_id, dedupe_key)
      select target_id, 'ASSET_ASSIGNED', 'Asset Assigned',
        format('You have been assigned an asset: %s. Please review and accept.', name_value),
        format('/my-profile?acceptAssetAssignmentId=%s', assignment_id_value), assignment_id_value::text,
        format('asset-batch-assigned:%s:%s', assignment_id_value, target_id)
      from (
        select employee_id_value::text as target_id
        union
        select employee_auth_id::text where employee_auth_id is not null
      ) targets
      on conflict (user_id, dedupe_key) do nothing;
    end if;

    insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
    values (
      actor_id::text, actor_email, 'CREATE', 'Asset', asset_id_value::text,
      format('Batch imported asset %s%s.', asset_tag_value, case when employee_id_value is null then '' else format(' Assigned to employee %s', employee_id_value) end)
    );
    imported_rows := imported_rows + 1;
  end loop;

  return jsonb_build_object(
    'total_rows', total_rows,
    'imported_rows', imported_rows,
    'assigned_rows', assigned_rows,
    'failed_rows', 0,
    'duplicate_rows', 0,
    'invalid_employee_rows', 0,
    'missing_required_rows', 0
  );
end;
$$;

create or replace function public.import_memos_batch(p_rows jsonb, p_publish boolean default false)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_email text;
  row_value jsonb;
  row_number integer := 0;
  total_rows integer := coalesce(pg_catalog.jsonb_array_length(p_rows), 0);
  imported_rows integer := 0;
  published_rows integer := 0;
  memo_id_value uuid;
  memo_number_value text;
  effective_date_value date;
  publication_date_value date;
  status_value public.memo_status;
  body_value text;
  target_business_units_value text[];
  target_departments_value text[];
  target_employee_ids_value uuid[];
  target_input text;
  target_employee_id uuid;
  target_row record;
  notification_target text;
  notification_link text;
begin
  if actor_id is null or not (public.is_system_admin() or public.has_feature_permission('Feedback', 'edit')) then
    raise exception 'You do not have permission to batch upload memos.' using errcode='42501';
  end if;
  if p_rows is null or pg_catalog.jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Memo import rows must be a JSON array.' using errcode='22023';
  end if;
  if total_rows = 0 then raise exception 'The memo import file contains no data rows.' using errcode='22023'; end if;
  if total_rows > 500 then raise exception 'Memo imports are limited to 500 rows per operation.' using errcode='22023'; end if;
  select email into actor_email from public.hris_users where id = actor_id;

  for row_value in select value from pg_catalog.jsonb_array_elements(p_rows) loop
    row_number := row_number + 1;
    memo_number_value := nullif(btrim(row_value->>'memo_number'), '');
    body_value := nullif(row_value->>'body', '');
    effective_date_value := (row_value->>'effective_date')::date;
    publication_date_value := nullif(btrim(row_value->>'publication_date'), '')::date;
    if memo_number_value is null then raise exception 'Memo row %: memo_number is required.', row_number using errcode='22023'; end if;
    if body_value is null then raise exception 'Memo row %: memo content is required.', row_number using errcode='22023'; end if;
    if effective_date_value is null then raise exception 'Memo row %: effective_date is required.', row_number using errcode='22023'; end if;
    if exists (select 1 from public.memos m where lower(btrim(coalesce(m.memo_number, ''))) = lower(memo_number_value)) then
      raise exception 'Memo row %: duplicate memo number “%”.', row_number, memo_number_value using errcode='23505';
    end if;

    target_business_units_value := coalesce(array(select pg_catalog.jsonb_array_elements_text(coalesce(row_value->'target_business_units', '[]'::jsonb))), '{}'::text[]);
    target_departments_value := coalesce(array(select pg_catalog.jsonb_array_elements_text(coalesce(row_value->'target_departments', '[]'::jsonb))), '{}'::text[]);
    target_employee_ids_value := '{}'::uuid[];

    foreach target_input in array target_business_units_value loop
      if target_input = 'All' then continue; end if;
      if not exists (
        select 1 from public.business_units bu
        where bu.id::text = target_input
           or lower(btrim(coalesce(bu.name, ''))) = lower(target_input)
           or lower(btrim(coalesce(bu.code, ''))) = lower(target_input)
      ) then raise exception 'Memo row %: business unit “%” was not found.', row_number, target_input using errcode='22023'; end if;
    end loop;
    foreach target_input in array target_departments_value loop
      if target_input = 'All' then continue; end if;
      if not exists (
        select 1 from public.departments d
        where d.id::text = target_input
           or lower(btrim(coalesce(d.name, ''))) = lower(target_input)
      ) then raise exception 'Memo row %: department “%” was not found.', row_number, target_input using errcode='22023'; end if;
    end loop;

    for target_input in select value from pg_catalog.jsonb_array_elements_text(coalesce(row_value->'target_employee_ids', '[]'::jsonb)) items(value) loop
      select u.id into target_employee_id
      from public.hris_users u
      where lower(btrim(coalesce(u.status, ''))) = 'active'
        and u.id::text = target_input
      limit 1;
      if target_employee_id is null then raise exception 'Memo row %: target employee “%” is not an active employee.', row_number, target_input using errcode='22023'; end if;
      target_employee_ids_value := array_append(target_employee_ids_value, target_employee_id);
    end loop;

    if coalesce(array_length(target_business_units_value, 1), 0) = 0
       and coalesce(array_length(target_departments_value, 1), 0) = 0
       and coalesce(array_length(target_employee_ids_value, 1), 0) = 0 then
      target_business_units_value := array['All'];
      target_departments_value := array['All'];
    end if;

    status_value := case when p_publish then 'Published'::public.memo_status else 'Draft'::public.memo_status end;
    if p_publish then
      publication_date_value := coalesce(publication_date_value, current_date);
      published_rows := published_rows + 1;
    end if;

    insert into public.memos(
      title, memo_number, memo_type, body, effective_date, publication_date,
      target_departments, target_business_units, target_employee_ids,
      acknowledgement_required, tags, attachments, acknowledgement_tracker,
      acknowledgement_signatures, status, created_by, notes
    ) values (
      nullif(btrim(row_value->>'title'), ''), memo_number_value, nullif(btrim(row_value->>'memo_type'), ''), body_value,
      effective_date_value, publication_date_value, target_departments_value, target_business_units_value, target_employee_ids_value,
      coalesce((row_value->>'acknowledgement_required')::boolean, false),
      coalesce(array(select pg_catalog.jsonb_array_elements_text(coalesce(row_value->'tags', '[]'::jsonb))), '{}'::text[]),
      coalesce(array(select pg_catalog.jsonb_array_elements_text(coalesce(row_value->'attachments', '[]'::jsonb))), '{}'::text[]),
      '{}'::text[], '[]'::jsonb, status_value, actor_id, nullif(btrim(row_value->>'notes'), '')
    ) returning id into memo_id_value;

    if p_publish then
      notification_link := format('/feedback/memos?memoId=%s', memo_id_value);
      for target_row in
        select u.id, u.auth_user_id
        from public.hris_users u
        where lower(btrim(coalesce(u.status, ''))) = 'active'
          and (
            u.id = any(target_employee_ids_value)
            or 'All' = any(target_business_units_value)
            or 'All' = any(target_departments_value)
            or u.business_unit = any(target_business_units_value)
            or u.business_unit_id::text = any(target_business_units_value)
            or exists (
              select 1 from public.business_units bu
              where bu.id = u.business_unit_id
                and (bu.name = any(target_business_units_value) or bu.code = any(target_business_units_value))
            )
            or u.department = any(target_departments_value)
            or u.department_id::text = any(target_departments_value)
            or exists (
              select 1 from public.departments d
              where d.id = u.department_id
                and d.name = any(target_departments_value)
            )
          )
      loop
        foreach notification_target in array array_remove(array[target_row.id::text, target_row.auth_user_id::text], null) loop
          insert into public.notifications(user_id, type, title, message, link, related_entity_id, dedupe_key)
          values (
            notification_target, 'MEMO_PUBLISHED', 'New memo published',
            format('%s is now available in the Memo Library.', row_value->>'title'), notification_link, memo_id_value::text,
            format('memo-published:%s:%s', memo_id_value, notification_target)
          ) on conflict (user_id, dedupe_key) do nothing;
        end loop;
      end loop;
    end if;

    insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
    values (actor_id::text, actor_email, 'CREATE', 'Memo', memo_id_value::text,
      format('Batch imported memo %s as %s.', memo_number_value, status_value));
    imported_rows := imported_rows + 1;
  end loop;

  return jsonb_build_object(
    'total_rows', total_rows,
    'imported_rows', imported_rows,
    'published_rows', published_rows,
    'failed_rows', 0,
    'duplicate_rows', 0,
    'invalid_employee_rows', 0,
    'missing_required_rows', 0
  );
end;
$$;

revoke all on function public.import_assets_batch(jsonb) from public, anon;
grant execute on function public.import_assets_batch(jsonb) to authenticated;
revoke all on function public.import_memos_batch(jsonb, boolean) from public, anon;
grant execute on function public.import_memos_batch(jsonb, boolean) to authenticated;
revoke all on function public.get_conditional_time_approval_config() from public, anon;
grant execute on function public.get_conditional_time_approval_config() to authenticated;
revoke all on function public.save_conditional_time_approval_config(jsonb, text) from public, anon;
grant execute on function public.save_conditional_time_approval_config(jsonb, text) to authenticated;
