-- Transaction-only checks: fixtures, notifications and audits never commit.
begin;
set local statement_timeout='60s';
set local lock_timeout='5s';
do $$
declare e record;hr record;bod record;mgr record;bu record;outsider record;r uuid;ids uuid[]:='{}';people uuid[]:='{}';d jsonb;before_n integer;after_n integer;day0 date:=(now() at time zone 'Asia/Manila')::date-30;key uuid;cfg jsonb;windows jsonb;counted integer;n integer:=0;bu_id uuid;begin
 for e in select h.id,h.auth_user_id from public.hris_users h where lower(h.status)='active' and h.auth_user_id is not null and not coalesce(h.is_duplicate,false) loop
 perform set_config('request.jwt.claims',jsonb_build_object('sub',e.auth_user_id,'role','authenticated')::text,true);
 if private.payroll_actor_id() is null then continue;end if;
 if attendance_pulse.hr() then hr:=e;end if;
 if public.has_active_role('Board of Director') and public.current_data_scope()->>'type'='GLOBAL' then bod:=e;end if;
 if public.has_active_role('Business Unit Manager') then bu:=e;end if;
 if not attendance_pulse.can_enter(e.id) then outsider:=e;end if;
 end loop;
 if hr.id is null or bod.id is null or bu.id is null or outsider.id is null then raise exception 'Required role fixtures unavailable';end if;
 -- Empty date chosen independently of any production attendance rows.
 while exists(select 1 from attendance_issues.requests where work_date=day0) loop day0:=day0-1;end loop;
 for e in select h.id,h.auth_user_id,private.punch_direct_manager(h.id) manager from public.hris_users h where lower(h.status)='active' and h.auth_user_id is not null and not coalesce(h.is_duplicate,false) and private.punch_direct_manager(h.id) is not null order by h.id loop
 perform set_config('request.jwt.claims',jsonb_build_object('sub',e.auth_user_id,'role','authenticated')::text,true);
 if private.payroll_actor_id() is null then continue;end if;
 r:=public.submit_attendance_issue(jsonb_build_object('kind','absence','date',day0,'category','Sickness','explanation','PRIVATE MEDICAL FIXTURE MUST NOT APPEAR IN PULSE','confirmed',true),gen_random_uuid());
 ids:=array_append(ids,r);people:=array_append(people,e.id);n:=n+1;exit when n=8;
 end loop;
 if n<>8 then raise exception 'Eight eligible fixtures needed';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',bod.auth_user_id,'role','authenticated')::text,true);
 d:=public.get_attendance_pulse(day0);
 if (d->>'reported')::integer<>8 or (d->>'approved')::integer<>0 or (d->>'pending')::integer<>8 then raise exception 'Eight reports must count as eight pending, not approved: %',d-'rows';end if;
 if d::text like '%PRIVATE MEDICAL%' or exists(select 1 from jsonb_array_elements(d->'rows') x where x ? 'explanation' or x ? 'attachment' or x ? 'category') then raise exception 'Sensitive information exposed in pulse';end if;
 -- Rejection is not approval; withdrawn and cancelled are excluded from the primary count.
 update attendance_issues.requests set status=case id when ids[1] then 'approved' when ids[2] then 'rejected' when ids[3] then 'withdrawn' when ids[4] then 'cancelled' else status end where id=any(ids);
 d:=public.get_attendance_pulse(day0);
 if (d->>'reported')::integer<>6 or (d->>'approved')::integer<>1 or (d->>'pending')::integer<>4 then raise exception 'Status counts incorrect';end if;
 -- Cross-BU direct report keeps reporting-line visibility, without unrelated BU access.
 select h.id,h.auth_user_id into mgr from public.hris_users h where h.id=private.punch_direct_manager(people[5]);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',mgr.auth_user_id,'role','authenticated')::text,true);
 if private.payroll_actor_id() is null then raise exception 'Manager inactive fixture';end if;
 d:=public.get_attendance_pulse(day0);
 if not exists(select 1 from jsonb_array_elements(d->'rows') x where x->>'id'=ids[5]::text) then raise exception 'Direct report hidden';end if;
 if not (attendance_pulse.profile(mgr.id)->>'hr')::boolean and not (attendance_pulse.profile(mgr.id)->>'bod')::boolean and not (attendance_pulse.profile(mgr.id)->>'buManager')::boolean and exists(select 1 from jsonb_array_elements(d->'rows') x where private.punch_direct_manager((x->>'employeeId')::uuid)<>mgr.id) then raise exception 'Unrelated employee exposed to ordinary manager';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',bu.auth_user_id,'role','authenticated')::text,true);
 d:=public.get_attendance_pulse(day0);
 if exists(select 1 from jsonb_array_elements(d->'rows') x where not attendance_pulse.visible(bu.id,(x->>'employeeId')::uuid,(x->>'businessUnitId')::uuid,attendance_pulse.profile(bu.id))) then raise exception 'BU scope mismatch';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider.auth_user_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 if (public.get_attendance_pulse(day0)->>'allowed')::boolean then raise exception 'Ordinary employee pulse access';end if;
 begin perform * from attendance_pulse.audit;raise exception 'PRIVATE_TABLE_BYPASS';exception when insufficient_privilege then null;end;
 begin perform public.log_gc_attendance_report(people[1],day0-1,'Unauthorized fixture',gen_random_uuid());raise exception 'GC_LOG_BYPASS';exception when insufficient_privilege then null;end;
 execute 'reset role';
 for e in select h.id,h.auth_user_id from public.hris_users h where lower(h.status)='active' and h.auth_user_id is not null and not coalesce(h.is_duplicate,false) loop
 perform set_config('request.jwt.claims',jsonb_build_object('sub',e.auth_user_id,'role','authenticated')::text,true);
 if attendance_pulse.hr() and public.can_access_hris_user(people[1]) then hr:=e;exit;end if;end loop;
 -- HR GC logging uses real actor and unchanged approval process. A retry preserves the same ID.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',hr.auth_user_id,'role','authenticated')::text,true);
 key:=gen_random_uuid();r:=public.log_gc_attendance_report(people[1],day0-1,'Employee reported in designated GC. Rollback only.',key);
 if public.log_gc_attendance_report(people[1],day0-1,'Employee reported in designated GC. Rollback only.',key)<>r then raise exception 'GC retry created duplicate';end if;
 if not exists(select 1 from attendance_issues.requests where id=r and report_source='GC Reported' and submitted_by=hr.id and status in('pending','hr_review') and not confirmed and manager_id=private.punch_direct_manager(employee_id)) then raise exception 'GC source, actor, or approval routing incorrect';end if;
 begin perform public.log_gc_attendance_report(people[1],day0-1,'Duplicate GC report',gen_random_uuid());raise exception 'DUPLICATE_GC_ALLOWED';exception when others then if sqlerrm='DUPLICATE_GC_ALLOWED' then raise;end if;end;
 if (public.get_attendance_pulse(day0-1)->>'reported')::integer<>1 then raise exception 'GC report not counted';end if;
 -- Synthetic shift fixtures test exact overlap and configured opening risk without touching schedules.
 select business_unit_id into bu_id from public.hris_users where id=people[5];
 update attendance_issues.requests set schedule=jsonb_build_object('published',true,'entries',jsonb_build_array(jsonb_build_object('kind','work','start','09:00','end','18:00'))) where id=any(ids);
 -- Scope snapshots are immutable, so use whatever BU already has >=2 fixtures.
 select (audience_snapshot->>'businessUnitId')::uuid into bu_id from attendance_issues.requests where id=any(ids) and status not in('withdrawn','cancelled') group by audience_snapshot->>'businessUnitId' having count(*)>=2 limit 1;
 if bu_id is not null then
 insert into attendance_pulse.windows(business_unit_id,start_time,end_time,label,minimum_reports) values(bu_id,'09:00','11:00','Test opening',2);
 d:=public.get_attendance_pulse(day0);
 if d->>'severity'<>'critical' or not exists(select 1 from jsonb_array_elements(d->'concerns') x where x->>'code'='critical_window') then raise exception 'Configured critical opening not detected';end if;
 end if;
 cfg:=public.get_attendance_pulse_settings();
 perform public.save_attendance_pulse_settings(cfg->'settings',cfg->'windows','Rollback settings verification');
 if not exists(select 1 from attendance_pulse.audit where actor=hr.id and action='settings changed') then raise exception 'Settings audit missing';end if;
 -- Alert queue and follow-up idempotency.
 select count(*) into before_n from attendance_pulse.deliveries;
 perform attendance_pulse.queue(hr.id,day0,'Rollback summary','rollback-pulse-queue',d);
 perform attendance_pulse.queue(hr.id,day0,'Rollback summary','rollback-pulse-queue',d);
 select count(*) into after_n from attendance_pulse.deliveries;
 if after_n<>before_n+1 then raise exception 'Duplicate alert queued';end if;
 perform public.attendance_pulse_followup(ids[5],'manager');
 select count(*) into before_n from attendance_issues.deliveries where request_id=ids[5];
 perform public.attendance_pulse_followup(ids[5],'manager');
 if (select count(*) from attendance_issues.deliveries where request_id=ids[5])<>before_n then raise exception 'Duplicate followup queued';end if;
 begin update attendance_issues.requests set report_source='HRIS' where id=r;raise exception 'SOURCE_OVERWRITE_ALLOWED';exception when insufficient_privilege then null;end;
 begin delete from attendance_pulse.audit;raise exception 'AUDIT_DELETE_ALLOWED';exception when others then if sqlerrm='AUDIT_DELETE_ALLOWED' then raise;end if;end;
end $$;
select 'PASS: counts, statuses, role scope, private summaries, GC routing/idempotency, opening risk, settings, immutable source/audit, deduplicated alerts' result;
rollback;
