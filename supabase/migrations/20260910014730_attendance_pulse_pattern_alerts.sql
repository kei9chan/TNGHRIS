set local lock_timeout='5s';
create function attendance_pulse.patterns(p_actor uuid,p_date date) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (
 select coalesce(r.audience_snapshot->>'businessUnitId',h.business_unit_id::text) as "businessUnitId",coalesce(r.audience_snapshot->>'businessUnit',h.business_unit,'Unassigned') as "businessUnit",coalesce(r.audience_snapshot->>'department',h.department,'Unassigned') as department,s->>'start' as "shiftStart",s->>'end' as "shiftEnd",count(distinct r.work_date) as days,count(distinct (r.employee_id,r.work_date)) as reports
 from attendance_issues.requests r join public.hris_users h on h.id=r.employee_id cross join lateral jsonb_array_elements(r.schedule->'entries') s
 where r.work_date between p_date-28 and p_date and r.kind='absence' and r.status not in('withdrawn','cancelled') and s->>'kind'='work' and attendance_pulse.visible(p_actor,r.employee_id,coalesce((r.audience_snapshot->>'businessUnitId')::uuid,h.business_unit_id),attendance_pulse.profile(p_actor))
 group by 1,2,3,4,5 having count(distinct r.work_date)>=2 and count(distinct (r.employee_id,r.work_date))>=(select attention_count from attendance_pulse.settings) order by count(distinct (r.employee_id,r.work_date)) desc limit 5) x
$$;
create or replace function public.get_attendance_pulse_patterns(p_date date) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if private.payroll_actor_id() is null or not attendance_pulse.can_enter(public.current_hris_user_id()) then raise exception 'Staffing scope required' using errcode='42501';end if;
 if p_date is null or p_date<(now() at time zone 'Asia/Manila')::date-366 or p_date>(now() at time zone 'Asia/Manila')::date+31 then raise exception 'Invalid date';end if;
 return attendance_pulse.patterns(public.current_hris_user_id(),p_date);end $$;
alter function attendance_pulse.read(uuid,date) rename to read_before_patterns;
create function attendance_pulse.read(p_actor uuid,p_date date) returns jsonb language plpgsql stable security definer set search_path='' as $$declare d jsonb;patterns jsonb;alerts jsonb;begin
 d:=attendance_pulse.read_before_patterns(p_actor,p_date);if not coalesce((d->>'allowed')::boolean,false) then return d;end if;
 patterns:=attendance_pulse.patterns(p_actor,p_date);
 select coalesce(jsonb_agg(jsonb_build_object('code','repeated_shift','businessUnitId',x->>'businessUnitId','severity','attention','text',x->>'businessUnit'||': repeated '||(x->>'shiftStart')||' shift reports across '||(x->>'days')||' dates')),'[]') into alerts from jsonb_array_elements(patterns) x;
 return d||jsonb_build_object('patterns',patterns,'concerns',(d->'concerns')||alerts,'severity',case when jsonb_array_length(alerts)>0 and d->>'severity'='normal' then 'attention' else d->>'severity' end);
end $$;
revoke all on all functions in schema attendance_pulse from public,anon,authenticated;
