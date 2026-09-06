-- Focused rollback verification. No schedules, publications, time packages or
-- permissions remain after this transaction. Uses existing identities; no grants.
begin;
set local lock_timeout='2s';set local statement_timeout='30s';
do $test$
declare actor uuid;employee uuid;bu uuid;scope uuid;day date;wk date;assignment uuid;template uuid;
 draft jsonb;published jsonb;pub uuid;pkg uuid;before_source jsonb;after_source jsonb;added uuid;nextpub uuid;bad boolean;reviewer uuid;
begin
 select id into strict actor from auth.users where lower(email)='kay@thenextperience.com';
 select a.employee_id,a.business_unit_id,a.date,a.id,a.shift_template_id into strict employee,bu,day,assignment,template
 from public.shift_assignments a join public.hris_users h on h.id=a.employee_id join public.shift_templates t on t.id=a.shift_template_id
 where h.business_unit_id=a.business_unit_id and not coalesce(h.is_duplicate,false) and t.schedule_kind='work' and not t.is_flexible and t.break_minutes=60 and t.end_time>t.start_time
 and extract(epoch from(t.end_time-t.start_time))>3600
 and not exists(select 1 from public.shift_assignments x left join public.shift_templates y on y.id=x.shift_template_id where x.employee_id=a.employee_id and x.date between date_trunc('week',a.date)::date and date_trunc('week',a.date)::date+6 and (y.id is null or y.break_minutes<>60 or y.is_flexible or y.end_time<=y.start_time or x.business_unit_id is distinct from a.business_unit_id))
 order by a.date desc limit 1;
 wk:=date_trunc('week',day)::date;
 select id into strict scope from public.payroll_access_scopes where kind='business_unit' and business_unit_id=bu;
 select id into strict reviewer from public.hris_users where auth_user_id is not null and auth_user_id<>actor and id<>employee limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 draft:=private.payroll_schedule_draft(employee,wk);
 set local role authenticated;
 published:=public.get_payroll_schedule_week(array[employee],wk);
 if jsonb_array_length(published)<>1 then raise exception 'Existing scheduler access not retained';end if;
 bad:=false;begin perform public.publish_payroll_schedule_week(array[employee],wk,'Rollback verification','{}');exception when serialization_failure then bad:=true;end;if not bad then raise exception 'Stale review accepted';end if;
 published:=public.publish_payroll_schedule_week(array[employee],wk,'Rollback verification',jsonb_build_object(employee,md5(draft::text)));pub:=(published#>>'{0,id}')::uuid;
 if public.publish_payroll_schedule_week(array[employee],wk,'Rollback retry',jsonb_build_object(employee,md5(draft::text)))#>>'{0,id}'<>pub::text then raise exception 'Publication retry duplicated version';end if;
 reset role;
 before_source:=private.payroll_time_sources(scope,day,day);
 if not exists(select 1 from jsonb_array_elements(before_source->'scheduleDays') x where x->>'employeeId'=employee::text and x->>'status'='published') then raise exception 'Published schedule unavailable';end if;
 -- A draft change before finalization must block payroll.
 insert into public.shift_assignments(employee_id,shift_template_id,date,business_unit_id) values(employee,template,day,bu) returning id into added;
 after_source:=private.payroll_time_sources(scope,day,day);
 if not exists(select 1 from jsonb_array_elements(after_source->'scheduleDays') x where x->>'employeeId'=employee::text and x->>'status'='unpublished') then raise exception 'Changed unpublished draft accepted before freeze';end if;
 delete from public.shift_assignments where id=added;
 -- Exercise the installed submission freeze trigger; no live package is committed.
 insert into public.payroll_time_packages(scope_id,date_from,date_to,version,source_hash,source_snapshot,result,created_by,reason)
 values(scope,day,day,999999,md5(before_source::text),before_source,'{}',actor,'Rollback trigger verification') returning id into pkg;
 update public.payroll_time_packages set status='submitted',submitted_by=actor,submitted_at=now() where id=pkg;
 if not exists(select 1 from public.payroll_schedule_freezes where package_id=pkg and publication_id=pub) then raise exception 'Submission did not freeze publication';end if;
 insert into public.shift_assignments(employee_id,shift_template_id,date,business_unit_id) values(employee,template,day,bu) returning id into added;
 after_source:=private.payroll_time_sources(scope,day,day);
 if after_source is distinct from before_source then raise exception 'Draft edit changed HR-frozen source';end if;
 draft:=private.payroll_schedule_draft(employee,wk);
 set local role authenticated;
 published:=public.publish_payroll_schedule_week(array[employee],wk,'Rollback proposed override',jsonb_build_object(employee,md5(draft::text)));nextpub:=(published#>>'{0,id}')::uuid;
 if published#>>'{0,approval_required}'<>'true' or (published#>>'{0,version}')::int<>2 then raise exception 'Frozen edit did not require a new override version';end if;
 bad:=false;begin perform public.review_payroll_schedule_override(nextpub,true,'Self approval prohibited');exception when insufficient_privilege then bad:=true;end;if not bad then raise exception 'Unassigned/publisher approval allowed';end if;
 reset role;
 if private.payroll_time_sources(scope,day,day) is distinct from before_source then raise exception 'Pending override altered frozen source';end if;
 -- Verify approved-only source selection, separately from the guarded approval RPC.
 insert into public.payroll_schedule_overrides(publication_id,decision,actor_id,reference) values(nextpub,'approve',reviewer,'Rollback source selection fixture');
 after_source:=private.payroll_time_sources(scope,day,day);
 if after_source is not distinct from before_source or not exists(select 1 from jsonb_array_elements(after_source->'schedulePublications') x where x->>'id'=nextpub::text) then raise exception 'Approved override did not invalidate old time source';end if;
 bad:=false;begin update public.payroll_schedule_publications set reference='Changed history' where id=pub;exception when insufficient_privilege then bad:=true;end;if not bad then raise exception 'Published history mutable';end if;
 bad:=false;begin delete from public.payroll_schedule_freezes where package_id=pkg;exception when insufficient_privilege then bad:=true;end;if not bad then raise exception 'Freeze history mutable';end if;
end $test$;
select 'PASS: existing schedule access, stale publication denial, retry idempotency, unpublished draft block, submission freeze trigger, pending override isolation, self/unassigned approval denial, approved-source invalidation and immutable history. Positive assigned HR approval remains an operational check.' as result;
rollback;
