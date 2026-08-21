-- Run with authenticated test JWTs after applying the RBAC migration.
begin;

-- GLOBAL must not create an ungranted feature permission.
select plan(4);
select ok(not public.rbac_has_permission('Payroll', 'view'), 'GLOBAL alone does not grant Payroll');
select ok(public.rbac_has_permission('Employees', 'view'), 'role permission grants Employees view');
select ok((select count(*) >= 1 from public.rbac_allowed_business_unit_ids()), 'scope resolves business units');
select ok(public.active_hris_user_id() is not null, 'authenticated HRIS profile resolves');

select * from finish();
rollback;
