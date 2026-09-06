begin read only;
set local statement_timeout='30s';
do $test$
declare actor uuid;employee uuid;denied boolean;t text;
begin
 select id into strict actor from auth.users where lower(email)='kay@thenextperience.com';
 select id into strict employee from hris_users where auth_user_id=actor;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 set local role authenticated;
 denied:=false;begin perform public.get_payroll_net_workspace('00000000-0000-0000-0000-000000000000');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Management-only salary disclosure';end if;
 denied:=false;begin perform public.prepare_payroll_net('00000000-0000-0000-0000-000000000000','Read-only denied check');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Management-only net calculation';end if;
 denied:=false;begin perform public.save_payroll_net_review('00000000-0000-0000-0000-000000000000','{}','Read-only denied check');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Unauthorized Finance review';end if;
 denied:=false;begin perform public.record_payroll_loan_balance(employee,'Denied example',current_date,'0','1','Read-only denied check');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Unauthorized/own loan balance write';end if;
 reset role;
 foreach t in array array['payroll_net_reviews','payroll_loan_ledger','payroll_net_runs'] loop
 if has_table_privilege('authenticated','public.'||t,'SELECT') or has_table_privilege('authenticated','public.'||t,'INSERT') or not (select relrowsecurity from pg_class where oid=('public.'||t)::regclass) then raise exception 'Raw access / RLS defect: %',t;end if;end loop;
 if has_function_privilege('anon','public.prepare_payroll_net(uuid,text)','EXECUTE') or has_function_privilege('authenticated','private.calculate_payroll_net_v1(jsonb)','EXECUTE') then raise exception 'Ungated calculation exposed';end if;
 perform set_config('payroll_phase5.access','PASS: read-only management/own-loan/preparation/review denial, raw-table RLS and anonymous/private-function restrictions; no source or access changes.',true);
end $test$;
select current_setting('payroll_phase5.access') as result;
rollback;
