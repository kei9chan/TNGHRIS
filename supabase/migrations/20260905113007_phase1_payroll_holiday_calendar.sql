-- Phase 1E: effective-dated holiday calendar foundation.
-- Additive only. No legacy holiday, attendance, or payroll rows are changed.

create table if not exists public.payroll_holiday_calendars (
  id uuid primary key default gen_random_uuid(),
  calendar_code text not null,
  calendar_name text not null,
  description text,
  timezone text not null default 'Asia/Manila',
  legal_entity_id uuid references public.payroll_legal_entities(id) on delete restrict,
  payroll_group_id uuid references public.payroll_groups(id) on delete restrict,
  business_unit_id uuid references public.business_units(id) on delete restrict,
  site_id uuid references public.sites(id) on delete restrict,
  effective_start_date date not null,
  effective_end_date date,
  version integer not null default 1,
  approval_status text not null default 'draft',
  is_active boolean not null default true,
  source_document_ref text,
  source_url text,
  source_version text,
  requested_by_user_id uuid references public.hris_users(id) on delete set null,
  requested_at timestamptz,
  approved_by_user_id uuid references public.hris_users(id) on delete set null,
  approved_at timestamptz,
  approval_note text,
  created_by_user_id uuid references public.hris_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_holiday_calendars_code_not_blank check (btrim(calendar_code) <> ''),
  constraint payroll_holiday_calendars_name_not_blank check (btrim(calendar_name) <> ''),
  constraint payroll_holiday_calendars_timezone_not_blank check (btrim(timezone) <> ''),
  constraint payroll_holiday_calendars_effective_range_check check (
    effective_end_date is null or effective_end_date > effective_start_date
  ),
  constraint payroll_holiday_calendars_version_check check (version > 0),
  constraint payroll_holiday_calendars_status_check check (
    approval_status in ('draft', 'approved', 'active', 'superseded', 'archived')
  ),
  constraint payroll_holiday_calendars_approval_evidence_check check (
    approval_status in ('draft', 'archived')
    or (approved_by_user_id is not null and approved_at is not null
        and nullif(btrim(source_document_ref), '') is not null)
  ),
  constraint payroll_holiday_calendars_request_timestamp_check check (
    (requested_by_user_id is null and requested_at is null)
    or (requested_by_user_id is not null and requested_at is not null)
  ),
  constraint payroll_holiday_calendars_maker_checker_check check (
    approved_by_user_id is null or requested_by_user_id is null
    or approved_by_user_id <> requested_by_user_id
  ),
  constraint payroll_holiday_calendars_scope_check check (
    payroll_group_id is null or legal_entity_id is not null
  )
);

create unique index if not exists payroll_holiday_calendars_global_version_uidx
  on public.payroll_holiday_calendars (lower(calendar_code), version)
  where legal_entity_id is null and payroll_group_id is null;
create unique index if not exists payroll_holiday_calendars_entity_version_uidx
  on public.payroll_holiday_calendars (lower(calendar_code), version, legal_entity_id)
  where legal_entity_id is not null and payroll_group_id is null;
create unique index if not exists payroll_holiday_calendars_group_version_uidx
  on public.payroll_holiday_calendars (lower(calendar_code), version, payroll_group_id)
  where payroll_group_id is not null;
create index if not exists payroll_holiday_calendars_effective_idx
  on public.payroll_holiday_calendars (legal_entity_id, payroll_group_id, business_unit_id,
    site_id, lower(calendar_code), effective_start_date, effective_end_date);
create index if not exists payroll_holiday_calendars_legal_entity_idx
  on public.payroll_holiday_calendars (legal_entity_id);
create index if not exists payroll_holiday_calendars_payroll_group_idx
  on public.payroll_holiday_calendars (payroll_group_id);
create index if not exists payroll_holiday_calendars_business_unit_idx
  on public.payroll_holiday_calendars (business_unit_id);
create index if not exists payroll_holiday_calendars_site_idx
  on public.payroll_holiday_calendars (site_id);
create index if not exists payroll_holiday_calendars_requested_by_idx
  on public.payroll_holiday_calendars (requested_by_user_id);
create index if not exists payroll_holiday_calendars_approved_by_idx
  on public.payroll_holiday_calendars (approved_by_user_id);
