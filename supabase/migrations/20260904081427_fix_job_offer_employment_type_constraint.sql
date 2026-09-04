-- The offer builder introduced explicit employment terms, but the original
-- job_offers check constraint still accepted only the legacy ATS values.
-- Preserve those historical values while allowing every value emitted by the
-- current offer builder.

alter table public.job_offers
  drop constraint if exists job_offers_employment_type_check;

alter table public.job_offers
  add constraint job_offers_employment_type_check
  check (
    employment_type in (
      'Full-Time',
      'Part-Time',
      'Contract',
      'Regular',
      'Probationary',
      'Seasonal / Fixed-Term',
      'Consultant / Contractor',
      'Custom'
    )
  ) not valid;

alter table public.job_offers
  validate constraint job_offers_employment_type_check;

comment on constraint job_offers_employment_type_check on public.job_offers is
  'Allows current offer-builder employment terms while retaining historical ATS values.';
