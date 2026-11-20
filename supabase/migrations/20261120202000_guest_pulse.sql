create schema guest_pulse;
revoke all on schema guest_pulse from public,anon,authenticated;
create table guest_pulse.forms(id uuid primary key default gen_random_uuid(),unit uuid not null references public.business_units(id),title text not null,questions jsonb not null,active boolean not null default true,active_since timestamptz default now());
create table guest_pulse.tables(token uuid primary key default gen_random_uuid(),form uuid not null references guest_pulse.forms(id),label text not null,unique(form,label));
create table guest_pulse.reviews(id uuid primary key, token uuid not null references guest_pulse.tables(token), visit date not null,created_at timestamptz not null default now(),answers jsonb not null,manager boolean not null,contact text,table_label text not null);
create index on guest_pulse.reviews(token,created_at);
create function guest_pulse.allowed(u uuid,edit boolean) returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from public.hris_users h where h.id=public.current_hris_user_id() and lower(h.status::text)='active' and (public.has_active_role('Admin') or public.has_active_role('BOD') or (not edit and (public.has_active_role('General Manager') or public.has_active_role('Operations Director'))) or (public.has_active_role('Business Unit Manager') and h.business_unit_id=u)))
$$;
create function public.guest_pulse_workspace(period text) returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object('units',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'edit',guest_pulse.allowed(id,true)) order by name) from public.business_units where guest_pulse.allowed(id,false)),'[]'),
'forms',coalesce((select jsonb_agg(to_jsonb(f) || jsonb_build_object('tables',coalesce((select jsonb_agg(to_jsonb(t) order by length(label),label) from guest_pulse.tables t where t.form=f.id),'[]'))) from guest_pulse.forms f where guest_pulse.allowed(unit,false)),'[]'),
'reviews',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('form',f.id) order by r.created_at desc) from guest_pulse.reviews r join guest_pulse.tables t using(token) join guest_pulse.forms f on f.id=t.form where guest_pulse.allowed(unit,false) and r.created_at >= (date_trunc(case period when 'Today' then 'day' when 'This month' then 'month' else 'week' end,now() at time zone 'Asia/Manila') at time zone 'Asia/Manila')),'[]'))
$$;
create function public.guest_pulse_save(u uuid,kind text,item jsonb) returns void language plpgsql security definer set search_path='' as $$
declare f uuid; q jsonb;
begin
if not guest_pulse.allowed(u,true) then raise exception 'Access denied';end if;
if kind='form' then
 if nullif(trim(item->>'title'),'') is null or jsonb_typeof(item->'questions') is distinct from 'array' or jsonb_array_length(item->'questions') not between 1 and 40 then raise exception 'Enter a title and 1–40 questions';end if;
 for q in select value from jsonb_array_elements(item->'questions') loop
 if nullif(trim(q->>'label'),'') is null or coalesce(q->>'type','') not in ('rating','choice','tags','text') or (q->>'type' in ('choice','tags') and (jsonb_typeof(q->'options') is distinct from 'array' or jsonb_array_length(q->'options')=0)) then raise exception 'Complete every question and its choices';end if;
 end loop;
 insert into guest_pulse.forms as old(id,unit,title,questions,active) values(coalesce((item->>'id')::uuid,gen_random_uuid()),u,trim(item->>'title'),item->'questions',(item->>'active')::boolean) on conflict(id) do update set title=excluded.title,questions=excluded.questions,active=excluded.active,active_since=case when excluded.active and not old.active then now() else old.active_since end where old.unit=u;
elsif kind='table' then
 select id into strict f from guest_pulse.forms where id=(item->>'form')::uuid and unit=u;
 if nullif(trim(item->>'label'),'') is null then raise exception 'Enter a table name';end if;
 insert into guest_pulse.tables as old(token,form,label) values(coalesce((item->>'token')::uuid,gen_random_uuid()),f,trim(item->>'label')) on conflict(token) do update set label=excluded.label where old.form=f;
