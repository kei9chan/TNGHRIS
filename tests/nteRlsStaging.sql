-- STAGING ONLY. Assert actual authenticated role access, with rollback.
begin;
do $$declare ir uuid;n uuid;actor uuid;begin
 select id into actor from public.hris_users where role='Board of Director' limit 1;
 insert into public.incident_reports(category,description,date_time,involved_employee_ids,involved_employee_names,reported_by,assigned_to_id)
 values('TEST','CONFIDENTIAL',now(),array['a1000000-0000-0000-0000-000000000001'::uuid],array['Test'],actor,actor) returning id into ir;
 insert into public.ntes(incident_report_id,issued_by_user_id,recipients,recipient_names,recipient_employee_id,details,status)
 values(ir,actor,array['a1000000-0000-0000-0000-000000000001'::uuid],array['Test'],'a1000000-0000-0000-0000-000000000001','Test','Draft') returning id into n;
 perform set_config('test.nte',n::text,true);perform set_config('test.ir',ir::text,true);
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-0000-0000-000000000001',true);
do $$declare blocked boolean:=false;begin
 if exists(select 1 from public.ntes where id=current_setting('test.nte')::uuid) then raise exception 'Recipient can read draft through table API';end if;
 if exists(select 1 from public.incident_reports where id=current_setting('test.ir')::uuid) then raise exception 'Recipient can read original IR through table API';end if;
 begin perform public.get_nte_incident_context(current_setting('test.nte')::uuid);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Context RPC leaked draft';end if;
 blocked:=false;begin update public.resolutions set details='tampered';exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Direct resolution writes allowed';end if;
end $$;
reset role;
rollback;
