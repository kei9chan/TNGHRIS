begin read only;
set local statement_timeout='30s';
do $$declare login_id uuid;s jsonb;denied boolean;t text;signature text;begin
 select auth_user_id into strict login_id from public.payroll_access_grants where permission='manage_access' and revoked_at is null order by granted_at limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',login_id,'role','authenticated')::text,true);
 set local role authenticated;
 s:=public.get_payroll_output_setup();if jsonb_array_length(s->'scopes')<>0 or jsonb_array_length(s->'owners')<>0 then raise exception 'Management-only output access';end if;
 denied:=false;begin perform public.get_payroll_payment_workspace('00000000-0000-0000-0000-000000000001');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Unknown payment workspace exposed';end if;
 denied:=false;begin perform public.create_payroll_payment_batch('00000000-0000-0000-0000-000000000001','Read-only denied test');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Unauthorized batch creation';end if;
 denied:=false;begin perform public.download_payroll_output('00000000-0000-0000-0000-000000000001');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Unknown export exposed';end if;
 denied:=false;begin perform public.record_payroll_output_process('00000000-0000-0000-0000-000000000001','bank','00000000-0000-0000-0000-000000000001','Read-only denied test');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Management-only process assignment';end if;
 reset role;
 foreach t in array array['payroll_payment_batches','payroll_payment_closures','payroll_payment_attempts','payroll_payment_events','payroll_loan_posting_adjustments','payroll_output_processes','payroll_output_exports','payroll_output_downloads'] loop
 if has_table_privilege('authenticated','public.'||t,'SELECT') or has_table_privilege('authenticated','public.'||t,'INSERT') or has_table_privilege('anon','public.'||t,'SELECT')
 or not(select relrowsecurity from pg_class where oid=('public.'||t)::regclass) then raise exception 'RLS/raw access defect: %',t;end if;end loop;
 foreach signature in array array['private.payroll_finish_disbursement(uuid,text,date,text)','private.payroll_original_my_payslip(uuid)','private.payroll_original_approval_state(uuid)','private.payroll_payment_authority(uuid,boolean)'] loop
 if has_function_privilege('authenticated',signature,'EXECUTE') then raise exception 'Private helper exposed: %',signature;end if;end loop;
 if has_function_privilege('anon','public.create_payroll_output(uuid,text)','EXECUTE') then raise exception 'Anonymous output creation';end if;
 if exists(select 1 from public.payroll_access_scopes where processing_mode<>'off') then raise exception 'Expected production processing off';end if;
 perform set_config('payroll_phase8.result','PASS: management-only denial, protected outputs, RLS/private-helper/anonymous restrictions and processing off',true);
end $$;
select current_setting('payroll_phase8.result') as result;
rollback;
