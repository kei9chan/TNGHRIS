-- Additive recipient snapshots. Existing survey/response records are retained.
create schema if not exists pulse_audience_private;
revoke all on schema pulse_audience_private from public,anon,authenticated;
create table pulse_audience_private.configurations (
 survey_id uuid primary key references public.pulse_surveys(id) on delete restrict,
 criteria jsonb not null, updated_by uuid not null, updated_at timestamptz not null default clock_timestamp()
);
create table pulse_audience_private.publications (
 survey_id uuid primary key references public.pulse_surveys(id) on delete restrict,
 criteria jsonb not null, published_by uuid not null, auth_user_id uuid,
 published_at timestamptz not null default clock_timestamp(), source text not null default 'activation'
);
create table pulse_audience_private.recipients (
 survey_id uuid not null references pulse_audience_private.publications(survey_id),
 employee_id uuid not null references public.hris_users(id), snapshot jsonb not null,
 added_at timestamptz not null default clock_timestamp(),added_by uuid not null,
 primary key(survey_id,employee_id)
);
create index pulse_recipients_employee on pulse_audience_private.recipients(employee_id,survey_id);
create table pulse_audience_private.audit (
 id uuid primary key default gen_random_uuid(),survey_id uuid not null,
 action text not null,actor_id uuid not null,auth_user_id uuid,
 reason text not null,criteria jsonb,recipients jsonb not null default '[]',
 created_at timestamptz not null default clock_timestamp()
);
create function pulse_audience_private.immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Survey audience history is immutable' using errcode='42501';end $$;
do $$declare t text;begin
 foreach t in array array['configurations','publications','recipients','audit'] loop
 execute format('alter table pulse_audience_private.%I enable row level security',t);
 execute format('revoke all on pulse_audience_private.%I from public,anon,authenticated',t);
 if t<>'configurations' then execute format('create trigger immutable before update or delete on pulse_audience_private.%I for each row execute function pulse_audience_private.immutable()',t);end if;
 end loop;
end $$;
create function pulse_audience_private.manager() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.current_hris_user_id() is not null and public.has_feature_permission('PulseSurvey','manage') and public.is_hr_or_admin()
$$;
create function pulse_audience_private.can_manage(p_survey uuid) returns boolean language sql stable security definer set search_path='' as $$
 select pulse_audience_private.manager() and exists(select 1 from public.pulse_surveys s where s.id=p_survey and (s.created_by_user_id=public.current_hris_user_id() or public.can_access_hris_user(s.created_by_user_id)))
$$;
create function pulse_audience_private.eligible(p_employee uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.hris_users h where h.id=p_employee and lower(h.status)='active' and not coalesce(h.is_duplicate,false)
 and lower(coalesce(h.employment_status,'')) not in ('inactive','resigned','terminated','separated') and (h.end_date is null or h.end_date::date>=(statement_timestamp() at time zone 'Asia/Manila')::date))
$$;
create function pulse_audience_private.employee(p_employee uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',h.id,'name',h.full_name,'employeeNumber',h.employee_id,'businessUnitId',h.business_unit_id,'businessUnit',h.business_unit,'departmentId',h.department_id,'department',h.department,'position',h.position,'employmentStatus',h.employment_status,
 'roles',coalesce((select jsonb_agg(r.role_id) from private.effective_role_ids(h.id) r),'[]'),
 'isManager',coalesce(h.position ~* '(^|[^a-z])manager([^a-z]|$)',false) or exists(select 1 from private.effective_role_ids(h.id) er join public.roles r on r.id=er.role_id where r.dashboard_type='manager')) from public.hris_users h where h.id=p_employee
$$;
create function pulse_audience_private.validate(p_config jsonb) returns void language plpgsql set search_path='' as $$declare k text;begin
 if p_config is null or jsonb_typeof(p_config)<>'object' or coalesce(p_config->>'preset','') not in ('all','businessUnits','managers','seasonal','consultants','nonRegular','regular','custom') then raise exception 'Survey Audience is required. Choose an audience preset.';end if;
 foreach k in array array['businessUnits','departments','positions','roles','employmentStatuses','includeEmployees','excludeEmployees'] loop
 if jsonb_typeof(p_config->k) is distinct from 'array' then raise exception 'Invalid audience filter: %',k;end if;
 if exists(select 1 from jsonb_array_elements(p_config->k) x where jsonb_typeof(x)<>'string') then raise exception 'Invalid audience filter value: %',k;end if;
 end loop;
 if p_config->>'preset'='businessUnits' and jsonb_array_length(p_config->'businessUnits')=0 then raise exception 'Select at least one business unit';end if;
