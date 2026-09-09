create or replace function public.queue_schedule_compliance_reminders() returns integer language plpgsql security definer set search_path='' as $$
declare today date:=(statement_timestamp() at time zone 'Asia/Manila')::date;w date;m record; s jsonb;ev text;hr record;counted integer:=0;t record;begin
 -- Execute is service-role-only. Open two weeks before Monday so the seven-day notice exists.
 for w in select generate_series(date_trunc('week',today)::date+7,date_trunc('week',today)::date+14,'7 days')::date loop
 for m in select h.id from public.hris_users h where lower(h.status::text)='active' and exists(select 1 from public.hris_users e where e.reports_to=h.id::text and lower(e.status::text)='active') loop
 perform schedule_compliance.refresh_task(m.id,w);end loop;end loop;
 for t in select t.* from schedule_compliance.tasks t join public.hris_users h on h.id=t.manager_id where lower(h.status::text)='active' and t.completed_at is null loop
 s:=schedule_compliance.refresh_task(t.manager_id,t.week);
 if (s->>'remaining')::int=0 then continue;end if;
 -- Queue opening once even when the dashboard created the task after yesterday's email run.
 insert into schedule_compliance.deliveries(event_key,manager_id,week,recipient_id,event) values(t.manager_id||':'||t.week||':opened',t.manager_id,t.week,t.manager_id,'opened') on conflict do nothing;
 ev:=null;
 if today=(t.deadline at time zone 'Asia/Manila')::date-7 then ev:='seven_days';
 elsif today=(t.deadline at time zone 'Asia/Manila')::date-3 then ev:='three_days';
 elsif today=(t.deadline at time zone 'Asia/Manila')::date-1 then ev:='one_day';
 elsif today=(t.deadline at time zone 'Asia/Manila')::date then ev:='deadline_day';
 elsif statement_timestamp()>t.deadline then ev:='overdue_'||today;end if;
 if ev is not null then
 insert into schedule_compliance.deliveries(event_key,manager_id,week,recipient_id,event) values(t.manager_id||':'||t.week||':'||ev,t.manager_id,t.week,t.manager_id,ev) on conflict do nothing;
 counted:=counted+1;end if;
 if statement_timestamp()>t.deadline then
 for hr in select distinct h.id from public.hris_users h join public.user_roles ur on ur.user_id=h.id where lower(h.status::text)='active' and ur.is_active and ur.role_id in('HR Staff','HR Manager') loop
 insert into schedule_compliance.deliveries(event_key,manager_id,week,recipient_id,event) values(hr.id||':'||t.manager_id||':'||t.week||':escalation:'||today,t.manager_id,t.week,hr.id,'HR escalation') on conflict do nothing;
 end loop;end if;end loop;return counted;
end $$;
