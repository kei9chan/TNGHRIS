-- Staging-only, synthetic records; rollback leaves no survey or answers behind.
begin;
do $$
declare sid uuid:=gen_random_uuid(); secid uuid:=gen_random_uuid(); q1 uuid:=gen_random_uuid(); q2 uuid:=gen_random_uuid(); q3 uuid:=gen_random_uuid(); q4 uuid:=gen_random_uuid(); q5 uuid:=gen_random_uuid();
  actor uuid; respondent uuid; definition jsonb; answers jsonb; rid uuid; rejected boolean;
begin
  select auth_user_id into actor from public.hris_users where role='Board of Director' and auth_user_id is not null limit 1;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('role','authenticated',true);
  definition:=jsonb_build_object('id',sid,'title','Synthetic pulse verification','start_date',current_date,'status','Active','is_anonymous',true,'sections',jsonb_build_array(jsonb_build_object('id',secid,'title','Test','questions',jsonb_build_array(
    jsonb_build_object('id',q1,'text','Yes no','type','yes_no','required',true),
    jsonb_build_object('id',q2,'text','Choices','type','checkboxes','required',true,'choices',jsonb_build_array(jsonb_build_object('id','a','label','A'),jsonb_build_object('id','b','label','B')),'minSelections',1,'maxSelections',2),
    jsonb_build_object('id',q3,'text','Date','type','date','required',true,'minDate','2026-01-01','maxDate','2026-12-31'),
    jsonb_build_object('id',q4,'text','Time','type','time','required',true,'timeFormat','12'),
    jsonb_build_object('id',q5,'text','Optional text','type','text','required',false)
  ))));
  perform public.save_pulse_survey_definition(definition);
  perform public.save_pulse_survey_definition(definition);
  if (select count(*) from public.pulse_survey_questions where section_id=secid)<>5 then raise exception 'Stable question ID test failed'; end if;
  select auth_user_id,id into actor,respondent from public.hris_users where role='Employee' and auth_user_id is not null limit 1;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  rejected:=false;
  begin perform public.save_pulse_survey_definition(definition); exception when others then rejected:=true; end;
  if not rejected then raise exception 'Employee management access was not denied'; end if;
  answers:=jsonb_build_array(jsonb_build_object('questionId',q1,'value','No'),jsonb_build_object('questionId',q2,'value',jsonb_build_array('a','b')),jsonb_build_object('questionId',q3,'value','2026-09-09'),jsonb_build_object('questionId',q4,'value','00:15'));
  insert into public.pulse_survey_responses(survey_id,respondent_id,answers) values(sid,respondent,answers) returning id into rid;
  if (select r.answers from public.pulse_survey_responses r where id=rid)<>answers then raise exception 'Round trip failed'; end if;
  rejected:=false;
  begin update public.pulse_survey_responses set answers='[]' where id=rid; exception when others then rejected:=true; end;
  if not rejected then raise exception 'Missing required answers accepted'; end if;
  rejected:=false;
  begin update public.pulse_survey_responses r set answers=jsonb_set(r.answers,'{0,value}','"Maybe"') where id=rid; exception when others then rejected:=true; end;
  if not rejected then raise exception 'Invalid yes/no accepted'; end if;
  rejected:=false;
  begin update public.pulse_survey_responses r set answers=jsonb_set(r.answers,'{1,value}','["a","a"]') where id=rid; exception when others then rejected:=true; end;
  if not rejected then raise exception 'Duplicate checkbox choice accepted'; end if;
  rejected:=false;
  begin update public.pulse_survey_responses r set answers=jsonb_set(r.answers,'{2,value}','"2026-02-30"') where id=rid; exception when others then rejected:=true; end;
  if not rejected then raise exception 'Invalid date accepted'; end if;
  rejected:=false;
  begin update public.pulse_survey_responses r set answers=jsonb_set(r.answers,'{3,value}','"24:15"') where id=rid; exception when others then rejected:=true; end;
  if not rejected then raise exception 'Invalid time accepted'; end if;
end $$;
rollback;
