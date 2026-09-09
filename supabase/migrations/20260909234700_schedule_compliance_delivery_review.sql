-- Bounded retries use the same persisted payload and provider idempotency key.
create or replace function public.finish_schedule_compliance_email(p_id uuid,p_token uuid,p_provider text,p_error text) returns void language plpgsql security definer set search_path='' as $$begin
 update schedule_compliance.deliveries set status=case when p_provider is not null then 'sent' else 'failed' end,provider_id=p_provider,error=left(p_error,300),lease_until=now()+interval '1 second',updated_at=clock_timestamp() where id=p_id and lease=p_token;
end $$;
create function public.get_schedule_compliance_deliveries() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not schedule_compliance.hr() then raise exception 'HR access required' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from (
 select h.full_name as recipient,manager_id,week,event,status,attempts,error,updated_at
 from schedule_compliance.deliveries d join public.hris_users h on h.id=d.recipient_id order by d.updated_at desc limit 50
 ) d);
end $$;
revoke all on function public.get_schedule_compliance_deliveries() from public,anon;
grant execute on function public.get_schedule_compliance_deliveries() to authenticated;
notify pgrst,'reload schema';
