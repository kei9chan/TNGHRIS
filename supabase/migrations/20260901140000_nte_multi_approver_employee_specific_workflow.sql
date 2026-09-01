-- Normalize NTE approvers and make each NTE belong to exactly one involved
-- employee. Existing NTE rows, numbers, documents, JSON approval history, and
-- parent Incident Reports are preserved and backfilled in place.

create table if not exists public.nte_approver_roles (
  role_id text primary key references public.roles(id) on update cascade on delete restrict,
  is_bod_role boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.nte_approver_roles(role_id, is_bod_role, is_active)
values
  ('Board of Director', true, true),
  ('Business Unit Manager', false, true),
  ('GeneralManager', false, true),
  ('Operations Director', false, true),
  ('Manager', false, true),
  ('HR Manager', false, true),
  ('HR Staff', false, true)
on conflict (role_id) do update
set is_bod_role = excluded.is_bod_role,
    is_active = excluded.is_active,
    updated_at = now();

alter table public.nte_approver_roles enable row level security;
revoke all on public.nte_approver_roles from public, anon, authenticated;
drop policy if exists nte_approver_roles_explicit_deny on public.nte_approver_roles;
create policy nte_approver_roles_explicit_deny
on public.nte_approver_roles for select to authenticated
using (false);

alter table public.ntes
  add column if not exists recipient_employee_id uuid references public.hris_users(id) on delete restrict,
  add column if not exists recipient_name_snapshot text,
  add column if not exists approval_version integer not null default 1;

update public.ntes
set recipient_employee_id = recipients[1],
    recipient_name_snapshot = coalesce(nullif(recipient_names[1], ''), recipient_name_snapshot)
where recipient_employee_id is null
   or recipient_name_snapshot is null;

create unique index if not exists ntes_one_active_per_incident_recipient
on public.ntes(incident_report_id, recipient_employee_id)
where recipient_employee_id is not null
  and status not in ('Rejected'::public.nte_status, 'Closed'::public.nte_status);

create index if not exists ntes_recipient_employee_idx
on public.ntes(recipient_employee_id, status, created_at desc);

alter table public.incident_reports
  add column if not exists nte_processing_complete boolean not null default false,
  add column if not exists nte_processing_summary jsonb not null default jsonb_build_object(
    'totalEmployees', 0,
    'employeesWithNte', 0,
    'activeNtes', 0,
    'statusCounts', '{}'::jsonb
  );

create table if not exists public.nte_approvals (
  id uuid primary key default gen_random_uuid(),
  nte_id uuid not null references public.ntes(id) on delete cascade,
  approver_user_id uuid not null references public.hris_users(id) on delete restrict,
  approver_employee_id uuid not null references public.hris_users(id) on delete restrict,
  selection_role_id text not null references public.roles(id) on update cascade on delete restrict,
  role_snapshot text not null,
  is_bod_role boolean not null default false,
  is_required boolean not null default true,
  status text not null default 'Pending' check (status in (
    'Pending', 'Approved', 'Returned for Revision', 'Rejected', 'Cancelled'
  )),
  assigned_at timestamptz not null default now(),
  actioned_at timestamptz,
  comments text,
  selected_by uuid not null references public.hris_users(id) on delete restrict,
  selection_source text not null default 'manual',
  selection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(nte_id, approver_user_id)
);

create index if not exists nte_approvals_pending_user_idx
on public.nte_approvals(approver_user_id, status, assigned_at desc)
where status = 'Pending';
create index if not exists nte_approvals_nte_status_idx
on public.nte_approvals(nte_id, status, is_required);
create index if not exists nte_approvals_approver_employee_idx
on public.nte_approvals(approver_employee_id);
create index if not exists nte_approvals_selected_by_idx
on public.nte_approvals(selected_by);
create index if not exists nte_approvals_selection_role_idx
on public.nte_approvals(selection_role_id);

-- Backfill every legacy approver without altering the NTE row itself. The
-- canonical role assignment is used; legacy name text is only a preference
-- when a multi-role user has more than one eligible assigned role.
insert into public.nte_approvals(
  nte_id, approver_user_id, approver_employee_id, selection_role_id,
  role_snapshot, is_bod_role, is_required, status, assigned_at,
  actioned_at, comments, selected_by, selection_source
)
select
  n.id,
  (step.value->>'userId')::uuid,
  (step.value->>'userId')::uuid,
  chosen.role_id,
  coalesce(chosen.display_name, chosen.role_id),
  chosen.is_bod_role,
  true,
  case lower(coalesce(step.value->>'status', 'pending'))
    when 'approved' then 'Approved'
    when 'rejected' then 'Rejected'
    when 'returned for revision' then 'Returned for Revision'
    when 'cancelled' then 'Cancelled'
    else 'Pending'
  end,
  n.created_at,
  case when lower(coalesce(step.value->>'status', 'pending')) = 'pending' then null else n.updated_at end,
  coalesce(step.value->>'rejectionReason', step.value->>'comments'),
  coalesce(n.issued_by_user_id, (step.value->>'userId')::uuid),
  'historical-backfill'
from public.ntes n
cross join lateral jsonb_array_elements(coalesce(n.approval_log, '[]'::jsonb)) with ordinality step(value, ord)
cross join lateral (
  select ur.role_id, coalesce(r.display_name, r.id) display_name, capability.is_bod_role
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id and r.is_active
  join public.nte_approver_roles capability on capability.role_id = ur.role_id and capability.is_active
  where ur.user_id = (step.value->>'userId')::uuid
    and ur.is_active
  order by
    case
      when capability.is_bod_role and regexp_replace(lower(coalesce(step.value->>'userName', '')), '[^a-z0-9]+', '', 'g') like '%boardofdirector%' then 0
      when capability.is_bod_role then 1
      else 2
    end,
    ur.is_primary desc,
    ur.role_id
  limit 1
) chosen
where nullif(step.value->>'userId', '') is not null
on conflict (nte_id, approver_user_id) do nothing;

alter table public.nte_approvals enable row level security;
revoke all on public.nte_approvals from public, anon;
grant select on public.nte_approvals to authenticated;

create or replace function private.can_issue_nte()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id and r.is_active
    where ur.user_id = public.current_hris_user_id()
      and ur.is_active
      and ur.role_id in ('HR Manager', 'HR Staff', 'Admin')
  ) and (
    public.has_feature_permission('NTEs', 'create')
    or public.has_feature_permission('NTEs', 'manage')
  )
