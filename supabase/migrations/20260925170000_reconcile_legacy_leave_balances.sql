-- Reconcile legacy leave quotas into the authoritative ledger.
-- Older accounts were initialized with zero ledger openings and later had
-- hris_users.leave_quota_* values updated.  Keep the ledger authoritative,
-- preserve its immutable history, and record only the delta that was missing.

create or replace function private.reconcile_legacy_leave_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  kind text;
  desired numeric;
  current_total numeric;
  delta numeric;
  actor uuid;
begin
  foreach kind in array array['vacation','sick','offset'] loop
    desired := case kind
      when 'vacation' then coalesce(new.leave_quota_vacation, 0)
      when 'sick' then coalesce(new.leave_quota_sick, 0)
      else coalesce(new.leave_quota_offset, 0)
    end;
    current_total := coalesce((select sum(l.amount) from public.payroll_leave_ledger l
      where l.employee_id = new.id and l.leave_kind = kind), 0);
    delta := desired - current_total;
    if delta <> 0 then
      actor := coalesce(public.current_hris_user_id(), new.id);
      insert into public.payroll_leave_ledger
        (employee_id, leave_kind, amount, credit_date, source, event_key, approved_by)
      values
        (new.id, kind, delta, (now() at time zone 'Asia/Manila')::date,
         'Authorized legacy leave balance reconciliation',
         'legacy-quota-reconcile:' || new.id::text || ':' || kind || ':' || gen_random_uuid()::text,
         actor);
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function private.reconcile_legacy_leave_quota() from public, anon, authenticated;

-- One-time backfill for balances already changed before this repair.
do $$
declare
  h record;
  kind text;
  desired numeric;
  current_total numeric;
  delta numeric;
begin
  for h in select id, leave_quota_vacation, leave_quota_sick, leave_quota_offset
    from public.hris_users where lower(status) = 'active' loop
    foreach kind in array array['vacation','sick','offset'] loop
      desired := case kind
        when 'vacation' then coalesce(h.leave_quota_vacation, 0)
        when 'sick' then coalesce(h.leave_quota_sick, 0)
        else coalesce(h.leave_quota_offset, 0)
      end;
      current_total := coalesce((select sum(l.amount) from public.payroll_leave_ledger l
        where l.employee_id = h.id and l.leave_kind = kind), 0);
      delta := desired - current_total;
      if delta <> 0 then
        insert into public.payroll_leave_ledger
          (employee_id, leave_kind, amount, credit_date, source, event_key, approved_by)
        values
          (h.id, kind, delta, (now() at time zone 'Asia/Manila')::date,
           'Authorized legacy leave balance reconciliation',
           'legacy-quota-backfill:' || h.id::text || ':' || kind,
           h.id)
        on conflict do nothing;
      end if;
    end loop;
  end loop;
end;
$$;

drop trigger if exists reconcile_legacy_leave_quota on public.hris_users;
create trigger reconcile_legacy_leave_quota
after update of leave_quota_vacation, leave_quota_sick, leave_quota_offset
on public.hris_users
for each row
when (old.leave_quota_vacation is distinct from new.leave_quota_vacation
   or old.leave_quota_sick is distinct from new.leave_quota_sick
   or old.leave_quota_offset is distinct from new.leave_quota_offset)
execute function private.reconcile_legacy_leave_quota();
