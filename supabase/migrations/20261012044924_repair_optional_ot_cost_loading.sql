-- Optional compensation estimates must not prevent OT review or authorization.
-- Keep salary access checks and manager/BOD routing unchanged.
do $$
declare
  v_ddl text;
begin
  v_ddl := pg_get_functiondef('private.ot_cost_estimate(public.ot_requests)'::regprocedure);
  if strpos(v_ddl,'scope_id uuid;') = 0
    or strpos(v_ddl,'p.scope_id=scope_id') = 0
    or strpos(v_ddl,'g.scope_id=scope_id') = 0 then
    raise exception 'OT cost function changed; inspect before repairing variable references.';
  end if;
  v_ddl := replace(v_ddl,'scope_id uuid;','v_scope_id uuid;');
  v_ddl := replace(v_ddl,'scope_id :=','v_scope_id :=');
  v_ddl := replace(v_ddl,'if scope_id is null','if v_scope_id is null');
  v_ddl := replace(v_ddl,'r.employee_id,scope_id,','r.employee_id,v_scope_id,');
  v_ddl := replace(v_ddl,'p.scope_id=scope_id','p.scope_id=v_scope_id');
  v_ddl := replace(v_ddl,'g.scope_id=scope_id','g.scope_id=v_scope_id');
  execute v_ddl;
end $$;

create or replace function private.ot_cost_estimate_safe(r public.ot_requests)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
  -- The underlying helper owns all authentication and compensation checks.
  return private.ot_cost_estimate(r);
exception when others then
  -- Do not expose salary values, SQL text or privileged error details.
  raise warning 'Optional OT cost estimate unavailable (SQLSTATE %)',sqlstate;
  return jsonb_build_object('available',false,'reason','Cost estimate temporarily unavailable.');
end $$;
revoke all on function private.ot_cost_estimate_safe(public.ot_requests) from public,anon,authenticated;

do $$
declare
  v_ddl text;
  v_version text := 'md5(rows::text||summary::text)';
begin
  v_ddl := pg_get_functiondef('public.get_ot_week_review(uuid[])'::regprocedure);
  if strpos(v_ddl,'private.ot_cost_estimate(r)') = 0 or strpos(v_ddl,v_version) = 0 then
    raise exception 'OT review payload changed; inspect before isolating optional estimates.';
  end if;
  v_ddl := replace(v_ddl,'private.ot_cost_estimate(r)','private.ot_cost_estimate_safe(r)');
  -- Approval version tracks the requests and routing, not optional compensation.
  v_ddl := replace(v_ddl,v_version,
    'md5((select coalesce(jsonb_agg(x.item-''costEstimate'' order by x.ordinality),''[]''::jsonb)::text from jsonb_array_elements(rows) with ordinality as x(item,ordinality))||summary::text)');
  execute v_ddl;
end $$;

notify pgrst,'reload schema';
