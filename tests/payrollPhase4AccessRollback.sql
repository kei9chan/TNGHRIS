-- Read-only real-account authorization checks. No source records or grants change.
begin read only;
set local statement_timeout='30s';
do $test$
declare actor uuid;scope uuid;denied boolean;context jsonb;
begin
 select id into strict actor from auth.users where lower(email)='kay@thenextperience.com';
 select id into strict scope from payroll_access_scopes where kind='business_unit' order by id limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 set local role authenticated;
 context:=public.get_payroll_gross_context();
 if jsonb_array_length(context->'scopes')=0 then raise exception 'Access manager cannot see setup scopes';end if;
 if exists(select 1 from jsonb_array_elements(context->'scopes') s where (s->>'canPrepare')::boolean or (s->>'canView')::boolean) then raise exception 'Management alone gained salary access';end if;
 perform public.get_payroll_phase_progress();
 denied:=false;begin perform public.list_payroll_gross_runs(scope);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Management alone disclosed payroll';end if;
 denied:=false;begin perform public.prepare_payroll_gross('00000000-0000-0000-0000-000000000000','Read-only denied operation');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Unauthorized preparation accepted';end if;
 if public.check_payroll_operation('prepare_pr',scope,'calculate') or public.check_payroll_operation('release_payroll',scope,'payment') then raise exception 'Off scope allowed processing';end if;
 denied:=false;begin perform public.get_payroll_gross_run('00000000-0000-0000-0000-000000000000');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Unknown run disclosed data';end if;
 reset role;
 if has_table_privilege('authenticated','public.payroll_gross_runs','SELECT') or has_table_privilege('authenticated','public.payroll_gross_runs','INSERT') or has_table_privilege('authenticated','public.payroll_gross_rules','INSERT') or has_function_privilege('anon','public.get_payroll_gross_run(uuid)','EXECUTE') then raise exception 'Raw/anonymous payroll access exposed';end if;
 perform set_config('request.jwt.claims','{"role":"anon"}',true);
 set local role anon;
 denied:=false;begin perform public.get_payroll_gross_context();exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous context allowed';end if;
 reset role;
 perform set_config('payroll_phase4.result','PASS: read-only real-account management visibility, salary/preparation denial, off-mode gates, invalid-run denial and raw/anonymous privilege checks; no records changed',true);
end $test$;
select current_setting('payroll_phase4.result') as result;
rollback;
