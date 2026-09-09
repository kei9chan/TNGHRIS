alter table public.pulse_survey_questions
  add column is_required boolean,
  add column choices jsonb not null default '[]',
  add column min_selections integer,
  add column max_selections integer,
  add column min_date date,
  add column max_date date,
  add column time_format text not null default '24';
update public.pulse_survey_questions set is_required = (question_type = 'rating');
alter table public.pulse_survey_questions alter column is_required set default false;
alter table public.pulse_survey_questions alter column is_required set not null;
alter table public.pulse_survey_questions drop constraint pulse_survey_questions_question_type_check;
alter table public.pulse_survey_questions add constraint pulse_survey_questions_question_type_check
check (question_type in ('rating','text','yes_no','checkboxes','date','time'));
alter table public.pulse_survey_questions add constraint pulse_question_limits check (
  jsonb_typeof(choices) = 'array' and time_format in ('12','24')
  and (min_selections is null or min_selections >= 0)
  and (max_selections is null or max_selections >= 1)
  and (min_selections is null or max_selections is null or min_selections <= max_selections)
  and (min_date is null or max_date is null or min_date <= max_date));
alter table public.pulse_survey_responses add column if not exists comments text;

create function public.validate_pulse_question() returns trigger
language plpgsql set search_path = '' as $$
declare n integer;
begin
  if btrim(new.text) = '' then raise exception 'Question text is required'; end if;
  if new.question_type = 'checkboxes' then
    n := jsonb_array_length(new.choices);
    if n = 0 or coalesce(new.min_selections,0) > n or coalesce(new.max_selections,n) > n then raise exception 'Invalid selection limits'; end if;
    if exists(select 1 from jsonb_array_elements(new.choices) c where jsonb_typeof(c) <> 'object' or coalesce(btrim(c->>'id'),'') = '' or coalesce(btrim(c->>'label'),'') = '') then raise exception 'Each choice needs an ID and label'; end if;
    if (select count(distinct c->>'id') from jsonb_array_elements(new.choices) c) <> n or (select count(distinct lower(btrim(c->>'label'))) from jsonb_array_elements(new.choices) c) <> n then raise exception 'Choices must be unique'; end if;
  end if;
  return new;
end $$;
create trigger pulse_question_validation before insert or update on public.pulse_survey_questions for each row execute function public.validate_pulse_question();

-- Atomic save, stable IDs, and existing RLS remain in force.
create function public.save_pulse_survey_definition(p_survey jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare sid uuid := (p_survey->>'id')::uuid; sec jsonb; q jsonb; secid uuid; qid uuid;
  section_ids uuid[] := '{}'; question_ids uuid[] := '{}'; si integer := 0; qi integer;
begin
  if auth.uid() is null or not public.is_hr_or_admin() then raise exception 'Not authorized to manage surveys'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(sid::text,0));
  if exists(select 1 from public.pulse_survey_responses where survey_id=sid) then raise exception 'This survey already has responses. Its questionnaire cannot be edited; create a new survey to preserve existing results.'; end if;
  if coalesce(btrim(p_survey->>'title'),'')='' or jsonb_typeof(p_survey->'sections') is distinct from 'array' or jsonb_array_length(p_survey->'sections')=0 then raise exception 'Title and sections are required'; end if;
  if (p_survey->>'start_date') is null or (p_survey->>'end_date')::date < (p_survey->>'start_date')::date then raise exception 'Invalid survey date range'; end if;
  insert into public.pulse_surveys(id,title,description,start_date,end_date,status,is_anonymous,created_by_user_id)
    values(sid,p_survey->>'title',p_survey->>'description',(p_survey->>'start_date')::date,(p_survey->>'end_date')::date,(p_survey->>'status')::public.pulse_survey_status,coalesce((p_survey->>'is_anonymous')::boolean,true),public.current_hris_id())
  on conflict(id) do update set title=excluded.title,description=excluded.description,start_date=excluded.start_date,end_date=excluded.end_date,status=excluded.status,is_anonymous=excluded.is_anonymous;
  for sec in select value from jsonb_array_elements(p_survey->'sections') loop
    secid := (sec->>'id')::uuid;
    if secid=any(section_ids) then raise exception 'Duplicate section'; end if;
    if exists(select 1 from public.pulse_survey_sections where id=secid and survey_id<>sid) then raise exception 'Section belongs to another survey'; end if;
    section_ids := array_append(section_ids,secid);
    insert into public.pulse_survey_sections(id,survey_id,title,description,sort_order) values(secid,sid,coalesce(nullif(sec->>'title',''),'Untitled Section'),sec->>'description',si)
    on conflict(id) do update set title=excluded.title,description=excluded.description,sort_order=excluded.sort_order;
    si:=si+1; qi:=0;
    for q in select value from jsonb_array_elements(sec->'questions') loop
      qid := (q->>'id')::uuid;
      if qid=any(question_ids) then raise exception 'Duplicate question'; end if;
      if exists(select 1 from public.pulse_survey_questions x join public.pulse_survey_sections s on s.id=x.section_id where x.id=qid and s.survey_id<>sid) then raise exception 'Question belongs to another survey'; end if;
      question_ids:=array_append(question_ids,qid);
      insert into public.pulse_survey_questions(id,section_id,text,question_type,sort_order,is_required,choices,min_selections,max_selections,min_date,max_date,time_format)
      values(qid,secid,q->>'text',q->>'type',qi,coalesce((q->>'required')::boolean,q->>'type'='rating'),coalesce(q->'choices','[]'),(q->>'minSelections')::integer,(q->>'maxSelections')::integer,(q->>'minDate')::date,(q->>'maxDate')::date,coalesce(q->>'timeFormat','24'))
      on conflict(id) do update set section_id=excluded.section_id,text=excluded.text,question_type=excluded.question_type,sort_order=excluded.sort_order,is_required=excluded.is_required,choices=excluded.choices,min_selections=excluded.min_selections,max_selections=excluded.max_selections,min_date=excluded.min_date,max_date=excluded.max_date,time_format=excluded.time_format;
      qi:=qi+1;
    end loop;
  end loop;
  delete from public.pulse_survey_questions where section_id in(select id from public.pulse_survey_sections where survey_id=sid) and not(id=any(question_ids));
  delete from public.pulse_survey_sections where survey_id=sid and not(id=any(section_ids));
  return sid;
