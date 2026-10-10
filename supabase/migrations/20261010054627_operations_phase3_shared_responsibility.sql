-- Helpers can save drafts, but shared recurring work needs an accountable owner before submission.
alter function operations_private.submit_run(uuid,integer) rename to submit_run_phase2;
create function operations_private.submit_run(p_run uuid,p_revision integer) returns void language plpgsql security definer set search_path='' as $$declare o public.ops_occurrences;begin
 select x.* into o from public.ops_occurrences x join public.ops_assignments a on a.occurrence_id=x.id where a.checklist_run_id=p_run limit 1 for update of x;
 if found and o.config->>'execution'='shared' and (o.owner_id is null or not exists(select 1 from public.ops_occurrence_staff where occurrence_id=o.id and employee_id=o.owner_id and active and operations_private.member(employee_id,o.business_unit_id))) then raise exception 'Take responsibility in Coverage or ask a manager to assign an owner before submitting shared work';end if;
 perform operations_private.submit_run_phase2(p_run,p_revision);
end $$;
revoke all on function operations_private.submit_run_phase2(uuid,integer) from public,anon,authenticated;
revoke all on function operations_private.submit_run(uuid,integer) from public,anon;
grant execute on function operations_private.submit_run(uuid,integer) to authenticated;

create or replace function operations_private.queue_notices(p_occ uuid,p_now timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare o public.ops_occurrences;r public.ops_rules;s record;k text;msg text;begin
 select * into o from public.ops_occurrences where id=p_occ;select * into r from public.ops_rules where id=o.rule_id;
 if o.status<>'Open' then update operations_private.ops_deliveries set state='Stopped' where occurrence_id=o.id and state='Queued';return;end if;
 for s in select st.employee_id id from public.ops_occurrence_staff st join public.ops_assignments ax on ax.id=st.assignment_id where st.occurrence_id=o.id and st.active and ax.status not in('Completed','Cancelled') union select r.updated_by union select h.id from public.hris_users h where operations_private.role_unit(h.id,o.business_unit_id,array['Business Unit Manager']) loop
 k:=null;
 if o.coverage in('Uncovered','Schedule missing','No owner','At risk') and p_now>=o.window_start and (s.id=r.updated_by or operations_private.role_unit(s.id,o.business_unit_id,array['Business Unit Manager'])) then k:='coverage:'||o.coverage;msg:=o.coverage_reason;
 elsif p_now>o.due_at and coalesce((o.config->>'overdue_every')::int,0)>0 then k:='overdue:'||floor(extract(epoch from(p_now-o.due_at))/(60*(o.config->>'overdue_every')::int))::text;msg:='Outstanding work is overdue';
 elsif p_now>=o.due_at-make_interval(mins=>coalesce((o.config->>'remind_before')::int,0)) and p_now<=o.due_at and coalesce((o.config->>'remind_before')::int,0)>0 then k:='due';msg:='Assigned work is due soon';
 elsif exists(select 1 from public.ops_occurrence_staff where occurrence_id=o.id and employee_id=s.id and active) then k:='assigned';msg:='You are assigned for operating date '||o.operating_date::text;end if;
 if k is not null then insert into operations_private.ops_deliveries(occurrence_id,recipient,event_key,title,message) values(o.id,s.id,k,o.title,msg) on conflict do nothing;end if;end loop;
end $$;
create or replace function operations_private.deliver_notices() returns void language plpgsql security definer set search_path='' as $$
declare d record;n uuid;begin
 for d in select x.* from operations_private.ops_deliveries x join public.ops_occurrences o on o.id=x.occurrence_id where x.state='Queued' and x.next_attempt_at<=now() and o.status='Open' order by x.next_attempt_at limit 200 for update of x skip locked loop
 begin
 if exists(select 1 from public.ops_occurrence_staff st join public.ops_assignments ax on ax.id=st.assignment_id where st.occurrence_id=d.occurrence_id and st.employee_id=d.recipient and (not st.active or ax.status in('Completed','Cancelled'))) and not exists(select 1 from public.ops_occurrences o join public.ops_rules r on r.id=o.rule_id where o.id=d.occurrence_id and (r.updated_by=d.recipient or operations_private.role_unit(d.recipient,o.business_unit_id,array['Business Unit Manager','GeneralManager','Admin','Board of Director']))) then update operations_private.ops_deliveries set state='Stopped' where id=d.id;continue;end if;
 if not exists(select 1 from public.hris_users h join public.ops_occurrences o on o.id=d.occurrence_id where h.id=d.recipient and lower(h.status)='active' and (operations_private.member(h.id,o.business_unit_id) or operations_private.role_unit(h.id,o.business_unit_id,array['Admin','Board of Director']))) then update operations_private.ops_deliveries set state='Stopped' where id=d.id;continue;end if;
 insert into public.notifications(user_id,type,title,message,link,related_entity_id,dedupe_key) values(d.recipient::text,'info',d.title,d.message,'/operations?view=Coverage',d.occurrence_id::text,'ops:'||d.occurrence_id||':'||d.event_key) on conflict(user_id,dedupe_key) do nothing returning id into n;
 if n is null then select id into n from public.notifications where user_id=d.recipient::text and dedupe_key='ops:'||d.occurrence_id||':'||d.event_key;end if;
 update operations_private.ops_deliveries set state='Sent',attempts=attempts+1,notification_id=n,last_error=null where id=d.id;
 exception when others then update operations_private.ops_deliveries set attempts=attempts+1,last_error=SQLERRM,next_attempt_at=now()+interval '5 minutes' where id=d.id;end;end loop;
end $$;
