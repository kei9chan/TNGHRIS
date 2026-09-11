-- Employee acknowledgment applies only the locked, approved PAN.
set local lock_timeout='5s';
create table private.pan_accept_context (
 transaction_id bigint not null,
 employee_id uuid not null,
 pan_id uuid not null references public.pans(id),
 primary key(transaction_id,employee_id)
);
alter table private.pan_accept_context enable row level security;
revoke all on private.pan_accept_context from public,anon,authenticated;
create or replace function public.guard_hris_user_security_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.role,new.data_access_scope,new.dashboard_type,new.auth_user_id)
       is distinct from (old.role,old.data_access_scope,old.dashboard_type,old.auth_user_id)
     and current_setting('app.rbac_role_update',true) <> 'allowed' then
    raise exception 'Role, scope, dashboard, and authentication links must be changed through the audited RBAC function.' using errcode='42501';
  end if;
  if (new.sss_no is distinct from old.sss_no and not public.has_sensitive_permission('sss','edit'))
      or (new.tin is distinct from old.tin and not public.has_sensitive_permission('tin','edit'))
      or (new.pagibig_no is distinct from old.pagibig_no and not public.has_sensitive_permission('pagibig','edit'))
      or (new.philhealth_no is distinct from old.philhealth_no and not public.has_sensitive_permission('philhealth','edit'))
      or ((new.bank_name,new.bank_account_number,new.bank_account_type) is distinct from (old.bank_name,old.bank_account_number,old.bank_account_type)
          and not public.has_sensitive_permission('bank_information','edit'))
      or ((new.rate_amount,new.salary_basic,new.salary_deminimis,new.salary_reimbursable) is distinct from (old.rate_amount,old.salary_basic,old.salary_deminimis,old.salary_reimbursable)
          and not public.has_sensitive_permission('salary_compensation','edit')
          and not (
            new.rate_amount is not distinct from old.rate_amount
            and exists (
              select 1 from private.pan_accept_context c join public.pans p on p.id=c.pan_id
              where c.transaction_id=txid_current() and c.employee_id=new.id
                and p.employee_id=public.current_hris_user_id()
                and p.status::text='Pending Employee'
                and coalesce((p.action_taken->>'salaryIncrease')::boolean,false)
                and new.salary_basic is not distinct from coalesce(nullif(p.particulars#>>'{to,salary,basic}','')::numeric,old.salary_basic)
                and new.salary_deminimis is not distinct from coalesce(nullif(p.particulars#>>'{to,salary,deminimis}','')::numeric,old.salary_deminimis)
                and new.salary_reimbursable is not distinct from coalesce(nullif(p.particulars#>>'{to,salary,reimbursable}','')::numeric,old.salary_reimbursable)
            )
          )) then
    raise exception 'Protected HR field update is not authorized.' using errcode='42501';
  end if;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.accept_pan(p_pan_id uuid, p_signature_data_url text, p_signature_name text)
 RETURNS pans
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := public.current_hris_user_id();
  pan_row public.pans;
  bod_approved boolean;
  all_approved boolean;
  to_data jsonb;
  action_data jsonb;
  next_position text;
  next_department text;
  next_employment_status text;
  next_business_unit text;
  next_business_unit_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if nullif(trim(coalesce(p_signature_name,'')),'') is null or nullif(trim(coalesce(p_signature_data_url,'')),'') is null then
    raise exception 'Your typed name and signature are required.';
  end if;
  select * into pan_row from public.pans where id=p_pan_id for update;
  if pan_row.id is null then raise exception 'PAN record not found.'; end if;
  if pan_row.employee_id is distinct from actor_id then raise exception 'Only the employee named in this PAN may accept it.' using errcode='42501'; end if;
  if pan_row.status::text = 'Completed' and pan_row.accepted_by = actor_id then return pan_row; end if;
  if pan_row.status::text <> 'Pending Employee' then raise exception 'This PAN is not awaiting employee acceptance.'; end if;

  select not exists(select 1 from jsonb_array_elements(pan_row.routing_steps) step where step->>'status' <> 'Approved') into all_approved;
  select exists(select 1 from jsonb_array_elements(pan_row.routing_steps) step where step->>'status'='Approved' and private.pan_user_is_bod(step->>'userId')) into bod_approved;
  if pan_row.workflow_version >= 2 and (not all_approved or not bod_approved) then
    raise exception 'Required approvals, including Board of Director approval, are incomplete.';
  end if;

  to_data := coalesce(pan_row.particulars->'to','{}'::jsonb);
  action_data := coalesce(pan_row.action_taken,'{}'::jsonb);
  next_position := nullif(trim(to_data->>'position'),'');
  next_department := nullif(trim(to_data->>'department'),'');
  next_employment_status := nullif(trim(to_data->>'employmentStatus'),'');
  next_business_unit := nullif(trim(to_data->>'businessUnit'),'');
  if coalesce(to_data->>'businessUnitId','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    next_business_unit_id := (to_data->>'businessUnitId')::uuid;
  end if;

  if pan_row.workflow_version >= 2 then
    insert into private.pan_accept_context(transaction_id,employee_id,pan_id)
    values(txid_current(),actor_id,p_pan_id);
    update public.hris_users
    set position = case
          when coalesce((action_data->>'promotion')::boolean,false) or coalesce((action_data->>'changeOfJobTitle')::boolean,false) or coalesce((action_data->>'transfer')::boolean,false)
            then case when lower(coalesce(next_position,'')) in ('same','not applicable') then position else coalesce(next_position,position) end
          else position end,
        department = case when coalesce((action_data->>'transfer')::boolean,false)
          then case when lower(coalesce(next_department,'')) in ('same','not applicable') then department else coalesce(next_department,department) end else department end,
        business_unit = case when coalesce((action_data->>'transfer')::boolean,false)
          then case when lower(coalesce(next_business_unit,'')) in ('same','not applicable') then business_unit else coalesce(next_business_unit,business_unit) end else business_unit end,
        business_unit_id = case when coalesce((action_data->>'transfer')::boolean,false) then coalesce(next_business_unit_id,business_unit_id) else business_unit_id end,
        employment_status = case when coalesce((action_data->>'changeOfStatus')::boolean,false)
          then case when lower(coalesce(next_employment_status,'')) in ('same','not applicable') then employment_status else coalesce(next_employment_status,employment_status) end else employment_status end,
        salary_basic = case when coalesce((action_data->>'salaryIncrease')::boolean,false) then coalesce(nullif(to_data#>>'{salary,basic}','')::numeric,salary_basic) else salary_basic end,
        salary_deminimis = case when coalesce((action_data->>'salaryIncrease')::boolean,false) then coalesce(nullif(to_data#>>'{salary,deminimis}','')::numeric,salary_deminimis) else salary_deminimis end,
        salary_reimbursable = case when coalesce((action_data->>'salaryIncrease')::boolean,false) then coalesce(nullif(to_data#>>'{salary,reimbursable}','')::numeric,salary_reimbursable) else salary_reimbursable end
    where id=pan_row.employee_id;
    delete from private.pan_accept_context where transaction_id=txid_current() and employee_id=actor_id;
  end if;

  update public.pans
  set status='Completed',signed_at=now(),signature_data_url=p_signature_data_url,signature_name=trim(p_signature_name),
      accepted_at=now(),accepted_by=actor_id,applied_at=case when workflow_version>=2 then now() else applied_at end,updated_at=now()
  where id=p_pan_id returning * into pan_row;
  perform private.pan_notify(
    pan_row.created_by_user_id,'PAN_UPDATE','PAN Accepted',
    format('%s acknowledged and accepted PAN %s.',pan_row.employee_name,p_pan_id),
    format('/employees/pan?item=%s',p_pan_id),p_pan_id,format('pan:%s:accepted',p_pan_id)
  );
  perform private.pan_audit('ACCEPT',p_pan_id,jsonb_build_object('employeeId',actor_id,'status','Completed','employeeRecordApplied',pan_row.workflow_version>=2));
  return pan_row;
end;
$function$


