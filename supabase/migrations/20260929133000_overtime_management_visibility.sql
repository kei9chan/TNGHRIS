-- Explicit OT reporting access; approval/write policies are unchanged.
create function private.ot_reporting_scope() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id();global_view boolean;manager_view boolean;units jsonb;
begin
 if auth.uid() is null or actor is null then return jsonb_build_object('overview',false,'global',false,'businessUnits','[]'::jsonb);end if;
 global_view:=public.current_hris_roles() && array['Admin','HR Staff','HR Manager','Board of Director'];
 manager_view:=public.current_hris_roles() && array['Manager','Manager/Team Leader','Business Unit Manager','GeneralManager','General Manager','Operations Director'];
 select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name) order by b.name),'[]') into units from public.business_units b
 where global_view or (manager_view and (
  exists(select 1 from public.hris_users u where u.id=actor and u.business_unit_id=b.id)
  or exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id and r.is_active where ur.user_id=actor and ur.is_active and ur.role_id=any(array['Manager','Manager/Team Leader','Business Unit Manager','GeneralManager','General Manager','Operations Director']) and ur.scope_type='SPECIFIC' and b.id=any(ur.allowed_business_unit_ids))
  or exists(select 1 from public.org_chart_assignments a where a.user_id=actor and a.business_unit_id=b.id and a.is_approved and a.effective_from<=(now() at time zone 'Asia/Manila')::date and (a.effective_until is null or a.effective_until>=(now() at time zone 'Asia/Manila')::date))
 ));
 return jsonb_build_object('overview',global_view or manager_view,'global',global_view,'businessUnits',units);
end $$;
revoke all on function private.ot_reporting_scope() from public,anon,authenticated;
create function public.get_ot_reporting_scope() returns jsonb language sql stable security definer set search_path='' as $$select private.ot_reporting_scope()$$;
revoke all on function public.get_ot_reporting_scope() from public,anon;
grant execute on function public.get_ot_reporting_scope() to authenticated;
create function private.can_read_ot_report(p_employee uuid,p_bu uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare scope jsonb;bu uuid:=p_bu;
begin
 if auth.uid() is null or public.current_hris_user_id() is null then return false;end if;
 scope:=private.ot_reporting_scope();
 if coalesce((scope->>'global')::boolean,false) then return true;end if;
 if bu is null then select business_unit_id into bu from public.hris_users where id=p_employee;end if;
 return exists(select 1 from jsonb_array_elements(scope->'businessUnits')b where b->>'id'=bu::text);
end $$;
revoke all on function private.can_read_ot_report(uuid,uuid) from public,anon;
grant execute on function private.can_read_ot_report(uuid,uuid) to authenticated;
drop policy ot_authorized_view on public.ot_requests;
create policy ot_authorized_view on public.ot_requests for select to authenticated using(
 employee_id=public.current_hris_user_id()
 or private.can_read_ot_report(employee_id,business_unit_id)
 or private.is_active_time_request_approver(public.current_hris_user_id(),'overtime',id)
);
notify pgrst,'reload schema';
-- Legacy requests have no BU snapshot. Resolve their employee BU for display
-- without requiring broad employee-directory access or rewriting request history.
create function public.list_visible_ot_requests(p_offset integer default 0,p_limit integer default 500)
returns setof jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id();scope jsonb:=private.ot_reporting_scope();
begin
 if auth.uid() is null or actor is null then raise exception 'Sign in to view overtime requests.' using errcode='42501';end if;
 if p_offset<0 or p_limit not between 1 and 500 then raise exception 'Invalid request page.';end if;
 return query select to_jsonb(o)||jsonb_build_object('business_unit_id',coalesce(o.business_unit_id,h.business_unit_id),'position',h.position)
 from public.ot_requests o left join public.hris_users h on h.id=o.employee_id
 where o.employee_id=actor or coalesce((scope->>'global')::boolean,false)
 or exists(select 1 from jsonb_array_elements(scope->'businessUnits')b where b->>'id'=coalesce(o.business_unit_id,h.business_unit_id)::text)
 or private.is_active_time_request_approver(actor,'overtime',o.id)
 order by o.created_at desc,o.id offset p_offset limit p_limit;
end $$;
revoke all on function public.list_visible_ot_requests(integer,integer) from public,anon;
grant execute on function public.list_visible_ot_requests(integer,integer) to authenticated;
notify pgrst,'reload schema';
