-- Essential production checks. All fixtures and actions are rolled back.
-- Existing identities and permissions are discovered; no users or roles are seeded.
begin;
set local lock_timeout='2s';set local statement_timeout='30s';
do $test$
declare emp uuid;actor uuid;admin_emp uuid;admin_auth uuid;other uuid;bu uuid;d date:=(statement_timestamp() at time zone 'Asia/Manila')::date;wk date;pub uuid;req uuid:=gen_random_uuid();ctx jsonb;again jsonb;sch jsonb;bad boolean;ex uuid;root uuid;src jsonb;result jsonb;scope uuid;
begin
 select h.id,h.auth_user_id,h.business_unit_id into strict emp,actor,bu from public.hris_users h
 where h.auth_user_id is not null and h.business_unit_id is not null and lower(h.status)='active' and not coalesce(h.is_duplicate,false)
 and exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id join public.role_permissions rp on rp.role_id=r.id where ur.user_id=h.id and ur.is_active and r.is_active and rp.resource_id='ClockInOut' and 'create'=any(rp.permissions))
 and not exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=h.id and ur.is_active and r.dashboard_type in('admin','hr','executive'))
 and not exists(select 1 from public.payroll_schedule_publications p where p.employee_id=h.id) limit 1;
 select h.id,h.auth_user_id into strict admin_emp,admin_auth from public.hris_users h join public.user_roles ur on ur.user_id=h.id join public.roles r on r.id=ur.role_id where h.auth_user_id is not null and lower(h.status)='active' and ur.is_active and r.is_active and r.dashboard_type='admin' limit 1;
 other:=admin_emp;wk:=date_trunc('week',d)::date;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 set local role authenticated;
 ctx:=public.get_my_attendance();
 if ctx->>'requiresClock'<>'true' or ctx->>'state'<>'not_started' then raise exception 'Default attendance requirement failed';end if;
 bad:=false;begin perform public.record_my_attendance('CLOCK_IN',req,0,d);exception when raise_exception then bad:=true;end;if not bad then raise exception 'Missing published schedule allowed';end if;
 bad:=false;begin perform public.get_hr_attendance_day(other,d);exception when insufficient_privilege then bad:=true;end;if not bad then raise exception 'Other attendance exposed';end if;
 bad:=false;begin perform public.save_attendance_exception(other,null,0,'Unauthorized exemption',false,d,null,'Not allowed');exception when insufficient_privilege then bad:=true;end;if not bad then raise exception 'Unauthorized exception modification allowed';end if;
 bad:=false;begin insert into public.time_events(employee_id,type,source) values(emp,'ClockIn','System');exception when insufficient_privilege then bad:=true;end;if not bad then raise exception 'Raw attendance overwrite path open';end if;
 reset role;
 sch:=jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'employeeId',emp,'date',d,'templateId',gen_random_uuid(),'name','Verification normal shift','start','09:00:00','end','18:00:00','endDayOffset',0,'kind','work','flexible',false,'breakMinutes',60));
 insert into public.payroll_schedule_publications(employee_id,business_unit_id,effective_from,effective_to,version,source_hash,snapshot,approval_required,published_by,reference)
 values(emp,bu,wk,wk+6,1,md5(private.payroll_schedule_draft(emp,wk)::text),sch,false,admin_emp,'Rollback clock verification') returning id into pub;
 set local role authenticated;
 ctx:=public.record_my_attendance('CLOCK_IN',req,0,d);
 if ctx->>'state'<>'working' or jsonb_array_length(ctx->'events')<>1 then raise exception 'Clock in failed';end if;
 again:=public.record_my_attendance('CLOCK_IN',req,0,d);
 if again->>'sessionId'<>ctx->>'sessionId' or again->>'revision'<>'1' then raise exception 'Same request duplicated';end if;
 bad:=false;begin perform public.record_my_attendance('CLOCK_IN',gen_random_uuid(),0,d);exception when serialization_failure then bad:=true;end;if not bad then raise exception 'Second device stale clock-in accepted';end if;
 again:=public.get_my_attendance();if again->'events'<>ctx->'events' then raise exception 'Second device inconsistent';end if;
 ctx:=public.record_my_attendance('START_BREAK',gen_random_uuid(),1,d);
 if ctx->>'state'<>'on_break' then raise exception 'Break start failed';end if;
 bad:=false;begin perform public.record_my_attendance('START_BREAK',gen_random_uuid(),2,d);exception when serialization_failure then bad:=true;end;if not bad then raise exception 'Duplicate break accepted';end if;
 ctx:=public.record_my_attendance('END_BREAK',gen_random_uuid(),2,d);
 ctx:=public.record_my_attendance('CLOCK_OUT',gen_random_uuid(),3,d);
 if ctx->>'state'<>'completed' or jsonb_array_length(ctx->'events')<>4 then raise exception 'Completed day failed';end if;
 bad:=false;begin perform public.record_my_attendance('CLOCK_IN',gen_random_uuid(),4,d);exception when serialization_failure then bad:=true;end;if not bad then raise exception 'Completed day restarted';end if;
 reset role;
 if (select count(*) from public.time_events where employee_id=emp)<>4 then raise exception 'Clock mirror duplicated';end if;
 select id into strict scope from public.payroll_access_scopes where business_unit_id=bu and kind='business_unit';
 src:=private.payroll_time_sources(scope,d,d);
 if (select count(*) from jsonb_array_elements(src->'events') x where x->>'employeeId'=emp::text)<>4 then raise exception 'Payroll clock source duplicate';end if;
 if exists(select 1 from jsonb_array_elements(src->'events') x where x->>'employeeId'=emp::text and x->>'type' not in('CLOCK_IN','START_BREAK','END_BREAK','CLOCK_OUT')) then raise exception 'Unsupported payroll event types';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_auth,'role','authenticated')::text,true);
 set local role authenticated;
 perform public.get_attendance_exception_admin();
 ex:=public.save_attendance_exception(emp,null,0,'Schedule-based attendance',false,d,null,'Rollback approved exemption');
 reset role;select record_id into root from public.attendance_clock_exemptions where id=ex;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 set local role authenticated;
 ctx:=public.get_my_attendance();if ctx->>'requiresClock'<>'false' then raise exception 'Exemption not recognized';end if;
 bad:=false;begin perform public.record_my_attendance('CLOCK_IN',gen_random_uuid(),4,d);exception when raise_exception then bad:=true;end;if not bad then raise exception 'Exempt clock allowed';end if;
 reset role;
 -- Isolate schedule-based HR interpretation from this test's recorded punches.
 src:=private.payroll_time_sources(scope,d,d);src:=jsonb_set(src,'{events}','[]');
 result:=private.interpret_payroll_time(src,d,d);
 if not exists(select 1 from jsonb_array_elements(result->'rows') x where x->>'employeeId'=emp::text and x->>'requiresClock'='false' and (x->>'regularMinutes')::numeric=480 and (x->>'actualMinutes')::numeric=0) then raise exception 'Exempt published attendance not available to HR';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_auth,'role','authenticated')::text,true);
 set local role authenticated;
 perform public.save_attendance_exception(emp,root,1,'Schedule-based attendance',false,d,d,'Rollback expiry version');
 ctx:=public.get_hr_attendance_day(emp,d);if jsonb_array_length(ctx->'originalEvents')<>4 then raise exception 'Original audit missing';end if;
 ctx:=public.correct_attendance_day(emp,d,4,jsonb_build_array(jsonb_build_object('type','CLOCK_IN','timestamp',(d::timestamp at time zone 'Asia/Manila')),jsonb_build_object('type','CLOCK_OUT','timestamp',((d::timestamp+interval '1 minute') at time zone 'Asia/Manila'))),'Rollback verified correction');
 ctx:=public.get_hr_attendance_day(emp,d);if jsonb_array_length(ctx->'events')<>2 or jsonb_array_length(ctx->'originalEvents')<>4 or jsonb_array_length(ctx->'audit')<>1 then raise exception 'Correction audit/version failed';end if;
 reset role;
 src:=private.payroll_time_sources(scope,d,d);if (select count(*) from jsonb_array_elements(src->'events') x where x->>'employeeId'=emp::text)<>2 then raise exception 'Payroll did not use correction version';end if;
 if (select count(*) from public.attendance_clock_exemptions where record_id=root)<>2 or private.attendance_exception(emp,d+1) is not null then raise exception 'Exception version/expiry failed';end if;
end $test$;
select 'PASS: normal clock/break cycle, second-device reads, request retry and stale action rejection, duplicate break rejection, completed lock, default required, exemption + payroll review, versioned expiry/audit, no published schedule, unauthorized attendance/exception/direct writes. All fixtures rolled back.' as result;
rollback;
