set local lock_timeout='5s';
set local statement_timeout='30s';

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
  new.supporting_documents:=coalesce(new.supporting_documents,'[]'::jsonb);
  return new;
 end if;

 select * into package_record from public.payroll_pay_packages where id=new.package_id;
 if package_record.id is null then
  new.supporting_documents:=coalesce(new.supporting_documents,'[]'::jsonb);
  return new;
 end if;

 new.source:=coalesce(nullif(new.source,''),nullif(package_record.treatment->>'entrySource',''),'system_rpc');
 new.calculation_version:=coalesce(nullif(new.calculation_version,''),nullif(package_record.treatment->>'calculationVersion',''),'legacy');
 new.new_value:=coalesce(new.new_value,to_jsonb(package_record)-'source_hash'-'source_pan_hash');
 new.supporting_documents:=(
  select coalesce(jsonb_agg(jsonb_build_object(
   'id',d.id,'name',d.file_name,'path',d.storage_path,'uploadedAt',d.uploaded_at
  ) order by d.uploaded_at),'[]'::jsonb)
  from public.payroll_pay_package_documents d where d.package_id=package_record.id
 );

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
