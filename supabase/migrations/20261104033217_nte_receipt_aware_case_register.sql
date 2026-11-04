-- Published is not proof of receipt. Only the documented receipt supplies a
-- deadline; draft/approval timestamps are never used for overdue reporting.
-- Preserve the current invoker/RLS reporting boundaries and export audit.
set local lock_timeout = '2s';
set local statement_timeout = '20s';

do $$
declare
  original text;
  revised text;
  old_stage text := $old$when c.nte_status='Issued' and c.response_date is null then 'Awaiting employee response'$old$;
  old_due text := $old$coalesce((c.meta->>'deadline')::timestamptz,c.response_deadline) due_at$old$;
  old_stats text := $old$'awaiting',count(*) filter(where r->>'stage'='Awaiting employee response'),$old$;
begin
  original := pg_get_functiondef('public.case_register_rows()'::regprocedure);
  if strpos(original, old_stage) = 0 or strpos(original, old_due) = 0 then
    raise exception 'Unexpected case register definition; review receipt mapping before applying.';
  end if;
  revised := replace(original, old_stage, $new$when c.nte_status='Issued' and c.response_date is null then case
    when c.meta->>'received_at' is null then 'Awaiting NTE receipt'
    when c.response_stage like 'For Management Review and Decision%' then 'For HR review'
    else 'Awaiting employee response' end$new$);
  revised := replace(revised, old_due, $new$case when c.meta->>'received_at' is not null then (c.meta->>'deadline')::timestamptz end due_at$new$);
  revised := replace(revised, $old$when 'nte-sent' then 'Awaiting employee response'$old$, $new$when 'nte-sent' then 'NTE receipt / response'$new$);
  execute revised;

  original := pg_get_functiondef('public.get_case_register(jsonb,integer,integer,jsonb)'::regprocedure);
  if strpos(original, old_stats) = 0 then
    raise exception 'Unexpected case register summary definition.';
  end if;
  execute replace(original, old_stats, old_stats || $new$
 'awaitingReceipt',count(*) filter(where r->>'stage'='Awaiting NTE receipt'),$new$);
end $$;
