-- Phase 1C follow-up: keep payroll-group-scoped component versions inside
-- their selected payroll-group effective range.

create or replace function private.validate_payroll_pay_component_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  group_start_date date;
  group_end_date date;
begin
  if new.payroll_group_id is not null then
    select pg.effective_start_date, pg.effective_end_date
      into group_start_date, group_end_date
    from public.payroll_groups pg
    where pg.id = new.payroll_group_id;

    if not found then
      raise exception 'The payroll group for this pay component does not exist.' using errcode = '23503';
    end if;

    if new.effective_start_date < group_start_date
       or (group_end_date is not null and (
         new.effective_end_date is null
         or new.effective_end_date > group_end_date
       )) then
      raise exception 'Pay-component effective dates must be within the selected payroll-group version.' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists payroll_pay_components_scope_guard on public.payroll_pay_components;
create trigger payroll_pay_components_scope_guard
before insert or update on public.payroll_pay_components
for each row execute function private.validate_payroll_pay_component_scope();

revoke all on function private.validate_payroll_pay_component_scope() from public, anon, authenticated;
