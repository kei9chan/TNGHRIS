set local lock_timeout='5s';
-- Match the existing active-account predicate for background recipients too.
create or replace function attendance_pulse.profile(p_actor uuid) returns jsonb language sql stable security definer set search_path='' as $$
 with r as(select e.role_id from private.effective_role_ids(p_actor) e join public.roles r on r.id=e.role_id and r.is_active),u as(select * from public.hris_users where id=p_actor and lower(status)='active' and auth_user_id is not null and not coalesce(is_duplicate,false) and exists(select 1 from public.user_roles ur join public.roles rr on rr.id=ur.role_id and rr.is_active where ur.user_id=p_actor and ur.is_active))
 select jsonb_build_object('active',exists(select 1 from u),'hr',exists(select 1 from r where role_id in('HR Staff','HR Manager','Admin')),
 'bod',exists(select 1 from r where role_id='Board of Director'),'global',exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id and r.is_active where ur.user_id=p_actor and ur.is_active and ur.scope_type='GLOBAL'),
 'buManager',exists(select 1 from r where role_id='Business Unit Manager'),'homeBu',(select business_unit_id from u),
 'allowedBuIds',coalesce((select jsonb_agg(distinct bu) from public.user_roles ur join public.roles r on r.id=ur.role_id and r.is_active cross join lateral unnest(ur.allowed_business_unit_ids) bu where ur.user_id=p_actor and ur.is_active),'[]'))
