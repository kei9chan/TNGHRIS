-- The separate release duty needs read access to the approved payroll and its
-- freshness check. Existing HRIS salary, Timekeeping and employee-scope checks stay.
-- Verified before this migration: zero active release_payroll grants; the only
-- current Payroll Access grant is organization manage_access. No existing account
-- gains access. The user's Phase 7 Finance-disbursement flow needs this read path.
-- Abort if that verified precondition changes; never assign/revoke any duty here.
do $$begin
 if exists(select 1 from public.payroll_access_grants where permission='release_payroll' and revoked_at is null) then
 raise exception 'Release assignments changed since inspection; review their exact scopes before applying this addition.';end if;
end $$;
do $$declare sig text;ddl text;begin
 foreach sig in array array['private.payroll_time_permission(uuid,text)','private.payroll_gross_permission(uuid,text)'] loop
 ddl:=pg_get_functiondef(sig::regprocedure);
 if ddl not like '%''approve_bod'']%' then raise exception 'Payroll view-duty definition changed; inspect before extending it.';end if;
 ddl:=replace(ddl,'''approve_bod'']','''approve_bod'',''release_payroll'']');
 ddl:=replace(ddl,'private.payroll_has_access(d,p_scope)',
 '(private.payroll_has_access(d,p_scope) and (d<>''release_payroll'' or private.workflow_user_has_role(public.current_hris_user_id(),''Finance Staff'')))');
 execute ddl;
 end loop;end $$;
notify pgrst,'reload schema';