$$;

create or replace function private.can_access_incident_for_nte(
  p_incident_report_id uuid,
  p_recipient_employee_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor public.hris_users%rowtype;
  incident public.incident_reports%rowtype;
  scope jsonb := public.current_data_scope();
  scope_type text := scope->>'type';
begin
  select * into actor from public.hris_users where id = public.current_hris_user_id();
  select * into incident from public.incident_reports where id = p_incident_report_id;
  if actor.id is null or incident.id is null then return false; end if;
  if p_recipient_employee_id is not null
     and not (p_recipient_employee_id = any(incident.involved_employee_ids)) then
    return false;
  end if;
  if scope_type = 'GLOBAL' then return true; end if;
  if scope_type = 'SPECIFIC' then
    return incident.business_unit_id::text in (
      select jsonb_array_elements_text(coalesce(scope->'allowedBuIds', '[]'::jsonb))
    );
  end if;
  if scope_type = 'HOME_ONLY' then
    return actor.business_unit_id is not null and actor.business_unit_id = incident.business_unit_id;
  end if;
  if p_recipient_employee_id is not null then
    return private.user_is_within_current_scope(p_recipient_employee_id);
  end if;
  return false;
end;
$$;

create or replace function private.can_view_nte(p_nte_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.ntes n
    left join public.incident_reports ir on ir.id = n.incident_report_id
    where n.id = p_nte_id
      and (
        n.recipient_employee_id = public.current_hris_user_id()
        or n.issued_by_user_id = public.current_hris_user_id()
        or ir.assigned_to_id = public.current_hris_user_id()
        or exists (
          select 1 from public.nte_approvals a
          where a.nte_id = n.id and a.approver_user_id = public.current_hris_user_id()
        )
        or (
          private.can_issue_nte()
          and private.can_access_incident_for_nte(n.incident_report_id, n.recipient_employee_id)
        )
      )
  )
$$;

drop policy if exists nte_approvals_scoped_select on public.nte_approvals;
create policy nte_approvals_scoped_select
on public.nte_approvals for select to authenticated
using (private.can_view_nte(nte_id));

drop policy if exists ntes_approver_select on public.ntes;
drop policy if exists ntes_approver_update on public.ntes;
drop policy if exists ntes_manager_read_team on public.ntes;
drop policy if exists ntes_assigned_approver_select on public.ntes;
create policy ntes_assigned_approver_select
on public.ntes for select to authenticated
using (
  exists (
    select 1 from public.nte_approvals a
    where a.nte_id = ntes.id
      and a.approver_user_id = public.current_hris_user_id()
  )
);

create or replace function private.sync_nte_approval_snapshot(p_nte_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids uuid[];
  names text[];
  log_value jsonb;
begin
  select
    coalesce(array_agg(a.approver_user_id order by a.assigned_at, a.id), '{}'::uuid[]),
    coalesce(array_agg(u.full_name order by a.assigned_at, a.id), '{}'::text[]),
    coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'approvalId', a.id,
      'userId', a.approver_user_id,
      'userName', u.full_name,
      'roleId', a.selection_role_id,
      'role', a.role_snapshot,
      'roleSnapshot', a.role_snapshot,
      'isBod', a.is_bod_role,
      'required', a.is_required,
      'status', a.status,
      'assignedAt', a.assigned_at,
      'timestamp', a.actioned_at,
      'comments', a.comments,
      'selectionReason', a.selection_reason,
      'rejectionReason', case when a.status in ('Rejected', 'Returned for Revision') then a.comments end
    )) order by a.assigned_at, a.id), '[]'::jsonb)
  into ids, names, log_value
  from public.nte_approvals a
  join public.hris_users u on u.id = a.approver_user_id
  where a.nte_id = p_nte_id;

  update public.ntes
  set approver_ids = ids,
      approver_names = names,
      approval_log = log_value
  where id = p_nte_id;
