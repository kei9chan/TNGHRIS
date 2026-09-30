-- A proclamation crawl needs more than pg_net's five-second default.
set local lock_timeout='5s';
select cron.unschedule('tng-government-holiday-sync');
select cron.schedule('tng-government-holiday-sync','20 2 * * *',
 $$select net.http_post(url:='https://kpogfmwsxwikfilxhcqh.supabase.co/functions/v1/holiday-calendar-sync',
 headers:=jsonb_build_object('Content-Type','application/json','x-holiday-worker',
 (select token::text from private.payroll_holiday_sync_worker where singleton)),
 body:='{}'::jsonb,timeout_milliseconds:=60000)$$);
