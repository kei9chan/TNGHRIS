-- Read-only access denial checks using the existing management-only account.
begin read only;
set local statement_timeout='30s';
do $$
declare actor uuid;employee uuid;denied boolean;t text;c jsonb;
begin
 select id into strict actor from auth.users where lower(email)='kay@thenextperience.com';
 select id into strict employee from public.hris_users where auth_user_id=actor;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 set local role authenticated;
 c:=public.get_payroll_special_context();
 if jsonb_array_length(c->'employees')<>0 then raise exception 'Access management disclosed special-pay employee scope.';end if;
 denied:=false;begin perform public.get_payroll_special_context(employee);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Management-only employee disclosure.';end if;
 denied:=false;begin perform public.prepare_payroll_special(employee,'{}','Read-only denied check',null);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Management-only or own special-pay preparation.';end if;
 denied:=false;begin perform public.get_payroll_special_run('00000000-0000-0000-0000-000000000000');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Unauthorized saved-run access.';end if;
 denied:=false;begin perform public.review_payroll_special('00000000-0000-0000-0000-000000000000','Read-only denied check');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Unauthorized Finance check.';end if;
 reset role;
 foreach t in array array['payroll_special_runs','payroll_special_reviews'] loop
 if has_table_privilege('authenticated','public.'||t,'SELECT') or has_table_privilege('authenticated','public.'||t,'INSERT') or has_table_privilege('authenticated','public.'||t,'UPDATE') or not(select relrowsecurity from pg_class where oid=('public.'||t)::regclass) then raise exception 'Raw-table privilege / RLS defect: %',t;end if;end loop;
 if has_function_privilege('anon','public.get_payroll_special_context(uuid)','EXECUTE') or has_function_privilege('anon','public.prepare_payroll_special(uuid,jsonb,text,uuid)','EXECUTE') or has_function_privilege('authenticated','private.calculate_payroll_special_v1(jsonb)','EXECUTE') then raise exception 'Ungated special-pay function exposed.';end if;
 perform set_config('payroll_phase6.access','PASS: management-only, own preparation, unknown record and Finance denial; RLS and anonymous/private execution restrictions.',true);
end $$;
select current_setting('payroll_phase6.access') as result;
rollback;
