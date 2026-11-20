-- Email is not proof of receipt. Existing receipt/response rules remain authoritative.
create table private.nte_email_deliveries (
 id uuid primary key default gen_random_uuid(), nte_id uuid not null references public.ntes(id),
 kind text not null check(kind in ('issued','reminder')), event_key text not null unique,
 deadline timestamptz, status text not null default 'queued', created_at timestamptz not null default now(),
 attempted_at timestamptz, first_attempt_at timestamptz, attempts integer not null default 0,
 token uuid, expires_at timestamptz, payload jsonb, provider_id text, error_code text, sent_at timestamptz
);
alter table private.nte_email_deliveries enable row level security;
revoke all on private.nte_email_deliveries from public,anon,authenticated;
create function private.queue_nte_issue_email() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status::text='Issued' and (tg_op='INSERT' or old.status::text is distinct from 'Issued') then
  insert into private.nte_email_deliveries(nte_id,kind,event_key) values(new.id,'issued',new.id||':issued:'||coalesce(new.approval_version,1)) on conflict do nothing;
 end if; return new;
end $$;
create trigger nte_issue_email after insert or update of status on public.ntes for each row execute function private.queue_nte_issue_email();

create function private.nte_email_eligible(d private.nte_email_deliveries) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ntes n where n.id=d.nte_id and n.status::text in ('Issued','Response Submitted','Hearing Scheduled') and
 (d.kind='issued' or (nullif(trim(n.employee_response),'') is null and n.response_date is null and exists
 (select 1 from private.nte_receipts r where r.nte_id=n.id and r.closed_at is null and
 r.deadline_exclusive=d.deadline and now()>=r.deadline_exclusive-interval '24 hours' and now()<r.deadline_exclusive))));
$$;
create function private.dispatch_nte_emails() returns void language plpgsql security definer set search_path='' as $$
declare d private.nte_email_deliveries; t uuid;
begin
 insert into private.nte_email_deliveries(nte_id,kind,event_key,deadline)
 select n.id,'reminder',n.id||':reminder:'||extract(epoch from r.deadline_exclusive),r.deadline_exclusive
 from public.ntes n join private.nte_receipts r on r.nte_id=n.id where r.closed_at is null
 and n.status::text in ('Issued','Hearing Scheduled') and nullif(trim(n.employee_response),'') is null and n.response_date is null
 and now()>=r.deadline_exclusive-interval '24 hours' and now()<r.deadline_exclusive on conflict do nothing;
 for d in select * from private.nte_email_deliveries where status in ('queued','sending','failed')
 and (expires_at is null or expires_at<now()) order by created_at limit 20 for update skip locked loop
  if not private.nte_email_eligible(d) then
   update private.nte_email_deliveries set status='cancelled',error_code='No longer applicable' where id=d.id;continue;
  end if;
  -- Resend retains idempotency keys for 24h. Never retry ambiguous delivery beyond that window.
  if d.first_attempt_at<now()-interval '23 hours' then
   update private.nte_email_deliveries set status='review',error_code='Delivery needs review; retry window ended' where id=d.id;continue;
  end if;
  t:=gen_random_uuid();
  update private.nte_email_deliveries set status='queued',token=t,expires_at=now()+interval '10 minutes',
   attempted_at=now(),first_attempt_at=coalesce(first_attempt_at,now()),attempts=attempts+1 where id=d.id;
  perform net.http_post(url:='https://kpogfmwsxwikfilxhcqh.supabase.co/functions/v1/nte-employee-email',
   body:=jsonb_build_object('token',t),headers:='{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds:=20000);
 end loop;
end $$;
create function public.claim_nte_employee_email(p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.nte_email_deliveries; p jsonb;
begin
 select * into d from private.nte_email_deliveries where token=p_token and status='queued' and expires_at>now() for update;
 if not found then return null;end if;
 if not private.nte_email_eligible(d) then update private.nte_email_deliveries set status='cancelled' where id=d.id;return null;end if;
 select jsonb_build_object('email',u.email,'name',n.recipient_name_snapshot,'number',n.nte_number,'nteId',n.id,'kind',d.kind,
 'deadline',case when d.kind='reminder' then d.deadline-interval '1 millisecond' else null end)
 into p from public.ntes n join public.hris_users u on u.id=n.recipient_employee_id where n.id=d.nte_id;
 if p is null or coalesce(p->>'email','') !~ '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$' then
  update private.nte_email_deliveries set status='failed',error_code='Missing valid employee email' where id=d.id;return null;
 end if;
 -- Once a provider attempt is possible, retries use the exact same payload.
 if d.payload is not null and d.payload->>'email' is distinct from p->>'email' then
  update private.nte_email_deliveries set status='review',error_code='Recipient email changed during delivery' where id=d.id;return null;
 end if;
 update private.nte_email_deliveries set status='sending',payload=coalesce(payload,p) where id=d.id;
 return jsonb_build_object('id',d.id,'payload',coalesce(d.payload,p));
end $$;
create function public.finish_nte_employee_email(p_token uuid,p_provider text,p_error text) returns boolean language plpgsql security definer set search_path='' as $$
declare d private.nte_email_deliveries;
begin
 update private.nte_email_deliveries set status=case when p_provider is not null then 'sent' else 'failed' end,
 provider_id=p_provider,error_code=left(p_error,160),sent_at=case when p_provider is not null then now() end
 where token=p_token and status='sending' returning * into d;
 if not found then return false;end if;
 if p_provider is not null then perform private.nte_event(d.nte_id,'Employee email accepted by provider',jsonb_build_object('kind',d.kind,'deliveryId',d.id),'nte-email:'||d.id);end if;
 return true;
end $$;
revoke all on function private.queue_nte_issue_email(),private.nte_email_eligible(private.nte_email_deliveries),private.dispatch_nte_emails(),public.claim_nte_employee_email(uuid),public.finish_nte_employee_email(uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_nte_employee_email(uuid),public.finish_nte_employee_email(uuid,text,text) to service_role;
select cron.schedule('nte-employee-email','* * * * *','select private.dispatch_nte_emails()');
