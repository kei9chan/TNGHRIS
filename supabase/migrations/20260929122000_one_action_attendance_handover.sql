-- Combine existing save + submit in one atomic action; retain existing finalizer authority.
create function public.prepare_payroll_attendance_for_calculation(p_scope uuid,p_from date,p_to date,p_source_hash text,p_note text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare id uuid;
begin
 if auth.uid() is null or not private.payroll_time_permission(p_scope,'finalize') then raise exception 'The assigned HR timekeeping finalizer must hand over attendance.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_scope::text,3));
 if exists(select 1 from private.payroll_attendance_import_reviews where scope_id=p_scope and date_from<=p_to and date_to>=p_from and status in('pending_hr_manager','pending_bod')) then raise exception 'Attendance fixes still await approval. Complete those decisions before calculating payroll.';end if;
 id:=public.save_payroll_time_package(p_scope,p_from,p_to,p_source_hash,coalesce(nullif(btrim(p_note),''),'Verified attendance handed to payroll through Prepare'));
 perform public.submit_payroll_time_package(id);
 return id;
end $$;
revoke all on function public.prepare_payroll_attendance_for_calculation(uuid,date,date,text,text) from public,anon;
grant execute on function public.prepare_payroll_attendance_for_calculation(uuid,date,date,text,text) to authenticated;
notify pgrst,'reload schema';