end $$;
create function pulse_audience_private.resolve(p_config jsonb) returns table(employee_id uuid,snapshot jsonb) language plpgsql stable security definer set search_path='' as $$begin
 perform pulse_audience_private.validate(p_config);
 return query select h.id,e.data from public.hris_users h cross join lateral(select pulse_audience_private.employee(h.id) data)e
 where pulse_audience_private.eligible(h.id) and not(p_config->'excludeEmployees' ? h.id::text) and (
 p_config->'includeEmployees' ? h.id::text or (
 (jsonb_array_length(p_config->'businessUnits')=0 or p_config->'businessUnits' ? h.business_unit_id::text) and
 (jsonb_array_length(p_config->'departments')=0 or p_config->'departments' ? h.department_id::text) and
 (jsonb_array_length(p_config->'positions')=0 or p_config->'positions' ? h.position) and
 (jsonb_array_length(p_config->'roles')=0 or exists(select 1 from jsonb_array_elements_text(e.data->'roles') r where p_config->'roles' ? r)) and
 (jsonb_array_length(p_config->'employmentStatuses')=0 or p_config->'employmentStatuses' ? h.employment_status) and
 (not coalesce((p_config->>'managersOnly')::boolean,false) or (e.data->>'isManager')::boolean) and
 case p_config->>'preset' when 'managers' then (e.data->>'isManager')::boolean
 when 'seasonal' then lower(coalesce(h.employment_status,'')) in ('seasonal','seasonal employee')
 when 'consultants' then lower(coalesce(h.employment_status,'')) in ('consultant','consultants','consultant / contractor')
 when 'regular' then lower(coalesce(h.employment_status,''))='regular'
 when 'nonRegular' then nullif(trim(h.employment_status),'') is not null and lower(h.employment_status)<>'regular'
 else true end));
end $$;
create function public.preview_pulse_audience(p_config jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare rows jsonb;begin
 if not pulse_audience_private.manager() then raise exception 'Survey management permission required' using errcode='42501';end if;
 if exists(select 1 from pulse_audience_private.resolve(p_config) x where not public.can_access_hris_user(x.employee_id)) then raise exception 'The audience includes employees outside your permitted scope. Narrow the filters.' using errcode='42501';end if;
 select coalesce(jsonb_agg(snapshot order by snapshot->>'name'),'[]') into rows from pulse_audience_private.resolve(p_config);
 return jsonb_build_object('count',jsonb_array_length(rows),'recipients',rows,'criteria',p_config);
end $$;
create function public.pulse_audience_options() returns jsonb language plpgsql security definer set search_path='' as $$begin
 if not pulse_audience_private.manager() then raise exception 'Survey management permission required' using errcode='42501';end if;
 return jsonb_build_object('employees',(select coalesce(jsonb_agg(pulse_audience_private.employee(h.id) order by h.full_name),'[]') from public.hris_users h where pulse_audience_private.eligible(h.id) and public.can_access_hris_user(h.id)),
 'businessUnits',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name) order by b.name),'[]') from public.business_units b where exists(select 1 from public.hris_users h where h.business_unit_id=b.id and public.can_access_hris_user(h.id))),
 'departments',(select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'name',d.name) order by d.name),'[]') from public.departments d where exists(select 1 from public.hris_users h where h.department_id=d.id and public.can_access_hris_user(h.id))),
 'roles',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'name',r.id)),'[]') from public.roles r where r.is_active),
 'fullTimeAvailable',false);
end $$;
create function pulse_audience_private.publish(p_survey uuid) returns void language plpgsql security definer set search_path='' as $$declare cfg jsonb;rows jsonb;actor uuid:=public.current_hris_user_id();begin
 if not pulse_audience_private.can_manage(p_survey) then raise exception 'Scoped survey management permission required' using errcode='42501';end if;
 if exists(select 1 from pulse_audience_private.publications where survey_id=p_survey) then return;end if;
 select criteria into cfg from pulse_audience_private.configurations where survey_id=p_survey;
 rows:=public.preview_pulse_audience(cfg)->'recipients';
 if jsonb_array_length(rows)=0 then raise exception 'Zero eligible recipients. Adjust the audience before activation.';end if;
 insert into pulse_audience_private.publications(survey_id,criteria,published_by,auth_user_id) values(p_survey,cfg,actor,auth.uid());
 insert into pulse_audience_private.recipients(survey_id,employee_id,snapshot,added_by) select p_survey,(x->>'id')::uuid,x,actor from jsonb_array_elements(rows) x;
 insert into pulse_audience_private.audit(survey_id,action,actor_id,auth_user_id,reason,criteria,recipients) values(p_survey,'activated',actor,auth.uid(),'Audience frozen at activation',cfg,rows);
 -- Notifications are created once from the authoritative frozen list.
 insert into public.notifications(user_id,type,title,message,link,related_entity_id)
 select r.employee_id::text,'info','Pulse Survey Available','You have been invited to answer a pulse survey.','/evaluation/pulse/take/'||p_survey,p_survey::text from pulse_audience_private.recipients r where r.survey_id=p_survey;
