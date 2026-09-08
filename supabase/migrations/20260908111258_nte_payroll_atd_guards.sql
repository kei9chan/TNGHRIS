create table private.nte_atd_postings (
 resolution_id uuid not null references public.resolutions(id),disbursement_id uuid not null references public.payroll_disbursements(id),
 pay_date date not null,amount numeric(20,2) not null check(amount>0),posted_at timestamptz not null default now(),
 primary key(resolution_id,pay_date)
);
alter table private.nte_atd_postings enable row level security;
revoke all on private.nte_atd_postings from public,anon,authenticated;
create trigger immutable_atd_posting before update or delete on private.nte_atd_postings for each row execute function private.nte_immutable();
create table private.nte_atd_payment_exceptions (
 resolution_id uuid not null references public.resolutions(id),event_id bigint not null references public.payroll_payment_events(id),
 recorded_at timestamptz not null default now(),primary key(resolution_id,event_id)
);
alter table private.nte_atd_payment_exceptions enable row level security;
revoke all on private.nte_atd_payment_exceptions from public,anon,authenticated;
create trigger immutable_atd_exception before update or delete on private.nte_atd_payment_exceptions for each row execute function private.nte_immutable();

create function public.get_payroll_atd_queue(p_gross_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare g public.payroll_gross_runs;
begin
 select * into g from public.payroll_gross_runs where id=p_gross_id;
 if auth.uid() is null or g.id is null or not private.payroll_net_can_review(g.scope_id) then raise exception 'Finance review permission for this payroll scope is required' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'employeeId',d.employee_id,'employeeName',i.atd->>'employeeName','reference','ATD:'||d.id,
 'basis',i.atd->>'legalBasis','total',i.atd->>'total','perCutoff',i.atd->>'perCutoff','firstDate',i.atd->>'firstDate','finalDate',i.atd->>'finalDate','hrVerifiedAt',i.hr_verified_at,
 'financeApprovedAt',i.finance_approved_at,'remaining',(i.atd->>'total')::numeric-coalesce((select sum(p.amount) from private.nte_atd_postings p where p.resolution_id=d.id),0)))
 from public.resolutions d join private.nte_implementation i on i.resolution_id=d.id where i.employee_signed_at is not null and i.hr_verified_at is not null
 and d.employee_id<>public.current_hris_user_id() and exists(select 1 from jsonb_array_elements(g.result->'employees') e where e->>'employeeId'=d.employee_id::text)),'[]'::jsonb);
