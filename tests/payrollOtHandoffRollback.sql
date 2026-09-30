-- Controlled verification against existing records. Caller MUST wrap BEGIN/ROLLBACK.
-- No test approvals or notifications are retained.
create temporary table ot_handoff_checks(check_name text primary key,passed boolean);
do $$
declare ids uuid[]:=array['dad87efe-2874-4628-be84-4ed6efe78fa7','97c22a36-5041-4bc5-a6b2-d1d10214b634','46bbdecd-cd92-4ae6-ac12-0c79b7222b97','78547dfd-37b5-476f-805c-9a7647d7e707']::uuid[];versions jsonb;first_result jsonb;again jsonb;w jsonb;v jsonb;operation uuid:=gen_random_uuid();blocked boolean;
begin
 perform set_config('request.jwt.claim.sub','d9bbcf62-1688-47c6-84d5-93343d1ef2e8',true);
 select jsonb_object_agg(id::text,to_jsonb(r)->>'updated_at') into versions from public.ot_requests r where id=any(ids);
 -- A stale row prevents the entire selected batch from being sent.
 blocked:=false;
 begin perform public.send_payroll_ot_to_manager(ids,versions||jsonb_build_object(ids[4]::text,'stale'),gen_random_uuid(),null);exception when others then blocked:=sqlerrm like '%changed%';end;
 if not blocked or exists(select 1 from private.payroll_ot_handoffs where request_id=any(ids)) then raise exception 'Atomic stale check failed';end if;
 insert into ot_handoff_checks values('Stale selection sends nothing',true);
 first_result:=public.send_payroll_ot_to_manager(ids,versions,operation,null);
 again:=public.send_payroll_ot_to_manager(ids,versions,operation,null);
 if first_result<>again or (select count(*) from private.payroll_ot_handoffs where request_id=any(ids))<>4 then raise exception 'Idempotence failed';end if;
 insert into ot_handoff_checks values('Idempotent batch handoff',true);
 if exists(select 1 from public.ot_requests where id=any(ids) and (status::text<>'Submitted' or direct_manager_id<>'5dd06984-421e-4593-95aa-91d404869913')) then raise exception 'Wrong manager route';end if;
 insert into ot_handoff_checks values('All selected requests appear in BUM stage',true);
 -- Employee cannot approve their own request.
 perform set_config('request.jwt.claim.sub','61006ec8-729e-44cf-ba43-93e7179d40ec',true);
 if exists(select 1 from public.ot_requests r where id=any(ids) and (private.ot_can_decide(r) or private.can_send_payroll_ot(r))) then raise exception 'Employee acquired manager authority';end if;
 insert into ot_handoff_checks values('Self-approval prevented',true);
 perform set_config('request.jwt.claim.sub','c826510d-25d8-42be-b640-c941e0f90bec',true);
 w:=public.get_ot_week_review(ids)->0;
 select jsonb_object_agg(r.id::text,private.ot_requested_minutes(r)) into v from public.ot_requests r where id=any(ids);
 -- One changed amount is reviewed, not the full original requested amount.
 v:=v||jsonb_build_object(ids[1]::text,60);
 first_result:=public.decide_ot_week(ids,v,w->>'version',gen_random_uuid(),'approve',null);
 if exists(select 1 from public.ot_requests where id=any(ids) and status::text<>'PendingBOD') then raise exception 'Above-limit OT was not escalated: %',first_result;end if;
 if (select manager_confirmed_minutes from public.ot_requests where id=ids[1])<>60 then raise exception 'Modified manager hours not saved';end if;
 insert into ot_handoff_checks values('Modified manager hours and blank approval note accepted',true),('Above-limit batch escalated to BOD',true);
end $$;
select * from ot_handoff_checks order by check_name;
