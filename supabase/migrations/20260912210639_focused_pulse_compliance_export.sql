-- Filtered export reuses the compliance snapshot and its scope authorization.
-- No table grants or RLS policies are broadened.
create function public.export_pulse_compliance(p_survey uuid,p_employees uuid[],p_filters jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare report jsonb;selected jsonb;results jsonb;anonymous boolean;respondents integer;
begin
 report:=public.get_pulse_compliance(p_survey);
 if report is null or report->'publication'='null'::jsonb then raise exception 'Published survey required';end if;
 if p_employees is null or cardinality(p_employees)>10000 or jsonb_typeof(p_filters)<>'object' then raise exception 'Invalid export selection';end if;
 if exists(select 1 from unnest(p_employees) e where e is null or not exists(select 1 from jsonb_array_elements(report->'rows') r where r->>'id'=e::text)) then
 raise exception 'Only survey recipients in your authorized scope may be exported' using errcode='42501';end if;
 select coalesce(jsonb_agg(r||jsonb_build_object('lastReminderAt',(
 select max(a.created_at) from pulse_audience_private.audit a where a.survey_id=p_survey and a.action='reminders_sent'
 and exists(select 1 from jsonb_array_elements(a.recipients) ar where ar->>'id'=r->>'id')
 )) order by r->>'name'),'[]') into selected from jsonb_array_elements(report->'rows') r where (r->>'id')::uuid=any(p_employees);
 select is_anonymous into anonymous from public.pulse_surveys where id=p_survey;
 select count(distinct respondent_id) into respondents from public.pulse_survey_responses where survey_id=p_survey and respondent_id=any(p_employees);
 -- Anonymous results must never disclose free text or isolate small groups.
 -- Suppressed cells are labeled, not silently exported as zero.
 with latest as (
 select distinct on(respondent_id) respondent_id,answers from public.pulse_survey_responses
 where survey_id=p_survey and respondent_id=any(p_employees) order by respondent_id,submitted_at desc,id desc
 ), answers as (
 select l.respondent_id,q.id,q.text question,q.question_type::text kind,q.choices,a->'value' value
 from latest l cross join lateral jsonb_array_elements(l.answers) a
 join public.pulse_survey_questions q on q.id::text=a->>'questionId'
 join public.pulse_survey_sections s on s.id=q.section_id and s.survey_id=p_survey
 ), expanded as (
 select a.*,v.value selection from answers a cross join lateral jsonb_array_elements(case when jsonb_typeof(a.value)='array' then a.value else jsonb_build_array(a.value) end) v
 ), grouped as (
 select id,question,kind,selection,choices,count(distinct respondent_id) n,
 avg(case when kind='rating' and jsonb_typeof(selection)='number' then (selection#>>'{}')::numeric end) score
 from expanded group by id,question,kind,selection,choices
 ) select coalesce(jsonb_agg(jsonb_build_object('question',question,
 'answer',case when anonymous and (respondents<5 or n<5 or kind in('text','date','time')) then 'Withheld to preserve anonymous responses'
 when kind='checkboxes' then coalesce((select c->>'label' from jsonb_array_elements(choices) c where c->>'id'=selection#>>'{}' limit 1),selection#>>'{}') else selection#>>'{}' end,
 'count',case when anonymous and (respondents<5 or n<5 or kind in('text','date','time')) then null else n end,
 'average',case when anonymous and (respondents<5 or n<5) then null else round(score,2) end) order by question,selection::text),'[]') into results from grouped;
 -- Collapse indistinguishable suppressed cells so their number reveals nothing.
 select coalesce(jsonb_agg(distinct value),'[]') into results from jsonb_array_elements(results);
 insert into pulse_audience_private.audit(survey_id,action,actor_id,auth_user_id,reason,criteria,recipients)
 values(p_survey,'compliance_exported',public.current_hris_user_id(),auth.uid(),'Filtered details, summary and response aggregates exported',p_filters,selected);
 return report||jsonb_build_object('rows',selected,'results',results,'resultsNotice',case when anonymous then 'Anonymous survey: aggregate results only. Small cells (fewer than 5 respondents), text, dates and times are withheld.' else 'Latest submitted response per selected recipient, grouped by question and answer. Multiple selections are counted separately.' end);
end $$;
revoke all on function public.export_pulse_compliance(uuid,uuid[],jsonb) from public,anon;
grant execute on function public.export_pulse_compliance(uuid,uuid[],jsonb) to authenticated;
