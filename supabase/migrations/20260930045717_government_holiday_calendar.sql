-- Government announcements are a shared payroll source, not a per-cutoff HR checkbox.
-- Append calendar revisions centrally; never fabricate future Eid dates or rewrite raw attendance.
set local lock_timeout='5s';
set local statement_timeout='30s';
create table private.payroll_government_calendar(
 version text primary key, date_from date not null,date_to date not null,
 source_urls jsonb not null, holidays jsonb not null,
 checked_on date not null,created_at timestamptz not null default now(),
 check(date_to>=date_from),check(jsonb_typeof(holidays)='array')
);
alter table private.payroll_government_calendar enable row level security;
revoke all on private.payroll_government_calendar from public,anon,authenticated;
insert into private.payroll_government_calendar(version,date_from,date_to,checked_on,source_urls,holidays)
values('PH-2026-proc1006-1189-1264','2026-01-01','2026-12-31','2026-09-30',
 '["https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/7/99678","https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/7/101036","https://pasigcity.gov.ph/news-and-releases/proclamation-no-1264-s-2026-eidl-adha-628"]',
 '[
  {"date":"2026-01-01","name":"New Year’s Day","kind":"regular","proclamation":"1006"},
  {"date":"2026-02-17","name":"Chinese New Year","kind":"special_nonworking","proclamation":"1006"},
  {"date":"2026-02-25","name":"EDSA People Power Revolution Anniversary","kind":"special_working","proclamation":"1006"},
  {"date":"2026-03-20","name":"Eid’l Fitr","kind":"regular","proclamation":"1189"},
  {"date":"2026-04-02","name":"Maundy Thursday","kind":"regular","proclamation":"1006"},
  {"date":"2026-04-03","name":"Good Friday","kind":"regular","proclamation":"1006"},
  {"date":"2026-04-04","name":"Black Saturday","kind":"special_nonworking","proclamation":"1006"},
  {"date":"2026-04-09","name":"Araw ng Kagitingan","kind":"regular","proclamation":"1006"},
  {"date":"2026-05-01","name":"Labor Day","kind":"regular","proclamation":"1006"},
  {"date":"2026-05-27","name":"Eid’l Adha","kind":"regular","proclamation":"1264"},
  {"date":"2026-06-12","name":"Independence Day","kind":"regular","proclamation":"1006"},
  {"date":"2026-08-21","name":"Ninoy Aquino Day","kind":"special_nonworking","proclamation":"1006"},
  {"date":"2026-08-31","name":"National Heroes Day","kind":"regular","proclamation":"1006"},
  {"date":"2026-11-01","name":"All Saints’ Day","kind":"special_nonworking","proclamation":"1006"},
  {"date":"2026-11-02","name":"All Souls’ Day","kind":"special_nonworking","proclamation":"1006"},
  {"date":"2026-11-30","name":"Bonifacio Day","kind":"regular","proclamation":"1006"},
  {"date":"2026-12-08","name":"Feast of the Immaculate Conception of Mary","kind":"special_nonworking","proclamation":"1006"},
  {"date":"2026-12-24","name":"Christmas Eve","kind":"special_nonworking","proclamation":"1006"},
  {"date":"2026-12-25","name":"Christmas Day","kind":"regular","proclamation":"1006"},
  {"date":"2026-12-30","name":"Rizal Day","kind":"regular","proclamation":"1006"},
  {"date":"2026-12-31","name":"Last Day of the Year","kind":"special_nonworking","proclamation":"1006"}
 ]');

-- Pure merge keeps the government date/classification authoritative, with one entry per date.
-- Existing scoped local declarations on other dates remain in the source and audit trail.
create function private.with_government_holidays(src jsonb,calendars jsonb,p_from date,p_to date) returns jsonb
language plpgsql immutable set search_path='' as $$
declare official jsonb;merged jsonb;
begin
 select coalesce(jsonb_agg(h||jsonb_build_object('id',(c->>'version')||':'||(h->>'date'),'source',
  case h->>'proclamation' when '1189' then c#>>'{source_urls,1}' when '1264' then c#>>'{source_urls,2}' else c#>>'{source_urls,0}' end,
  'government',true) order by h->>'date'),'[]') into official
 from jsonb_array_elements(calendars)c cross join lateral jsonb_array_elements(c->'holidays')h
 where (h->>'date')::date between p_from-1 and p_to+1;
 select coalesce(jsonb_agg(h order by h->>'date',h->>'id'),'[]') into merged from (
  select h from jsonb_array_elements(official)h union all
  select h from jsonb_array_elements(coalesce(src->'holidays','[]'))h
  where not exists(select 1 from jsonb_array_elements(official)o where o->>'date'=h->>'date')
 )v;
 return src||jsonb_build_object('holidays',merged,'governmentCalendar',jsonb_build_object(
  'coverage',coalesce((select jsonb_agg(c-'holidays') from jsonb_array_elements(calendars)c),'[]'),
  'covered',not exists(select 1 from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day')d
    where not exists(select 1 from jsonb_array_elements(calendars)c where d::date between (c->>'date_from')::date and (c->>'date_to')::date)),
  'mode','Official national calendar; existing scoped local declarations retained'));
