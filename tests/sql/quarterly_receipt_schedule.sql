-- Pure dates and ACL checks; no employee, role, receipt or payroll writes.
begin;
do $$
declare v jsonb;r record;
begin
 for r in select * from (values
 ('2026-04-11'::date,'2026-04-25'::date,'2026-01-01','2026-03-31','2026-04-15'),
 ('2026-07-11'::date,'2026-07-25'::date,'2026-04-01','2026-06-30','2026-07-15'),
 ('2026-10-11'::date,'2026-10-25'::date,'2026-07-01','2026-09-30','2026-10-15'),
 ('2027-01-11'::date,'2027-01-25'::date,'2026-10-01','2026-12-31','2027-01-15')) x(f,t,qf,qt,deadline) loop
  v:=private.payroll_receipt_quarter(r.f,r.t);
  if v->>'from'<>r.qf or v->>'to'<>r.qt or v->>'deadline'<>r.deadline then raise exception 'Quarter/date mismatch: %',v;end if;
 end loop;
 if private.payroll_receipt_quarter('2026-09-26','2026-10-10') is not null or private.payroll_receipt_quarter('2026-10-26','2026-11-10') is not null or private.payroll_receipt_quarter('2026-11-11','2026-11-25') is not null then raise exception 'Ordinary payroll incorrectly gated';end if;
 if private.payroll_reimbursement_requirements('{"dateFrom":"2026-11-11","dateTo":"2026-11-25","packages":[{"components":[{"category":"reimbursable_allowance","amount":"1000"}]}]}'::jsonb)<>'[]'::jsonb then raise exception 'Ordinary cutoff incorrectly needs receipts';end if;
 if has_function_privilege('anon','public.confirm_payroll_reimbursement_quarter_target(uuid,uuid,text,numeric,text,bigint)','execute') or has_table_privilege('authenticated','private.payroll_reimbursement_quarter_targets','select') then raise exception 'Quarterly finance access exposed';end if;
end $$;
select 'PASS: all four requested quarters/deadlines, only containing cutoff gated, ordinary payroll not gated, private Finance target ACL' result;
rollback;
