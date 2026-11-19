-- Add request types without changing existing hiring requests or approval routes.
alter type public.job_employment_type add value if not exists 'Seasonal';
alter type public.job_employment_type add value if not exists 'Weekender';
alter table public.job_requisitions add column seasonal_months integer;
alter table public.job_requisitions add constraint job_requisitions_seasonal_months_check
  check (
    (employment_type::text = 'Seasonal' and seasonal_months is not null and seasonal_months > 0)
    or (employment_type::text <> 'Seasonal' and seasonal_months is null)
  );
comment on column public.job_requisitions.seasonal_months is
  'Requested engagement duration in whole months, required for Seasonal only.';
