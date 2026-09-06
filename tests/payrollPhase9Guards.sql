-- Installed pure functions and disposable constraint copies; no real payroll data.
begin;
set local statement_timeout='30s';
do $$declare source jsonb;inp jsonb;result jsonb;bad boolean;begin
 source:='[{"employeeId":"local-only","employeeName":"Local fixture","key":"total:net","label":"Net","amount":"100.01"}]';
 inp:='{"sourceRef":"Legacy evidence","coverageRef":"Full roster and component review","legacyEmployees":["local-only"],"rows":[{"employeeId":"local-only","key":"total:net","legacyAmount":"100.00","explanation":"","policyRef":""}]}';
 result:=private.payroll_compare_values(source,inp);
 if result#>>'{0,difference}'<>'0.01' or result#>>'{0,resolved}'<>'false' then raise exception 'Exact difference/unexplained blocker failed';end if;
 inp:=jsonb_set(jsonb_set(inp,'{rows,0,explanation}','"Rounding difference"'),'{rows,0,policyRef}','"Approved rounding source"');
 if private.payroll_compare_values(source,inp)#>>'{0,resolved}'<>'true' then raise exception 'Explained difference failed';end if;
 bad:=false;begin perform private.payroll_compare_values(source,inp||'{"legacyEmployees":["local-only","extra"]}');exception when raise_exception then bad:=true;end;if not bad then raise exception 'Extra legacy payee accepted';end if;
 bad:=false;begin perform private.payroll_compare_values(source,inp||'{"legacyEmployees":["local-only","local-only"]}');exception when raise_exception then bad:=true;end;if not bad then raise exception 'Duplicate payee accepted';end if;
 bad:=false;begin perform private.payroll_compare_values(source,jsonb_set(inp,'{rows,0,legacyAmount}','""'));exception when raise_exception then bad:=true;end;if not bad then raise exception 'Blank treated as zero';end if;
 bad:=false;begin perform private.payroll_compare_values(source,jsonb_set(inp,'{rows,0,legacyAmount}','"1.001"'));exception when raise_exception then bad:=true;end;if not bad then raise exception 'Excess precision accepted';end if;
 bad:=false;begin perform private.payroll_compare_values(source,jsonb_set(inp,'{rows,0,key}','"wrong"'));exception when raise_exception then bad:=true;end;if not bad then raise exception 'Wrong component accepted';end if;
 bad:=false;begin perform private.payroll_compare_values(source,inp||'{"rows":[]}');exception when raise_exception then bad:=true;end;if not bad then raise exception 'Missing rows accepted';end if;
 if not private.payroll_pilot_dates('2026-08-11','2026-08-25') or not private.payroll_pilot_dates('2026-08-26','2026-09-10') or not private.payroll_pilot_dates('2028-02-26','2028-03-10')
 or private.payroll_pilot_dates('2026-08-11','2026-08-24') or private.payroll_pilot_dates(null,null) then raise exception 'Cutoff boundary failure';end if;
 if private.payroll_live_window('00000000-0000-0000-0000-000000000001','2026-08-11','2026-08-25') then raise exception 'Uncertified live window allowed';end if;
 bad:=false;begin perform private.payroll_assert_live_window('00000000-0000-0000-0000-000000000001','{"kind":"regular","from":"2026-08-11","to":"2026-08-25"}');exception when insufficient_privilege then bad:=true;end;if not bad then raise exception 'Uncertified run accepted';end if;
end $$;
create temporary table phase9_mode_check(id uuid,kind text,processing_mode text);
create trigger certificate before insert or update of processing_mode on phase9_mode_check for each row execute function private.payroll_require_live_certificate();
insert into phase9_mode_check values('00000000-0000-0000-0000-000000000001','business_unit','off');
do $$declare bad boolean:=false;begin
 begin update phase9_mode_check set processing_mode='live';exception when raise_exception then bad:=true;end;if not bad then raise exception 'Direct mode bypass accepted';end if;
end $$;
create temporary table phase9_approval_check(like public.payroll_approval_runs including all);
insert into phase9_approval_check(scope_id,net_run_id,source_hash,source_snapshot,settlement_key,submitted_by,submission_ref,correction_contact,mode)
values('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','local','{}','local-key','00000000-0000-0000-0000-000000000003','Temporary verification','Temporary verification','shadow');
insert into phase9_approval_check(scope_id,net_run_id,source_hash,source_snapshot,settlement_key,submitted_by,submission_ref,correction_contact,mode)
select scope_id,net_run_id,source_hash,source_snapshot,settlement_key,submitted_by,submission_ref,correction_contact,'live' from phase9_approval_check;
do $$declare bad boolean:=false;begin
 begin insert into phase9_approval_check(scope_id,net_run_id,source_hash,source_snapshot,settlement_key,submitted_by,submission_ref,correction_contact,mode)
 select scope_id,net_run_id,source_hash,source_snapshot,settlement_key,submitted_by,submission_ref,correction_contact,'live' from phase9_approval_check limit 1;
 exception when unique_violation then bad:=true;end;if not bad then raise exception 'Duplicate live workflow accepted';end if;
end $$;
create temporary table phase9_accept_check(like public.payroll_comparison_acceptances including all);
insert into phase9_accept_check(comparison_id,duty,actor_id,reference) values('00000000-0000-0000-0000-000000000001','hr','00000000-0000-0000-0000-000000000002','Temporary verification');
do $$declare bad boolean:=false;begin
 begin insert into phase9_accept_check(comparison_id,duty,actor_id,reference) select comparison_id,'finance',actor_id,reference from phase9_accept_check;exception when unique_violation then bad:=true;end;if not bad then raise exception 'Same HR and Finance accepter allowed';end if;
end $$;
select 'PASS: exact comparison, incomplete/duplicate roster and missing component denial, literal amounts, cutoff boundaries, uncertified live denial, separate shadow/live workflow uniqueness and distinct HR/Finance acceptance.' as result;
rollback;
