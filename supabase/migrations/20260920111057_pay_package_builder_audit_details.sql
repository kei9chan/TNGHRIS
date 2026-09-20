set local lock_timeout='5s';
set local statement_timeout='30s';

alter table public.payroll_pay_audit
 add column if not exists previous_value jsonb,
 add column if not exists new_value jsonb,
 add column if not exists source text not null default 'legacy',
 add column if not exists supporting_documents jsonb not null default '[]'::jsonb,
 add column if not exists calculation_version text;

create or replace function private.populate_payroll_pay_audit_details()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
 package_record public.payroll_pay_packages;
 previous_record public.payroll_pay_packages;
begin
 if new.package_id is null then
  new.source:=coalesce(nullif(new.source,''),'system_rpc');
  return new;
 end if;

 select * into package_record from public.payroll_pay_packages where id=new.package_id;
 if package_record.id is null then return new; end if;

 new.source:=coalesce(nullif(new.source,''),nullif(package_record.treatment->>'entrySource',''),'system_rpc');
 new.calculation_version:=coalesce(nullif(new.calculation_version,''),nullif(package_record.treatment->>'calculationVersion',''),'legacy');
 new.new_value:=coalesce(new.new_value,to_jsonb(package_record)-'source_hash'-'source_pan_hash');
 new.supporting_documents:=coalesce(new.supporting_documents,(
  select coalesce(jsonb_agg(jsonb_build_object(
   'id',d.id,'name',d.file_name,'path',d.storage_path,'uploadedAt',d.uploaded_at
  ) order by d.uploaded_at),'[]'::jsonb)
  from public.payroll_pay_package_documents d where d.package_id=package_record.id
 ));

 if new.previous_value is null and package_record.replaces_id is not null then
  select * into previous_record from public.payroll_pay_packages where id=package_record.replaces_id;
  if previous_record.id is not null then
   new.previous_value:=to_jsonb(previous_record)-'source_hash'-'source_pan_hash';
  end if;
 elsif new.previous_value is null and new.action in ('approve','reject') then
  new.previous_value:=jsonb_build_object('id',package_record.id,'status','draft');
 end if;
 return new;
end $$;

revoke all on function private.populate_payroll_pay_audit_details() from public,anon,authenticated;

drop trigger if exists populate_payroll_pay_audit_details on public.payroll_pay_audit;
create trigger populate_payroll_pay_audit_details
before insert on public.payroll_pay_audit
for each row execute function private.populate_payroll_pay_audit_details();

comment on column public.payroll_pay_audit.previous_value is 'Prior effective-dated package snapshot, when applicable.';
comment on column public.payroll_pay_audit.new_value is 'Saved package snapshot with source hashes omitted.';
comment on column public.payroll_pay_audit.source is 'manual_builder, excel_upload, or the authoritative RPC source.';
comment on column public.payroll_pay_audit.supporting_documents is 'Document metadata only; file content remains in the private storage bucket.';
comment on column public.payroll_pay_audit.calculation_version is 'Payroll preview or calculation contract version recorded by the package.';
