begin;
select set_config('test.pan_id',(select id::text from public.pans p where status='Pending Approval' and not exists(select 1 from jsonb_array_elements(routing_steps) s where not private.pan_user_is_bod(s->>'userId') and s->>'status'<>'Approved') limit 1),true);
select set_config('test.bod_one',(select auth_user_id::text from public.hris_users where private.pan_user_is_bod(id::text) order by id limit 1),true);
select set_config('test.bod_two',(select auth_user_id::text from public.hris_users where private.pan_user_is_bod(id::text) order by id offset 1 limit 1),true);
set local role authenticated;
do $$declare target uuid:=current_setting('test.pan_id')::uuid;result public.pans;begin
 perform set_config('request.jwt.claim.sub',current_setting('test.bod_one'),true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.bod_one'),'role','authenticated')::text,true);
 if not exists(select 1 from public.get_my_actionable_approval_tasks() where request_type='pan' and request_id=target) then raise exception 'First BOD queue missing PAN';end if;
 if not exists(select 1 from public.pans where id=target) then raise exception 'First BOD RLS blocks PAN';end if;
 result:=public.approve_pan(target,'Rollback test first BOD');
 if result.status::text<>'Pending Approval' then raise exception 'PAN finalized before second BOD';end if;
 if exists(select 1 from public.get_my_actionable_approval_tasks() where request_type='pan' and request_id=target) then raise exception 'Already approved PAN remains actionable for first BOD';end if;
 begin
 perform public.approve_pan(target,'Duplicate attempt');
 raise exception 'Duplicate approval allowed';
 exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',current_setting('test.bod_two'),true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.bod_two'),'role','authenticated')::text,true);
 if not exists(select 1 from public.get_my_actionable_approval_tasks() where request_type='pan' and request_id=target) then raise exception 'PAN disappeared from second BOD';end if;
 if not exists(select 1 from public.pans where id=target) then raise exception 'Second BOD RLS blocks PAN';end if;
 result:=public.approve_pan(target,'Rollback test second BOD');
 if result.status::text<>'Pending Employee' then raise exception 'Both BOD approvals must advance to employee acknowledgement';end if;
 if (select count(*) from jsonb_array_elements(result.routing_steps) s where s->>'role'='Board of Director' and s->>'status'='Approved')<>2 then raise exception 'Distinct BOD approvals not recorded';end if;
end $$;
select 'PASS: both authenticated BOD queues/RLS, first approval preserves second queue, duplicate refusal and final employee acknowledgement; rolled back' as result;
rollback;
