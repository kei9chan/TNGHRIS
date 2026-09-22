-- Direct compensation packages use a resilient approver pool. Any two
-- independent approvers may approve, while the submitter remains ineligible.
create or replace function private.direct_package_approval_steps(p_creator uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  hr public.hris_users;
  finance public.hris_users;
  alternate public.hris_users;
  result jsonb:='[]'::jsonb;
  creator_hris uuid:=public.current_hris_user_id();
begin
  select * into hr from public.hris_users u
   where lower(u.role)='hr manager' and lower(u.full_name) like '%jedediah%'
   order by (u.auth_user_id is not null) desc,u.created_at limit 1;
  select * into finance from public.hris_users u
   where lower(u.full_name) like '%casas%' and lower(u.full_name) like '%lenny%'
   order by (lower(u.role) like '%finance%') desc,(u.auth_user_id is not null) desc,u.created_at limit 1;
  select * into alternate from public.hris_users u
   where lower(u.email)='kay@thenextperience.com'
   order by (u.auth_user_id is not null) desc,u.created_at limit 1;

  if hr.id is null then raise exception 'Jedidiah/Jedediah HR Manager is not configured for compensation approval.'; end if;
  if finance.id is null then raise exception 'Lenny Rose Casas · Finance is not configured for compensation approval.'; end if;
  if alternate.id is null then raise exception 'Kay Lacap · alternate compensation approver is not configured.'; end if;

  if creator_hris is distinct from hr.id then
    result:=result||jsonb_build_array(jsonb_build_object('userId',hr.id,'name',hr.full_name,'role','HR Manager','status','Pending'));
  end if;
  if creator_hris is distinct from finance.id then
    result:=result||jsonb_build_array(jsonb_build_object('userId',finance.id,'name',finance.full_name,'role','Finance','status','Pending'));
  end if;
  if creator_hris is distinct from alternate.id then
    result:=result||jsonb_build_array(jsonb_build_object('userId',alternate.id,'name',alternate.full_name,'role','BOD · Alternate approver','status','Pending'));
  end if;
  if jsonb_array_length(result)<2 then
    raise exception 'Two independent compensation approvers must be configured; the creator cannot approve their own entry.';
  end if;
  return result;
end $$;

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
begin
  select * into strict p from public.payroll_pay_packages where id=p_package_id for update;
  if p.source_kind='approved_pan' then raise exception 'PAN approval is the compensation approval. Create a correction instead of reapproving or editing this package.'; end if;
  if p.status<>'draft' or p.approval_state<>'pending' then raise exception 'This package is not pending compensation approval.'; end if;
  if p.created_by=actor_auth then raise exception 'The creator cannot approve their own compensation entry.' using errcode='42501'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'Record a review reason.'; end if;

  for step in select value from jsonb_array_elements(p.approval_steps) loop
    if not found and step->>'status'='Pending' and step->>'userId'=actor::text then
      step:=step||jsonb_build_object('status',case when p_approve then 'Approved' else 'Rejected' end,'timestamp',now(),'notes',btrim(p_reason));
      found:=true;
    end if;
    rebuilt:=rebuilt||jsonb_build_array(step);
  end loop;
  if not found then raise exception 'You are not an assigned pending approver.' using errcode='42501'; end if;

  if not p_approve then
    update public.payroll_pay_packages set approval_steps=rebuilt,approval_state='rejected',status='rejected' where id=p.id;
    insert into public.payroll_pay_audit(employee_id,scope_id,package_id,actor_id,action,reason,previous_value,new_value,source,calculation_version)
    values(p.employee_id,p.scope_id,p.id,actor_auth,'reject',p_reason,to_jsonb(p),(select to_jsonb(x) from public.payroll_pay_packages x where x.id=p.id),p.source_kind,'pay-package-builder-v2');
    return;
  end if;

  select count(*) into approved_count from jsonb_array_elements(rebuilt) s where s->>'status'='Approved';
  all_done:=approved_count>=2;
  if all_done then
    for step in select value from jsonb_array_elements(rebuilt) loop
      if step->>'status'='Pending' then
        step:=step||jsonb_build_object('status','Not required','timestamp',now(),'notes','Two independent approvals completed');
      end if;
      finalized:=finalized||jsonb_build_array(step);
    end loop;
  else
    finalized:=rebuilt;
  end if;

  update public.payroll_pay_packages set approval_steps=finalized,approval_state=case when all_done then 'approved' else 'pending' end where id=p.id;
  if all_done then perform private.approve_payroll_package(p.id,actor_auth); end if;
  insert into public.payroll_pay_audit(employee_id,scope_id,package_id,actor_id,action,reason,previous_value,new_value,source,calculation_version)
  values(p.employee_id,p.scope_id,p.id,actor_auth,case when all_done then 'approve_and_activate' else 'approval_step' end,p_reason,to_jsonb(p),(select to_jsonb(x) from public.payroll_pay_packages x where x.id=p.id),p.source_kind,'pay-package-builder-v2');
end $$;

create or replace function private.approve_payroll_package(p_package_id uuid,p_approver uuid) returns void
language plpgsql security definer set search_path='' as $$
declare p public.payroll_pay_packages; replaced public.payroll_pay_packages; approved_count integer;
begin
 select * into strict p from public.payroll_pay_packages where id=p_package_id;
 perform 1 from public.hris_users where id=p.employee_id for update;
 select * into strict p from public.payroll_pay_packages where id=p_package_id for update;
 if p.status='approved' then return;end if;
 if p.status<>'draft' then raise exception 'Only a draft can be approved.';end if;
 if p.source_kind='approved_pan' then raise exception 'PAN-generated packages are approved only by the PAN workflow.';end if;
 select count(*) into approved_count from jsonb_array_elements(p.approval_steps) s where s->>'status'='Approved';
 if p.approval_state<>'approved' or approved_count<2 then raise exception 'Two independent compensation approvals must be completed first.';end if;
 if p.source_hash is distinct from private.payroll_source_hash(p.employee_id) then raise exception 'The approved history or employee compensation changed. Refresh and create a new draft.' using errcode='40001';end if;
 if p.replaces_id is not null then
  select * into strict replaced from public.payroll_pay_packages where id=p.replaces_id;
  if replaced.employee_id<>p.employee_id or replaced.engagement_key<>p.engagement_key or replaced.effective_from<>p.effective_from or replaced.status<>'approved' then raise exception 'A same-date correction must reference the current approved version.';end if;
  update public.payroll_pay_packages set status='superseded' where id=p.replaces_id;
 end if;
 update public.payroll_pay_packages set status='approved',approved_by=p_approver,approved_at=now() where id=p.id;
 insert into public.payroll_pay_audit(employee_id,scope_id,package_id,actor_id,action,reason,previous_value,new_value,source,calculation_version)
 values(p.employee_id,p.scope_id,p.id,p_approver,'approve',p.reason,to_jsonb(p),(select to_jsonb(x) from public.payroll_pay_packages x where x.id=p.id),p.source_kind,'pay-package-builder-v2');
end $$;

-- Add Kay to already-pending packages, including Ernesto's current test package,
-- without replacing the record or losing any completed approval evidence.
do $$
declare alternate public.hris_users;
begin
  select * into alternate from public.hris_users u where lower(u.email)='kay@thenextperience.com' order by (u.auth_user_id is not null) desc,u.created_at limit 1;
  if alternate.id is null then raise exception 'Kay Lacap · alternate compensation approver is not configured.'; end if;
  update public.payroll_pay_packages p
     set approval_steps=p.approval_steps||jsonb_build_array(jsonb_build_object('userId',alternate.id,'name',alternate.full_name,'role','BOD · Alternate approver','status','Pending'))
   where p.status='draft' and p.approval_state='pending' and p.source_kind<>'approved_pan'
     and p.created_by is distinct from coalesce(alternate.auth_user_id,alternate.id)
     and not exists(select 1 from jsonb_array_elements(p.approval_steps) s where s->>'userId'=alternate.id::text);
end $$;

revoke all on function public.review_payroll_pay_package(uuid,boolean,text) from public,anon;
grant execute on function public.review_payroll_pay_package(uuid,boolean,text) to authenticated;
notify pgrst,'reload schema';
