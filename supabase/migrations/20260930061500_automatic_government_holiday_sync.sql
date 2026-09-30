-- Fetch published presidential proclamations daily, preserving immutable calendar revisions.
set local lock_timeout='5s';
set local statement_timeout='30s';
create table private.payroll_holiday_sync_worker(
 singleton boolean primary key default true check(singleton),
 token uuid not null default gen_random_uuid(),
 last_checked_at timestamptz,
 last_change_count integer not null default 0
);
insert into private.payroll_holiday_sync_worker(singleton) values(true);
alter table private.payroll_holiday_sync_worker enable row level security;
revoke all on private.payroll_holiday_sync_worker from public,anon,authenticated;

create function public.authorize_payroll_holiday_sync(p_token text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.payroll_holiday_sync_worker where token::text=p_token)
$$;
revoke all on function public.authorize_payroll_holiday_sync(text) from public,anon,authenticated;
grant execute on function public.authorize_payroll_holiday_sync(text) to service_role;

-- National dates apply to all scopes. NCR dates apply only to units with verified NCR sites.
create table private.payroll_government_jurisdictions(
 scope_id uuid primary key references public.payroll_access_scopes(id),jurisdiction text not null
);
insert into private.payroll_government_jurisdictions(scope_id,jurisdiction) values
 ('dd39148c-e5f6-4cb6-93a0-c637677d16a8','NCR'), -- S Maison, Pasay
 ('0bdb7ee7-0a52-4270-9472-ebcbf19bf1eb','NCR'), -- SM Aura, Taguig
 ('5ece83a5-d63c-4772-bd10-d6670ed5cf27','NCR'), -- MOA, Pasay
 ('f12c903a-c0a8-4fb9-8f5f-bb18b6325657','NCR'), -- SM North, Quezon City
 ('597fbc8b-460e-47bb-ac11-b20c02f4596f','NCR'); -- Dessert Museum, Pasay
alter table private.payroll_government_jurisdictions enable row level security;
revoke all on private.payroll_government_jurisdictions from public,anon,authenticated;

