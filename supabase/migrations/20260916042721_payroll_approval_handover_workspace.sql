-- Workspace projections only; existing approval, payment and pilot gates remain authoritative.
set local lock_timeout='5s';
set local statement_timeout='30s';
create function private.payroll_workspace_approvals(p_scope uuid,p_from date,p_to date,p_offset integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r record;s jsonb;items jsonb:='[]';more boolean:=false;n integer:=0;
begin
 if private.payroll_actor_id() is null or not coalesce(private.payroll_gross_permission(p_scope,'view'),false) then
 raise exception 'Scoped payroll salary access required.' using errcode='42501';end if;
 if (p_from is null)<>(p_to is null) or (p_from is not null and (p_to<p_from or p_to-p_from>30)) or p_offset is null or p_offset<0 then
 raise exception 'Choose a valid cutoff and page.';end if;
 for r in select id from public.payroll_approval_runs where scope_id=p_scope
 and (p_from is null or (source_snapshot->>'from'=p_from::text and source_snapshot->>'to'=p_to::text))
 order by submitted_at desc,id desc offset p_offset limit 51 loop
 n:=n+1;if n>50 then more:=true;exit;end if;
 begin
 s:=private.payroll_approval_state(r.id);
 items:=items||jsonb_build_array((s-'source')||jsonb_build_object('from',s#>>'{source,from}','to',s#>>'{source,to}',
 'kind',s#>>'{source,kind}','version',s#>'{source,version}'));
 exception when insufficient_privilege then null;end;
 end loop;
 return jsonb_build_object('items',items,'hasMore',more,'nextOffset',p_offset+50,'checkedAt',clock_timestamp());
end $$;
create function public.get_payroll_workspace_approvals(p_scope uuid,p_from date default null,p_to date default null,p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$select private.payroll_workspace_approvals(p_scope,p_from,p_to,p_offset)$$;

-- Retain the exact existing activation implementation privately. Old clients fail closed.
alter function public.activate_payroll_pilot(uuid,text) set schema private;
alter function private.activate_payroll_pilot(uuid,text) rename to payroll_activate_certified_pilot;
revoke all on function private.payroll_activate_certified_pilot(uuid,text) from public,anon,authenticated;
create function public.activate_payroll_pilot(p_id uuid,p_reference text) returns uuid
language plpgsql security invoker set search_path='' as $$begin
 raise exception 'Explicit live authorization required. Refresh Compare & Pilot and review the business unit and handover window.' using errcode='42501';
end $$;
create function private.payroll_authorize_pilot(p_id uuid,p_scope uuid,p_from date,p_to date,p_scope_name text,p_reference text,p_authorized boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare p public.payroll_pilot_proposals;scope_name text;activation uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('payroll-pilot-control',0));
 if private.payroll_actor_id() is null or not coalesce(private.payroll_has_access('manage_access',p_scope),false) then
 raise exception 'Scoped Payroll Access manager required.' using errcode='42501';end if;
 if p_authorized is distinct from true then raise exception 'Explicit live authorization is required; test approval does not enable live payroll.' using errcode='42501';end if;
 select * into p from public.payroll_pilot_proposals where id=p_id and scope_id=p_scope;
 select name into scope_name from public.payroll_access_scopes where id=p_scope;
 if p.id is null or p.date_from is distinct from p_from or p.date_to is distinct from p_to or scope_name is distinct from p_scope_name then
 raise exception 'Business unit or handover window changed. Review the current proposal before authorizing.' using errcode='42501';end if;
 -- Runs the original certification, BOD, parent gate, single-pilot and window checks atomically.
 activation:=private.payroll_activate_certified_pilot(p_id,p_reference);
 insert into public.payroll_gross_audit(scope_id,actor_id,action,record_id,reason)
 values(p_scope,private.payroll_actor_id(),'pilot_explicit_live_authorization',activation,
 jsonb_build_object('proposal',p_id,'businessUnit',scope_name,'from',p_from,'to',p_to,'reference',trim(p_reference))::text);
 return activation;
end $$;
create function public.authorize_payroll_pilot_activation(p_id uuid,p_scope uuid,p_from date,p_to date,p_scope_name text,p_reference text,p_authorized boolean)
returns uuid language sql security invoker set search_path='' as $$select private.payroll_authorize_pilot(p_id,p_scope,p_from,p_to,p_scope_name,p_reference,p_authorized)$$;
revoke all on function private.payroll_workspace_approvals(uuid,date,date,integer),public.get_payroll_workspace_approvals(uuid,date,date,integer),
 public.activate_payroll_pilot(uuid,text),private.payroll_authorize_pilot(uuid,uuid,date,date,text,text,boolean),public.authorize_payroll_pilot_activation(uuid,uuid,date,date,text,text,boolean) from public,anon,authenticated;
grant execute on function private.payroll_workspace_approvals(uuid,date,date,integer),public.get_payroll_workspace_approvals(uuid,date,date,integer),
 public.activate_payroll_pilot(uuid,text),private.payroll_authorize_pilot(uuid,uuid,date,date,text,text,boolean),public.authorize_payroll_pilot_activation(uuid,uuid,date,date,text,text,boolean) to authenticated;