end;
$$;

create or replace function private.refresh_incident_nte_summary(p_incident_report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  total_employees integer;
  employees_with_nte integer;
  active_ntes integer;
  all_nte_ids uuid[];
  status_counts jsonb;
  next_stage text;
begin
  select cardinality(ir.involved_employee_ids)
  into total_employees
  from public.incident_reports ir
  where ir.id = p_incident_report_id;

  if total_employees is null then return; end if;

  select
    count(distinct n.recipient_employee_id),
    count(*) filter (where n.status not in ('Rejected'::public.nte_status, 'Closed'::public.nte_status)),
    coalesce(array_agg(n.id order by n.created_at, n.id), '{}'::uuid[])
  into employees_with_nte, active_ntes, all_nte_ids
  from public.ntes n
  where n.incident_report_id = p_incident_report_id;

  select coalesce(jsonb_object_agg(status_text, status_count), '{}'::jsonb)
  into status_counts
  from (
    select n.status::text status_text, count(*) status_count
    from public.ntes n
    where n.incident_report_id = p_incident_report_id
    group by n.status::text
  ) counts;

  next_stage := case
    when employees_with_nte = 0 then 'ir-review'
    when employees_with_nte < total_employees then 'nte-partial'
    when exists (
      select 1 from public.ntes n
      where n.incident_report_id = p_incident_report_id and n.status = 'PendingApproval'::public.nte_status
    ) then 'nte-for-approval'
    when exists (
      select 1 from public.ntes n
      where n.incident_report_id = p_incident_report_id and n.status = 'Draft'::public.nte_status
    ) then 'nte-draft'
    when exists (
      select 1 from public.ntes n
      where n.incident_report_id = p_incident_report_id
        and n.status in ('Issued'::public.nte_status, 'Response Submitted'::public.nte_status, 'Hearing Scheduled'::public.nte_status)
    ) then 'nte-sent'
    else 'employee-processing-complete'
  end;

  update public.incident_reports
  set nte_ids = all_nte_ids,
      nte_processing_complete = total_employees > 0 and employees_with_nte >= total_employees,
      nte_processing_summary = jsonb_build_object(
        'totalEmployees', total_employees,
        'employeesWithNte', employees_with_nte,
        'activeNtes', active_ntes,
        'statusCounts', status_counts,
        'processingIncomplete', employees_with_nte < total_employees
      ),
      pipeline_stage = case
        when status in ('Closed'::public.ir_status, 'NoAction'::public.ir_status) then pipeline_stage
        else next_stage
      end,
      updated_at = now()
  where id = p_incident_report_id;
end;
$$;

create or replace function private.refresh_incident_nte_summary_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_incident_nte_summary(coalesce(new.incident_report_id, old.incident_report_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists refresh_incident_nte_summary_after_change on public.ntes;
create trigger refresh_incident_nte_summary_after_change
after insert or update of status, recipient_employee_id, incident_report_id or delete on public.ntes
for each row execute function private.refresh_incident_nte_summary_trigger();

create or replace function private.enforce_employee_specific_nte()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.recipient_employee_id := coalesce(new.recipient_employee_id, new.recipients[1]);
  new.recipient_name_snapshot := coalesce(nullif(new.recipient_name_snapshot, ''), nullif(new.recipient_names[1], ''));

  if new.recipient_employee_id is null then
    raise exception 'Exactly one NTE recipient is required.' using errcode = '23502';
  end if;
  if cardinality(coalesce(new.recipients, '{}'::uuid[])) <> 1
     or new.recipients[1] <> new.recipient_employee_id then
    raise exception 'An NTE must contain exactly one recipient employee.' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.incident_reports ir
    where ir.id = new.incident_report_id
      and new.recipient_employee_id = any(ir.involved_employee_ids)
  ) then
    raise exception 'The NTE recipient must be an involved employee on the linked Incident Report.' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and (
    new.incident_report_id is distinct from old.incident_report_id
    or new.recipient_employee_id is distinct from old.recipient_employee_id
  ) then
    raise exception 'The linked Incident Report and NTE recipient cannot be changed after creation.' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE'
     and old.status = 'PendingApproval'::public.nte_status
     and new.status is distinct from old.status
     and coalesce(current_setting('app.nte_workflow_rpc', true), 'off') <> 'on' then
    raise exception 'Pending NTE approval outcomes must use the assigned approval action.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE'
     and new.status = 'PendingApproval'::public.nte_status
     and new.status is distinct from old.status
     and coalesce(current_setting('app.nte_workflow_rpc', true), 'off') <> 'on' then
    raise exception 'NTE submission must use the protected workflow action.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE'
     and old.status = 'Draft'::public.nte_status
     and new.status = 'Issued'::public.nte_status then
    raise exception 'An NTE cannot be issued without completing required approvals.' using errcode = '42501';
  end if;
  if new.status = 'PendingApproval'::public.nte_status then
    if not exists (
      select 1 from public.nte_approvals a
      where a.nte_id = new.id and a.is_required and a.is_bod_role
        and a.status in ('Pending', 'Approved')
    ) then
      raise exception 'At least one selected Board of Director approver is required.' using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.nte_approvals a
      where a.nte_id = new.id and a.is_required
        and a.status in ('Pending', 'Approved')
    ) then
      raise exception 'At least one required NTE approver is required.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_employee_specific_nte_before_write on public.ntes;
create trigger enforce_employee_specific_nte_before_write
before insert or update on public.ntes
for each row execute function private.enforce_employee_specific_nte();

-- Synchronize the preserved legacy approval snapshot after backfill, then
-- calculate every parent Incident Report summary without deleting old IDs.
do $$
declare item record;
begin
  for item in select id from public.ntes loop
    perform private.sync_nte_approval_snapshot(item.id);
  end loop;
  for item in select id, updated_at from public.incident_reports loop
    perform private.refresh_incident_nte_summary(item.id);
    update public.incident_reports set updated_at = item.updated_at where id = item.id;
  end loop;
end
$$;

create or replace function public.get_eligible_nte_approvers(
  p_incident_report_id uuid,
  p_recipient_employee_id uuid
)
returns table(
  id uuid,
  full_name text,
  email text,
  job_position text,
  business_unit_id uuid,
  business_unit text,
  eligible_role_ids text[],
  eligible_role_labels text[],
  has_bod_role boolean,
  preferred_role_id text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_issue_nte() then
    raise exception 'You are not authorized to issue an NTE.' using errcode = '42501';
  end if;
  if not private.can_access_incident_for_nte(p_incident_report_id, p_recipient_employee_id) then
    raise exception 'The Incident Report or recipient is outside your authorized scope.' using errcode = '42501';
  end if;

  return query
  with incident as (
    select ir.business_unit_id from public.incident_reports ir where ir.id = p_incident_report_id
  ), candidates as (
    select
      u.id,
      u.full_name,
      u.email,
      u.position,
      u.business_unit_id,
      coalesce(bu.name, u.business_unit) business_unit,
      array_agg(distinct ur.role_id order by ur.role_id) role_ids,
      array_agg(distinct coalesce(r.display_name, r.id) order by coalesce(r.display_name, r.id)) role_labels,
      bool_or(capability.is_bod_role) has_bod,
      (array_agg(ur.role_id order by capability.is_bod_role desc, ur.is_primary desc, ur.role_id))[1] preferred_role
    from public.hris_users u
    join public.user_roles ur on ur.user_id = u.id and ur.is_active
    join public.roles r on r.id = ur.role_id and r.is_active
    join public.nte_approver_roles capability on capability.role_id = ur.role_id and capability.is_active
    left join public.business_units bu on bu.id = u.business_unit_id
    cross join incident
    left join auth.users au on au.id = u.auth_user_id
    where u.id <> p_recipient_employee_id
      and lower(coalesce(u.status, '')) = 'active'
      and lower(coalesce(u.employment_status, 'active')) not in ('inactive', 'terminated', 'archived', 'separated')
      and coalesce(u.end_date, current_date) >= current_date
      and u.auth_user_id is not null
      and au.id is not null
      and au.deleted_at is null
      and coalesce(au.banned_until, '-infinity'::timestamptz) <= now()
      and (
        public.current_data_scope()->>'type' = 'GLOBAL'
        or private.user_is_within_current_scope(u.id)
      )
    group by u.id, u.full_name, u.email, u.position, u.business_unit_id, bu.name, u.business_unit, incident.business_unit_id
  )
  select c.id, c.full_name, c.email, c.position, c.business_unit_id, c.business_unit,
         c.role_ids, c.role_labels, c.has_bod, c.preferred_role
  from candidates c
  cross join incident
  order by (c.business_unit_id = incident.business_unit_id) desc, c.has_bod desc, c.full_name;
end;
$$;

create or replace function public.create_nte_for_employee(
  p_incident_report_id uuid,
  p_recipient_employee_id uuid,
  p_template_id uuid,
  p_response_deadline timestamptz,
  p_details text,
  p_body text,
  p_evidence_link text default null,
  p_memo_ids text[] default '{}'::text[],
  p_discipline_code_ids text[] default '{}'::text[],
  p_approvers jsonb default '[]'::jsonb,
  p_nte_number text default null
)
returns public.ntes
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor public.hris_users%rowtype;
  recipient public.hris_users%rowtype;
  incident public.incident_reports%rowtype;
  created_nte public.ntes;
  approver_input record;
  selected_role record;
  approver_user public.hris_users%rowtype;
  selected_count integer := 0;
  selected_bod_count integer := 0;
  approver_snapshot jsonb := '[]'::jsonb;
begin
  if actor_id is null or not private.can_issue_nte() then
    raise exception 'You are not authorized to issue an NTE.' using errcode = '42501';
  end if;
  select * into actor from public.hris_users where id = actor_id;
  select * into incident from public.incident_reports where id = p_incident_report_id for update;
  if incident.id is null then raise exception 'Incident Report not found.' using errcode = 'P0002'; end if;
  if not private.can_access_incident_for_nte(p_incident_report_id, p_recipient_employee_id) then
    raise exception 'The Incident Report or recipient is outside your authorized scope.' using errcode = '42501';
  end if;
  select * into recipient from public.hris_users where id = p_recipient_employee_id;
  if recipient.id is null or not (recipient.id = any(incident.involved_employee_ids)) then
    raise exception 'The selected employee is not involved in this Incident Report.' using errcode = '22023';
  end if;
  if p_response_deadline is null then raise exception 'A response deadline is required.' using errcode = '22023'; end if;
  if length(trim(coalesce(p_details, ''))) = 0 then raise exception 'NTE allegations/details are required.' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_approvers, '[]'::jsonb)) <> 'array' then
    raise exception 'The approver list must be an array.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.ntes n
    where n.incident_report_id = p_incident_report_id
      and n.recipient_employee_id = p_recipient_employee_id
      and n.status not in ('Rejected'::public.nte_status, 'Closed'::public.nte_status)
  ) then
    raise exception 'An active NTE already exists for this employee and Incident Report.' using errcode = '23505';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_approvers, '[]'::jsonb)) entry
    group by entry->>'userId'
    having count(*) > 1
  ) then
    raise exception 'The same approver cannot be selected more than once.' using errcode = '23505';
  end if;
  if nullif(trim(coalesce(p_nte_number, '')), '') is not null and exists (
    select 1 from public.ntes n where trim(n.nte_number::text) = trim(p_nte_number)
  ) then
    raise exception 'The requested NTE number is already in use.' using errcode = '23505';
  end if;

  insert into public.ntes(
    incident_report_id, template_id, issued_by_user_id, issued_by_name,
    recipients, recipient_names, recipient_employee_id, recipient_name_snapshot,
    response_deadline, details, evidence_link, status, body, memo_ids,
    discipline_code_ids, nte_number
  ) values (
    incident.id, p_template_id, actor.id, actor.full_name,
    array[recipient.id], array[recipient.full_name], recipient.id, recipient.full_name,
    p_response_deadline, trim(p_details), p_evidence_link, 'Draft'::public.nte_status,
    p_body, coalesce(p_memo_ids, '{}'), coalesce(p_discipline_code_ids, '{}'),
    coalesce(nullif(trim(p_nte_number), ''), nextval('public.ntes_nte_number_seq')::text)
  ) returning * into created_nte;

  for approver_input in
    select entry->>'userId' user_id, entry->>'roleId' role_id,
           nullif(trim(entry->>'selectionReason'), '') selection_reason
    from jsonb_array_elements(coalesce(p_approvers, '[]'::jsonb)) entry
  loop
    if approver_input.user_id is null or approver_input.role_id is null then
      raise exception 'Every selected approver requires a user and role.' using errcode = '22023';
    end if;
    if approver_input.user_id::uuid = recipient.id then
      raise exception 'The NTE recipient cannot approve their own NTE.' using errcode = '22023';
    end if;

    select ur.role_id, coalesce(r.display_name, r.id) display_name, capability.is_bod_role
    into selected_role
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id and r.is_active
    join public.nte_approver_roles capability on capability.role_id = ur.role_id and capability.is_active
    where ur.user_id = approver_input.user_id::uuid
      and ur.role_id = approver_input.role_id
      and ur.is_active;
    if selected_role.role_id is null then
      raise exception 'A selected approver no longer has the eligible role used for selection.' using errcode = '42501';
    end if;

    select u.* into approver_user
    from public.hris_users u
    left join auth.users au on au.id = u.auth_user_id
    where u.id = approver_input.user_id::uuid
      and lower(coalesce(u.status, '')) = 'active'
      and lower(coalesce(u.employment_status, 'active')) not in ('inactive', 'terminated', 'archived', 'separated')
      and coalesce(u.end_date, current_date) >= current_date
      and au.id is not null and au.deleted_at is null
      and coalesce(au.banned_until, '-infinity'::timestamptz) <= now();
    if approver_user.id is null then
      raise exception 'A selected approver is not an active eligible user.' using errcode = '42501';
    end if;
    if public.current_data_scope()->>'type' <> 'GLOBAL'
       and not private.user_is_within_current_scope(approver_user.id)
       then
      raise exception 'A selected approver is outside your authorized scope.' using errcode = '42501';
    end if;

    insert into public.nte_approvals(
      nte_id, approver_user_id, approver_employee_id, selection_role_id,
      role_snapshot, is_bod_role, is_required, status, selected_by,
      selection_source, selection_reason
    ) values (
      created_nte.id, approver_user.id, approver_user.id, selected_role.role_id,
      selected_role.display_name, selected_role.is_bod_role, true, 'Pending', actor.id,
      'manual', approver_input.selection_reason
    );
    selected_count := selected_count + 1;
    if selected_role.is_bod_role then selected_bod_count := selected_bod_count + 1; end if;
    approver_snapshot := approver_snapshot || jsonb_build_array(jsonb_build_object(
      'userId', approver_user.id,
      'name', approver_user.full_name,
      'roleId', selected_role.role_id,
      'role', selected_role.display_name,
      'isBod', selected_role.is_bod_role
    ));
  end loop;

  if selected_count = 0 then raise exception 'At least one NTE approver is required.' using errcode = '23514'; end if;
  if selected_bod_count = 0 then raise exception 'At least one Board of Director is required.' using errcode = '23514'; end if;

  perform private.sync_nte_approval_snapshot(created_nte.id);
  perform set_config('app.nte_workflow_rpc', 'on', true);
  update public.ntes set status = 'PendingApproval'::public.nte_status, updated_at = now()
  where id = created_nte.id returning * into created_nte;

  insert into public.notifications(user_id, type, title, message, link, related_entity_id, dedupe_key)
  select a.approver_user_id::text, 'NTE_ISSUED', 'NTE Approval Required',
         format('You have been selected to approve %s for %s.', coalesce(created_nte.nte_code, created_nte.nte_number), recipient.full_name),
         '/feedback/nte/' || created_nte.id::text, created_nte.id::text,
         'nte:' || created_nte.id::text || ':approval:' || a.approver_user_id::text || ':v1'
  from public.nte_approvals a where a.nte_id = created_nte.id
  on conflict (user_id, dedupe_key) do nothing;

  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  values (
    actor.id::text, actor.email, 'CREATE', 'NTE', created_nte.id::text,
    jsonb_build_object(
      'incidentReportId', incident.id,
      'recipientEmployeeId', recipient.id,
      'recipientName', recipient.full_name,
      'selectedApprovers', approver_snapshot,
      'status', 'PendingApproval'
    )::text
  );
  perform private.refresh_incident_nte_summary(incident.id);
  return created_nte;
