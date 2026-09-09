-- Scoped, snapshot-based Pulse Survey compliance. No response contents are exposed.
create function public.get_pulse_compliance(p_survey uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare report jsonb;begin
 if auth.uid() is null or not pulse_audience_private.can_manage(p_survey) then
 raise exception 'Scoped survey management permission required' using errcode='42501';end if;
 select jsonb_build_object('title',s.title,'status',s.status,'dueDate',s.end_date,
 'publication',(select to_jsonb(p) from pulse_audience_private.publications p where p.survey_id=s.id),
 'rows',(select coalesce(jsonb_agg(r.snapshot||jsonb_build_object(
 'addedAt',r.added_at,'completedAt',x.completed_at,
 'complianceStatus',case when x.completed_at is not null then 'Completed' when s.end_date is not null and s.end_date<(statement_timestamp() at time zone 'Asia/Manila')::date then 'Overdue' else 'Pending' end,
 'canRemind',x.completed_at is null and pulse_audience_private.eligible(r.employee_id) and s.status::text='Active' and (s.end_date is null or s.end_date>=(statement_timestamp() at time zone 'Asia/Manila')::date)
 ) order by r.snapshot->>'name'),'[]')
 from pulse_audience_private.recipients r
 left join lateral(select max(submitted_at) completed_at from public.pulse_survey_responses where survey_id=s.id and respondent_id=r.employee_id)x on true
 where r.survey_id=s.id and public.can_access_hris_user(r.employee_id))) into report
 from public.pulse_surveys s where s.id=p_survey;
 return report;
end $$;
create function public.remind_pulse_recipients(p_survey uuid,p_employees uuid[]) returns integer
language plpgsql security definer set search_path='' as $$
declare sent integer;ids uuid[];begin
 if auth.uid() is null or not pulse_audience_private.can_manage(p_survey) then
 raise exception 'Scoped survey management permission required' using errcode='42501';end if;
 if not exists(select 1 from pulse_audience_private.publications where survey_id=p_survey) then raise exception 'Configure the survey audience before sending reminders';end if;
 if not exists(select 1 from public.pulse_surveys where id=p_survey and status::text='Active' and (end_date is null or end_date>=(statement_timestamp() at time zone 'Asia/Manila')::date)) then raise exception 'Reminders are available only for active surveys within their response period';end if;
 if exists(select 1 from unnest(p_employees) e where e is null or not public.can_access_hris_user(e) or not exists(select 1 from pulse_audience_private.recipients r where r.survey_id=p_survey and r.employee_id=e)) then raise exception 'Only recipients within your permitted scope may be reminded' using errcode='42501';end if;
 -- Recheck current eligibility and completion rather than trusting a stale browser list.
 select array_agg(distinct e) into ids from unnest(p_employees)e where pulse_audience_private.eligible(e) and not exists(select 1 from public.pulse_survey_responses where survey_id=p_survey and respondent_id=e);
 insert into public.notifications(user_id,type,title,message,link,related_entity_id)
 select e::text,'info','Pulse Survey Reminder','Please complete your assigned pulse survey.','/evaluation/pulse/take/'||p_survey,p_survey::text from unnest(ids)e;
 get diagnostics sent=row_count;
 if sent>0 then insert into pulse_audience_private.audit(survey_id,action,actor_id,auth_user_id,reason,recipients)
 select p_survey,'reminders_sent',public.current_hris_user_id(),auth.uid(),'Reminder sent to selected compliance recipients',jsonb_agg(r.snapshot)
 from pulse_audience_private.recipients r where r.survey_id=p_survey and r.employee_id=any(ids);end if;
 return sent;
end $$;
revoke all on function public.get_pulse_compliance(uuid),public.remind_pulse_recipients(uuid,uuid[]) from public,anon;
grant execute on function public.get_pulse_compliance(uuid),public.remind_pulse_recipients(uuid,uuid[]) to authenticated;
