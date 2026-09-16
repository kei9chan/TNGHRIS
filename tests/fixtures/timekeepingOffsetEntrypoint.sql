-- Existing scoped offset entrypoint, captured before Phase 3.
CREATE OR REPLACE FUNCTION public.get_my_payroll_offset_reviews()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if private.payroll_actor_id() is null then raise exception 'Active login required.' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'employeeName',h.full_name,'date',o.date,'minutes',c.eligible_minutes,'complete',private.payroll_offset_complete(c.id),'current',c.source_hash=md5(private.payroll_time_sources(c.scope_id,o.date,o.date)::text),'isSelf',c.employee_id=public.current_hris_user_id(),'actions',coalesce((select jsonb_agg(jsonb_build_object('stage',a.stage,'decision',a.decision,'createdAt',a.created_at) order by a.created_at,a.id) from public.payroll_offset_actions a where a.case_id=c.id),'[]')) order by c.created_at desc)
 from public.payroll_offset_cases c join public.hris_users h on h.id=c.employee_id join public.ot_requests o on o.id=c.ot_request_id
 where public.can_access_hris_user(c.employee_id) and (c.employee_id=public.current_hris_user_id() or private.payroll_time_permission(c.scope_id,'finalize') or private.payroll_offset_role(private.payroll_actor_id(),'HR Manager') or private.payroll_offset_role(private.payroll_actor_id(),'General Manager') or private.payroll_offset_role(private.payroll_actor_id(),'Board of Director'))),'[]');
end $function$;