end $$;

alter function private.payroll_time_sources(uuid,date,date) rename to payroll_time_sources_before_government_calendar;
create function private.payroll_time_sources(p_scope uuid,p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare src jsonb;calendars jsonb;
begin
 src:=private.payroll_time_sources_before_government_calendar(p_scope,p_from,p_to);
 select coalesce(jsonb_agg(to_jsonb(c) order by c.date_from),'[]') into calendars from (
  select distinct on(date_from,date_to) * from private.payroll_government_calendar
  where date_from<=p_to+1 and date_to>=p_from-1 order by date_from,date_to,created_at desc,version desc
 )c;
 return private.with_government_holidays(src,calendars,p_from,p_to);
end $$;

alter function private.interpret_payroll_time(jsonb,date,date) rename to interpret_payroll_time_before_government_calendar;
create function private.interpret_payroll_time(p_source jsonb,p_from date,p_to date) returns jsonb
language plpgsql immutable set search_path='' as $$
declare result jsonb;rows jsonb:='[]';r jsonb;issues jsonb;covered boolean;
begin
 result:=private.interpret_payroll_time_before_government_calendar(p_source,p_from,p_to);
 for r in select value from jsonb_array_elements(result->'rows') loop
  covered:=exists(select 1 from jsonb_array_elements(coalesce(p_source#>'{governmentCalendar,coverage}','[]'))c
    where (r->>'date')::date between (c->>'date_from')::date and (c->>'date_to')::date)
   and not exists(select 1 from jsonb_array_elements(coalesce(r->'segments','[]'))s where not exists(
    select 1 from jsonb_array_elements(coalesce(p_source#>'{governmentCalendar,coverage}','[]'))c
    where (s->>'date')::date between (c->>'date_from')::date and (c->>'date_to')::date));
  select coalesce(jsonb_agg(i),'[]') into issues from jsonb_array_elements(r->'issues')i
   where i#>>'{}'<>'Holiday calendar coverage needs review';
  if not covered then issues:=issues||jsonb_build_array('Government holiday calendar update needed');end if;
  rows:=rows||jsonb_build_array(r||jsonb_build_object('issues',issues,'ready',jsonb_array_length(issues)=0));
 end loop;
 return result||jsonb_build_object('rows',rows,'blockedDays',(select count(*) from jsonb_array_elements(rows)x where not(x->>'ready')::boolean));
end $$;
revoke all on function private.with_government_holidays(jsonb,jsonb,date,date),private.payroll_time_sources(uuid,date,date),private.payroll_time_sources_before_government_calendar(uuid,date,date),private.interpret_payroll_time(jsonb,date,date),private.interpret_payroll_time_before_government_calendar(jsonb,date,date) from public,anon,authenticated;

-- Break decisions still validate their original evidence. A new holiday publication changes the
-- full payroll source hash (stale calculation), not the separate recorded-break approval evidence.
do $$declare ddl text;begin
 ddl:=pg_get_functiondef('public.get_payroll_break_review(uuid,date,date)'::regprocedure);
 if position('hash:=md5((src-''approvedRecordedBreaks'')::text)' in ddl)=0 then raise exception 'Unexpected break review definition';end if;
 execute replace(ddl,'hash:=md5((src-''approvedRecordedBreaks'')::text)',
  'hash:=md5(private.payroll_time_sources_before_break_review(p_scope,p_from,p_to)::text)');
 ddl:=pg_get_functiondef('public.preview_payroll_time(uuid,date,date)'::regprocedure);
 if position('''holidays'',review#>''{source,holidays}''' in ddl)=0 then raise exception 'Unexpected payroll preview definition';end if;
 execute replace(ddl,'''holidays'',review#>''{source,holidays}''',
  '''governmentCalendar'',review#>''{source,governmentCalendar}'',''holidays'',review#>''{source,holidays}''');
end $$;
notify pgrst,'reload schema';