create or replace function private.with_government_holidays(src jsonb,calendars jsonb,p_from date,p_to date,p_scope uuid) returns jsonb
language plpgsql stable set search_path='' as $$
declare official jsonb;merged jsonb;juris text;
begin
 select jurisdiction into juris from private.payroll_government_jurisdictions where scope_id=p_scope;
 select coalesce(jsonb_agg(h||jsonb_build_object('id',(c->>'version')||':'||(h->>'date'),'source',
  coalesce(h->>'source',case h->>'proclamation' when '1189' then c#>>'{source_urls,1}' when '1264' then c#>>'{source_urls,2}' else c#>>'{source_urls,0}' end),
  'government',true) order by h->>'date'),'[]') into official
 from jsonb_array_elements(calendars)c cross join lateral jsonb_array_elements(c->'holidays')h
 where (h->>'date')::date between p_from-1 and p_to+1
   and (not h ? 'jurisdiction' or h->>'jurisdiction'=juris);
 select coalesce(jsonb_agg(h order by h->>'date',h->>'id'),'[]') into merged from (
  select h from jsonb_array_elements(official)h union all
  select h from jsonb_array_elements(coalesce(src->'holidays','[]'))h
  where not exists(select 1 from jsonb_array_elements(official)o where o->>'date'=h->>'date')
 )v;
 return src||jsonb_build_object('holidays',merged,'governmentCalendar',jsonb_build_object(
  'coverage',coalesce((select jsonb_agg(c-'holidays') from jsonb_array_elements(calendars)c),'[]'),
  'covered',not exists(select 1 from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day')d
    where not exists(select 1 from jsonb_array_elements(calendars)c where d::date between (c->>'date_from')::date and (c->>'date_to')::date)),
  'mode','Published national proclamations, plus verified scoped NCR declarations'));
end $$;
revoke all on function private.with_government_holidays(jsonb,jsonb,date,date,uuid) from public,anon,authenticated;
create or replace function private.payroll_time_sources(p_scope uuid,p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare src jsonb;calendars jsonb;
begin
 src:=private.payroll_time_sources_before_government_calendar(p_scope,p_from,p_to);
 select coalesce(jsonb_agg(to_jsonb(c) order by c.date_from),'[]') into calendars from (
  select distinct on(date_from,date_to) * from private.payroll_government_calendar
  where date_from<=p_to+1 and date_to>=p_from-1 order by date_from,date_to,created_at desc,version desc
 )c;
 return private.with_government_holidays(src,calendars,p_from,p_to,p_scope);
end $$;
revoke all on function private.payroll_time_sources(uuid,date,date) from public,anon,authenticated;

create function public.apply_payroll_government_proclamations(p_events jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare y integer;old private.payroll_government_calendar%rowtype;arr jsonb;event jsonb;combined jsonb;urls jsonb;n integer:=0;conflicts integer:=0;year_count integer;new_version text;
begin
 if jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events)>300 then raise exception 'Invalid holiday feed';end if;
 for y in select distinct left(value->>'date',4)::integer from jsonb_array_elements(p_events) where (value->>'date') ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' loop
  if y<extract(year from now())::integer-1 or y>extract(year from now())::integer+2 then raise exception 'Unexpected calendar year';end if;
  select * into old from private.payroll_government_calendar where date_from=make_date(y,1,1) and date_to=make_date(y,12,31) order by created_at desc,version desc limit 1;
  combined:=coalesce(old.holidays,'[]'::jsonb); urls:=coalesce(old.source_urls,'[]'::jsonb);
  select count(*) into year_count from jsonb_array_elements(p_events)e where left(e->>'date',4)=y::text and not(e ? 'jurisdiction');
  if old.version is null and year_count<17 then continue;end if;
  for event in select value from jsonb_array_elements(p_events) where left(value->>'date',4)=y::text order by value->>'date',value->>'proclamation' loop
   if jsonb_typeof(event)<>'object' or (event->>'date')::date not between make_date(y,1,1) and make_date(y,12,31)
    or event->>'kind' not in('regular','special_nonworking','special_working')
    or length(event->>'name') not between 3 and 160
    or event->>'proclamation' !~ '^[0-9]{1,5}$'
    or event->>'source' !~ '^https://lawphil[.]net/executive/proc/proc20[0-9]{2}/proc_[0-9]+_20[0-9]{2}[.]html$'
    or coalesce(event->>'jurisdiction','NATIONAL') not in('NATIONAL','NCR') then raise exception 'Invalid holiday declaration';end if;
   if exists(select 1 from jsonb_array_elements(combined)h where h->>'date'=event->>'date'
     and coalesce(h->>'jurisdiction','NATIONAL')=coalesce(event->>'jurisdiction','NATIONAL')) then
     if exists(select 1 from jsonb_array_elements(combined)h where h->>'date'=event->>'date'
       and coalesce(h->>'jurisdiction','NATIONAL')=coalesce(event->>'jurisdiction','NATIONAL')
       and h->>'kind'<>event->>'kind') then conflicts:=conflicts+1;end if;
     continue;
   end if;
   combined:=combined||jsonb_build_array(event);n:=n+1;
   if not urls ? (event->>'source') then urls:=urls||jsonb_build_array(event->>'source');end if;
  end loop;
  if (old.version is null and jsonb_array_length(combined)>0) or (old.version is not null and combined<>old.holidays) then
   new_version:='PH-'||y||'-auto-'||md5(combined::text);
   insert into private.payroll_government_calendar(version,date_from,date_to,checked_on,source_urls,holidays)
   values(new_version,make_date(y,1,1),make_date(y,12,31),current_date,urls,combined) on conflict do nothing;
  end if;
 end loop;
 update private.payroll_holiday_sync_worker set last_checked_at=clock_timestamp(),last_change_count=n where singleton;
 return jsonb_build_object('new_dates',n,'conflicting_dates_held_for_review',conflicts);
end $$;
revoke all on function public.apply_payroll_government_proclamations(jsonb) from public,anon,authenticated;
grant execute on function public.apply_payroll_government_proclamations(jsonb) to service_role;

select cron.schedule('tng-government-holiday-sync','20 2 * * *',
 $$select net.http_post(url:='https://kpogfmwsxwikfilxhcqh.supabase.co/functions/v1/holiday-calendar-sync',
 headers:=jsonb_build_object('Content-Type','application/json','x-holiday-worker',
 (select token::text from private.payroll_holiday_sync_worker where singleton)),body:='{}'::jsonb)$$);