$$;
create function public.get_attendance_pulse_patterns(p_date date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id();p jsonb:=attendance_pulse.profile(actor);begin
 if private.payroll_actor_id() is null or not attendance_pulse.can_enter(actor) then raise exception 'Staffing scope required' using errcode='42501';end if;
 if p_date is null or p_date<(now() at time zone 'Asia/Manila')::date-366 or p_date>(now() at time zone 'Asia/Manila')::date+31 then raise exception 'Invalid date';end if;
 return (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (
 select coalesce(r.audience_snapshot->>'businessUnit',h.business_unit,'Unassigned') as "businessUnit",coalesce(r.audience_snapshot->>'department',h.department,'Unassigned') as department,s->>'start' as "shiftStart",s->>'end' as "shiftEnd",count(distinct r.work_date) as days,count(distinct (r.employee_id,r.work_date)) as reports
 from attendance_issues.requests r join public.hris_users h on h.id=r.employee_id cross join lateral jsonb_array_elements(r.schedule->'entries') s
 where r.work_date between p_date-28 and p_date and r.kind='absence' and r.status not in('withdrawn','cancelled') and s->>'kind'='work' and attendance_pulse.visible(actor,r.employee_id,coalesce((r.audience_snapshot->>'businessUnitId')::uuid,h.business_unit_id),p)
 group by 1,2,3,4 having count(distinct r.work_date)>=2 and count(distinct (r.employee_id,r.work_date))>=3 order by count(distinct (r.employee_id,r.work_date)) desc limit 5) x);
end $$;
revoke all on function public.get_attendance_pulse_patterns(date) from public,anon;
grant execute on function public.get_attendance_pulse_patterns(date) to authenticated;
-- Only role-authorized pulse recipients may receive background summaries.
create function attendance_pulse.delivery_role(p_actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select (p->>'active')::boolean and ((p->>'hr')::boolean or (p->>'bod')::boolean or (p->>'buManager')::boolean) from (select attendance_pulse.profile(p_actor) p) q
$$;
revoke all on function attendance_pulse.delivery_role(uuid) from public,anon,authenticated;
create or replace function attendance_pulse.refresh_alerts() returns void language plpgsql security definer set search_path='' as $$
declare slot timestamptz:=date_bin('15 minutes',now(),'2020-01-01'::timestamptz);inserted integer;d date:=(now() at time zone 'Asia/Manila')::date;h record;p jsonb;data jsonb;finger text;old attendance_pulse.alert_state;cfg attendance_pulse.settings;begin
 insert into attendance_pulse.runs(slot) values(slot) on conflict do nothing;get diagnostics inserted=row_count;if inserted=0 then return;end if;
 select * into cfg from attendance_pulse.settings;
 for h in select distinct u.id from public.hris_users u join lateral private.effective_role_ids(u.id) e on true join public.roles r on r.id=e.role_id and r.is_active where lower(u.status)='active' and u.auth_user_id is not null and r.id in('HR Staff','HR Manager','Admin','Business Unit Manager','Board of Director') loop
 p:=attendance_pulse.profile(h.id);data:=attendance_pulse.read(h.id,d);
 if not coalesce((data->>'allowed')::boolean,false) then continue;end if;
 -- Board receives summaries only for company-wide/critical concerns, not each request.
 if (p->>'bod')::boolean and not (p->>'hr')::boolean and not (data->>'severity'='critical' or ((p->>'global')::boolean and (data->>'reported')::integer>=cfg.company_count)) then
 update attendance_pulse.alert_state set fingerprint='normal' where recipient=h.id and work_date=d;
 continue;end if;
 if extract(hour from now() at time zone 'Asia/Manila')>=cfg.summary_hour then perform attendance_pulse.queue(h.id,d,'Daily attendance pulse',h.id||':'||d||':daily',data);end if;
 select coalesce(string_agg(concat(x->>'businessUnitId',':',x->>'code',':',x->>'severity'),'|' order by x->>'businessUnitId',x->>'code'),'normal') into finger from jsonb_array_elements(data->'concerns') x;
 insert into attendance_pulse.alert_state(recipient,work_date) values(h.id,d) on conflict do nothing;
 select * into old from attendance_pulse.alert_state where recipient=h.id and work_date=d for update;
 if finger is distinct from old.fingerprint then
 update attendance_pulse.alert_state set fingerprint=finger,transitions=transitions+case when data->>'severity'<>'normal' then 1 else 0 end where recipient=h.id and work_date=d;
 insert into attendance_pulse.audit(action,work_date,previous,new_value) values('staffing condition changed',d,jsonb_build_object('fingerprint',old.fingerprint),jsonb_build_object('recipient',h.id,'fingerprint',finger,'severity',data->>'severity'));
 if data->>'severity'<>'normal' and old.transitions<3 then perform attendance_pulse.queue(h.id,d,case when data->>'severity'='critical' then 'Critical staffing concern' else 'Attendance needs attention' end,h.id||':'||d||':condition:'||old.transitions,data);end if;
 end if;
 end loop;
end $$;

create or replace function public.claim_attendance_pulse_email() returns jsonb language plpgsql security definer set search_path='' as $$
declare d attendance_pulse.deliveries;token uuid:=gen_random_uuid();data jsonb;email text;begin
 select * into d from attendance_pulse.deliveries where status in('queued','retry','sending') and next_attempt<=now() and (lease_until is null or lease_until<now()) and attempts<6 order by created_at for update skip locked limit 1;
 if d.id is null then return null;end if;
 if not attendance_pulse.delivery_role(d.recipient) then update attendance_pulse.deliveries set status='skipped',error='Recipient no longer has staffing access' where id=d.id;insert into attendance_pulse.audit(action,work_date,new_value) values('email skipped',d.work_date,jsonb_build_object('delivery',d.id));return '{"skipped":true}';end if;
 -- Refresh scope at dispatch; queued data cannot outlive a permission change.
 data:=attendance_pulse.read(d.recipient,d.work_date)-'rows';select h.email into email from public.hris_users h where h.id=d.recipient;
 update attendance_pulse.deliveries set status='sending',attempts=attempts+1,lease_token=token,lease_until=now()+interval '5 minutes',payload=data where id=d.id;
 insert into attendance_pulse.audit(action,work_date,previous,new_value) values('email delivery claimed',d.work_date,jsonb_build_object('status',d.status),jsonb_build_object('delivery',d.id,'attempt',d.attempts+1));
 return jsonb_build_object('id',d.id,'token',token,'payload',data||jsonb_build_object('email',email,'event',d.event));end $$;
