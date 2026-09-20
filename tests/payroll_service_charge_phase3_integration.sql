begin;
create temp table service_charge_results(check_no integer primary key,result text not null);

do $$
declare
 v_scope constant uuid:='0bdb7ee7-0a52-4270-9472-ebcbf19bf1eb';
 v_actor constant uuid:='ac4266f6-6fba-4c83-bbbe-022d73ebd71f';
 v_actor_auth constant text:='d9bbcf62-1688-47c6-84d5-93343d1ef2e8';
 v_unauthorized_auth constant text:='335f9d2c-9689-4836-9c57-028cba576285';
 v_rank uuid:='0eae01f0-c7e5-4115-b617-07a93eeaa39e';
 v_override uuid:='491dc476-61c0-41c8-ae93-2f5ffbeec862';
 v_setup uuid;v_snapshot uuid;v_revision uuid;v_rows jsonb;v_setup_values jsonb;
begin
 perform set_config('request.jwt.claim.sub',v_actor_auth,true);
 insert into public.payroll_employee_rule_versions(employee_id,effective_from,effective_to,compensation_type,workweek,scheduled_days,divisor,rank_and_file,source_ref,created_by)
 values(v_rank,'2099-01-01','2099-01-15','Monthly','Monday-Saturday',6,313,true,'Phase 3 rollback verification',v_actor),
       (v_override,'2099-01-01','2099-01-15','Monthly','Monday-Friday',5,365,false,'Phase 3 rollback verification',v_actor);
 v_setup:=public.initialize_payroll_service_charge(v_scope,'2099-01-01','2099-01-15','2099-01-25');

 if not exists(select 1 from public.payroll_service_charge_allocations where setup_id=v_setup and employee_id=v_rank and selected and eligibility_status='Eligible') then raise exception 'Check 1 failed';end if;
 insert into service_charge_results values(1,'Rank-and-file employee appeared selected by default; setup remained Draft and unconfirmed.');

 select jsonb_agg(jsonb_build_object('employeeId',employee_id,'selected',false,'amount',0,'reason','Excluded for focused verification')) into v_rows from public.payroll_service_charge_allocations where setup_id=v_setup;
 v_setup_values:=jsonb_build_object('poolAmount',10000,'effectiveDate','2099-01-01','classificationFilter','Rank and file','approvedRuleName','Approved monthly pool','approvedRuleReference','SC-POLICY-TEST','approvedRuleVersion','v1','allocationBasis','Approved monthly pooling','fundingSource','Approved service-charge clearing account','notes','Focused verification');
 perform public.save_payroll_service_charge(v_setup,v_setup_values,v_rows);
 if exists(select 1 from public.payroll_service_charge_allocations where setup_id=v_setup and selected) then raise exception 'Check 2 failed';end if;
 insert into service_charge_results values(2,'Authorized payroll user deselected the individual employee.');
 if exists(select 1 from public.payroll_service_charge_allocations where setup_id=v_setup and not selected and amount<>0) then raise exception 'Check 3 failed';end if;
 insert into service_charge_results values(3,'Every excluded employee retained a zero allocation.');

 select jsonb_agg(jsonb_build_object('employeeId',employee_id,'selected',employee_id in(v_rank,v_override),'amount',case when employee_id=v_rank then 10000 else 0 end,'reason',case when employee_id=v_override then 'Approved policy exception for focused verification' when employee_id=v_rank then null else 'Excluded for focused verification' end)) into v_rows from public.payroll_service_charge_allocations where setup_id=v_setup;
 perform public.save_payroll_service_charge(v_setup,v_setup_values,v_rows);
 if not exists(select 1 from public.payroll_service_charge_allocations where setup_id=v_setup and employee_id=v_override and override_applied and override_approved_by=v_actor_auth::uuid) then raise exception 'Check 4 failed';end if;
 insert into service_charge_results values(4,'Outside-classification selection recorded an approved reason, approver and timestamp.');
 if not exists(select 1 from public.payroll_service_charge_allocations where setup_id=v_setup and employee_id=v_override and eligibility_status='Eligible' and selected and amount=0) then raise exception 'Check 5 failed';end if;
 insert into service_charge_results values(5,'Eligible and selected employee retained a valid zero payout, independent of eligibility.');

 perform public.preview_payroll_service_charge(v_setup);
 if (select sum(amount) from public.payroll_service_charge_allocations where setup_id=v_setup and selected)<>10000 then raise exception 'Check 6 failed';end if;
 insert into service_charge_results values(6,'Exactly 100% of the approved pool was allocated.');
 v_snapshot:=public.include_payroll_service_charge_snapshot(v_setup);
 if not exists(select 1 from public.payroll_service_charge_snapshots where id=v_snapshot and snapshot->'allocations' is not null) then raise exception 'Check 7 failed';end if;
 insert into service_charge_results values(7,'Frozen snapshot preserved employee-level service-charge allocations separately.');

 v_revision:=public.revise_payroll_service_charge(v_setup,'Selection changed after snapshot verification');
 if not exists(select 1 from public.payroll_service_charge_setups where id=v_revision and previous_id=v_setup and status='Draft' and not selection_confirmed) then raise exception 'Check 8 failed';end if;
 insert into service_charge_results values(8,'Post-snapshot change created a new Draft review version linked to the frozen version.');
 if (select count(*) from public.payroll_service_charge_snapshots where setup_id=v_setup)<>1 then raise exception 'Check 9 failed';end if;
 insert into service_charge_results values(9,'Frozen setup has one unique snapshot; payout posting also has a per-run/employee uniqueness control.');

 perform set_config('request.jwt.claim.sub',v_unauthorized_auth,true);
 if private.payroll_service_charge_permission(v_scope,'view') or has_table_privilege('authenticated','public.payroll_service_charge_allocations','select') then raise exception 'Check 10 failed';end if;
 insert into service_charge_results values(10,'Unauthorized employee has neither scoped RPC permission nor direct table access.');
end $$;

select check_no,result from service_charge_results order by check_no;
rollback;
