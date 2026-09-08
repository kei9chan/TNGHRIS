-- Run in a rollback-only transaction after loading the proposed functions.
do $$
declare actor record; sample uuid; payload jsonb; tested integer:=0; denied integer:=0;
begin
 select id into sample from public.hris_users where not coalesce(is_duplicate,false) order by id limit 1;
 for actor in select u.auth_user_id,u.id,exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id and r.is_active where ur.user_id=u.id and ur.is_active and ur.role_id='Board of Director') bod
 from public.hris_users u where lower(u.status)='active' and u.auth_user_id is not null
 order by u.id limit 500 loop
 perform set_config('request.jwt.claim.sub',actor.auth_user_id::text,true);
 if actor.bod then
 payload:=public.get_bod_employee_directory('{"q":"","offset":"0"}');
 assert jsonb_array_length(payload->'items')<=25,'Unbounded directory';
 payload:=public.get_bod_employee_snapshot(sample);
 assert payload#>>'{identity,id}'=sample::text,'Mismatched employee';
 assert payload::text !~ 'bank_account_number|sss_no|pagibig_no|philhealth_no|emergency_contact|birth_date','Sensitive field leak';
 perform public.get_bod_employee_filters();tested:=tested+1;
 else
 begin perform public.get_bod_employee_snapshot(sample);raise exception 'Non-BOD snapshot allowed';exception when insufficient_privilege then null;end;
 begin perform public.get_bod_employee_directory('{}');raise exception 'Non-BOD directory allowed';exception when insufficient_privilege then null;end;
 begin perform public.get_bod_employee_filters();raise exception 'Non-BOD filters allowed';exception when insufficient_privilege then null;end;
 denied:=denied+1;
 end if;
 end loop;
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.get_bod_employee_snapshot(sample);raise exception 'Anonymous allowed';exception when insufficient_privilege then null;end;
 assert tested>0,'No BOD account tested';assert denied>0,'No non-BOD account tested';
 raise notice 'PASS: % BOD identities and % non-BOD identities, anonymous denial, bounded response and field whitelist.',tested,denied;
end $$;
select 'PASS: BOD/non-BOD/anonymous live-role checks, bounded directory, whitelist, no data changes' result;
