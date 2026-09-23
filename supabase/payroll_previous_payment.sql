-- Previous payments are evidence, never a second disbursement or loan posting.
create table private.payroll_previous_payments (
 id uuid primary key default gen_random_uuid(),
 scope_id uuid not null references public.payroll_access_scopes(id),
 date_from date not null,date_to date not null,
 amount numeric(16,2) not null check(amount>0),paid_on date not null,
 reference text not null check(length(trim(reference))>0),
 evidence text not null check(evidence ~ '^https://'),
 recorded_by uuid not null references public.hris_users(id),
 recorded_at timestamptz not null default clock_timestamp(),
 unique(scope_id,reference),check(date_to>=date_from)
);
create table private.payroll_previous_payment_reviews (
 payment_id uuid primary key references private.payroll_previous_payments(id),
 decision text not null check(decision in('verified','rejected')),
 note text not null,reviewed_by uuid not null references public.hris_users(id),
 reviewed_at timestamptz not null default clock_timestamp()
);
create index payroll_previous_payment_period on private.payroll_previous_payments(scope_id,date_from,date_to);
alter table private.payroll_previous_payments enable row level security;
alter table private.payroll_previous_payment_reviews enable row level security;
revoke all on private.payroll_previous_payments,private.payroll_previous_payment_reviews from public,anon,authenticated;
create trigger immutable before update or delete on private.payroll_previous_payments for each row execute function private.payroll_audit_immutable();
create trigger immutable before update or delete on private.payroll_previous_payment_reviews for each row execute function private.payroll_audit_immutable();

create function private.previous_payment_can_review(p_scope uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.payroll_actor_id() is not null
 and private.payroll_gross_permission(p_scope,'view') and
 (public.has_active_role('Board of Director') or (public.has_active_role('Finance Staff') and private.payroll_has_access('authorize_finance',p_scope)))
$$;
create function public.get_payroll_previous_payments(p_scope uuid,p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$begin
 if auth.uid() is null or private.payroll_actor_id() is null or not private.payroll_gross_permission(p_scope,'view') then raise exception 'Payroll access required.' using errcode='42501';end if;
 return jsonb_build_object('canRecord',private.historical_reconciliation_user(public.current_hris_user_id()) or private.previous_payment_can_review(p_scope),
 'records',(select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('status',coalesce(r.decision,'pending_verification'),'reviewed_by',r.reviewed_by,'note',r.note,
 'canReview',r.payment_id is null and p.recorded_by<>public.current_hris_user_id() and private.previous_payment_can_review(p_scope)) order by p.recorded_at),'[]')
 from private.payroll_previous_payments p left join private.payroll_previous_payment_reviews r on r.payment_id=p.id
 where p.scope_id=p_scope and p.date_from=p_from and p.date_to=p_to));