exception when others then
  raise;
end;
$$;

create or replace function public.act_on_nte_approval(
  p_nte_id uuid,
  p_action text,
  p_comments text default null
)
returns public.ntes
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor public.hris_users%rowtype;
  current_nte public.ntes;
  current_approval public.nte_approvals;
  previous_nte_status public.nte_status;
  normalized_action text := lower(trim(coalesce(p_action, '')));
  note text := trim(coalesce(p_comments, ''));
  all_required_approved boolean;
  bod_approved boolean;
  next_status public.nte_status;
begin
  if actor_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  if normalized_action not in ('approve', 'return', 'reject') then
    raise exception 'Choose Approve, Return for Revision, or Reject.' using errcode = '22023';
  end if;
  if normalized_action in ('return', 'reject') and length(note) < 3 then
    raise exception 'Comments are required and must contain at least 3 characters.' using errcode = '22023';
  end if;

  select * into current_nte from public.ntes where id = p_nte_id for update;
  if current_nte.id is null then raise exception 'NTE not found.' using errcode = 'P0002'; end if;
  if current_nte.status <> 'PendingApproval'::public.nte_status then
    raise exception 'This NTE is no longer pending approval.' using errcode = '22023';
  end if;
  previous_nte_status := current_nte.status;
  select * into current_approval
  from public.nte_approvals
  where nte_id = p_nte_id and approver_user_id = actor_id
  for update;
  if current_approval.id is null then
    raise exception 'This NTE is not assigned to you.' using errcode = '42501';
  end if;
  if current_approval.status <> 'Pending' then
    raise exception 'This approval task has already been processed.' using errcode = '22023';
  end if;
  select * into actor from public.hris_users
  where id = actor_id and lower(status) = 'active';
  if actor.id is null then raise exception 'Your active employee profile could not be resolved.' using errcode = '42501'; end if;

  if normalized_action = 'approve' then
    update public.nte_approvals
    set status = 'Approved', actioned_at = now(), comments = nullif(note, ''), updated_at = now()
    where id = current_approval.id;
  elsif normalized_action = 'return' then
    update public.nte_approvals
    set status = 'Returned for Revision', actioned_at = now(), comments = note, updated_at = now()
    where id = current_approval.id;
    update public.nte_approvals
    set status = 'Cancelled', actioned_at = now(), comments = 'Cancelled because another required approver returned the NTE for revision.', updated_at = now()
    where nte_id = p_nte_id and id <> current_approval.id and status = 'Pending';
  else
    update public.nte_approvals
    set status = 'Rejected', actioned_at = now(), comments = note, updated_at = now()
    where id = current_approval.id;
    update public.nte_approvals
    set status = 'Cancelled', actioned_at = now(), comments = 'Cancelled because another required approver rejected the NTE.', updated_at = now()
    where nte_id = p_nte_id and id <> current_approval.id and status = 'Pending';
  end if;

  select
    bool_and(status = 'Approved') filter (where is_required),
    bool_or(status = 'Approved') filter (where is_required and is_bod_role)
  into all_required_approved, bod_approved
  from public.nte_approvals where nte_id = p_nte_id;

  next_status := case
    when normalized_action = 'return' then 'Draft'::public.nte_status
    when normalized_action = 'reject' then 'Rejected'::public.nte_status
    when coalesce(all_required_approved, false) and coalesce(bod_approved, false) then 'Issued'::public.nte_status
    else 'PendingApproval'::public.nte_status
  end;

  perform set_config('app.nte_workflow_rpc', 'on', true);
  update public.ntes
  set status = next_status,
      revision_note = case when normalized_action = 'return' then note else revision_note end,
      revision_requested_at = case when normalized_action = 'return' then now() else revision_requested_at end,
      revision_requested_by = case when normalized_action = 'return' then actor.id else revision_requested_by end,
      workflow_history = coalesce(workflow_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'action', upper(normalized_action),
        'note', nullif(note, ''),
        'actorId', actor.id,
        'actorName', actor.full_name,
        'actorRole', current_approval.role_snapshot,
        'approvalStage', 'NTE Approval',
        'previousStatus', previous_nte_status::text,
        'newStatus', next_status::text,
        'timestamp', now()
      )),
      updated_at = now()
  where id = p_nte_id returning * into current_nte;
  perform private.sync_nte_approval_snapshot(p_nte_id);
  select * into current_nte from public.ntes where id = p_nte_id;

  if next_status = 'Issued'::public.nte_status then
    insert into public.notifications(user_id, type, title, message, link, related_entity_id, dedupe_key)
    values (
      current_nte.recipient_employee_id::text, 'NTE_ISSUED', 'Notice to Explain Issued',
      format('Notice to Explain %s has completed approval and requires your response.', coalesce(current_nte.nte_code, current_nte.nte_number)),
      '/feedback/nte/' || current_nte.id::text, current_nte.id::text,
      'nte:' || current_nte.id::text || ':issued'
    ) on conflict (user_id, dedupe_key) do nothing;
  elsif next_status in ('Draft'::public.nte_status, 'Rejected'::public.nte_status) then
    insert into public.notifications(user_id, type, title, message, link, related_entity_id, dedupe_key)
    select recipient_id::text, 'GENERAL',
           case when next_status = 'Draft'::public.nte_status then 'NTE Returned for Revision' else 'NTE Rejected' end,
           format('%s acted on NTE %s. Comments: %s', actor.full_name, coalesce(current_nte.nte_code, current_nte.nte_number), note),
           '/feedback/nte/' || current_nte.id::text, current_nte.id::text,
           'nte:' || current_nte.id::text || ':' || lower(next_status::text) || ':' || extract(epoch from now())::bigint::text || ':' || recipient_id::text
    from (
      select current_nte.issued_by_user_id recipient_id
      union
      select ir.assigned_to_id from public.incident_reports ir where ir.id = current_nte.incident_report_id
    ) recipients
    where recipient_id is not null and recipient_id <> actor.id;
  end if;

  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  values (
    actor.id::text, actor.email, upper(normalized_action), 'NTE', p_nte_id::text,
    jsonb_build_object(
      'role', current_approval.role_snapshot,
      'approvalStage', 'NTE Approval',
      'previousStatus', previous_nte_status::text,
      'newStatus', next_status::text,
      'comments', nullif(note, '')
    )::text
  );
  perform private.refresh_incident_nte_summary(current_nte.incident_report_id);
  return current_nte;
