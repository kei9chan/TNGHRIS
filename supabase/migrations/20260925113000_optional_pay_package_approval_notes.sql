-- Approval notes are optional. Rejection reasons remain required so a declined
-- compensation package always has an auditable explanation.
create or replace function public.review_payroll_pay_package(p_package_id uuid,p_approve boolean,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare
  p public.payroll_pay_packages;
  actor uuid:=public.current_hris_user_id();
  actor_auth uuid:=private.payroll_actor_id();
  rebuilt jsonb:='[]'::jsonb;
  finalized jsonb:='[]'::jsonb;
  step jsonb;
  found boolean:=false;
  approved_count integer:=0;
  all_done boolean:=false;
  decision_note text:=nullif(btrim(coalesce(p_reason,'')),'');
begin
  select * into strict p from public.payroll_pay_packages where id=p_package_id for update;
  if p.source_kind='approved_pan' then raise exception 'PAN approval is the compensation approval. Create a correction instead of reapproving or editing this package.'; end if;
  if p.status<>'draft' or p.approval_state<>'pending' then raise exception 'This package is not pending compensation approval.'; end if;
  if actor is null or actor_auth is null then raise exception 'Authenticated reviewer required.' using errcode='42501'; end if;
  if p.created_by=actor_auth or p.created_by=actor then raise exception 'The creator cannot approve their own compensation entry.' using errcode='42501'; end if;
  if not p_approve and length(coalesce(decision_note,''))<3 then raise exception 'A rejection reason of at least 3 characters is required.'; end if;

  for step in select value from jsonb_array_elements(p.approval_steps) loop
    if not found and step->>'status'='Pending' and step->>'userId'=actor::text then
      step:=step||jsonb_build_object('status',case when p_approve then 'Approved' else 'Rejected' end,'timestamp',now(),'notes',decision_note);
      found:=true;
    end if;
    rebuilt:=rebuilt||jsonb_build_array(step);
  end loop;
  if not found then raise exception 'You are not an assigned pending approver.' using errcode='42501'; end if;

  if not p_approve then
    update public.payroll_pay_packages set approval_steps=rebuilt,approval_state='rejected',status='rejected' where id=p.id;
    insert into public.payroll_pay_audit(employee_id,scope_id,package_id,actor_id,action,reason,previous_value,new_value,source,calculation_version)
    values(p.employee_id,p.scope_id,p.id,actor_auth,'reject',decision_note,to_jsonb(p),(select to_jsonb(x) from public.payroll_pay_packages x where x.id=p.id),p.source_kind,'pay-package-builder-v2');
    return;
  end if;

  select count(distinct s->>'userId') into approved_count from jsonb_array_elements(rebuilt) s where s->>'status'='Approved';
  all_done:=approved_count>=2;
  if all_done then
    for step in select value from jsonb_array_elements(rebuilt) loop
      if step->>'status'='Pending' then
        step:=step||jsonb_build_object('status','Not required','timestamp',now(),'notes','Two distinct sign-offs completed');
      end if;
      finalized:=finalized||jsonb_build_array(step);
    end loop;
  else
    finalized:=rebuilt;
  end if;

  update public.payroll_pay_packages set approval_steps=finalized,approval_state=case when all_done then 'approved' else 'pending' end where id=p.id;
  if all_done then perform private.approve_payroll_package(p.id,actor_auth); end if;
  insert into public.payroll_pay_audit(employee_id,scope_id,package_id,actor_id,action,reason,previous_value,new_value,source,calculation_version)
  values(p.employee_id,p.scope_id,p.id,actor_auth,case when all_done then 'approve_and_activate' else 'approval_step' end,decision_note,to_jsonb(p),(select to_jsonb(x) from public.payroll_pay_packages x where x.id=p.id),p.source_kind,'pay-package-builder-v2');
end $$;

revoke all on function public.review_payroll_pay_package(uuid,boolean,text) from public,anon;
