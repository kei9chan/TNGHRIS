begin;
set local statement_timeout='30s';
set local lock_timeout='2s';
do $$
declare m uuid; a uuid; e uuid; hr uuid; s jsonb; denied boolean; old_count integer;
begin
 select h.id,h.auth_user_id,t.id into strict m,a,e from public.hris_users h join public.hris_users t on t.reports_to=h.id::text
 where lower(h.status::text)='active' and lower(t.status::text)='active' and h.auth_user_id is not null
 and not exists(select 1 from public.user_roles where user_id=h.id and is_active and role_id in('HR Staff','HR Manager','Admin')) limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 s:=public.get_schedule_compliance('2099-01-05',null);
 if s->>'managerId'<>m::text or (s->>'required')::int<1 then raise exception 'Direct-report task incorrect';end if;
 if (s->>'deadline')::timestamptz<>'2099-01-03 23:59+08'::timestamptz then raise exception 'Manila deadline incorrect';end if;
 denied:=false;begin perform public.get_schedule_compliance_report(null);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Manager accessed HR report';end if;
 denied:=false;begin perform public.save_schedule_exemption(e,'2099-01-05',null,true,'Unauthorized test');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Manager granted exemption';end if;
 denied:=false;begin perform public.get_schedule_compliance('2099-01-05',e);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Another manager task exposed';end if;
 if has_function_privilege('authenticated','public.queue_schedule_compliance_reminders()','EXECUTE') or has_function_privilege('anon','public.get_schedule_compliance(date,uuid)','EXECUTE') then raise exception 'Worker or anonymous privilege leak';end if;
 select h.auth_user_id,h.id into strict a,hr from public.hris_users h join public.user_roles ur on ur.user_id=h.id where ur.role_id='HR Manager' and ur.is_active and h.auth_user_id is not null limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 old_count:=(s->>'required')::int;
 perform public.save_schedule_exemption(e,'2099-01-05','2099-01-11',true,'Rollback-only exemption test');
 s:=public.get_schedule_compliance('2099-01-05',m);
 if (s->>'required')::int<>old_count-1 or (s->>'exempt')::int<1 then raise exception 'Exemption not excluded';end if;
 perform public.save_schedule_exemption(e,'2099-01-05','2099-01-11',false,'Rollback-only removal test');
 s:=public.get_schedule_compliance('2099-01-05',m);
 if (s->>'required')::int<>old_count then raise exception 'Exemption removal failed';end if;
 perform public.set_schedule_day_status(e,'2099-01-05','rest','Rollback-only rest day');
 s:=public.get_schedule_compliance('2099-01-05',m);
 if not exists(select 1 from jsonb_array_elements(s->'employees') p cross join lateral jsonb_array_elements(p->'days') d where p->>'id'=e::text and d->>'date'='2099-01-05' and d->>'status'='Rest Day') then raise exception 'Saved rest day missing';end if;
 if (select p->>'complete' from jsonb_array_elements(s->'employees') p where p->>'id'=e::text)='true' then raise exception 'Partial week counted complete';end if;
 for old_count in 1..6 loop perform public.set_schedule_day_status(e,'2099-01-05'::date+old_count,'rest','Rollback-only complete week');end loop;
 s:=public.get_schedule_compliance('2099-01-05',m);
 if (select p->>'complete' from jsonb_array_elements(s->'employees') p where p->>'id'=e::text)<>'true' then raise exception 'Saved complete week not counted';end if;
 denied:=false;begin update schedule_compliance.exemptions set reason='tampered' where employee_id=e;exception when others then denied:=true;end;
 if not denied then raise exception 'Exemption history mutable';end if;
end $$;
select 'PASS: reporting identity, Manila deadline, HR-only controls, own-task isolation, service-only worker, exemptions/removal, saved rest days, partial/full week completion, immutable history. All test writes rolled back.' as result;
rollback;
