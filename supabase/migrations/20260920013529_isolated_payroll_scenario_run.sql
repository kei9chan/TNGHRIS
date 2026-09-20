-- Synthetic evidence never enters official attendance, schedules, leave or payments.
create schema if not exists payroll_scenario_private;
revoke all on schema payroll_scenario_private from public, anon, authenticated;
create table payroll_scenario_private.runs (
 seed_run_id text primary key,
 scope_id uuid not null references public.payroll_access_scopes(id),
 label text not null, date_from date not null, date_to date not null, pay_date date not null,
 timezone text not null default 'Asia/Manila', is_test boolean not null default true check(is_test),
 status text not null default 'Needs review' check(status in ('Draft','Needs review','Calculated')),
 snapshot jsonb not null, created_at timestamptz not null default now()
);
alter table payroll_scenario_private.runs enable row level security;
revoke all on payroll_scenario_private.runs from public,anon,authenticated;
create function public.get_payroll_scenario_run(p_scope uuid,p_from date,p_to date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r payroll_scenario_private.runs; e jsonb;
begin
 if not coalesce(private.payroll_gross_permission(p_scope,'view'),false) then raise exception 'Scoped payroll and compensation access required' using errcode='42501';end if;
 select * into r from payroll_scenario_private.runs where scope_id=p_scope and date_from=p_from and date_to=p_to;
 if not found then return null;end if;
 for e in select value from jsonb_array_elements(r.snapshot->'employees') loop
 if not coalesce(private.payroll_package_permission((e->>'id')::uuid,p_scope,'view'),false) then raise exception 'Employee compensation access required' using errcode='42501';end if;
 end loop;
 return to_jsonb(r);
end $$;
revoke all on function public.get_payroll_scenario_run(uuid,date,date) from public,anon;
grant execute on function public.get_payroll_scenario_run(uuid,date,date) to authenticated;
