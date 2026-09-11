create or replace function public.get_schedule_publication_history(p_employee uuid,p_week date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.payroll_schedule_can_read(p_employee) then raise exception 'You do not have permission to view schedules for this scope.' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('version',p.version,'publishedAt',p.published_at,'publisher',u.full_name,'note',p.reference,'from',p.effective_from,'to',p.effective_to,'approvalRequired',p.approval_required,'decision',o.decision,'reviewedAt',o.created_at) order by p.version desc),'[]') from public.payroll_schedule_publications p left join public.hris_users u on u.id=p.published_by left join public.payroll_schedule_overrides o on o.publication_id=p.id where p.employee_id=p_employee and p.effective_from=p_week);
end $$;
revoke all on function public.get_schedule_publication_history(uuid,date) from public,anon;
grant execute on function public.get_schedule_publication_history(uuid,date) to authenticated;