end;
$$;

create or replace function public.get_my_pending_nte_approvals()
returns table(
  id uuid,
  incident_report_id uuid,
  recipient_employee_id uuid,
  recipient_name text,
  response_deadline timestamptz,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  nte_number text,
  nte_code text,
  approval_id uuid,
  approval_role text,
  approval_assigned_at timestamptz,
  case_number integer,
  category text,
  business_unit_id uuid,
  business_unit_name text,
  assigned_to_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.incident_report_id, n.recipient_employee_id,
         coalesce(n.recipient_name_snapshot, n.recipient_names[1]),
         n.response_deadline, n.status::text, n.created_at, n.updated_at,
         n.nte_number, n.nte_code, a.id, a.role_snapshot, a.assigned_at,
         ir.case_number, ir.category, ir.business_unit_id, ir.business_unit_name,
         ir.assigned_to_name
  from public.nte_approvals a
  join public.ntes n on n.id = a.nte_id
  join public.incident_reports ir on ir.id = n.incident_report_id
  where a.approver_user_id = public.current_hris_user_id()
    and a.status = 'Pending'
    and n.status = 'PendingApproval'::public.nte_status
  order by a.assigned_at desc
$$;

create or replace function public.resubmit_nte_revision(
  p_nte_id uuid,
  p_details text,
  p_body text default null,
  p_response_deadline timestamptz default null,
  p_evidence_link text default null
)
returns public.ntes
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor public.hris_users%rowtype;
  current_nte public.ntes;
  next_version integer;
begin
  if actor_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  select * into current_nte from public.ntes where id = p_nte_id for update;
  if current_nte.id is null then raise exception 'NTE not found.' using errcode = 'P0002'; end if;
  if current_nte.status <> 'Draft'::public.nte_status or current_nte.revision_requested_at is null then
    raise exception 'Only an NTE returned for revision can be resubmitted.' using errcode = '22023';
  end if;
  if actor_id <> current_nte.issued_by_user_id and not private.can_issue_nte() then
    raise exception 'Only the NTE issuer or an authorized HR user may resubmit it.' using errcode = '42501';
  end if;
  if not private.can_access_incident_for_nte(current_nte.incident_report_id, current_nte.recipient_employee_id) then
    raise exception 'This NTE is outside your authorized scope.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_details, ''))) = 0 then
    raise exception 'NTE allegations/details are required.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.nte_approvals a where a.nte_id = p_nte_id and a.is_required and a.is_bod_role) then
    raise exception 'At least one Board of Director is required before resubmission.' using errcode = '23514';
  end if;
  select * into actor from public.hris_users where id = actor_id;
  next_version := current_nte.approval_version + 1;

  update public.nte_approvals
  set status = 'Pending', assigned_at = now(), actioned_at = null, comments = null, updated_at = now()
  where nte_id = p_nte_id and is_required;
  perform private.sync_nte_approval_snapshot(p_nte_id);
  perform set_config('app.nte_workflow_rpc', 'on', true);
  update public.ntes
  set details = trim(p_details), body = coalesce(p_body, body),
      response_deadline = coalesce(p_response_deadline, response_deadline),
      evidence_link = p_evidence_link, status = 'PendingApproval'::public.nte_status,
      approval_version = next_version,
      workflow_history = coalesce(workflow_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'action', 'RESUBMITTED', 'actorId', actor.id, 'actorName', actor.full_name,
        'approvalStage', 'NTE Approval', 'approvalVersion', next_version, 'timestamp', now()
      )), updated_at = now()
  where id = p_nte_id returning * into current_nte;

  insert into public.notifications(user_id, type, title, message, link, related_entity_id, dedupe_key)
  select a.approver_user_id::text, 'NTE_ISSUED', 'Revised NTE Approval Required',
         format('Revised NTE %s requires your approval.', coalesce(current_nte.nte_code, current_nte.nte_number)),
         '/feedback/nte/' || current_nte.id::text, current_nte.id::text,
         'nte:' || current_nte.id::text || ':approval:' || a.approver_user_id::text || ':v' || next_version::text
  from public.nte_approvals a where a.nte_id = current_nte.id and a.status = 'Pending'
  on conflict (user_id, dedupe_key) do nothing;

  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  values (actor.id::text, actor.email, 'RESUBMIT', 'NTE', p_nte_id::text,
    jsonb_build_object('approvalVersion', next_version, 'recipientEmployeeId', current_nte.recipient_employee_id)::text);
  perform private.refresh_incident_nte_summary(current_nte.incident_report_id);
  return current_nte;
