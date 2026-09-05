-- Phase 1H: deterministic, server-side attendance interpretation.
-- Additive only. Raw time events remain immutable and legacy attendance/payroll
-- tables are not rewritten. The generator creates a versioned derived result
-- and review exceptions for each effective-dated roster entry.

create or replace function private.guard_payroll_attendance_interpretation_input()
returns trigger
language plpgsql
set search_path = ''
as $phase1h$
declare
  interpretation_employee_id uuid;
  interpretation_status text;
  raw_employee_id uuid;
  raw_status text;
begin
  select employee_id, record_status
    into interpretation_employee_id, interpretation_status
  from public.payroll_attendance_interpretations
  where id = coalesce(new.attendance_interpretation_id, old.attendance_interpretation_id);
  if not found then
    raise exception 'The attendance interpretation does not exist.' using errcode = '23503';
  end if;

  if tg_op = 'DELETE' then
    if interpretation_status <> 'draft' then
      raise exception 'Inputs for a non-draft attendance interpretation cannot be deleted.' using errcode = '55000';
    end if;
    return old;
  end if;

  if interpretation_status <> 'draft' and tg_op = 'UPDATE' then
    raise exception 'Inputs for a non-draft attendance interpretation are immutable.' using errcode = '55000';
  end if;

  select employee_id, event_status
    into raw_employee_id, raw_status
  from public.payroll_raw_time_events
  where id = new.raw_event_id;
  if not found then
    raise exception 'The referenced raw time event does not exist.' using errcode = '23503';
  end if;
  if raw_employee_id is null or raw_employee_id is distinct from interpretation_employee_id then
    raise exception 'An attendance interpretation input must reference a resolved event for the same employee.'
      using errcode = '22023';
  end if;

  -- Duplicate raw events are preserved as evidence and may be linked only as
  -- duplicate inputs. They are never included in derived work minutes.
  if raw_status not in ('received', 'duplicate') then
    raise exception 'Only received or duplicate raw events may be linked as attendance inputs.' using errcode = '55000';
  end if;
  if raw_status = 'duplicate' and (
    new.event_role <> 'duplicate'
    or new.include_in_work_minutes
    or new.include_in_break_minutes
  ) then
    raise exception 'A duplicate raw event must be classified as duplicate and excluded from calculations.' using errcode = '22023';
  end if;
  if raw_status = 'received' and new.event_role = 'duplicate' then
    raise exception 'A received raw event cannot be classified as a duplicate.' using errcode = '22023';
  end if;

  return new;
end;
$phase1h$;

revoke all on function private.guard_payroll_attendance_interpretation_input() from public, anon, authenticated;

