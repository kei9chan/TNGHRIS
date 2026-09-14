begin;
set local lock_timeout='2s';set local statement_timeout='45s';
do $$
declare actor uuid;authid uuid;bu uuid;emp uuid;preset uuid;other uuid;denied boolean;roster jsonb;saved jsonb;review jsonb;pub jsonb;day integer;wk date:='2099-01-05';
begin
 select id,auth_user_id,business_unit_id into strict actor,authid,bu from public.hris_users where full_name='Mojica, Boj';
 select h.id into strict emp from public.hris_users h where h.reports_to=actor::text and lower(h.status)='active' and h.business_unit_id=bu and not exists(select 1 from public.shift_assignments s where s.employee_id=h.id and s.date between wk and wk+6) limit 1;
 select id into strict other from public.hris_users where reports_to is distinct from actor::text and id<>actor and business_unit_id=bu and lower(status)='active' limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',authid,'role','authenticated')::text,true);
 set local role authenticated;
 roster:=public.get_schedule_builder_data('direct',wk);
 if exists(select 1 from jsonb_array_elements(roster->'people') r where r->>'reports_to' is distinct from actor::text) then raise exception 'Direct roster leaks unrelated employees';end if;
 if jsonb_array_length(roster->'people')<>13 then raise exception 'Boj direct report count mismatch';end if;
 roster:=public.get_schedule_builder_data('business_unit',wk);
 if exists(select 1 from jsonb_array_elements(roster->'people') r where r->>'business_unit_id' is distinct from bu::text) then raise exception 'BU roster leaks another BU';end if;
 insert into public.shift_templates(name,business_unit_id,start_time,end_time,break_minutes,grace_period_minutes,end_day_offset,paid_minutes,schedule_kind,is_flexible) values('Rollback Schedule Builder',bu,'09:00','18:00',60,5,0,480,'work',false) returning id into preset;
 denied:=false;begin perform public.save_schedule_builder_shift('direct',wk,other,wk,preset);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Default scope permitted unrelated save';end if;
 for day in 0..6 loop saved:=public.save_schedule_builder_shift('direct',wk,emp,wk+day,preset);end loop;
 -- Retry after a lost response must not insert another shift.
 perform public.save_schedule_builder_shift('direct',wk,emp,wk,preset);
 if (select count(*) from public.shift_assignments where employee_id=emp and date between wk and wk+6)<>7 then raise exception 'Retry created duplicate schedule';end if;
 roster:=public.get_schedule_builder_data('direct',wk);
 if not exists(select 1 from jsonb_array_elements(roster->'assignments') a where a->>'employee_id'=emp::text and a->>'date'=wk::text) then raise exception 'Saved shift disappeared';end if;
 perform public.get_schedule_builder_data('direct',wk+7);
 roster:=public.get_schedule_builder_data('business_unit',wk);
 if not exists(select 1 from jsonb_array_elements(roster->'assignments') a where a->>'employee_id'=emp::text and a->>'date'=wk::text) then raise exception 'Saved shift disappeared after week/scope change';end if;
 review:=public.review_payroll_schedule_week(array[emp],wk);
 pub:=public.publish_schedule_builder_week('direct',array[emp],wk,'Rollback focused verification',jsonb_build_object(emp::text,review#>>'{0,draftHash}'));
 review:=public.get_payroll_schedule_week(array[emp],wk);
 if not coalesce((review#>>'{0,published}')::boolean,false) then raise exception 'Saved publication not visible';end if;
 reset role;
 -- One ordinary account; no elevated grants, own/other schedule writes stay denied.
 select auth_user_id into strict authid from public.hris_users h where h.role='Employee' and lower(h.status)='active' and h.auth_user_id is not null and h.id<>emp and not exists(select 1 from public.user_roles ur where ur.user_id=h.id and ur.is_active and ur.role_id<>'Employee') and not exists(select 1 from public.hris_users t where t.reports_to=h.id::text) limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',authid,'role','authenticated')::text,true);
 set local role authenticated;
 denied:=false;begin perform public.save_schedule_builder_shift('business_unit',wk,emp,wk,preset);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Unauthorized RPC save permitted';end if;
 denied:=false;begin perform public.publish_schedule_builder_week('business_unit',array[emp],wk,'Unauthorized rollback test','{}');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Unauthorized publish permitted';end if;
 reset role;
end $$;
select 'PASS: Boj direct/BU scope; save, retry, week/filter readback, publication; unauthorized save/publish. All test records rolled back.' result;
rollback;
