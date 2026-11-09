-- Untracked leave types (including Without Pay) omit credit amounts from the
-- lookup response. The immutable decision audit still requires numeric values.
-- Fill those amounts at the decision boundary, retaining the request's stored
-- shortfall and duration. Do not alter approval authority or credit accounting.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $migration$
declare
  definition text;
  lookup constant text := '  credits := private.leave_credit_context(request_row.id);';
  normalized constant text := $patch$  credits := private.leave_credit_context(request_row.id);
  -- Complete the leave-exception audit snapshot for untracked leave types.
  -- creditTracked/creditException retain their original meaning and values.
  credits := credits || jsonb_build_object(
    'creditShortfall', coalesce((credits->>'creditShortfall')::numeric, request_row.credit_shortfall, 0),
    'availableCredits', coalesce((credits->>'availableCredits')::numeric, 0),
    'requestedCredits', coalesce((credits->>'requestedCredits')::numeric, request_row.duration_days)
  );$patch$;
begin
  definition := pg_get_functiondef('public.process_leave_exception_approval(uuid,text,text,text)'::regprocedure);
  if position(normalized in definition) > 0 then return; end if;
  if (length(definition) - length(replace(definition, lookup, ''))) / length(lookup) <> 1 then
    raise exception 'Leave exception credit lookup changed; review before applying the audit fix';
  end if;
  execute replace(definition, lookup, normalized);
end;
$migration$;
