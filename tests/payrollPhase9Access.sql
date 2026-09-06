begin read only;
set local statement_timeout='30s';
do $$declare login_id uuid;scope_id uuid;s jsonb;bad boolean;sig text;t text;begin
 select auth_user_id into strict login_id from public.payroll_access_grants where permission='manage_access' and revoked_at is null order by granted_at limit 1;
 select id into strict scope_id from public.payroll_access_scopes where kind='business_unit' order by id limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',login_id,'role','authenticated')::text,true);set local role authenticated;
 s:=public.get_payroll_pilot_workspace(scope_id);
 if jsonb_array_length(s->'comparisons')<>0 or jsonb_array_length(s->'proposals')<>0 or nullif(s->>'blockedReason','') is null then raise exception 'Management-only salary denial failed';end if;
 bad:=false;begin perform public.get_payroll_comparison_template('00000000-0000-0000-0000-000000000001');exception when insufficient_privilege then bad:=true;end;if not bad then raise exception 'Unknown source exposed';end if;
 bad:=false;begin perform public.propose_payroll_pilot(scope_id,null,null,current_date,current_date,'{}');exception when insufficient_privilege then bad:=true;end;if not bad then raise exception 'Management-only pilot proposal allowed';end if;
 bad:=false;begin perform public.activate_payroll_pilot('00000000-0000-0000-0000-000000000001','Read-only unauthorized check');exception when insufficient_privilege then bad:=true;end;if not bad then raise exception 'Unknown activation allowed';end if;
 bad:=false;begin perform public.review_payroll_pilot('00000000-0000-0000-0000-000000000001',null,'hr','Read-only unauthorized check');exception when insufficient_privilege then bad:=true;end;if not bad then raise exception 'Unknown monitoring allowed';end if;
 if public.check_payroll_operation('release_payroll',scope_id,'payment') then raise exception 'Payment enabled';end if;
 reset role;
 foreach t in array array['payroll_comparisons','payroll_comparison_acceptances','payroll_pilot_proposals','payroll_pilot_decisions','payroll_pilot_activations','payroll_pilot_monitoring','payroll_pilot_promotions'] loop
 if has_table_privilege('authenticated','public.'||t,'SELECT') or has_table_privilege('authenticated','public.'||t,'INSERT') or has_table_privilege('anon','public.'||t,'SELECT') or not(select relrowsecurity from pg_class where oid=('public.'||t)::regclass) then raise exception 'Table privilege/RLS defect: %',t;end if;end loop;
 foreach sig in array array['private.payroll_comparison_ready(uuid,boolean)','private.payroll_pilot_proof(uuid,uuid,uuid,date,date,jsonb)','private.payroll_live_window(uuid,date,date)','private.payroll_phase8_approval_state(uuid)','private.payroll_pilot_payment_proof(uuid,uuid)'] loop
 if has_function_privilege('authenticated',sig,'EXECUTE') then raise exception 'Private helper exposed: %',sig;end if;end loop;
 if has_function_privilege('anon','public.get_payroll_pilot_workspace(uuid)','EXECUTE') then raise exception 'Anonymous pilot access';end if;
 if exists(select 1 from public.payroll_access_scopes where processing_mode<>'off') or exists(select 1 from public.payroll_pilot_activations) or exists(select 1 from public.payroll_comparisons) then raise exception 'Production evidence/mode changed';end if;
 perform set_config('payroll_phase9.result','PASS: manager-only salary denial, unauthorized pilot proposal/activation/monitoring denial, anonymous/private-helper/RLS restrictions; all nine scopes off and no fake comparison or activation records.',true);
end $$;
select current_setting('payroll_phase9.result') result;
rollback;
