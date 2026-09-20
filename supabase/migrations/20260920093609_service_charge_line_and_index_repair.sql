create index payroll_service_charge_setup_previous on public.payroll_service_charge_setups(previous_id) where previous_id is not null;
create index payroll_service_charge_setup_created_by on public.payroll_service_charge_setups(created_by);
create index payroll_service_charge_setup_updated_by on public.payroll_service_charge_setups(updated_by);
create index payroll_service_charge_setup_confirmed_by on public.payroll_service_charge_setups(confirmed_by) where confirmed_by is not null;
create index payroll_service_charge_allocation_override_by on public.payroll_service_charge_allocations(override_approved_by) where override_approved_by is not null;
create index payroll_service_charge_snapshot_scope on public.payroll_service_charge_snapshots(scope_id,period_from,period_to);
create index payroll_service_charge_snapshot_created_by on public.payroll_service_charge_snapshots(created_by);
create index payroll_service_charge_posting_snapshot on public.payroll_service_charge_postings(snapshot_id);
create index payroll_service_charge_posting_employee on public.payroll_service_charge_postings(employee_id);
create index payroll_service_charge_posting_released_by on public.payroll_service_charge_postings(released_by);
create index payroll_service_charge_audit_snapshot on public.payroll_service_charge_audit(snapshot_id) where snapshot_id is not null;
create index payroll_service_charge_audit_actor on public.payroll_service_charge_audit(actor_id);

create or replace function private.calculate_payroll_gross_v1(snap jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare v_result jsonb;v_sc jsonb:=snap->'serviceCharge';v_emp jsonb;v_a jsonb;v_line jsonb;v_employees jsonb:='[]';v_amount numeric;v_gross numeric;
begin
 v_result:=private.calculate_payroll_gross_without_service_charge_phase3(snap);
 if v_sc is null then return v_result;end if;
 for v_emp in select value from jsonb_array_elements(v_result->'employees') loop
  select value into v_a from jsonb_array_elements(v_sc->'allocations') where value->>'employeeId'=v_emp->>'employeeId' and (value->>'selected')::boolean;
  if v_a is not null then
   v_amount:=(v_a->>'amount')::numeric;
   v_line:=private.payroll_gross_line('Service Charge',1,v_amount,1,jsonb_build_object('kind','earning','sourceKind','service_charge','snapshotId',v_sc->>'snapshotId','ruleReference',v_sc->>'approved_rule_reference','allocationBasis',v_sc->>'allocation_basis'));
   v_emp:=jsonb_set(v_emp,'{lines}',coalesce(v_emp->'lines','[]'::jsonb)||jsonb_build_array(v_line));
   if v_emp->>'gross' is not null then v_emp:=jsonb_set(v_emp,'{gross}',to_jsonb(((v_emp->>'gross')::numeric+v_amount)::text));end if;
  end if;
  v_employees:=v_employees||jsonb_build_array(v_emp);v_a:=null;
 end loop;
 v_result:=jsonb_set(v_result,'{employees}',v_employees);
 if v_result->>'gross' is not null then
  v_gross:=(v_result->>'gross')::numeric+(v_sc->>'pool_amount')::numeric;
  v_result:=jsonb_set(v_result,'{gross}',to_jsonb(v_gross::text));
 end if;
 return v_result||jsonb_build_object('serviceChargeSnapshotId',v_sc->>'snapshotId','serviceChargePool',v_sc->>'pool_amount');
end $$;

revoke all on function private.calculate_payroll_gross_v1(jsonb) from public,anon,authenticated;
