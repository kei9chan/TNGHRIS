-- A missing authenticated HRIS identity must never satisfy a nullable role check.
create or replace function public.get_payroll_missing_government_ids()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor public.hris_users;outp jsonb;
begin
 select * into actor from public.hris_users where id=public.current_hris_user_id();
 if actor.id is null or actor.role not in ('HR Manager','Admin') then
  raise exception 'HR Manager access required.' using errcode='42501';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('employeeId',h.id,'employeeName',h.full_name,'missing',
  array_remove(array[case when nullif(trim(h.tin),'') is null then 'TIN' end,
    case when nullif(trim(h.sss_no),'') is null then 'SSS' end,
    case when nullif(trim(h.philhealth_no),'') is null then 'PhilHealth' end,
    case when nullif(trim(h.pagibig_no),'') is null then 'Pag-IBIG' end],null)) order by h.full_name),'[]') into outp
 from public.hris_users h where exists (
  select 1 from public.payroll_gross_runs g cross join lateral jsonb_array_elements(g.result->'employees') e
  where e->>'employeeId'=h.id::text
    and g.id=(select g2.id from public.payroll_gross_runs g2 where g2.scope_id=g.scope_id order by g2.created_at desc limit 1)
 ) and (nullif(trim(h.tin),'') is null or nullif(trim(h.sss_no),'') is null
   or nullif(trim(h.philhealth_no),'') is null or nullif(trim(h.pagibig_no),'') is null);
 return outp;
end $$;
revoke all on function public.get_payroll_missing_government_ids() from public,anon;
grant execute on function public.get_payroll_missing_government_ids() to authenticated;
