-- Caller wraps this script and migration in BEGIN/ROLLBACK. All notifications rolled back.
create temporary table ot_return_checks(check_name text primary key,passed boolean);
do $$declare target_id uuid:='dad87efe-2874-4628-be84-4ed6efe78fa7';versions jsonb;w jsonb;blocked boolean;begin
 perform set_config('request.jwt.claim.sub','d9bbcf62-1688-47c6-84d5-93343d1ef2e8',true);
 select jsonb_build_object(r.id::text,to_jsonb(r)->>'updated_at') into versions from public.ot_requests r where r.id=target_id;
 perform public.send_payroll_ot_to_manager(array[target_id],versions,gen_random_uuid(),null);
 perform set_config('request.jwt.claim.sub','c826510d-25d8-42be-b640-c941e0f90bec',true);
 w:=public.get_ot_week_review(array[target_id])->0;
 blocked:=false;begin perform public.decide_ot_week(array[target_id],'{}',w->>'version',gen_random_uuid(),'return',null);exception when others then blocked:=sqlerrm like '%reason%';end;
 if not blocked then raise exception 'Return without reason accepted';end if;
 perform public.decide_ot_week(array[target_id],'{}',w->>'version',gen_random_uuid(),'return','Confirm which closing task required the extra hour.');
 if not exists(select 1 from private.payroll_ot_handoffs where request_id=target_id and state='Returned' and return_note like 'Confirm%') then raise exception 'Return not captured';end if;
 if not exists(select 1 from public.notifications where user_id='ac4266f6-6fba-4c83-bbbe-022d73ebd71f' and related_entity_id=target_id::text and title='Payroll OT returned for details') then raise exception 'Sender was not notified';end if;
 insert into ot_return_checks values('Specific return reason and sender notification',true);
 perform set_config('request.jwt.claim.sub','d9bbcf62-1688-47c6-84d5-93343d1ef2e8',true);
 select jsonb_build_object(r.id::text,to_jsonb(r)->>'updated_at') into versions from public.ot_requests r where r.id=target_id;
 perform public.send_payroll_ot_to_manager(array[target_id],versions,gen_random_uuid(),'Closing coverage confirmed with the shift supervisor.');
 if not exists(select 1 from public.ot_requests r join private.payroll_ot_handoffs h on h.request_id=r.id where r.id=target_id and r.status::text='Submitted' and h.note like 'Closing coverage%') then raise exception 'Resubmit lost details';end if;
 insert into ot_return_checks values('Reply and resubmit retains requested evidence',true);
 perform set_config('request.jwt.claim.sub','c826510d-25d8-42be-b640-c941e0f90bec',true);
 w:=public.get_ot_week_review(array[target_id])->0;
 perform public.decide_ot_week(array[target_id],'{}',w->>'version',gen_random_uuid(),'reject','Duplicate request confirmed by manager.');
 if not exists(select 1 from public.ot_requests r where r.id=target_id and r.status::text='Rejected') then raise exception 'Reject failed';end if;
 insert into ot_return_checks values('Manager can reject with reason',true);
end $$;
select * from ot_return_checks order by check_name;
