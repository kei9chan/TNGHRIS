-- Phase 1A follow-up: close cross-scope and concurrent-version integrity gaps.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.payroll_calendar_rules'::regclass
      and conname = 'payroll_calendar_rules_group_id_id_key'
  ) then
    alter table public.payroll_calendar_rules
      add constraint payroll_calendar_rules_group_id_id_key unique (payroll_group_id, id);
  end if;
end;
$$;

alter table public.payroll_periods
  drop constraint if exists payroll_periods_calendar_rule_id_fkey;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.payroll_periods'::regclass
      and conname = 'payroll_periods_group_calendar_rule_fkey'
  ) then
    alter table public.payroll_periods
      add constraint payroll_periods_group_calendar_rule_fkey
      foreign key (payroll_group_id, calendar_rule_id)
      references public.payroll_calendar_rules (payroll_group_id, id);
  end if;
end;
$$;

create or replace function private.prevent_payroll_group_overlap()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.format('payroll-group:%s:%s', new.legal_entity_id, pg_catalog.lower(new.code)),
      0
    )
  );

  if exists (
    select 1
    from public.payroll_groups existing
    where existing.id <> new.id
      and existing.legal_entity_id = new.legal_entity_id
      and pg_catalog.lower(existing.code) = pg_catalog.lower(new.code)
      and daterange(
        existing.effective_start_date,
        coalesce(existing.effective_end_date, 'infinity'::date),
        '[)'
      ) && daterange(
        new.effective_start_date,
        coalesce(new.effective_end_date, 'infinity'::date),
        '[)'
      )
  ) then
    raise exception 'Payroll group versions cannot have overlapping effective dates.' using errcode = '23P01';
  end if;
  return new;
end;
$$;

create or replace function private.prevent_payroll_calendar_rule_overlap()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.format('payroll-calendar:%s:%s', new.payroll_group_id, pg_catalog.lower(new.calendar_code)),
      0
    )
  );

  if exists (
    select 1
    from public.payroll_calendar_rules existing
    where existing.id <> new.id
      and existing.payroll_group_id = new.payroll_group_id
      and pg_catalog.lower(existing.calendar_code) = pg_catalog.lower(new.calendar_code)
      and daterange(
        existing.effective_start_date,
        coalesce(existing.effective_end_date, 'infinity'::date),
        '[)'
      ) && daterange(
        new.effective_start_date,
        coalesce(new.effective_end_date, 'infinity'::date),
        '[)'
      )
  ) then
    raise exception 'Payroll calendar rule versions cannot have overlapping effective dates.' using errcode = '23P01';
  end if;
  return new;
end;
$$;

create or replace function private.guard_payroll_period_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status <> 'draft' then
    raise exception 'A new payroll period must begin in draft status.' using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      if nullif(btrim(new.status_reason), '') is null then
        raise exception 'A reason is required for every payroll-period status change.' using errcode = '22023';
      end if;

      if not (
        (old.status = 'draft' and new.status in ('collecting_inputs', 'voided'))
        or (old.status = 'collecting_inputs' and new.status in ('draft', 'ready_for_calculation', 'voided'))
        or (old.status = 'ready_for_calculation' and new.status in ('collecting_inputs', 'calculated', 'voided'))
        or (old.status = 'calculated' and new.status in ('ready_for_calculation', 'reviewed', 'voided'))
        or (old.status = 'reviewed' and new.status in ('calculated', 'approved', 'voided'))
        or (old.status = 'approved' and new.status in ('reviewed', 'locked', 'voided'))
        or (old.status = 'locked' and new.status in ('posted', 'voided'))
        or (old.status = 'posted' and new.status = 'disbursement_prepared')
        or (old.status = 'disbursement_prepared' and new.status = 'paid')
      ) then
        raise exception 'Invalid payroll-period status transition: % -> %.', old.status, new.status using errcode = '22023';
      end if;
    end if;

    if old.status in ('locked', 'posted', 'disbursement_prepared', 'paid', 'voided', 'reissued')
       and (
         new.payroll_group_id is distinct from old.payroll_group_id
         or new.calendar_rule_id is distinct from old.calendar_rule_id
         or new.period_type is distinct from old.period_type
         or new.period_start_date is distinct from old.period_start_date
         or new.period_end_date is distinct from old.period_end_date
         or new.attendance_close_date is distinct from old.attendance_close_date
         or new.adjustment_deadline_date is distinct from old.adjustment_deadline_date
         or new.pay_date is distinct from old.pay_date
         or new.timezone is distinct from old.timezone
       ) then
      raise exception 'Locked or posted payroll periods cannot have their defining inputs changed.' using errcode = '55000';
    end if;

    if new.status = 'locked' and old.status is distinct from 'locked' then
      new.locked_at := coalesce(new.locked_at, now());
    elsif new.status = 'posted' and old.status is distinct from 'posted' then
      new.posted_at := coalesce(new.posted_at, now());
    elsif new.status = 'paid' and old.status is distinct from 'paid' then
      new.paid_at := coalesce(new.paid_at, now());
    elsif new.status = 'voided' and old.status is distinct from 'voided' then
      new.voided_at := coalesce(new.voided_at, now());
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;