create index if not exists payroll_holiday_calendars_created_by_idx
  on public.payroll_holiday_calendars (created_by_user_id);

create table if not exists public.payroll_holiday_dates (
  id uuid primary key default gen_random_uuid(),
  holiday_calendar_id uuid not null references public.payroll_holiday_calendars(id) on delete restrict,
  holiday_date date not null,
  holiday_name text not null,
  holiday_type text not null,
  is_movable boolean not null default false,
  official_source_ref text,
  official_source_url text,
  official_publication_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_holiday_dates_name_not_blank check (btrim(holiday_name) <> ''),
  constraint payroll_holiday_dates_type_check check (
    holiday_type in ('regular_holiday', 'special_non_working', 'special_working', 'local_other')
  ),
  constraint payroll_holiday_dates_unique_date unique (holiday_calendar_id, holiday_date)
);

create index if not exists payroll_holiday_dates_calendar_date_idx
  on public.payroll_holiday_dates (holiday_calendar_id, holiday_date);
create index if not exists payroll_holiday_dates_type_date_idx
  on public.payroll_holiday_dates (holiday_type, holiday_date);

create or replace function private.guard_payroll_holiday_calendar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  referenced boolean;
  group_entity uuid;
  group_business_unit uuid;
begin
  if tg_op = 'INSERT' and new.approval_status <> 'draft' then
    raise exception 'A new holiday calendar must begin in draft status.' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' then
    if new.approval_status is distinct from old.approval_status and not (
      (old.approval_status = 'draft' and new.approval_status in ('approved','archived'))
      or (old.approval_status = 'approved' and new.approval_status in ('active','superseded','archived'))
      or (old.approval_status = 'active' and new.approval_status in ('superseded','archived'))
      or (old.approval_status = 'superseded' and new.approval_status = 'archived')
    ) then
      raise exception 'Invalid holiday-calendar status transition: % -> %.', old.approval_status, new.approval_status using errcode = '22023';
    end if;
    if new.approval_status in ('superseded','archived') then new.is_active := false; end if;
    select exists (select 1 from public.payroll_holiday_dates where holiday_calendar_id = old.id)
      into referenced;
    if referenced and (
      new.calendar_code is distinct from old.calendar_code
      or new.calendar_name is distinct from old.calendar_name
      or new.description is distinct from old.description
      or new.timezone is distinct from old.timezone
      or new.legal_entity_id is distinct from old.legal_entity_id
      or new.payroll_group_id is distinct from old.payroll_group_id
      or new.business_unit_id is distinct from old.business_unit_id
      or new.site_id is distinct from old.site_id
      or new.effective_start_date is distinct from old.effective_start_date
      or new.effective_end_date is distinct from old.effective_end_date
      or new.version is distinct from old.version
    ) then
      raise exception 'A holiday calendar used by holiday dates is immutable; create a new version instead.' using errcode = '55000';
    end if;
  end if;
  if new.payroll_group_id is not null then
    select pg.legal_entity_id, pg.business_unit_id into group_entity, group_business_unit
    from public.payroll_groups pg where pg.id = new.payroll_group_id;
    if not found then raise exception 'The holiday calendar payroll group does not exist.' using errcode = '23503'; end if;
    if new.legal_entity_id is distinct from group_entity then
      raise exception 'The holiday calendar payroll group must match its legal entity.' using errcode = '22023';
    end if;
    if new.business_unit_id is not null and group_business_unit is not null
       and new.business_unit_id is distinct from group_business_unit then
      raise exception 'The holiday calendar business unit must match its payroll group.' using errcode = '22023';
    end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    pg_catalog.format('payroll-holiday-calendar:%s:%s:%s',
      coalesce(new.legal_entity_id::text,'global'), coalesce(new.payroll_group_id::text,'global'),
      pg_catalog.lower(new.calendar_code)), 0));
  if new.approval_status in ('draft','approved','active') and exists (
    select 1 from public.payroll_holiday_calendars existing
    where existing.id <> new.id
      and pg_catalog.lower(existing.calendar_code) = pg_catalog.lower(new.calendar_code)
      and existing.legal_entity_id is not distinct from new.legal_entity_id
      and existing.payroll_group_id is not distinct from new.payroll_group_id
      and existing.business_unit_id is not distinct from new.business_unit_id
      and existing.site_id is not distinct from new.site_id
      and existing.approval_status in ('draft','approved','active')
      and pg_catalog.daterange(existing.effective_start_date, coalesce(existing.effective_end_date,'infinity'::date),'[)')
        && pg_catalog.daterange(new.effective_start_date, coalesce(new.effective_end_date,'infinity'::date),'[)')
  ) then
    raise exception 'Holiday-calendar versions with the same scope cannot overlap.' using errcode = '23P01';
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create or replace function private.guard_payroll_holiday_date()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  calendar_status text;
  calendar_active boolean;
  calendar_start date;
  calendar_end date;