end $$;
create function public.record_payroll_previous_payment(p_scope uuid,p_from date,p_to date,p_amount text,p_paid_on date,p_reference text,p_evidence text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id();amount numeric;existing private.payroll_previous_payments;key text;
begin
 if auth.uid() is null or private.payroll_actor_id() is null or not private.payroll_gross_permission(p_scope,'view')
 or not(private.historical_reconciliation_user(actor) or private.previous_payment_can_review(p_scope)) then raise exception 'Authorized HR, BOD or Finance access required.' using errcode='42501';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>31 or p_paid_on is null or p_paid_on>(now() at time zone 'Asia/Manila')::date
 or p_amount is null or p_amount!~'^[0-9]+([.][0-9]{1,2})?$' or coalesce(trim(p_reference),'')='' or coalesce(p_evidence,'')!~'^https://[^[:space:]]+$' then raise exception 'Enter the actual positive amount, payment date, reference and an accessible HTTPS evidence document.';end if;
 amount:=p_amount::numeric;if amount<=0 then raise exception 'Actual payment amount must be greater than zero.';end if;
 key:='regular:'||p_scope::text||':'||p_from::text||':'||p_to::text;
 perform pg_advisory_xact_lock(hashtextextended('payroll-settlement:'||key,0));
 select * into existing from private.payroll_previous_payments where scope_id=p_scope and reference=trim(p_reference);
 if existing.id is not null then
  if existing.date_from=p_from and existing.date_to=p_to and existing.amount=amount and existing.paid_on=p_paid_on and existing.evidence=p_evidence then return existing.id;end if;
  raise exception 'This payment reference already belongs to different evidence.';
 end if;
 if exists(select 1 from public.payroll_disbursements where settlement_key=key)
 or exists(select 1 from public.payroll_payment_batches b where b.settlement_key=key and not exists(select 1 from public.payroll_payment_closures c where c.batch_id=b.id)) then
 raise exception 'A payment or active payment batch already exists. Reconcile its outcomes in Payments & Reports before recording external payment evidence.';end if;
 insert into private.payroll_previous_payments(scope_id,date_from,date_to,amount,paid_on,reference,evidence,recorded_by)
 values(p_scope,p_from,p_to,amount,p_paid_on,trim(p_reference),p_evidence,actor) returning id into existing.id;
 return existing.id;
end $$;
create function public.review_payroll_previous_payment(p_id uuid,p_decision text,p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare p private.payroll_previous_payments;begin
 select * into strict p from private.payroll_previous_payments where id=p_id;
 if not private.previous_payment_can_review(p.scope_id) or p.recorded_by=public.current_hris_user_id() then raise exception 'Independent authorized Finance or BOD verification is required.' using errcode='42501';end if;
 if p_decision not in('verified','rejected') or coalesce(trim(p_note),'')='' then raise exception 'Enter your evidence verification or rejection note.';end if;
 perform pg_advisory_xact_lock(hashtextextended('payroll-settlement:regular:'||p.scope_id::text||':'||p.date_from::text||':'||p.date_to::text,0));
 insert into private.payroll_previous_payment_reviews(payment_id,decision,note,reviewed_by) values(p.id,p_decision,trim(p_note),public.current_hris_user_id());
end $$;
create function private.guard_previous_payroll_payment() returns trigger language plpgsql security definer set search_path='' as $$
declare key text;begin
 if tg_table_name='payroll_payment_attempts' then select settlement_key into key from public.payroll_payment_batches where id=new.batch_id;
 else key:=new.settlement_key;end if;
 perform pg_advisory_xact_lock(hashtextextended('payroll-settlement:'||key,0));
 if exists(select 1 from private.payroll_previous_payments p left join private.payroll_previous_payment_reviews r on r.payment_id=p.id
 where key='regular:'||p.scope_id::text||':'||p.date_from::text||':'||p.date_to::text and coalesce(r.decision,'pending_verification')<>'rejected') then
 raise exception 'Previous payment is recorded for this payroll. A second disbursement is blocked. Verify the evidence and review any difference; do not pay this payroll again.';end if;
 return new;
end $$;
create trigger previous_payment_guard before insert on public.payroll_payment_batches for each row execute function private.guard_previous_payroll_payment();
create trigger previous_payment_guard before insert on public.payroll_payment_attempts for each row execute function private.guard_previous_payroll_payment();
create trigger previous_payment_guard before insert on public.payroll_disbursements for each row execute function private.guard_previous_payroll_payment();
revoke all on function private.previous_payment_can_review(uuid),private.guard_previous_payroll_payment() from public,anon,authenticated;
revoke all on function public.get_payroll_previous_payments(uuid,date,date),public.record_payroll_previous_payment(uuid,date,date,text,date,text,text),public.review_payroll_previous_payment(uuid,text,text) from public,anon;
grant execute on function public.get_payroll_previous_payments(uuid,date,date),public.record_payroll_previous_payment(uuid,date,date,text,date,text,text),public.review_payroll_previous_payment(uuid,text,text) to authenticated;
notify pgrst,'reload schema';
