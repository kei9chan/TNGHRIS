-- A saved draft is resumable work, not a duplicate error. Submit the existing
-- record in place so its source, creator, documents, and audit history remain intact.
create or replace function public.submit_payroll_pay_package_draft(p_package_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  package_row public.payroll_pay_packages;
  actor uuid := public.current_hris_user_id();
  payroll_actor uuid := private.payroll_actor_id();
  steps jsonb;
begin
  if actor is null or payroll_actor is null then
    raise exception 'Authenticated payroll user required.' using errcode='42501';
  end if;

  select * into strict package_row
  from public.payroll_pay_packages
  where id=p_package_id
  for update;

  if package_row.source_kind='approved_pan' then
    raise exception 'PAN-generated packages do not use the draft submission workflow.';
  end if;
  if package_row.status<>'draft' or package_row.approval_state not in ('draft','returned') then
    raise exception 'This package is already submitted or is no longer an editable draft.';
  end if;
  if package_row.created_by is distinct from payroll_actor
     and package_row.created_by is distinct from actor then
    raise exception 'Only the person who saved this draft may submit it for approval.' using errcode='42501';
  end if;
  if not private.payroll_package_scope_permission(package_row.employee_id,package_row.scope_id,'edit',package_row.stream) then
    raise exception 'You do not have permission to submit this pay-package draft.' using errcode='42501';
  end if;
  if package_row.source_hash is distinct from private.payroll_source_hash(package_row.employee_id) then
    raise exception 'The approved salary source changed after this draft was saved. Open the draft, review the current source, and save the correction before submitting.' using errcode='40001';
  end if;

  steps:=private.direct_package_approval_steps(payroll_actor);
  update public.payroll_pay_packages
     set approval_state='pending',
         approval_steps=steps,
         treatment=jsonb_set(coalesce(treatment,'{}'::jsonb),'{submissionIntent}','"approval"'::jsonb,true),
         source_metadata=coalesce(source_metadata,'{}'::jsonb)||jsonb_build_object('submittedAt',now(),'submittedBy',actor)
   where id=package_row.id;

  insert into public.payroll_pay_audit(employee_id,scope_id,package_id,actor_id,action,reason,previous_value,new_value,source,calculation_version)
  values(package_row.employee_id,package_row.scope_id,package_row.id,payroll_actor,'submitted_for_approval',package_row.reason,to_jsonb(package_row),(select to_jsonb(p) from public.payroll_pay_packages p where p.id=package_row.id),package_row.source_kind,'pay-package-draft-resume-v1');
end $$;

revoke all on function public.submit_payroll_pay_package_draft(uuid) from public,anon,authenticated;
grant execute on function public.submit_payroll_pay_package_draft(uuid) to authenticated;
notify pgrst,'reload schema';
