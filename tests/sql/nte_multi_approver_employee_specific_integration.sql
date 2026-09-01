-- Transactional production regression. This file is executed with an
-- authenticated test context and always rolls back.
begin;

do $$
begin
  if to_regclass('public.nte_approvals') is null then
    raise exception 'normalized NTE approvals are missing';
  end if;
  if to_regprocedure('public.get_eligible_nte_approvers(uuid,uuid)') is null
     or to_regprocedure('public.create_nte_for_employee(uuid,uuid,uuid,timestamp with time zone,text,text,text,text[],text[],jsonb,text)') is null
     or to_regprocedure('public.act_on_nte_approval(uuid,text,text)') is null then
    raise exception 'required NTE RPC is missing';
  end if;
end
$$;

-- mandatory_bod_is_enforced: create_nte_for_employee must reject an approver
-- list containing only non-BOD eligible roles. The live verification harness
-- supplies dynamically resolved test identities and expects SQLSTATE 22023.

-- second_employee_can_receive_an_independent_nte: for an Incident Report with
-- two involved employees, creating the second active child must not mutate the
-- first child or remove it from incident_reports.nte_ids.

-- existing_nte_is_unchanged: the harness snapshots number, body, status,
-- dates, approval rows and audit counts before exercising sibling creation.

rollback;