create or replace function public.generate_payroll_attendance_interpretations(
  p_payroll_group_id uuid,
  p_start_date date,
  p_end_date date,
  p_request_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $phase1h$
declare
  v_actor uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_run_key text;
  v_schedule record;
  v_rule record;
  v_event record;
  v_existing record;
  v_schedule_timezone text;
  v_start_time time;
  v_end_time time;
  v_crosses_midnight boolean;
  v_segment_count integer;
  v_segment_total integer;
  v_segment_snapshot jsonb;
  v_schedule_snapshot jsonb;
  v_rule_snapshot jsonb;
  v_input_snapshot jsonb;
  v_scheduled_start timestamptz;
  v_scheduled_end timestamptz;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_first_clock_in timestamptz;
  v_last_clock_out timestamptz;
  v_elapsed_minutes integer := 0;
  v_scheduled_break integer := 0;
  v_scheduled_work integer := 0;
  v_actual_work integer := 0;
  v_break_minutes integer := 0;
  v_late_minutes integer := 0;
  v_undertime_minutes integer := 0;
  v_absence_minutes integer := 0;
  v_source_event_count integer := 0;
  v_clock_in_count integer := 0;
  v_clock_out_count integer := 0;
  v_duplicate_count integer := 0;
  v_missing_clock_in boolean := false;
  v_missing_clock_out boolean := false;
  v_no_show boolean := false;
  v_late_clock_out boolean := false;
  v_early_clock_in boolean := false;
  v_absence_status text := 'needs_review';
  v_record_reason text;
  v_interpretation_id uuid;
  v_interpretation_version integer;
  v_created_count integer := 0;
  v_skipped_existing_count integer := 0;
  v_missing_rule_count integer := 0;
  v_no_show_count integer := 0;
  v_exception_count integer := 0;
  v_run_schedule_count integer := 0;
  v_event_role text;
  v_include_work boolean;
  v_include_break boolean;
begin
  if auth.uid() is null then
    raise exception 'An authenticated payroll user is required to generate attendance interpretations.' using errcode = '42501';
  end if;

  if not (
    public.is_system_admin()
    or public.is_hr_or_admin()
    or public.has_active_role('Finance Staff')
  ) then
    raise exception 'Only HR, Finance, or system administrators may generate attendance interpretations.' using errcode = '42501';
  end if;

  v_actor := public.current_hris_user_id();
  if v_actor is null then
    raise exception 'The authenticated user is not linked to an HRIS user.' using errcode = '42501';
  end if;

  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'The attendance interpretation date range is invalid.' using errcode = '22023';
  end if;
  if p_end_date - p_start_date > 92 then
    raise exception 'Attendance interpretation runs may cover at most 93 calendar days.' using errcode = '22023';
  end if;
  if p_payroll_group_id is not null and not exists (
    select 1 from public.payroll_groups pg where pg.id = p_payroll_group_id
  ) then
    raise exception 'The selected payroll group does not exist.' using errcode = '23503';
  end if;

  v_run_key := coalesce(
    nullif(pg_catalog.btrim(p_request_key), ''),
    pg_catalog.to_char(v_now, 'YYYYMMDDHH24MISSMS')
  );

  -- Serialize the same group/date range while keeping the function retry-safe.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.format(
        'payroll-attendance-run:%s:%s:%s',
        coalesce(p_payroll_group_id::text, 'all'),
        p_start_date,
        p_end_date
      ),
      0
    )
  );

  for v_schedule in
    select
      pes.id as schedule_id,
      pes.employee_id,
      pes.worker_assignment_id,
      pes.shift_preset_id,
      pes.shift_date,
      pes.schedule_source,
      pes.is_override,
      pes.override_reason,
      pes.version as schedule_version,
      pes.source_document_ref as schedule_source_document_ref,
      pes.change_reason as schedule_change_reason,
      pes.record_status as schedule_status,
      wa.payroll_group_id,
      coalesce(wa.business_unit_id, pg.business_unit_id, sp.business_unit_id) as business_unit_id,
      coalesce(wa.site_id, sp.site_id) as site_id,
      pg.legal_entity_id,
      sp.preset_code,
      sp.preset_name,
      sp.shift_kind,
      sp.timezone as preset_timezone,
      sp.scheduled_minutes as preset_scheduled_minutes,
      sp.break_minutes as preset_break_minutes,
      sp.break_policy as preset_break_policy,
      sp.version as preset_version
    from public.payroll_employee_schedules pes
    join public.payroll_worker_assignments wa
      on wa.id = pes.worker_assignment_id
     and wa.employee_id = pes.employee_id
    join public.payroll_groups pg on pg.id = wa.payroll_group_id
    join public.payroll_shift_presets sp on sp.id = pes.shift_preset_id
    where pes.shift_date between p_start_date and p_end_date
      and (p_payroll_group_id is null or wa.payroll_group_id = p_payroll_group_id)
      and pes.record_status in ('approved', 'active')
      and wa.record_status in ('approved', 'active')
      and wa.effective_start_date <= pes.shift_date
      and (wa.effective_end_date is null or pes.shift_date < wa.effective_end_date)
      and sp.approval_status in ('approved', 'active')
      and sp.is_active
      and sp.effective_start_date <= pes.shift_date
      and (sp.effective_end_date is null or pes.shift_date < sp.effective_end_date)
    order by pes.shift_date, pes.employee_id, pes.id
  loop
    v_run_schedule_count := v_run_schedule_count + 1;

    select i.id, i.interpretation_version, i.record_status
      into v_existing
    from public.payroll_attendance_interpretations i
    where i.employee_id = v_schedule.employee_id
      and i.work_date = v_schedule.shift_date
      and i.record_status in ('draft', 'needs_review', 'resolved', 'approved')
    order by i.interpretation_version desc
    limit 1;
    if found then
      v_skipped_existing_count := v_skipped_existing_count + 1;
      continue;
    end if;

    select
      r.id as rule_id,
      r.rule_code,
      r.rule_name,
      r.timezone as rule_timezone,
      r.version as rule_version,
      r.effective_start_date as rule_effective_start_date,
      r.effective_end_date as rule_effective_end_date,
      r.grace_period_minutes,
      r.no_show_buffer_minutes,
      r.meal_break_minutes,
      r.meal_break_policy,
      r.rounding_policy,
      r.early_clock_in_policy,
      r.late_clock_out_policy,
      r.missing_punch_policy,
      r.source_document_ref as rule_source_document_ref,
      r.source_url as rule_source_url,
      r.source_version as rule_source_version
      into v_rule
    from public.payroll_attendance_rule_sets r
    where r.approval_status in ('approved', 'active')
      and r.is_active
      and r.effective_start_date <= v_schedule.shift_date
      and (r.effective_end_date is null or v_schedule.shift_date < r.effective_end_date)
      and (r.legal_entity_id is null or r.legal_entity_id = v_schedule.legal_entity_id)
      and (r.payroll_group_id is null or r.payroll_group_id = v_schedule.payroll_group_id)
      and (r.business_unit_id is null or r.business_unit_id = v_schedule.business_unit_id)
      and (r.site_id is null or r.site_id = v_schedule.site_id)
    order by
      case when r.site_id is not null then 4
           when r.business_unit_id is not null then 3
           when r.payroll_group_id is not null then 2
           when r.legal_entity_id is not null then 1
           else 0 end desc,
      r.version desc,
      r.effective_start_date desc,
      r.id desc
    limit 1;
    if not found then
      v_missing_rule_count := v_missing_rule_count + 1;
      continue;
    end if;

    select
      min(sps.start_time),
      max(sps.end_time),
      coalesce(bool_or(sps.crosses_midnight), false),
      count(*)::integer,
      coalesce(sum(sps.scheduled_minutes), 0)::integer,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', sps.id,
            'segment_number', sps.segment_number,
            'start_time', sps.start_time,
            'end_time', sps.end_time,
            'crosses_midnight', sps.crosses_midnight,
            'scheduled_minutes', sps.scheduled_minutes
          ) order by sps.segment_number
        ),
        '[]'::jsonb
      )
      into v_start_time, v_end_time, v_crosses_midnight,
           v_segment_count, v_segment_total, v_segment_snapshot
    from public.payroll_shift_preset_segments sps
    where sps.shift_preset_id = v_schedule.shift_preset_id;

    if v_segment_count = 0 or v_start_time is null or v_end_time is null then
      v_missing_rule_count := v_missing_rule_count + 1;
      continue;
    end if;

    v_schedule_timezone := coalesce(nullif(v_schedule.preset_timezone, ''), v_rule.rule_timezone);
    v_scheduled_start := (
      v_schedule.shift_date::timestamp
      + (v_start_time - time '00:00:00')
    ) at time zone v_schedule_timezone;
    v_scheduled_end := (
      v_schedule.shift_date::timestamp
      + (v_end_time - time '00:00:00')
      + case when v_crosses_midnight then interval '1 day' else interval '0 day' end
    ) at time zone v_schedule_timezone;
    v_window_start := v_scheduled_start - interval '6 hours';
    v_window_end := v_scheduled_end + interval '6 hours';

    -- The preset's break value is the scheduled break, bounded by the active
    -- policy. For a multi-segment/split shift the preset scheduled minutes are
    -- already the paid segment total, so the break gap is not subtracted twice.
    v_scheduled_break := least(
      greatest(coalesce(v_schedule.preset_break_minutes, 0), 0),
      greatest(coalesce(v_rule.meal_break_minutes, 0), 0)
    );
    if v_segment_count > 1 or v_schedule.shift_kind in ('split', 'broken') then
      v_scheduled_work := greatest(coalesce(v_schedule.preset_scheduled_minutes, v_segment_total), 0);
    else
      v_scheduled_work := greatest(
        coalesce(v_schedule.preset_scheduled_minutes, v_segment_total) - v_scheduled_break,
        0
      );
    end if;

    select
      count(*)::integer,
      count(*) filter (
        where e.event_status = 'received'
          and not e.is_duplicate
          and e.event_kind = 'clock_in'
      )::integer,
      count(*) filter (
        where e.event_status = 'received'
          and not e.is_duplicate
          and e.event_kind = 'clock_out'
      )::integer,
      count(*) filter (where e.event_status = 'duplicate' or e.is_duplicate)::integer
      into v_source_event_count, v_clock_in_count, v_clock_out_count, v_duplicate_count
    from public.payroll_raw_time_events e
    where e.employee_id = v_schedule.employee_id
      and e.event_occurred_at between v_window_start and v_window_end
      and e.event_status in ('received', 'duplicate');

    select
      min(e.event_occurred_at) filter (
        where e.event_status = 'received'
          and not e.is_duplicate
          and e.event_kind = 'clock_in'
      ),
      max(e.event_occurred_at) filter (
        where e.event_status = 'received'
          and not e.is_duplicate
          and e.event_kind = 'clock_out'
      )
      into v_first_clock_in, v_last_clock_out
    from public.payroll_raw_time_events e
    where e.employee_id = v_schedule.employee_id
      and e.event_occurred_at between v_window_start and v_window_end
      and e.event_status = 'received'
      and not e.is_duplicate;

    v_missing_clock_in := v_first_clock_in is null;
    v_missing_clock_out := v_last_clock_out is null;

    select coalesce(sum(
      pg_catalog.floor(extract(epoch from pair.break_end - pair.break_start) / 60)::integer
    ), 0)::integer
      into v_break_minutes
    from (
      select
        e.event_occurred_at as break_start,
        (
          select min(e2.event_occurred_at)
          from public.payroll_raw_time_events e2
          where e2.employee_id = v_schedule.employee_id
            and e2.event_status = 'received'
            and not e2.is_duplicate
            and e2.event_kind = 'break_end'
            and e2.event_occurred_at > e.event_occurred_at
            and e2.event_occurred_at <= coalesce(v_last_clock_out, v_window_end)
            and e2.event_occurred_at between v_window_start and v_window_end
        ) as break_end
      from public.payroll_raw_time_events e
      where e.employee_id = v_schedule.employee_id
        and e.event_status = 'received'
        and not e.is_duplicate
        and e.event_kind = 'break_start'
        and e.event_occurred_at between v_window_start and v_window_end
    ) pair
    where pair.break_end is not null;

    if v_break_minutes = 0
       and v_first_clock_in is not null
       and v_last_clock_out is not null
       and v_last_clock_out >= v_first_clock_in then
      -- For a moveable scheduled break without explicit break punches, retain
      -- the policy-based scheduled break assumption in the input snapshot.
      v_break_minutes := least(
        v_scheduled_break,
        greatest(pg_catalog.floor(extract(epoch from v_last_clock_out - v_first_clock_in) / 60)::integer, 0)
      );
    end if;

    if v_first_clock_in is not null
       and v_last_clock_out is not null
       and v_last_clock_out >= v_first_clock_in then
      v_elapsed_minutes := greatest(
        pg_catalog.floor(extract(epoch from v_last_clock_out - v_first_clock_in) / 60)::integer,
        0
      );
      v_actual_work := greatest(v_elapsed_minutes - v_break_minutes, 0);
    else
      v_elapsed_minutes := 0;
      v_actual_work := 0;
    end if;

    v_late_minutes := 0;
    if v_first_clock_in is not null and v_first_clock_in > v_scheduled_start then
      v_late_minutes := greatest(
        pg_catalog.floor(extract(epoch from v_first_clock_in - v_scheduled_start) / 60)::integer
          - greatest(coalesce(v_rule.grace_period_minutes, 0), 0),
        0
      );
    end if;

    v_undertime_minutes := 0;
    if v_last_clock_out is not null and v_last_clock_out < v_scheduled_end then
      v_undertime_minutes := greatest(v_scheduled_work - v_actual_work, 0);
    end if;

    v_early_clock_in := v_first_clock_in is not null and v_first_clock_in < v_scheduled_start;
    v_late_clock_out := v_last_clock_out is not null and v_last_clock_out > v_scheduled_end;
    v_no_show := false;
    v_absence_minutes := 0;

    if v_first_clock_in is null and v_last_clock_out is null then
      if v_now >= v_scheduled_start + greatest(coalesce(v_rule.no_show_buffer_minutes, 0), 0) * interval '1 minute' then
        v_no_show := true;
        v_absence_status := 'absent';
        v_absence_minutes := v_scheduled_work;
      else
        v_absence_status := 'needs_review';
      end if;
    elsif v_missing_clock_in or v_missing_clock_out then
      v_absence_status := 'needs_review';
      v_absence_minutes := greatest(v_scheduled_work - v_actual_work, 0);
    elsif v_actual_work < v_scheduled_work then
      v_absence_status := 'partial';
    else
      v_absence_status := 'present';
    end if;

    select coalesce(max(i.interpretation_version), 0) + 1
      into v_interpretation_version
    from public.payroll_attendance_interpretations i
    where i.employee_id = v_schedule.employee_id
      and i.work_date = v_schedule.shift_date;

    v_schedule_snapshot := pg_catalog.jsonb_build_object(
      'schedule_id', v_schedule.schedule_id,
      'employee_id', v_schedule.employee_id,
      'worker_assignment_id', v_schedule.worker_assignment_id,
      'shift_preset_id', v_schedule.shift_preset_id,
      'work_date', v_schedule.shift_date,
      'schedule_source', v_schedule.schedule_source,
      'is_override', v_schedule.is_override,
      'override_reason', v_schedule.override_reason,
      'schedule_version', v_schedule.schedule_version,
      'record_status', v_schedule.schedule_status,
      'preset_code', v_schedule.preset_code,
      'preset_name', v_schedule.preset_name,
      'shift_kind', v_schedule.shift_kind,
      'timezone', v_schedule_timezone,
      'scheduled_minutes', v_schedule.preset_scheduled_minutes,
      'break_minutes', v_schedule.preset_break_minutes,
      'break_policy', v_schedule.preset_break_policy,
      'source_document_ref', v_schedule.schedule_source_document_ref,
      'change_reason', v_schedule.schedule_change_reason,
      'segments', v_segment_snapshot
    );

    v_rule_snapshot := pg_catalog.jsonb_build_object(
      'rule_set_id', v_rule.rule_id,
      'rule_code', v_rule.rule_code,
      'rule_name', v_rule.rule_name,
      'timezone', v_rule.rule_timezone,
      'version', v_rule.rule_version,
      'effective_start_date', v_rule.rule_effective_start_date,
      'effective_end_date', v_rule.rule_effective_end_date,
      'grace_period_minutes', v_rule.grace_period_minutes,
      'no_show_buffer_minutes', v_rule.no_show_buffer_minutes,
      'meal_break_minutes', v_rule.meal_break_minutes,
      'meal_break_policy', v_rule.meal_break_policy,
      'rounding_policy', v_rule.rounding_policy,
      'early_clock_in_policy', v_rule.early_clock_in_policy,
      'late_clock_out_policy', v_rule.late_clock_out_policy,
      'missing_punch_policy', v_rule.missing_punch_policy,
      'source_document_ref', v_rule.rule_source_document_ref,
      'source_url', v_rule.rule_source_url,
      'source_version', v_rule.rule_source_version
    );

    v_input_snapshot := pg_catalog.jsonb_build_object(
      'run_key', v_run_key,
      'generated_at', v_now,
      'source_event_count', v_source_event_count,
      'calculation_window', pg_catalog.jsonb_build_object(
        'start_at', v_window_start,
        'end_at', v_window_end
      ),
      'calculation', pg_catalog.jsonb_build_object(
        'scheduled_work_minutes', v_scheduled_work,
        'scheduled_break_minutes', v_scheduled_break,
        'elapsed_minutes', v_elapsed_minutes,
        'actual_work_minutes', v_actual_work,
        'break_minutes', v_break_minutes,
        'late_minutes', v_late_minutes,
        'undertime_minutes', v_undertime_minutes,
        'absence_minutes', v_absence_minutes,
        'grace_applied', greatest(coalesce(v_rule.grace_period_minutes, 0), 0),
        'no_show_buffer_applied', greatest(coalesce(v_rule.no_show_buffer_minutes, 0), 0),
        'break_assumption', case
          when v_first_clock_in is null or v_last_clock_out is null then 'not_applied'
          when exists (
            select 1
            from public.payroll_raw_time_events be
            where be.employee_id = v_schedule.employee_id
              and be.event_kind = 'break_start'
              and be.event_status = 'received'
              and not be.is_duplicate
              and be.event_occurred_at between v_window_start and v_window_end
          ) then 'explicit_break_events'
          when v_scheduled_break > 0 then 'scheduled_break_assumption'
          else 'no_break'
        end,
        'early_clock_in_policy', v_rule.early_clock_in_policy,
        'late_clock_out_policy', v_rule.late_clock_out_policy
      ),
      'raw_events', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', e.id,
            'event_kind', e.event_kind,
            'event_status', e.event_status,
            'is_duplicate', e.is_duplicate,
            'duplicate_of_event_id', e.duplicate_of_event_id,
            'event_occurred_at', e.event_occurred_at,
            'event_timezone', e.event_timezone,
            'source_type', e.source_type,
            'source_system', e.source_system,
            'work_context', e.work_context,
            'submission_mode', e.submission_mode
          ) order by e.event_occurred_at, e.id
        )
        from public.payroll_raw_time_events e
        where e.employee_id = v_schedule.employee_id
          and e.event_occurred_at between v_window_start and v_window_end
          and e.event_status in ('received', 'duplicate')
      ), '[]'::jsonb)
    );

    v_record_reason := case
      when v_no_show then 'No valid clock event was received after the configured no-show buffer.'
      when v_missing_clock_in and v_missing_clock_out then 'Both clock-in and clock-out are missing; manual review is required.'
      when v_missing_clock_in then 'Clock-in is missing; manual review is required.'
      when v_missing_clock_out then 'Clock-out is missing; manual review is required.'
      when v_late_clock_out then 'Late clock-out was retained for review under the active policy.'
      when v_early_clock_in then 'Early clock-in was retained for review under the active policy.'
      when v_late_minutes > 0 or v_undertime_minutes > 0 then 'Late or undertime minutes were calculated from the assigned schedule.'
      else 'Attendance was interpreted from the assigned schedule and received raw events.'
    end;

    insert into public.payroll_attendance_interpretations (
      employee_id,
      work_date,
      employee_schedule_id,
      attendance_rule_set_id,
      interpretation_version,
      record_status,
      interpretation_source,
      schedule_timezone,
      scheduled_start_at,
      scheduled_end_at,
      scheduled_work_minutes,
      scheduled_break_minutes,
      first_clock_in_at,
      last_clock_out_at,
      actual_work_minutes,
      break_minutes,
      late_minutes,
      undertime_minutes,
      absence_minutes,
      absence_status,
      missing_clock_in,
      missing_clock_out,
      source_event_count,
      schedule_snapshot,
      rule_snapshot,
      input_snapshot,
      status_reason,
      created_by_user_id
    ) values (
      v_schedule.employee_id,
      v_schedule.shift_date,
      v_schedule.schedule_id,
      v_rule.rule_id,
      v_interpretation_version,
      'draft',
      'system',
      v_schedule_timezone,
      v_scheduled_start,
      v_scheduled_end,
      v_scheduled_work,
      v_scheduled_break,
      v_first_clock_in,
      v_last_clock_out,
      v_actual_work,
      v_break_minutes,
      v_late_minutes,
      v_undertime_minutes,
      v_absence_minutes,
      v_absence_status,
      v_missing_clock_in,
      v_missing_clock_out,
      v_source_event_count,
      v_schedule_snapshot,
      v_rule_snapshot,
      v_input_snapshot,
      v_record_reason,
      v_actor
    ) returning id into v_interpretation_id;

    for v_event in
      select
        e.id,
        e.event_kind,
        e.event_status,
        e.is_duplicate,
        e.event_occurred_at,
        row_number() over (order by e.event_occurred_at, e.id)::integer as event_sequence
      from public.payroll_raw_time_events e
      where e.employee_id = v_schedule.employee_id
        and e.event_occurred_at between v_window_start and v_window_end
        and e.event_status in ('received', 'duplicate')
      order by e.event_occurred_at, e.id
    loop
      if v_event.event_status = 'duplicate' or v_event.is_duplicate then
        v_event_role := 'duplicate';
        v_include_work := false;
        v_include_break := false;
      elsif v_event.event_kind in ('clock_in', 'clock_out', 'break_start', 'break_end') then
        v_event_role := v_event.event_kind;
        v_include_work := v_event.event_kind in ('clock_in', 'clock_out');
        v_include_break := v_event.event_kind in ('break_start', 'break_end');
      else
        v_event_role := 'other';
        v_include_work := false;
        v_include_break := false;
      end if;

      insert into public.payroll_attendance_interpretation_inputs (
        attendance_interpretation_id,
        raw_event_id,
        event_sequence,
        event_role,
        include_in_work_minutes,
        include_in_break_minutes,
        exclusion_reason
      ) values (
        v_interpretation_id,
        v_event.id,
        v_event.event_sequence,
        v_event_role,
        v_include_work,
        v_include_break,
        case when v_event_role = 'duplicate'
          then 'Duplicate raw event preserved as evidence and excluded from calculation.'
          else null
        end
      );
    end loop;

    if v_duplicate_count > 0 then
      for v_event in
        select e.id, e.event_occurred_at, e.duplicate_of_event_id
        from public.payroll_raw_time_events e
        where e.employee_id = v_schedule.employee_id
          and (e.event_status = 'duplicate' or e.is_duplicate)
          and e.event_occurred_at between v_window_start and v_window_end
        order by e.event_occurred_at, e.id
      loop
        insert into public.payroll_attendance_exceptions (
          attendance_interpretation_id,
          employee_id,
          work_date,
          raw_event_id,
          exception_type,
          severity,
          status,
          deduplication_key,
          detection_source,
          details,
          evidence
        ) values (
          v_interpretation_id,
          v_schedule.employee_id,
          v_schedule.shift_date,
          v_event.id,
          'duplicate_event',
          'info',
          'open',
          'duplicate:' || v_event.id::text,
          'system',
          'A duplicate raw time event was retained and excluded from the attendance calculation.',
          pg_catalog.jsonb_build_object(
            'duplicate_event_id', v_event.id,
            'duplicate_of_event_id', v_event.duplicate_of_event_id,
            'event_occurred_at', v_event.event_occurred_at
          )
        );
        v_exception_count := v_exception_count + 1;
      end loop;
    end if;

    if v_missing_clock_in then
      insert into public.payroll_attendance_exceptions (
        attendance_interpretation_id, employee_id, work_date, exception_type,
        severity, status, deduplication_key, detection_source, details, evidence
      ) values (
        v_interpretation_id, v_schedule.employee_id, v_schedule.shift_date,
        'missing_clock_in', 'warning', 'open', 'missing_clock_in', 'system',
        'No received, non-duplicate clock-in was found in the schedule window.',
        pg_catalog.jsonb_build_object('scheduled_start_at', v_scheduled_start, 'window_start', v_window_start)
      );
      v_exception_count := v_exception_count + 1;
    end if;

    if v_missing_clock_out then
      insert into public.payroll_attendance_exceptions (
        attendance_interpretation_id, employee_id, work_date, exception_type,
        severity, status, deduplication_key, detection_source, details, evidence
      ) values (
        v_interpretation_id, v_schedule.employee_id, v_schedule.shift_date,
        'missing_clock_out', 'warning', 'open', 'missing_clock_out', 'system',
        'No received, non-duplicate clock-out was found in the schedule window.',
        pg_catalog.jsonb_build_object('scheduled_end_at', v_scheduled_end, 'window_end', v_window_end)
      );
      v_exception_count := v_exception_count + 1;
    end if;

    if v_no_show then
      insert into public.payroll_attendance_exceptions (
        attendance_interpretation_id, employee_id, work_date, exception_type,
        severity, status, deduplication_key, detection_source, details, evidence
      ) values (
        v_interpretation_id, v_schedule.employee_id, v_schedule.shift_date,
        'no_show', 'blocking', 'open', 'no_show', 'system',
        'No valid clock event was received after the configured no-show buffer; resolve before payroll finalization.',
        pg_catalog.jsonb_build_object(
          'scheduled_start_at', v_scheduled_start,
          'no_show_buffer_minutes', v_rule.no_show_buffer_minutes,
          'checked_at', v_now
        )
      );
      v_exception_count := v_exception_count + 1;
      v_no_show_count := v_no_show_count + 1;
    end if;

    if v_late_minutes > 0 then
      insert into public.payroll_attendance_exceptions (
        attendance_interpretation_id, employee_id, work_date, exception_type,
        severity, status, deduplication_key, detection_source, details, evidence
      ) values (
        v_interpretation_id, v_schedule.employee_id, v_schedule.shift_date,
        'late', 'warning', 'open', 'late', 'system',
        'Clock-in exceeded the configured grace period.',
        pg_catalog.jsonb_build_object(
          'clock_in_at', v_first_clock_in,
          'scheduled_start_at', v_scheduled_start,
          'grace_period_minutes', v_rule.grace_period_minutes,
          'late_minutes', v_late_minutes
        )
      );
      v_exception_count := v_exception_count + 1;
    end if;

    if v_undertime_minutes > 0 and not (v_missing_clock_in or v_missing_clock_out) then
      insert into public.payroll_attendance_exceptions (
        attendance_interpretation_id, employee_id, work_date, exception_type,
        severity, status, deduplication_key, detection_source, details, evidence
      ) values (
        v_interpretation_id, v_schedule.employee_id, v_schedule.shift_date,
        'undertime', 'warning', 'open', 'undertime', 'system',
        'The interpreted paid work is below the scheduled paid work.',
        pg_catalog.jsonb_build_object(
          'actual_work_minutes', v_actual_work,
          'scheduled_work_minutes', v_scheduled_work,
          'undertime_minutes', v_undertime_minutes
        )
      );
      v_exception_count := v_exception_count + 1;
    end if;

    if v_early_clock_in and v_rule.early_clock_in_policy = 'review' then
      insert into public.payroll_attendance_exceptions (
        attendance_interpretation_id, employee_id, work_date, exception_type,
        severity, status, deduplication_key, detection_source, details, evidence
      ) values (
        v_interpretation_id, v_schedule.employee_id, v_schedule.shift_date,
        'early_clock_in', 'warning', 'open', 'early_clock_in', 'system',
        'Clock-in occurred before the scheduled start and requires policy review.',
        pg_catalog.jsonb_build_object('clock_in_at', v_first_clock_in, 'scheduled_start_at', v_scheduled_start)
      );
      v_exception_count := v_exception_count + 1;
    end if;

    if v_late_clock_out and v_rule.late_clock_out_policy = 'review' then
      insert into public.payroll_attendance_exceptions (
        attendance_interpretation_id, employee_id, work_date, exception_type,
        severity, status, deduplication_key, detection_source, details, evidence
      ) values (
        v_interpretation_id, v_schedule.employee_id, v_schedule.shift_date,
        'late_clock_out', 'warning', 'open', 'late_clock_out', 'system',
        'Clock-out occurred after the scheduled end and was retained for review; overtime is not calculated in Phase 1H.',
        pg_catalog.jsonb_build_object('clock_out_at', v_last_clock_out, 'scheduled_end_at', v_scheduled_end)
      );
      v_exception_count := v_exception_count + 1;
    end if;

    if v_break_minutes > v_scheduled_break then
      insert into public.payroll_attendance_exceptions (
        attendance_interpretation_id, employee_id, work_date, exception_type,
        severity, status, deduplication_key, detection_source, details, evidence
      ) values (
        v_interpretation_id, v_schedule.employee_id, v_schedule.shift_date,
        'break', 'warning', 'open', 'break', 'system',
        'Observed or explicit break time exceeds the scheduled break and requires review.',
        pg_catalog.jsonb_build_object(
          'break_minutes', v_break_minutes,
          'scheduled_break_minutes', v_scheduled_break
        )
      );
      v_exception_count := v_exception_count + 1;
    end if;

    update public.payroll_attendance_interpretations
    set record_status = 'needs_review',
        status_reason = v_record_reason,
        updated_at = pg_catalog.now()
    where id = v_interpretation_id;

    v_created_count := v_created_count + 1;
  end loop;

  return pg_catalog.jsonb_build_object(
    'request_key', v_run_key,
    'payroll_group_id', p_payroll_group_id,
    'period_start', p_start_date,
    'period_end', p_end_date,
    'scheduled_records_seen', v_run_schedule_count,
    'interpretations_created', v_created_count,
    'existing_interpretations_skipped', v_skipped_existing_count,
    'missing_active_rule_records', v_missing_rule_count,
    'no_show_count', v_no_show_count,
    'exceptions_created', v_exception_count,
    'generated_at', v_now
  );
end;
$phase1h$;

revoke all on function public.generate_payroll_attendance_interpretations(uuid, date, date, text)
  from public, anon, authenticated;
grant execute on function public.generate_payroll_attendance_interpretations(uuid, date, date, text)
  to authenticated, service_role;

comment on function public.generate_payroll_attendance_interpretations(uuid, date, date, text) is
  'Phase 1H server-side attendance interpretation. Creates immutable-input, versioned derived results and review exceptions; never rewrites raw time events or finalized interpretations.';
