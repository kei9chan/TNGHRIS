-- Additive support for secure offer viewing, acceptance, signatures and signed PDFs.
-- Existing offer rows, relationships, statuses and RLS policies are preserved.

alter table public.job_offers
  add column if not exists viewed_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists signed_at timestamptz,
  add column if not exists declined_at timestamptz,
  add column if not exists decline_reason text,
  add column if not exists signature_name text,
  add column if not exists signature_type text,
  add column if not exists signature_path text,
  add column if not exists signed_pdf_path text,
  add column if not exists require_signature boolean not null default true;

create index if not exists job_offers_application_status_idx
  on public.job_offers (application_id, status, updated_at desc);

alter table public.job_offers
  drop constraint if exists job_offers_signature_type_check;

alter table public.job_offers
  add constraint job_offers_signature_type_check
  check (signature_type is null or signature_type in ('typed', 'drawn'));

update storage.buckets
set file_size_limit = 7340032,
    allowed_mime_types = array['image/png','image/jpeg','image/svg+xml','application/pdf']
where id = 'offer-assets';