end $$;
create function pulse_audience_private.activation_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.status::text='Active' and not exists(select 1 from pulse_audience_private.publications where survey_id=new.id) then perform pulse_audience_private.publish(new.id);end if;return new;
end $$;
create trigger pulse_audience_activation after insert or update of status on public.pulse_surveys for each row execute function pulse_audience_private.activation_guard();

create function public.configure_pulse_audience(p_survey uuid,p_config jsonb,p_activate boolean default false) returns void language plpgsql security definer set search_path='' as $$declare preview jsonb;begin
 if not pulse_audience_private.can_manage(p_survey) then raise exception 'Scoped survey management permission required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_survey::text,0));
 if exists(select 1 from pulse_audience_private.publications where survey_id=p_survey) then
 if p_config is distinct from (select criteria from pulse_audience_private.publications where survey_id=p_survey) then raise exception 'The published audience is fixed. Add recipients with a reason; existing recipients cannot be removed.';end if;return;end if;
 preview:=public.preview_pulse_audience(p_config);
 insert into pulse_audience_private.configurations(survey_id,criteria,updated_by) values(p_survey,p_config,public.current_hris_user_id()) on conflict(survey_id) do update set criteria=excluded.criteria,updated_by=excluded.updated_by,updated_at=clock_timestamp();
 insert into pulse_audience_private.audit(survey_id,action,actor_id,auth_user_id,reason,criteria,recipients) values(p_survey,'configured',public.current_hris_user_id(),auth.uid(),'Audience configured',p_config,preview->'recipients');
 if p_activate or exists(select 1 from public.pulse_surveys where id=p_survey and status::text='Active') then update public.pulse_surveys set status='Active' where id=p_survey;end if;
end $$;
create function public.save_pulse_survey_with_audience(p_survey jsonb,p_audience jsonb) returns uuid language plpgsql security invoker set search_path='' as $$declare sid uuid:=(p_survey->>'id')::uuid;was_published boolean;result uuid;begin
 if not public.has_feature_permission('PulseSurvey','manage') then raise exception 'Survey management permission required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(sid::text,0));
 -- Query through an authorized RPC, not direct private-table grants.
 was_published:=coalesce((public.get_pulse_audience(sid)->>'published')::boolean,false);
 result:=public.save_pulse_survey_definition(case when was_published or p_survey->>'status'<>'Active' then p_survey else jsonb_set(p_survey,'{status}','"Draft"') end);
 perform public.configure_pulse_audience(sid,p_audience,p_survey->>'status'='Active');
 return result;
