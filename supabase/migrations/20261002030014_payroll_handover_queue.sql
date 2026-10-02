-- Read-only, aggregate handover inbox. No compensation or employee records exposed.
create function private.payroll_handover_queue(p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare oversight boolean;
begin
 if auth.uid() is null or private.payroll_actor_id() is null then
 raise exception 'Active HRIS login required.' using errcode='42501';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>62 then
 raise exception 'Choose a valid payroll cutoff of up to 63 days.';end if;
 oversight:=private.payroll_offset_role(auth.uid(),'Admin') or private.payroll_offset_role(auth.uid(),'Board of Director');
 return coalesce((select jsonb_agg(jsonb_build_object(
 'scopeId',s.id,'name',s.name,'packageId',p.id,'version',p.version,'submittedAt',p.submitted_at,
 'grossId',g.id,'netId',n.id
 ) order by s.name)
 from public.payroll_access_scopes s
 left join lateral (select x.id,x.version,x.submitted_at from public.payroll_time_packages x
 where x.scope_id=s.id and x.date_from=p_from and x.date_to=p_to and x.status='submitted'
 order by x.version desc limit 1) p on true
 left join lateral (select x.id from public.payroll_gross_runs x where x.time_package_id=p.id order by x.version desc limit 1) g on true
 left join lateral (select x.id from public.payroll_net_runs x where x.gross_run_id=g.id order by x.version desc limit 1) n on true
 where s.kind='business_unit' and (oversight or private.payroll_time_permission(s.id,'view'))),'[]'::jsonb);
end $$;
revoke all on function private.payroll_handover_queue(date,date) from public,anon;
revoke all on function private.payroll_handover_queue(date,date) from authenticated;
create function public.get_payroll_handover_queue(p_from date,p_to date) returns jsonb
-- Follow the existing payroll RPC boundary; private schema remains inaccessible.
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Login required.' using errcode='42501';end if;
 return private.payroll_handover_queue(p_from,p_to);
end $$;
revoke all on function public.get_payroll_handover_queue(date,date) from public,anon;
grant execute on function public.get_payroll_handover_queue(date,date) to authenticated;
