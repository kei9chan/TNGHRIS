-- Only the new remaining-balance importer uses a dated balancing adjustment.
-- Older migration batches retain their approved semantics and audit records.
alter function private.activate_leave_balance_migration(uuid,uuid) rename to activate_leave_balance_migration_before_remaining;
create function private.activate_leave_balance_migration(p_batch uuid,p_actor uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r public.leave_balance_migration_rows;existing numeric;begin
 if not exists(select 1 from private.payroll_input_records where kind='leave-balances' and source_id=p_batch) then
  perform private.activate_leave_balance_migration_before_remaining(p_batch,p_actor);return;
 end if;
 for r in select * from public.leave_balance_migration_rows where batch_id=p_batch and validation_status in('valid','review') and leave_kind in('vacation','sick','offset') order by employee_id,row_number loop
  perform pg_advisory_xact_lock(hashtextextended('confirmed-leave:'||r.employee_id,0));
  if r.activated_at is not null then continue;end if;
  perform private.sync_confirmed_leave(r.employee_id,r.as_of_date);
  existing:=private.confirmed_leave_balance(r.employee_id,r.leave_kind,r.as_of_date);
  insert into public.payroll_leave_ledger(employee_id,leave_kind,amount,credit_date,source,event_key,approved_by)
  values(r.employee_id,r.leave_kind,r.remaining_balance-existing,r.as_of_date,'Approved remaining balance adjustment · '||coalesce(r.source,'Opening balance migration'),'migration:'||p_batch||':'||r.id||':remaining',p_actor) on conflict do nothing;
  update public.leave_balance_migration_rows set activated_at=clock_timestamp() where id=r.id;
 end loop;
end $$;
-- Approval routing remains unchanged. Skip only the ledger debit for imported
-- usage already included in an approved end-of-day remaining balance.
do $$declare definition text;needle text:='  if new.final_classification=''lwop'' then return new;end if;';replacement text;begin
 definition:=pg_get_functiondef('private.confirmed_leave_request_accounting()'::regprocedure);
 if strpos(definition,needle)=0 then raise exception 'Leave accounting contract changed; review before applying migration.';end if;
 replacement:=needle||$patch$
  perform pg_advisory_xact_lock(hashtextextended('confirmed-leave:'||new.employee_id,0));
  if exists(select 1 from private.payroll_input_records where kind='leave-taken' and source_id=new.id) then
   if exists(select 1 from public.leave_balance_migration_rows mr join public.leave_balance_migration_batches mb on mb.id=mr.batch_id where mr.employee_id=new.employee_id and mr.leave_kind=k and mr.as_of_date>=new.end_date and mb.status in('pending_hr_manager','pending_bod')) then raise exception 'Approve the imported opening balance before approving leave already included in that balance.';end if;
   if exists(select 1 from public.leave_balance_migration_rows mr join public.leave_balance_migration_batches mb on mb.id=mr.batch_id join private.payroll_input_records ir on ir.source_id=mb.id and ir.kind='leave-balances' where mr.employee_id=new.employee_id and mr.leave_kind=k and mr.as_of_date>=new.end_date and mb.status='approved' and mr.activated_at is not null) then return new;end if;
  end if;
$patch$;
 definition:=replace(definition,needle,replacement);
 definition:=replace(definition,'values(new.employee_id,k,-charge,(now() at time zone ''Asia/Manila'')::date,','values(new.employee_id,k,-charge,case when exists(select 1 from private.payroll_input_records where kind=''leave-taken'' and source_id=new.id) then new.end_date else (now() at time zone ''Asia/Manila'')::date end,');
 execute definition;
end $$;
revoke all on function private.activate_leave_balance_migration(uuid,uuid),private.activate_leave_balance_migration_before_remaining(uuid,uuid) from public,anon,authenticated;
