-- Installed pure rules and temporary constraint copies only; no real payroll rows.
begin;
set local statement_timeout='30s';
do $$declare p jsonb;denied boolean;begin
 p:=private.payroll_payment_position(1000,400,300);
 if p->>'unpaid'<>'600' or p->>'available'<>'300' or p->>'complete'<>'false' then raise exception 'Partial/pending balance mismatch';end if;
 p:=private.payroll_payment_position(1000,1000,0);if p->>'complete'<>'true' then raise exception 'Complete payment not detected';end if;
 p:=private.payroll_payment_position(1000,0,0);if p->>'available'<>'1000' then raise exception 'Returned/failed funds not available';end if;
 p:=private.payroll_payment_position(0,0,0);if p->>'complete'<>'true' then raise exception 'Zero-net reconciliation mismatch';end if;
 denied:=false;begin perform private.payroll_payment_position(1000,700,400);exception when raise_exception then denied:=true;end;if not denied then raise exception 'Overpayment/reservation accepted';end if;
 denied:=false;begin perform private.payroll_payment_position(1000,-1,0);exception when raise_exception then denied:=true;end;if not denied then raise exception 'Negative confirmation accepted';end if;
 perform private.payroll_payment_transition('pending','confirmed');perform private.payroll_payment_transition('pending','failed');
 perform private.payroll_payment_transition('pending','cancelled');perform private.payroll_payment_transition('confirmed','returned');
 denied:=false;begin perform private.payroll_payment_transition('confirmed','confirmed');exception when serialization_failure then denied:=true;end;if not denied then raise exception 'Double confirmation accepted';end if;
 denied:=false;begin perform private.payroll_payment_transition('pending','returned');exception when serialization_failure then denied:=true;end;if not denied then raise exception 'Unpaid return accepted';end if;
 denied:=false;begin perform private.payroll_payment_transition('failed','confirmed');exception when serialization_failure then denied:=true;end;if not denied then raise exception 'Failure overwritten instead of linked reissue';end if;
end $$;
create temporary table phase8_event_check (like public.payroll_payment_events including all);
insert into phase8_event_check(request_id,attempt_id,status,occurred_on,reference,reason,actor_id)
values('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000011','confirmed',current_date,'Temporary receipt','Temporary constraint verification','00000000-0000-0000-0000-000000000012');
do $$declare denied boolean;begin
 denied:=false;begin insert into phase8_event_check(request_id,attempt_id,status,occurred_on,reference,reason,actor_id)
 select request_id,attempt_id,'returned',occurred_on,reference,reason,actor_id from phase8_event_check limit 1;exception when unique_violation then denied:=true;end;if not denied then raise exception 'Request replay uniqueness missing';end if;
 denied:=false;begin insert into phase8_event_check(request_id,attempt_id,status,occurred_on,reference,reason,actor_id)
 select '00000000-0000-0000-0000-000000000013',attempt_id,status,occurred_on,reference,reason,actor_id from phase8_event_check limit 1;exception when unique_violation then denied:=true;end;if not denied then raise exception 'Duplicate outcome uniqueness missing';end if;
end $$;
select 'PASS: partial, pending, full and zero-net reconciliation; overpayment denial; outcome ordering; retry uniqueness' as result;
rollback;