end $$;
create function public.approve_payroll_atd(p_gross_id uuid,p_resolution_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare d public.resolutions;i private.nte_implementation;g public.payroll_gross_runs;
begin
 select * into g from public.payroll_gross_runs where id=p_gross_id;
 select * into d from public.resolutions where id=p_resolution_id;
 select * into i from private.nte_implementation where resolution_id=p_resolution_id for update;
 if auth.uid() is null or g.id is null or not public.has_active_role('Finance Staff') or not private.payroll_net_can_review(g.scope_id)
 or not exists(select 1 from jsonb_array_elements(g.result->'employees') e where e->>'employeeId'=d.employee_id::text)
 or d.employee_id=public.current_hris_user_id() or i.hr_verified_by=public.current_hris_user_id() or i.employee_signed_at is null or i.hr_verified_at is null then raise exception 'Independent authorized Finance review is required' using errcode='42501';end if;
 if i.finance_approved_at is not null then return;end if;
 update private.nte_implementation set finance_approved_at=now(),finance_approved_by=public.current_hris_user_id(),status='ATD approved — Payroll pending' where resolution_id=d.id;
 perform private.nte_event(d.nte_id,'ATD Finance approved',jsonb_build_object('resolutionId',d.id));
end $$;
create function private.validate_atd_deduction(p_employee uuid,p_reference text,p_amount numeric,p_pay_date date) returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid;d public.resolutions;i private.nte_implementation;paid numeric;
begin
 if p_reference not like 'ATD:%' then return null;end if;
 rid:=substring(p_reference from 5)::uuid;
 select * into d from public.resolutions where id=rid;
 select * into i from private.nte_implementation where resolution_id=rid for update;
 if d.id is null or d.employee_id<>p_employee or d.employee_acknowledged_at is null or i.employee_signed_at is null or i.hr_verified_at is null or i.finance_approved_at is null then raise exception 'ATD requires separate employee consent, HR verification and Finance approval';end if;
 if exists(select 1 from private.nte_atd_payment_exceptions where resolution_id=rid) then raise exception 'An ATD payment was returned. HR and Finance reconciliation is required before further deductions';end if;
 if p_pay_date is null or p_pay_date<(i.atd->>'firstDate')::date or p_pay_date>(i.atd->>'finalDate')::date or p_pay_date<(d.review_fields->>'effectiveDate')::date then raise exception 'Pay date is outside the authorized ATD period';end if;
 select coalesce(sum(amount),0) into paid from private.nte_atd_postings where resolution_id=rid;
 if p_amount is null or p_amount<=0 or p_amount>least((i.atd->>'perCutoff')::numeric,(i.atd->>'total')::numeric-paid) or exists(select 1 from private.nte_atd_postings where resolution_id=rid and pay_date=p_pay_date) then raise exception 'ATD amount exceeds authorization, is already posted, or is fully paid';end if;
 return rid;
end $$;
create function private.guard_payroll_atd_review() returns trigger language plpgsql security definer set search_path='' as $$
declare e jsonb;item jsonb;seen text[]:='{}';
begin
 for e in select value from jsonb_array_elements(new.inputs->'employees') loop
  for item in select value from jsonb_array_elements(coalesce(e->'deductions','[]')) where value->>'sourceRef' like 'ATD:%' loop
   if item->>'sourceRef'=any(seen) then raise exception 'Duplicate ATD deduction in this payroll review';end if;
   seen:=array_append(seen,item->>'sourceRef');
   perform private.validate_atd_deduction((e->>'employeeId')::uuid,item->>'sourceRef',(item->>'amount')::numeric,(new.inputs->>'payDate')::date);
  end loop;
 end loop;
 return new;
end $$;
create trigger guard_payroll_atd_review before insert on public.payroll_net_reviews for each row execute function private.guard_payroll_atd_review();
create function private.post_payroll_atd() returns trigger language plpgsql security definer set search_path='' as $$
declare snapshot jsonb;e jsonb;item jsonb;rid uuid;paid numeric;d public.resolutions;
begin
 select source_snapshot into snapshot from public.payroll_approval_runs where id=new.run_id;
 for e in select value from jsonb_array_elements(snapshot->'employees') loop
  for item in select value from jsonb_array_elements(coalesce(e->'otherDeductions','[]')) where value->>'sourceRef' like 'ATD:%' and (value->>'amount')::numeric>0 loop
   rid:=private.validate_atd_deduction((e->>'employeeId')::uuid,item->>'sourceRef',(item->>'amount')::numeric,(snapshot->>'payDate')::date);
   insert into private.nte_atd_postings(resolution_id,disbursement_id,pay_date,amount) values(rid,new.id,(snapshot->>'payDate')::date,(item->>'amount')::numeric);
   select * into d from public.resolutions where id=rid;
   perform private.nte_event(d.nte_id,'Authorized payroll deduction posted',jsonb_build_object('resolutionId',rid,'amount',item->>'amount','payDate',snapshot->>'payDate'));
   select sum(amount) into paid from private.nte_atd_postings where resolution_id=rid;
   if paid=(d.review_fields->>'total')::numeric then
    update private.nte_implementation set status='Completed — deduction fully posted' where resolution_id=rid;
    perform set_config('app.nod_rpc','on',true);
    update public.ntes set status='Closed' where id=d.nte_id;
   end if;
  end loop;
 end loop;
 return new;
end $$;
create trigger post_payroll_atd after insert on public.payroll_disbursements for each row execute function private.post_payroll_atd();
create function private.flag_returned_atd_payment() returns trigger language plpgsql security definer set search_path='' as $$
declare r record;
begin
 if new.status='returned' then
  for r in select d.id,d.nte_id from public.payroll_payment_attempts a join public.payroll_payment_batches b on b.id=a.batch_id
   join public.payroll_disbursements p on p.run_id=b.run_id join private.nte_atd_postings x on x.disbursement_id=p.id
   join public.resolutions d on d.id=x.resolution_id and d.employee_id=a.employee_id where a.id=new.attempt_id loop
   insert into private.nte_atd_payment_exceptions(resolution_id,event_id) values(r.id,new.id) on conflict do nothing;
   update private.nte_implementation set status='Payment returned — HR / Finance reconciliation required' where resolution_id=r.id;
   update public.ntes set status='Issued',response_stage='Decision Issued — payment reconciliation pending' where id=r.nte_id;
   perform private.nte_event(r.nte_id,'ATD payment returned — case reopened for reconciliation',jsonb_build_object('resolutionId',r.id,'paymentEventId',new.id));
  end loop;
 end if;return new;
end $$;
create trigger flag_returned_atd_payment after insert on public.payroll_payment_events for each row execute function private.flag_returned_atd_payment();
revoke all on function private.flag_returned_atd_payment() from public,anon,authenticated;
revoke all on function private.validate_atd_deduction(uuid,text,numeric,date),private.guard_payroll_atd_review(),private.post_payroll_atd() from public,anon,authenticated;
revoke all on function public.get_payroll_atd_queue(uuid),public.approve_payroll_atd(uuid,uuid) from public,anon;
grant execute on function public.get_payroll_atd_queue(uuid),public.approve_payroll_atd(uuid,uuid) to authenticated;
notify pgrst,'reload schema';

