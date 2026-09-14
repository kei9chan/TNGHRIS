set local lock_timeout='2s';
set local statement_timeout='25s';
create or replace function private.payroll_time_sources(p_scope uuid,p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare src jsonb:=private.payroll_time_sources_before_ob(p_scope,p_from,p_to);obs jsonb:='[]';r public.official_business_requests;sch jsonb;shifts jsonb:=src->'shifts';days jsonb:=src->'scheduleDays';old_shifts jsonb;old_minutes numeric;h record;prior_ob jsonb;
begin
 for r in select x.* from public.official_business_requests x where x.work_date between p_from and p_to and x.approved_at is not null and x.status in('Approved','For Review','Completed')
 and x.employee_id::text in(select u->>'id' from jsonb_array_elements(src->'employees') u) loop
 select coalesce(jsonb_agg(x),'[]') into old_shifts from jsonb_array_elements(src->'shifts') x where x->>'employeeId'=r.employee_id::text and (x->>'date')::date=r.work_date;
 select coalesce(sum(case when x->>'kind'<>'work' then 0 when (x->>'flexible')::boolean then (x->>'paidMinutes')::numeric else greatest(0,extract(epoch from((x->>'end')::time-(x->>'start')::time))/60+coalesce((x->>'endDayOffset')::integer,0)*1440-60) end),0) into old_minutes from jsonb_array_elements(old_shifts) x;
 obs:=obs||jsonb_build_array(jsonb_build_object('id',r.id,'reference',r.reference,'employeeId',r.employee_id,'date',r.work_date,'status',r.status,'approvedAt',r.approved_at,'revision',r.revision,'overrideSchedule',r.override_schedule,'originalScheduledMinutes',old_minutes,
 'originalRestDay',exists(select 1 from jsonb_array_elements(old_shifts) x where x->>'kind'='rest'),
 'independentPayReview',exists(select 1 from public.payroll_time_compensation_reviews v where v.employee_id=r.employee_id and v.work_date=r.work_date),
 'hasRejectedPunches',exists(select 1 from public.official_business_punch_audits a where a.ob_id=r.id and not a.recorded)));
 if r.override_schedule and not private.is_schedule_suspended(r.employee_id,r.work_date) then
 sch:=private.attendance_schedule(r.employee_id,r.work_date);
 select coalesce(jsonb_agg(x),'[]') into shifts from jsonb_array_elements(shifts) x where not(x->>'employeeId'=r.employee_id::text and (x->>'date')::date=r.work_date);
 shifts:=shifts||(select jsonb_agg(x||jsonb_build_object('employeeId',r.employee_id,'date',r.work_date,'published',true,'publicationId',sch->'publicationId','officialBusinessId',r.id)) from jsonb_array_elements(sch->'entries') x);
 select coalesce(jsonb_agg(x),'[]') into days from jsonb_array_elements(days) x where not(x->>'employeeId'=r.employee_id::text and (x->>'date')::date=r.work_date);
 days:=days||jsonb_build_array(jsonb_build_object('employeeId',r.employee_id,'date',r.work_date,'status','published','officialBusinessId',r.id));
 end if;
 end loop;
 -- A later amendment/cancellation must not erase a date already punched under
 -- a previous approval, or silently reinterpret those punches for payroll.
 for h in select distinct a.ob_id,a.employee_id,(a.approval_snapshot->>'work_date')::date as work_date,current_ob.reference
 from public.official_business_punch_audits a join public.official_business_requests current_ob on current_ob.id=a.ob_id
 where a.recorded and (a.approval_snapshot->>'work_date')::date between p_from and p_to
 and a.employee_id::text in(select u->>'id' from jsonb_array_elements(src->'employees') u)
 and (current_ob.approved_at is null or current_ob.status in('Cancelled','Rejected')
 or a.approval_snapshot->>'work_date' is distinct from current_ob.work_date::text
 or (a.approval_snapshot->>'starts_at')::timestamptz is distinct from current_ob.starts_at
 or (a.approval_snapshot->>'ends_at')::timestamptz is distinct from current_ob.ends_at
 or (a.approval_snapshot->>'latitude')::double precision is distinct from current_ob.latitude
 or (a.approval_snapshot->>'longitude')::double precision is distinct from current_ob.longitude
 or (a.approval_snapshot->>'radius_metres')::integer is distinct from current_ob.radius_metres
 or (a.approval_snapshot->>'override_schedule')::boolean is distinct from current_ob.override_schedule) loop
 select x into prior_ob from jsonb_array_elements(obs) x where x->>'employeeId'=h.employee_id::text and (x->>'date')::date=h.work_date;
 select coalesce(jsonb_agg(x),'[]') into obs from jsonb_array_elements(obs) x where not(x->>'employeeId'=h.employee_id::text and (x->>'date')::date=h.work_date);
 obs:=obs||jsonb_build_array(coalesce(prior_ob,'{}')||jsonb_build_object('id',h.ob_id,'reference',h.reference,'employeeId',h.employee_id,'date',h.work_date,'status','For Review','changedAfterPunch',true));
 end loop;
 return src||jsonb_build_object('officialBusiness',obs,'originalShiftsBeforeOb',src->'shifts','shifts',shifts,'scheduleDays',days);
end $$;
