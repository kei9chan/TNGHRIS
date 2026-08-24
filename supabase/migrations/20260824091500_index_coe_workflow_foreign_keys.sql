-- Cover the remaining COE workflow foreign keys reported by the post-migration
-- performance advisor. These indexes are additive and do not change data or RLS.

create index if not exists coe_requests_approved_by_idx
  on public.coe_requests(approved_by)
  where approved_by is not null;

create index if not exists coe_requests_employee_business_unit_idx
  on public.coe_requests(employee_business_unit_id)
  where employee_business_unit_id is not null;

create index if not exists coe_requests_employee_department_idx
  on public.coe_requests(employee_department_id)
  where employee_department_id is not null;

create index if not exists coe_requests_requested_by_idx
  on public.coe_requests(requested_by)
  where requested_by is not null;

create index if not exists coe_templates_created_by_idx
  on public.coe_templates(created_by)
  where created_by is not null;