end $$;
create function public.get_pulse_audience(p_survey uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if not pulse_audience_private.manager() or (exists(select 1 from public.pulse_surveys where id=p_survey) and not pulse_audience_private.can_manage(p_survey)) then raise exception 'Scoped survey management permission required' using errcode='42501';end if;
 return jsonb_build_object('published',exists(select 1 from pulse_audience_private.publications where survey_id=p_survey),'publication',(select to_jsonb(p) from pulse_audience_private.publications p where survey_id=p_survey),'criteria',coalesce((select criteria from pulse_audience_private.publications where survey_id=p_survey),(select criteria from pulse_audience_private.configurations where survey_id=p_survey)),
 'recipients',(select coalesce(jsonb_agg(r.snapshot||jsonb_build_object('addedAt',r.added_at) order by r.snapshot->>'name'),'[]') from pulse_audience_private.recipients r where survey_id=p_survey and public.can_access_hris_user(r.employee_id)),
 'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by created_at desc),'[]') from pulse_audience_private.audit a where survey_id=p_survey and not exists(select 1 from jsonb_array_elements(a.recipients) x where not public.can_access_hris_user((x->>'id')::uuid))));
end $$;
create function public.add_pulse_recipients(p_survey uuid,p_employees uuid[],p_reason text) returns integer language plpgsql security definer set search_path='' as $$declare rows jsonb;n integer;begin
 if not pulse_audience_private.can_manage(p_survey) then raise exception 'Scoped survey management permission required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_survey::text,0));
 if not exists(select 1 from pulse_audience_private.publications where survey_id=p_survey) then raise exception 'Activate the survey first';end if;
 if length(trim(coalesce(p_reason,'')))<3 then raise exception 'A reason is required for recipient additions';end if;
 if exists(select 1 from unnest(p_employees) x where not public.can_access_hris_user(x) or not pulse_audience_private.eligible(x)) then raise exception 'Recipients must be active employees within your scope' using errcode='42501';end if;
 with added as(insert into pulse_audience_private.recipients(survey_id,employee_id,snapshot,added_by) select p_survey,x,pulse_audience_private.employee(x),public.current_hris_user_id() from (select distinct unnest(p_employees) x) ids on conflict do nothing returning snapshot)
 select coalesce(jsonb_agg(snapshot),'[]') into rows from added;
 n:=jsonb_array_length(rows);
 if n>0 then insert into pulse_audience_private.audit(survey_id,action,actor_id,auth_user_id,reason,recipients) values(p_survey,'recipients_added',public.current_hris_user_id(),auth.uid(),p_reason,rows);
 insert into public.notifications(user_id,type,title,message,link,related_entity_id) select x->>'id','info','Pulse Survey Available','You have been invited to answer a pulse survey.','/evaluation/pulse/take/'||p_survey,p_survey::text from jsonb_array_elements(rows)x;end if;
 return n;
end $$;
create function public.can_read_pulse_audience(p_survey uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.current_hris_user_id() is not null and (pulse_audience_private.can_manage(p_survey) or (
 -- Legacy active surveys retain their current access until HR configures their first
 -- explicit audience. No historical publication date or recipient list is invented.
 exists(select 1 from public.pulse_surveys s where s.id=p_survey and s.status::text<>'Draft') and
 (not exists(select 1 from pulse_audience_private.publications where survey_id=p_survey) or exists(select 1 from pulse_audience_private.recipients where survey_id=p_survey and employee_id=public.current_hris_user_id()))))
$$;
create function public.can_manage_pulse_owner(p_owner uuid) returns boolean language sql stable security definer set search_path='' as $$
 select pulse_audience_private.manager() and (p_owner=public.current_hris_user_id() or public.can_access_hris_user(p_owner))
$$;
create policy pulse_audience_read on public.pulse_surveys as restrictive for select to authenticated using(public.can_manage_pulse_owner(created_by_user_id) or public.can_read_pulse_audience(id));
create policy pulse_audience_sections on public.pulse_survey_sections as restrictive for select to authenticated using(public.can_read_pulse_audience(survey_id));
create policy pulse_audience_questions on public.pulse_survey_questions as restrictive for select to authenticated using(exists(select 1 from public.pulse_survey_sections s where s.id=section_id and public.can_read_pulse_audience(s.survey_id)));
create function pulse_audience_private.response_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if public.current_hris_user_id() is null or new.respondent_id is distinct from public.current_hris_user_id() then raise exception 'You may answer only for your authenticated employee account' using errcode='42501';end if;
 if not pulse_audience_private.eligible(new.respondent_id) or not public.can_read_pulse_audience(new.survey_id) or (exists(select 1 from pulse_audience_private.publications where survey_id=new.survey_id) and not exists(select 1 from pulse_audience_private.recipients where survey_id=new.survey_id and employee_id=new.respondent_id)) then raise exception 'You are not a recipient of this survey' using errcode='42501';end if;
 if not exists(select 1 from public.pulse_surveys where id=new.survey_id and status::text='Active' and start_date<=(clock_timestamp() at time zone 'Asia/Manila')::date and (end_date is null or end_date>=(clock_timestamp() at time zone 'Asia/Manila')::date)) then raise exception 'Survey is outside its response period';end if;
 if tg_op='UPDATE' and (new.survey_id<>old.survey_id or new.respondent_id<>old.respondent_id) then raise exception 'Response identity is immutable' using errcode='42501';end if;
 new.submitted_at:=clock_timestamp();return new;
end $$;
create trigger pulse_audience_response before insert or update on public.pulse_survey_responses for each row execute function pulse_audience_private.response_guard();
revoke all on all functions in schema pulse_audience_private from public,anon,authenticated;
do $$declare p record;begin
 for p in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in ('preview_pulse_audience','pulse_audience_options','configure_pulse_audience','save_pulse_survey_with_audience','get_pulse_audience','add_pulse_recipients','can_read_pulse_audience','can_manage_pulse_owner') loop
 execute format('revoke all on function %s from public,anon',p.signature);execute format('grant execute on function %s to authenticated',p.signature);end loop;
end $$;
