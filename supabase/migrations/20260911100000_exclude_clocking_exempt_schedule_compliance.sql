-- Clocking exemptions also remove an employee from weekly schedule compliance
-- when the exemption covers the complete Monday-Sunday schedule week. This
-- keeps punch requirements and scheduling requirements aligned without
-- deleting or changing the employee's published schedule.

create or replace function schedule_compliance.snapshot(p_manager uuid,p_week date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  e record;
  d date;
  draft jsonb;
  days jsonb;
  people jsonb:='[]';
  missing jsonb;
  tag jsonb;
  required integer:=0;
  done integer:=0;
  excluded integer:=0;
  needed integer;
  deadline timestamptz;
  today date:=(statement_timestamp() at time zone 'Asia/Manila')::date;
  state text;
begin
  if p_week is null or extract(isodow from p_week)<>1 then
    raise exception 'Select a Monday schedule week';
  end if;

  select t.deadline into deadline
  from schedule_compliance.tasks t
  where t.manager_id=p_manager and t.week=p_week;
  if deadline is null then
    select ((p_week-s.days_before)+s.deadline_time) at time zone 'Asia/Manila'
      into deadline
    from schedule_compliance.settings s;
  end if;

  for e in
    select id,full_name,business_unit_id,business_unit,department
    from public.hris_users
    where reports_to=p_manager::text
      and id<>p_manager
      and lower(status::text)='active'
    order by full_name
  loop
    draft:=private.payroll_schedule_draft(e.id,p_week);
    missing:='[]';
    days:='[]';
    needed:=0;

    for d in select generate_series(p_week,p_week+6,'1 day')::date loop
      -- A current clocking exemption means no punch is required for the day.
      -- Treat it like a scheduling exemption for compliance purposes only;
      -- published schedule, payroll and attendance history remain unchanged.
      if coalesce((private.attendance_exception(e.id,d)->>'requires_clock')::boolean,true)=false
         or coalesce((select x.exempt
                      from schedule_compliance.exemptions x
                      where x.employee_id=e.id
                        and d>=x.effective_from
                        and (x.effective_to is null or d<=x.effective_to)
                      order by x.approved_at desc,x.id desc
                      limit 1),false) then
        days:=days||jsonb_build_array(jsonb_build_object('date',d,'status','Exempt'));
        continue;
      end if;

      needed:=needed+1;
      select x into tag
      from jsonb_array_elements(draft) x
      where (x->>'date')::date=d
        and x->>'kind' in('work','rest','no_schedule')
      limit 1;
      if tag is not null and coalesce(tag->>'statusTag','')<>'absence' then
        days:=days||jsonb_build_array(jsonb_build_object(
          'date',d,
          'status',case when tag->>'kind'='rest' then 'Rest Day' else 'Saved' end
        ));
      elsif exists(
        select 1
        from jsonb_array_elements(private.approved_schedule_leave(e.id,d)) l
        where (l->>'fullDay')::boolean
      ) then
        days:=days||jsonb_build_array(jsonb_build_object('date',d,'status','Approved leave'));
      else
        missing:=missing||to_jsonb(d);
        days:=days||jsonb_build_array(jsonb_build_object('date',d,'status','Missing'));
      end if;
    end loop;

    if needed=0 then
      excluded:=excluded+1;
    else
      required:=required+1;
      if jsonb_array_length(missing)=0 then done:=done+1; end if;
    end if;

    people:=people||jsonb_build_array(jsonb_build_object(
      'id',e.id,
      'name',e.full_name,
      'businessUnitId',e.business_unit_id,
      'businessUnit',e.business_unit,
      'department',e.department,
      'exempt',needed=0,
      'complete',needed>0 and jsonb_array_length(missing)=0,
      'missingDates',missing,
      'days',days,
      'publication',coalesce((
        select case when source_hash=md5(draft::text) then 'Published' else 'Draft changes' end
        from public.payroll_schedule_publications
        where employee_id=e.id and effective_from=p_week
        order by version desc limit 1
      ),'Draft')
    ));
  end loop;

  state:=case
    when required=0 then 'No Scheduling Required'
    when done=required then 'Completed'
    when statement_timestamp()>deadline then 'Overdue'
    when (deadline at time zone 'Asia/Manila')::date=today then 'Due Today'
    when (deadline at time zone 'Asia/Manila')::date=today+1 then 'Due Tomorrow'
    when done=0 then 'Not Started'
    else 'In Progress'
  end;

  return jsonb_build_object(
    'managerId',p_manager,
    'managerName',(select full_name from public.hris_users where id=p_manager),
    'week',p_week,
    'deadline',deadline,
    'required',required,
    'completed',done,
    'remaining',required-done,
    'exempt',excluded,
    'percentage',case when required=0 then 0 else round(100.0*done/required) end,
    'status',state,
    'employees',people
  );
end;
$$;

-- Return only full-week clocking exemptions for the schedule manager. The
-- function is scoped to the caller's existing employee visibility and never
-- exposes exemption details for people outside that scope.
create or replace function public.get_schedule_clocking_exemptions(
  p_employees uuid[],
  p_week date
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if private.payroll_actor_id() is null then
    raise exception 'Schedule access required' using errcode='42501';
  end if;
  if p_week is null or extract(isodow from p_week)<>1 then
    raise exception 'Select a Monday schedule week';
  end if;

  return coalesce((
    select jsonb_agg(h.id order by h.full_name)
    from public.hris_users h
    where h.id=any(coalesce(p_employees,'{}'::uuid[]))
      and lower(h.status::text)='active'
      and (public.can_access_hris_user(h.id) or private.schedule_team_can_manage(h.id))
      and not exists (
        select 1
        from generate_series(p_week,p_week+6,'1 day') g(day)
        where coalesce((private.attendance_exception(h.id,g.day::date)->>'requires_clock')::boolean,true)
      )
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.get_schedule_clocking_exemptions(uuid[],date) from public,anon;
grant execute on function public.get_schedule_clocking_exemptions(uuid[],date) to authenticated;
notify pgrst,'reload schema';
