-- Avoid a second calculation for payrolls with no receipt-based components.
set local lock_timeout='5s';
create or replace function private.payroll_reimbursement_requirements(snap jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
begin
 if not exists(select 1 from jsonb_array_elements(coalesce(snap->'packages','[]')) p cross join lateral jsonb_array_elements(coalesce(p->'components','[]')) c where private.payroll_is_reimbursement_component(c)) then return '[]'::jsonb;end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('employeeId',e->>'employeeId','employeeName',e->>'employeeName',
 'requiredAmount',v.amount::text,'calculationReady',jsonb_array_length(coalesce(e->'issues','[]'))=0) order by e->>'employeeId'),'[]')
 from jsonb_array_elements(private.calculate_payroll_gross_v1(snap)->'employees') e
 cross join lateral (select round(coalesce(sum(case when l->>'rounding'='employee_total_half_up' then (l->>'unrounded')::numeric else (l->>'amount')::numeric end),0),2) amount from jsonb_array_elements(e->'lines') l where private.payroll_is_reimbursement_component(l->'component')) v
 where v.amount>0);
end $$;

-- These RPC-only tables intentionally deny direct row access.
create policy rpc_only on private.payroll_reimbursement_evidence for all to anon,authenticated using(false) with check(false);
create policy rpc_only on private.payroll_reimbursement_evidence_audit for all to anon,authenticated using(false) with check(false);