else raise exception 'Unknown action';end if;
end $$;
create function public.guest_pulse_card(code uuid) returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object('title',f.title,'questions',questions,'table',label,'unit',b.name) from guest_pulse.tables t join guest_pulse.forms f on f.id=t.form join public.business_units b on b.id=f.unit where t.token=$1 and f.active
$$;
create function public.guest_pulse_submit(code uuid,request_id uuid,visit_day date,questions jsonb,answers jsonb,manager boolean,contact text) returns void language plpgsql security definer set search_path='' as $$
declare card jsonb:=public.guest_pulse_card(code); q jsonb; a jsonb; i int:=0; snapshot jsonb:='[]';
begin
if card is null then raise exception 'This form is closed';end if;
if questions is distinct from card->'questions' then raise exception 'The questions changed. Refresh the form.';end if;
if visit_day is null or visit_day>(now() at time zone 'Asia/Manila')::date or length(answers::text)>20000 or jsonb_typeof(answers) is distinct from 'array' or jsonb_array_length(answers)<>jsonb_array_length(questions) then raise exception 'Check the visit date and answers';end if;
for q in select value from jsonb_array_elements(questions) loop
 a:=answers->i;i:=i+1;
 if q->>'type'='rating' and coalesce(a->>'value','') not in ('1','2','3','4','5') then raise exception 'Choose a rating for each category';end if;
 if q->>'type'='choice' and not coalesce((q->'options') ? (a->>'value'),false) then raise exception 'Choose one of the options';end if;
 if q->>'type'='tags' and (jsonb_typeof(a->'tags') is distinct from 'array' or not ((q->'options') @> (a->'tags'))) then raise exception 'Check selected options';end if;
 snapshot:=snapshot||jsonb_build_array(jsonb_build_object('label',q->>'label','type',q->>'type','value',a->>'value','tags',a->'tags','note',left(a->>'note',2000)));
end loop;
insert into guest_pulse.reviews values(request_id,code,visit_day,now(),snapshot,manager,left(contact,300),card->>'table') on conflict(id) do nothing;
end $$;
revoke all on function public.guest_pulse_workspace(text),public.guest_pulse_save(uuid,text,jsonb),public.guest_pulse_card(uuid),public.guest_pulse_submit(uuid,uuid,date,jsonb,jsonb,boolean,text) from public,anon,authenticated;
grant execute on function public.guest_pulse_workspace(text),public.guest_pulse_save(uuid,text,jsonb) to authenticated;
grant execute on function public.guest_pulse_card(uuid),public.guest_pulse_submit(uuid,uuid,date,jsonb,jsonb,boolean,text) to anon,authenticated;
with seed as (insert into guest_pulse.forms(unit,title,questions) select id,'Balay Balay Restaurant','[{"label":"Food & drinks","type":"rating"},{"label":"Speed of service","type":"rating"},{"label":"Staff friendliness","type":"rating"},{"label":"Value for money","type":"rating"},{"label":"Would you eat here again?","type":"choice","options":["Yes","Maybe","No"]},{"label":"What’s one thing we could do better?","type":"tags","options":["Faster service","Food temperature","Portion size","More choices","Table cleanliness"]},{"label":"What did you love?","type":"tags","options":["Favorite dish","Friendly staff","Quick service","Beach atmosphere","Good value"]}]'::jsonb from public.business_units where name='Inflatable Island Beach Club' returning id)
insert into guest_pulse.tables(form,label) select id,'Table '||n from seed cross join generate_series(1,20)n;
create function guest_pulse.weekly() returns void language sql security definer set search_path='' as $$
with bounds as (select date_trunc('week',now() at time zone 'Asia/Manila') at time zone 'Asia/Manila' as finish), counts as (
 select f.*,b.name,finish,count(r.id) as n,count(r.id) filter(where r.manager) as followups from guest_pulse.forms f join public.business_units b on b.id=f.unit cross join bounds left join guest_pulse.tables t on t.form=f.id left join guest_pulse.reviews r on r.token=t.token and r.created_at>=finish-interval '7 days' and r.created_at<finish group by f.id,b.name,finish)
insert into public.notifications(user_id,type,title,message,link,dedupe_key)
select distinct h.id::text,'GENERAL',case when c.n=0 then 'Guest Pulse · No feedback received' else 'Guest Pulse · Weekly feedback report' end,
 c.name||' · '||c.title||' · Week of '||to_char((finish at time zone 'Asia/Manila')-interval '7 days','Mon DD')||'. '||case when c.n=0 then 'Zero responses. Please check QR placement and whether guests are being invited.' else c.n||' responses, '||c.followups||' manager requests.' end,
 '/operations?view=Guest+Pulse','guest-pulse:'||c.id||':'||h.id||':'||extract(epoch from finish)
 from counts c join public.hris_users h on lower(h.status::text)='active' join lateral (select h.role::text role union select role_id from public.user_roles where user_id=h.id and is_active) roles on true
 where (c.n>0 and (roles.role in ('BOD','Admin','Operations Director','General Manager') or (roles.role='Business Unit Manager' and h.business_unit_id=c.unit))) or (roles.role='BOD' and c.n=0 and c.active and c.active_since<=finish-interval '7 days') on conflict do nothing;
$$;
select cron.schedule('guest-pulse-weekly','0 0 * * 1','select guest_pulse.weekly()');
