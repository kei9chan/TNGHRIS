-- Standing requirements repeat the target amount; evidence remains specific to each quarter.
set local lock_timeout='5s';
create table private.payroll_reimbursement_standing_requirements (
 id uuid primary key default gen_random_uuid(),revision bigserial not null unique,
 employee_id uuid not null references public.hris_users(id),effective_from date not null,
 required_amount numeric(14,2) not null check(required_amount>=0),
 basis_reference text not null check(length(btrim(basis_reference)) between 3 and 2000),
 approved_by uuid not null references public.hris_users(id),approved_at timestamptz not null default clock_timestamp(),
 check(effective_from=date_trunc('quarter',effective_from)::date)
);
create index payroll_reimbursement_standing_employee_effective on private.payroll_reimbursement_standing_requirements(employee_id,effective_from desc,revision desc);
alter table private.payroll_reimbursement_standing_requirements enable row level security;
revoke all on private.payroll_reimbursement_standing_requirements from public,anon,authenticated;
create policy rpc_only on private.payroll_reimbursement_standing_requirements for all to anon,authenticated using(false) with check(false);
create trigger immutable before update or delete on private.payroll_reimbursement_standing_requirements for each row execute function private.payroll_audit_immutable();

create function private.payroll_quarter_receipt_targets(p_scope uuid,p_from date,p_to date,p_employees jsonb) returns jsonb
language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(record order by record->>'employee_id'),'[]') from (
  select to_jsonb(t) record from private.payroll_reimbursement_quarter_targets t
  where t.scope_id=p_scope and t.quarter_from=p_from and exists(select 1 from jsonb_array_elements(p_employees) e where e->>'id'=t.employee_id::text)
  union all
  select jsonb_build_object('id',d.id,'scope_id',p_scope,'quarter_from',p_from,'quarter_to',p_to,'employee_id',d.employee_id,
    'required_amount',d.required_amount,'basis_reference',d.basis_reference,'revision',-d.revision,
    'confirmed_by',d.approved_by,'confirmed_at',d.approved_at,'target_source','standing_requirement')
  from (select distinct on (employee_id) * from private.payroll_reimbursement_standing_requirements
    where effective_from<=p_from order by employee_id,effective_from desc,revision desc) d
  where exists(select 1 from jsonb_array_elements(p_employees) e where e->>'id'=d.employee_id::text)
   and not exists(select 1 from private.payroll_reimbursement_quarter_targets t where t.scope_id=p_scope and t.quarter_from=p_from and t.employee_id=d.employee_id)
 ) x
$$;
revoke all on function private.payroll_quarter_receipt_targets(uuid,date,date,jsonb) from public,anon,authenticated;

do $$declare ddl text;needle text;fn regprocedure;begin
 ddl:=pg_get_functiondef('private.payroll_quarter_receipt_context(uuid,date,date)'::regprocedure);
 needle:=$needle$select coalesce(jsonb_agg(to_jsonb(t) order by t.employee_id),'[]') into targets from private.payroll_reimbursement_quarter_targets t where t.scope_id=p_scope and t.quarter_from=(q->>'from')::date and exists(select 1 from jsonb_array_elements(employees) e where e->>'id'=t.employee_id::text);$needle$;
 if position(needle in ddl)=0 then raise exception 'Unexpected quarterly context definition';end if;
 execute replace(ddl,needle,$replacement$targets:=private.payroll_quarter_receipt_targets(p_scope,(q->>'from')::date,(q->>'to')::date,employees);$replacement$);
 -- A quarter-specific Finance confirmation can override an inherited standing target.
 foreach fn in array array['private.confirm_payroll_reimbursement_quarter_target(uuid,uuid,text,numeric,text,bigint)'::regprocedure,'private.confirm_payroll_quarter_receipt_requirement(uuid,date,date,uuid,text,numeric,text,bigint)'::regprocedure] loop
  ddl:=pg_get_functiondef(fn);
  needle:='if coalesce(row.revision,0) is distinct from coalesce(p_expected_revision,0) then';
  if position(needle in ddl)=0 then raise exception 'Unexpected target confirmation definition';end if;
  execute replace(ddl,needle,$replacement$if coalesce(row.revision,(select (t->>'revision')::bigint from jsonb_array_elements(snap->'quarterlyReceiptTargets') t where t->>'employee_id'=p_employee::text),0) is distinct from coalesce(p_expected_revision,0) then$replacement$);
 end loop;
end $$;
notify pgrst,'reload schema';
