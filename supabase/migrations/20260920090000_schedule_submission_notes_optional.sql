-- Schedule notes are optional context. The schedule itself, the selected week,
-- and all existing approval / publication checks remain required.
set local lock_timeout='5s';
set local statement_timeout='30s';

do $$
declare
  ddl text;
begin
  ddl := pg_get_functiondef('public.submit_my_bod_schedule(date,jsonb,text)'::regprocedure);
  if position('not between 3 and 1000' in lower(ddl)) = 0 then
    raise exception 'Schedule submission function changed; review before applying optional notes fix';
  end if;
  ddl := replace(ddl, 'not between 3 and 1000', '> 1000');
  ddl := replace(ddl, 'Provide all seven dates and a schedule note', 'Provide all seven dates; notes are optional');
  execute ddl;
end $$;

revoke all on function public.submit_my_bod_schedule(date,jsonb,text) from public,anon,authenticated;
grant execute on function public.submit_my_bod_schedule(date,jsonb,text) to authenticated;
notify pgrst,'reload schema';