end;
$$;

-- Backward-compatible wrapper for old clients. A former BOD "closure" action
-- is treated as an NTE rejection and no longer closes sibling employee cases.
create or replace function public.process_nte_bod_outcome(
  p_nte_id uuid,
  p_outcome text,
  p_note text
)
returns public.ntes
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return public.act_on_nte_approval(
    p_nte_id,
    case lower(trim(coalesce(p_outcome, '')))
      when 'revision' then 'return'
      when 'closure' then 'reject'
      else p_outcome
    end,
    p_note
  );
end;
$$;

revoke all on function public.get_eligible_nte_approvers(uuid, uuid) from public, anon;
revoke all on function public.create_nte_for_employee(uuid, uuid, uuid, timestamptz, text, text, text, text[], text[], jsonb, text) from public, anon;
revoke all on function public.act_on_nte_approval(uuid, text, text) from public, anon;
revoke all on function public.get_my_pending_nte_approvals() from public, anon;
revoke all on function public.resubmit_nte_revision(uuid, text, text, timestamptz, text) from public, anon;
revoke all on function public.process_nte_bod_outcome(uuid, text, text) from public, anon;
grant execute on function public.get_eligible_nte_approvers(uuid, uuid) to authenticated;
grant execute on function public.create_nte_for_employee(uuid, uuid, uuid, timestamptz, text, text, text, text[], text[], jsonb, text) to authenticated;
grant execute on function public.act_on_nte_approval(uuid, text, text) to authenticated;
grant execute on function public.get_my_pending_nte_approvals() to authenticated;
grant execute on function public.resubmit_nte_revision(uuid, text, text, timestamptz, text) to authenticated;
grant execute on function public.process_nte_bod_outcome(uuid, text, text) to authenticated;

insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
values (
  'system', null, 'MIGRATE', 'NTE', null,
  'Backfilled employee-specific NTE recipients and normalized approver assignments without changing existing NTE numbers or documents.'
);

-- Rollback is additive-safe: restore callers to the prior RPC definitions,
-- drop the two new triggers/policies/functions, then drop nte_approvals,
-- nte_approver_roles, the partial index, and the added columns. No legacy NTE,
-- Incident Report, document, notification, or audit row must be deleted.
