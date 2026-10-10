-- Opt-in maintenance eligibility on the existing register. Existing assets,
-- assignments, immutable Operations versions and current asset RLS are preserved.
alter table public.assets add column requires_maintenance boolean not null default false;
comment on column public.assets.requires_maintenance is 'Opt-in eligibility for linking Operations maintenance tasks within this business unit.';

-- Extend the existing classification without rewriting asset records.
alter table public.assets drop constraint assets_type_check;
alter table public.assets add constraint assets_type_check check (type in ('Laptop','Mobile Phone','Monitor','Software License','Equipment','Other'));
create index assets_maintenance_unit_idx on public.assets(business_unit_id) where requires_maintenance;

create or replace function operations_private.validate_content(p_unit uuid,p_kind text,p_content jsonb) returns void language plpgsql security definer set search_path='' as $$
declare d uuid:=nullif(p_content->>'department_id','')::uuid; a uuid:=nullif(p_content->>'asset_id','')::uuid; m uuid:=nullif(p_content->>'responsible_manager_id','')::uuid; begin
 if length(trim(coalesce(p_content->>'title','')))<3 or length(p_content->>'title')>180 then raise exception 'Title must be 3–180 characters';end if;
 if coalesce(p_content->>'priority','Normal') not in ('Low','Normal','High','Urgent') then raise exception 'Invalid priority';end if;
 if coalesce(p_content->>'evidence','none') not in ('none','text','photo','numeric','yes_no') then raise exception 'Invalid evidence type';end if;
 if nullif(p_content->>'sop_url','') is not null and p_content->>'sop_url' !~ '^https?://' then raise exception 'SOP URL must use http or https';end if;
 if coalesce((p_content->>'duration')::numeric,0)<0 then raise exception 'Duration cannot be negative';end if;
 if d is not null and not exists(select 1 from public.departments where id=d and business_unit_id=p_unit) then raise exception 'Department is outside this unit' using errcode='42501';end if;
 if a is not null and not exists(select 1 from public.assets x join public.business_units b on b.id=p_unit where x.id=a and x.requires_maintenance and x.business_unit_id in (b.id::text,b.name)) then raise exception 'Asset must be marked Requires maintenance in this business unit' using errcode='42501';end if;
 if m is not null and not operations_private.role_unit(m,p_unit,array['Business Unit Manager','GeneralManager','Admin','Board of Director']) then raise exception 'Responsible manager is outside this unit' using errcode='42501';end if;
 if p_kind='checklist' and coalesce(p_content->>'category','Other') not in ('Opening','Closing','Cleaning','Maintenance','Inspection','Inventory','Handover','Other') then raise exception 'Invalid checklist category';end if;
 if p_content ? 'allow_na' and jsonb_typeof(p_content->'allow_na')<>'boolean' or p_content ? 'photo_required' and jsonb_typeof(p_content->'photo_required')<>'boolean' then raise exception 'Invalid evidence rules';end if;
 if (p_content ? 'min' and jsonb_typeof(p_content->'min') not in ('number','null')) or (p_content ? 'max' and jsonb_typeof(p_content->'max') not in ('number','null')) then raise exception 'Numeric bounds must be numbers';end if;
 if (p_content->>'min')::numeric>(p_content->>'max')::numeric then raise exception 'Minimum cannot exceed maximum';end if;
 if length(coalesce(p_content->>'unit',''))>30 then raise exception 'Reading unit must be at most 30 characters';end if;
end $$;

create or replace function operations_private.workspace(p_unit uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare w jsonb:=operations_private.workspace_phase2(p_unit);begin
 return w||jsonb_build_object('assets',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name) order by a.name,a.id),'[]') from public.assets a join public.business_units b on b.id=p_unit where operations_private.can_use_library(p_unit) and a.requires_maintenance and a.business_unit_id in(b.id::text,b.name)), 'assignments',(select coalesce(jsonb_agg(x||jsonb_build_object('occurrence_id',a.occurrence_id,'can_cancel',case when a.occurrence_id is null then (x->>'can_cancel')::bool else false end)),'[]') from jsonb_array_elements(w->'assignments') x join public.ops_assignments a on a.id=(x->>'id')::uuid));
end $$;

-- Preserve the import transaction, permissions, notifications and audit trail.
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
  maintenance_value boolean;
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
    if row_value ? 'requires_maintenance' and pg_catalog.jsonb_typeof(row_value->'requires_maintenance') <> 'boolean' then
      raise exception 'Asset row %: requires_maintenance must be a boolean.', row_number using errcode='22023';
    end if;
    maintenance_value := coalesce((row_value->>'requires_maintenance')::boolean, false);
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
      purchase_date, value, status, notes, condition, warranty_expiry, requires_maintenance, updated_at
    ) values (
      asset_tag_value, name_value, type_value, nullif(btrim(row_value->>'brand'), ''), nullif(btrim(row_value->>'model'), ''),
      serial_value, nullif(btrim(row_value->>'description'), ''), business_unit_id_value,
      purchase_date_value, purchase_cost_value, status_value::public.asset_status, nullif(btrim(row_value->>'notes'), ''),
      nullif(btrim(row_value->>'condition'), ''), warranty_expiry_value, maintenance_value, now()
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

