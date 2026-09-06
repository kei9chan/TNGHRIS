begin read only;
set local statement_timeout='30s';
do $$declare login_id uuid;employee uuid;denied boolean;t text;definition text;sig text;begin
 select h.auth_user_id,h.id into strict login_id,employee from public.hris_users h where h.auth_user_id=(select g.auth_user_id from public.payroll_access_grants g where g.permission='manage_access' and g.revoked_at is null order by g.granted_at limit 1);
 if login_id=employee then raise exception 'Expected distinct login and employee identity test';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',login_id,'role','authenticated')::text,true);
 if public.current_hris_user_id()<>employee or private.payroll_actor_id()<>login_id then raise exception 'Identity mapping is inconsistent';end if;
 set local role authenticated;
 if jsonb_array_length(public.list_payroll_approvals())<>0 then raise exception 'Management-only approval disclosure';end if;
 if jsonb_array_length(public.list_my_payroll_payslips())<>0 then raise exception 'Unexpected release';end if;
 denied:=false;begin perform public.get_my_payroll_payslip('00000000-0000-0000-0000-000000000001');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Foreign/nonexistent payslip available';end if;
 denied:=false;begin perform public.act_on_payroll_approval('00000000-0000-0000-0000-000000000001',4,'approve','Read-only denied test');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'BOD management-only approval accepted';end if;
 denied:=false;begin perform public.record_payroll_disbursement('00000000-0000-0000-0000-000000000001','Read-only denied test',current_date,'0');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Payment gate bypassed';end if;
 reset role;
 foreach t in array array['payroll_approval_runs','payroll_approval_actions','payroll_disbursements','payroll_loan_postings','payroll_released_payslips'] loop
 if has_table_privilege('authenticated','public.'||t,'SELECT') or has_table_privilege('authenticated','public.'||t,'INSERT') or not(select relrowsecurity from pg_class where oid=('public.'||t)::regclass) then raise exception 'Raw access/RLS defect: %',t;end if;end loop;
 foreach sig in array array['public.prepare_payroll_net(uuid,text)','public.prepare_payroll_special(uuid,jsonb,text,uuid)','public.save_payroll_net_review(uuid,jsonb,text)','public.review_payroll_special(uuid,text)'] loop
 definition:=pg_get_functiondef(sig::regprocedure);if definition like '%private.payroll_actor_id()%' then raise exception 'Employee audit writer still uses login ID: %',sig;end if;end loop;
 if has_function_privilege('anon','public.get_my_payroll_payslip(uuid)','EXECUTE') or has_function_privilege('authenticated','private.payroll_approval_state(uuid)','EXECUTE') then raise exception 'Private or anonymous execution defect';end if;
 perform set_config('payroll_phase7.result','PASS: identity mapping, access denials, release denials, RLS and private/anonymous restrictions',true);
end $$;
select current_setting('payroll_phase7.result') as result;
rollback;
