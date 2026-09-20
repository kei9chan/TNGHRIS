-- Payroll helpers use the authenticated actor UUID. Align Phase 3 ownership
-- columns with that established identity model; employee IDs remain HRIS IDs.
alter table public.payroll_service_charge_setups drop constraint payroll_service_charge_setups_created_by_fkey;
alter table public.payroll_service_charge_setups drop constraint payroll_service_charge_setups_updated_by_fkey;
alter table public.payroll_service_charge_setups drop constraint payroll_service_charge_setups_confirmed_by_fkey;
alter table public.payroll_service_charge_setups add constraint payroll_service_charge_setups_created_by_fkey foreign key(created_by) references auth.users(id);
alter table public.payroll_service_charge_setups add constraint payroll_service_charge_setups_updated_by_fkey foreign key(updated_by) references auth.users(id);
alter table public.payroll_service_charge_setups add constraint payroll_service_charge_setups_confirmed_by_fkey foreign key(confirmed_by) references auth.users(id);

alter table public.payroll_service_charge_allocations drop constraint payroll_service_charge_allocations_override_approved_by_fkey;
alter table public.payroll_service_charge_allocations add constraint payroll_service_charge_allocations_override_approved_by_fkey foreign key(override_approved_by) references auth.users(id);
alter table public.payroll_service_charge_snapshots drop constraint payroll_service_charge_snapshots_created_by_fkey;
alter table public.payroll_service_charge_snapshots add constraint payroll_service_charge_snapshots_created_by_fkey foreign key(created_by) references auth.users(id);
alter table public.payroll_service_charge_postings drop constraint payroll_service_charge_postings_released_by_fkey;
alter table public.payroll_service_charge_postings add constraint payroll_service_charge_postings_released_by_fkey foreign key(released_by) references auth.users(id);
alter table public.payroll_service_charge_audit drop constraint payroll_service_charge_audit_actor_id_fkey;
alter table public.payroll_service_charge_audit add constraint payroll_service_charge_audit_actor_id_fkey foreign key(actor_id) references auth.users(id);

create or replace function private.release_payroll_service_charge() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_snapshot uuid;v_setup uuid;v_actor uuid;begin
 select auth_user_id into v_actor from public.hris_users where id=new.recorded_by;
 if v_actor is null then raise exception 'Active payroll release actor is required.' using errcode='42501';end if;
 select nullif(source_snapshot->>'serviceChargeSnapshotId','')::uuid into v_snapshot from public.payroll_approval_runs where id=new.run_id;
 if v_snapshot is null then return new;end if;
 select setup_id into v_setup from public.payroll_service_charge_snapshots where id=v_snapshot;
 insert into public.payroll_service_charge_postings(snapshot_id,approval_run_id,employee_id,amount,released_by)
 select v_snapshot,new.run_id,a.employee_id,a.amount,v_actor from public.payroll_service_charge_allocations a where a.setup_id=v_setup and a.selected
 on conflict(approval_run_id,employee_id) do nothing;
 update public.payroll_service_charge_setups set status='Released',released_at=clock_timestamp(),updated_by=v_actor,updated_at=clock_timestamp() where id=v_setup;
 update public.payroll_service_charge_allocations set inclusion_status='Released',updated_at=clock_timestamp() where setup_id=v_setup and selected;
 insert into public.payroll_service_charge_audit(setup_id,snapshot_id,actor_id,action,new_value,reason)
 values(v_setup,v_snapshot,v_actor,'released',(select snapshot from public.payroll_service_charge_snapshots where id=v_snapshot),'Released with payroll disbursement '||new.id::text);
 return new;
end $$;

create or replace function public.get_payroll_service_charge(p_scope_id uuid,p_from date,p_to date,p_pay_date date default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_id uuid;v_result jsonb;
begin
 if not private.payroll_service_charge_permission(p_scope_id,'view') then raise exception 'Scoped payroll access required.' using errcode='42501';end if;
 select id into v_id from public.payroll_service_charge_setups where scope_id=p_scope_id and period_from=p_from and period_to=p_to and (p_pay_date is null or pay_date=p_pay_date) order by version desc limit 1;
 if v_id is null then return jsonb_build_object('configured',false,'scopeId',p_scope_id,'from',p_from,'to',p_to,'canManage',private.payroll_service_charge_permission(p_scope_id,'manage'));end if;
 v_result:=private.payroll_service_charge_setup_json(v_id);
 return jsonb_build_object('configured',true,'canManage',private.payroll_service_charge_permission(p_scope_id,'manage'),'setup',v_result,
  'audit',coalesce((select jsonb_agg(jsonb_build_object('action',a.action,'reason',a.reason,'at',a.created_at,'actor',h.full_name,'previous',a.previous_value,'next',a.new_value) order by a.created_at desc) from public.payroll_service_charge_audit a left join public.hris_users h on h.auth_user_id=a.actor_id where a.setup_id=v_id),'[]'::jsonb));
end $$;

revoke all on function private.release_payroll_service_charge() from public,anon,authenticated;
revoke all on function public.get_payroll_service_charge(uuid,date,date,date) from public,anon,authenticated;
grant execute on function public.get_payroll_service_charge(uuid,date,date,date) to authenticated;
