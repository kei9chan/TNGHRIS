-- Employee-facing payslip presentation metadata and immutable acknowledgement.
-- Monetary snapshots and detailed payroll calculations remain unchanged.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.payroll_payslip_identity
  add column if not exists department text,
  add column if not exists position text;

create or replace function private.capture_payslip_identity()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.payroll_payslip_identity(
    payslip_id, employee_number, business_unit, department, position
  )
  select new.id, h.employee_id, h.business_unit, h.department, h.position
  from public.hris_users h where h.id=new.employee_id;
  return new;
end $$;

update public.payroll_payslip_identity i
set department = coalesce(i.department, h.department),
    position = coalesce(i.position, h.position)
from public.payroll_released_payslips p
join public.hris_users h on h.id=p.employee_id
where p.id=i.payslip_id
  and (i.department is null or i.position is null);

create table if not exists public.payroll_payslip_acknowledgements (
  payslip_id uuid primary key references public.payroll_released_payslips(id),
  employee_id uuid not null references public.hris_users(id),
  acknowledged_by uuid not null references public.hris_users(id),
  acknowledged_at timestamptz not null default clock_timestamp(),
  constraint payslip_acknowledgement_self check(employee_id=acknowledged_by)
);
alter table public.payroll_payslip_acknowledgements enable row level security;
revoke all on public.payroll_payslip_acknowledgements from public, anon, authenticated;
drop trigger if exists immutable on public.payroll_payslip_acknowledgements;
create trigger immutable before update or delete on public.payroll_payslip_acknowledgements
for each row execute function private.payroll_audit_immutable();

create or replace function public.acknowledge_payroll_payslip(p_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare
  v_employee uuid;
  v_ack timestamptz;
begin
  if private.payroll_actor_id() is null then
    raise exception 'Active HRIS login required' using errcode='42501';
  end if;
  select employee_id into v_employee
  from public.payroll_released_payslips
  where id=p_id;
  if v_employee is null
     or v_employee<>public.current_hris_user_id()
     or not coalesce(private.confirmed_slip_visible(p_id),false) then
    raise exception 'Payslip unavailable' using errcode='42501';
  end if;
  insert into public.payroll_payslip_acknowledgements(
    payslip_id, employee_id, acknowledged_by
  ) values (p_id,v_employee,v_employee)
  on conflict(payslip_id) do nothing;
  select acknowledged_at into v_ack
  from public.payroll_payslip_acknowledgements
  where payslip_id=p_id and employee_id=v_employee;
  return v_ack::text;
end $$;

create or replace function private.payroll_self_service_slip(p_id uuid,p_review boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  s public.payroll_released_payslips;
  r public.payroll_approval_runs;
  p jsonb;
  meta public.payroll_payslip_identity;
begin
  if private.payroll_actor_id() is null then
    raise exception 'Active HRIS login required' using errcode='42501';
  end if;
  select * into s from public.payroll_released_payslips where id=p_id;
  if s.id is null or not (
    s.employee_id=public.current_hris_user_id()
    or (p_review and (
      coalesce(private.payroll_issue_role(p_id,'hr'),false)
      or coalesce(private.payroll_issue_role(p_id,'finance'),false)
    ))
  ) then raise exception 'Payslip unavailable' using errcode='42501'; end if;
  select * into r from public.payroll_approval_runs where id=s.run_id;
  select * into meta from public.payroll_payslip_identity where payslip_id=s.id;
  p:=s.payload;
  if s.employee_id=public.current_hris_user_id() then p:=public.get_my_payroll_payslip(p_id); end if;
  return p||jsonb_build_object(
    'id',s.id,
    'runId',s.run_id,
    'releasedAt',s.released_at,
    'generatedAt',s.released_at,
    'employeeNumber',meta.employee_number,
    'businessUnit',meta.business_unit,
    'department',meta.department,
    'position',meta.position,
    'version',r.source_snapshot->>'version',
    'payrollStatus',coalesce(p->>'paymentStatus','Approved'),
    'items',private.payroll_payslip_items(s.payload),
    'acknowledgedAt',(select acknowledged_at from public.payroll_payslip_acknowledgements where payslip_id=s.id),
    'correctionKind',(select correction_kind from public.payroll_issue_corrections where corrected_payslip_id=s.id limit 1),
    'originalPayslipId',(select i.payslip_id from public.payroll_issue_corrections c join public.payroll_employee_issues i on i.id=c.issue_id where c.corrected_payslip_id=s.id limit 1)
  );
end $$;

revoke all on function public.acknowledge_payroll_payslip(uuid) from public, anon, authenticated;
grant execute on function public.acknowledge_payroll_payslip(uuid) to authenticated;
revoke all on function private.payroll_self_service_slip(uuid,boolean) from public, anon, authenticated;
notify pgrst,'reload schema';

