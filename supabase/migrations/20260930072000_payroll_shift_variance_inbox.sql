-- Manager inbox for moved shifts, independent of payroll-wide HR access.
set local lock_timeout='5s';
set local statement_timeout='30s';
create function public.get_my_payroll_shift_variances() returns jsonb
language sql stable security definer set search_path='' as $$
 select case when auth.uid() is null then '[]'::jsonb else coalesce(jsonb_agg(jsonb_build_object(
  'id',r.id,'employee',e.full_name,'workDate',r.work_date,'businessUnit',b.name,
  'originalStart',r.original_shift->>'start','originalEnd',r.original_shift->>'end',
  'proposedStart',r.proposed_start,'proposedEnd',r.proposed_end,'reason',r.reason,
  'submittedAt',r.submitted_at) order by r.submitted_at desc),'[]'::jsonb) end
 from private.payroll_shift_variance_reviews r
 join public.hris_users e on e.id=r.employee_id
 join public.payroll_access_scopes s on s.id=r.scope_id
 left join public.business_units b on b.id=s.business_unit_id
 where r.status='pending' and r.manager_id=public.current_hris_user_id()
 and r.submitted_by<>r.manager_id and r.employee_id<>r.manager_id
 and private.is_direct_reporting_manager(r.manager_id,r.employee_id)
$$;
revoke all on function public.get_my_payroll_shift_variances() from public,anon;
grant execute on function public.get_my_payroll_shift_variances() to authenticated;