begin
  select approval_status, is_active, effective_start_date, effective_end_date
    into calendar_status, calendar_active, calendar_start, calendar_end
  from public.payroll_holiday_calendars
  where id = coalesce(new.holiday_calendar_id, old.holiday_calendar_id);
  if not found then raise exception 'The holiday calendar does not exist.' using errcode = '23503'; end if;
  if tg_op = 'INSERT' and calendar_status <> 'draft' then
    raise exception 'Holiday dates may only be added while the calendar is in draft status.' using errcode = '55000';
  end if;
  if tg_op = 'UPDATE' and old.holiday_calendar_id <> new.holiday_calendar_id then
    raise exception 'A holiday date cannot be moved to another calendar.' using errcode = '55000';
  end if;
  if tg_op <> 'DELETE' then
    if new.holiday_date < calendar_start or (calendar_end is not null and new.holiday_date >= calendar_end) then
      raise exception 'The holiday date must fall within the calendar effective range.' using errcode = '22023';
    end if;
    if calendar_status <> 'draft' then
      raise exception 'Holiday dates may only be changed while the calendar is in draft status.' using errcode = '55000';
    end if;
    new.updated_at := pg_catalog.now();
    return new;
  end if;
  if calendar_status <> 'draft' then
    raise exception 'Only holiday dates in a draft calendar may be deleted.' using errcode = '55000';
  end if;
  return old;
end;
$$;

create or replace function private.prevent_payroll_holiday_calendar_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Holiday calendars are append-only; archive the calendar instead of deleting it.' using errcode = '55000';
end; $$;

drop trigger if exists payroll_holiday_calendars_guard on public.payroll_holiday_calendars;
create trigger payroll_holiday_calendars_guard before insert or update on public.payroll_holiday_calendars
for each row execute function private.guard_payroll_holiday_calendar();
drop trigger if exists payroll_holiday_calendars_delete_guard on public.payroll_holiday_calendars;
create trigger payroll_holiday_calendars_delete_guard before delete on public.payroll_holiday_calendars
for each row execute function private.prevent_payroll_holiday_calendar_delete();
drop trigger if exists payroll_holiday_dates_guard on public.payroll_holiday_dates;
create trigger payroll_holiday_dates_guard before insert or update or delete on public.payroll_holiday_dates
for each row execute function private.guard_payroll_holiday_date();

alter table public.payroll_holiday_calendars enable row level security;
alter table public.payroll_holiday_dates enable row level security;
drop policy if exists payroll_holiday_calendars_authorized_read on public.payroll_holiday_calendars;
create policy payroll_holiday_calendars_authorized_read on public.payroll_holiday_calendars
for select to authenticated using (private.payroll_configuration_access());
drop policy if exists payroll_holiday_dates_authorized_read on public.payroll_holiday_dates;
create policy payroll_holiday_dates_authorized_read on public.payroll_holiday_dates
for select to authenticated using (private.payroll_configuration_access());
revoke all on table public.payroll_holiday_calendars, public.payroll_holiday_dates from public, anon, authenticated;
grant select on table public.payroll_holiday_calendars, public.payroll_holiday_dates to authenticated;
grant all on table public.payroll_holiday_calendars, public.payroll_holiday_dates to service_role;
revoke all on function private.guard_payroll_holiday_calendar() from public, anon, authenticated;
revoke all on function private.guard_payroll_holiday_date() from public, anon, authenticated;
revoke all on function private.prevent_payroll_holiday_calendar_delete() from public, anon, authenticated;

comment on table public.payroll_holiday_calendars is
  'Versioned holiday calendars scoped to a legal entity, payroll group, business unit, or site.';
comment on table public.payroll_holiday_dates is
  'Approved holiday dates and classifications used later by the payroll premium engine.';
