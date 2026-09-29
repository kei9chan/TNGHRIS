-- RLS executes as the signed-in role. Keep the actor-parameter helper private;
-- expose only a current-session predicate for the SELECT policy.
create function private.current_actor_can_read_assigned_ot(p_request uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null
   and public.current_hris_user_id() is not null
   and private.is_active_time_request_approver(public.current_hris_user_id(),'overtime',p_request)
$$;
revoke all on function private.current_actor_can_read_assigned_ot(uuid) from public,anon;
grant execute on function private.current_actor_can_read_assigned_ot(uuid) to authenticated;
drop policy ot_authorized_view on public.ot_requests;
create policy ot_authorized_view on public.ot_requests for select to authenticated using (
 employee_id=public.current_hris_user_id()
 or private.can_read_ot_report(employee_id,business_unit_id)
 or private.current_actor_can_read_assigned_ot(id)
);
notify pgrst,'reload schema';