end $$;
revoke all on function public.save_pulse_survey_definition(jsonb) from public,anon;
grant execute on function public.save_pulse_survey_definition(jsonb) to authenticated;

create function public.validate_pulse_answers() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare q record; v jsonb; s text; n integer; dt date; survey public.pulse_surveys;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.survey_id::text,0));
  select * into survey from public.pulse_surveys where id=new.survey_id;
  if survey.id is null or survey.status::text <> 'Active' then raise exception 'Survey is not active'; end if;
  if jsonb_typeof(new.answers) is distinct from 'array' then raise exception 'Answers must be an array'; end if;
  if (select count(distinct a->>'questionId') from jsonb_array_elements(new.answers) a) <> jsonb_array_length(new.answers) then raise exception 'Duplicate or missing question IDs'; end if;
  if exists(select 1 from jsonb_array_elements(new.answers) a where not exists(select 1 from public.pulse_survey_questions x join public.pulse_survey_sections ss on ss.id=x.section_id where x.id::text=a->>'questionId' and ss.survey_id=new.survey_id)) then raise exception 'Answer references an unknown question'; end if;
  for q in select x.* from public.pulse_survey_questions x join public.pulse_survey_sections ss on ss.id=x.section_id where ss.survey_id=new.survey_id loop
    v:=null;
    select a->'value' into v from jsonb_array_elements(new.answers) a where a->>'questionId'=q.id::text;
    if v is null or v='null'::jsonb or v='""'::jsonb or v='[]'::jsonb or (jsonb_typeof(v)='string' and btrim(v#>>'{}')='') then
      if q.is_required then raise exception 'Required question: %',q.text; end if;
      continue;
    end if;
    s:=v#>>'{}';
    case q.question_type
      when 'rating' then if jsonb_typeof(v)<>'number' or s::numeric not in(1,2,3,4,5) then raise exception 'Rating must be 1 to 5'; end if;
      when 'text' then if jsonb_typeof(v)<>'string' then raise exception 'Text answer required'; end if;
      when 'yes_no' then if jsonb_typeof(v)<>'string' or s not in('Yes','No') then raise exception 'Select Yes or No'; end if;
      when 'checkboxes' then
        if jsonb_typeof(v)<>'array' then raise exception 'Checkbox answer must be an array'; end if;
        n:=jsonb_array_length(v);
        if n < greatest(case when q.is_required then 1 else 0 end,coalesce(q.min_selections,0)) or n>coalesce(q.max_selections,jsonb_array_length(q.choices)) then raise exception 'Invalid number of selections'; end if;
        if (select count(distinct c) from jsonb_array_elements(v) c)<>n or exists(select 1 from jsonb_array_elements(v) c where jsonb_typeof(c)<>'string' or not exists(select 1 from jsonb_array_elements(q.choices) o where o->>'id'=c#>>'{}')) then raise exception 'Invalid checkbox choice'; end if;
      when 'date' then
        if jsonb_typeof(v)<>'string' or s !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
        dt:=s::date;
        if to_char(dt,'YYYY-MM-DD')<>s or dt<q.min_date or dt>q.max_date then raise exception 'Date outside allowed range'; end if;
      when 'time' then if jsonb_typeof(v)<>'string' or s !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Invalid time'; end if;
      else raise exception 'Unsupported question type';
    end case;
  end loop;
  return new;
end $$;
create trigger pulse_answer_validation before insert or update of answers,survey_id on public.pulse_survey_responses for each row execute function public.validate_pulse_answers();
revoke all on function public.validate_pulse_question() from public,anon,authenticated;
revoke all on function public.validate_pulse_answers() from public,anon,authenticated;
