-- PostgREST safe-update enforcement also applies inside security-definer workers.
-- Select the singleton explicitly; preserve all authorization and queue behavior.
create or replace function public.phone_push_worker(p_timestamp bigint,p_nonce uuid,p_action text,p_payload text,p_signature text) returns jsonb language plpgsql security definer set search_path='' as $$
declare secret text;expected text;args jsonb;j phone_push_private.jobs;d phone_push_private.devices;lease_id uuid;results jsonb:='[]';item jsonb;st text;begin
 select decrypted_secret into secret from vault.decrypted_secrets where name='tng_phone_push_signing';
 if p_timestamp is null or p_nonce is null or p_action is null or p_payload is null or secret is null or abs(extract(epoch from clock_timestamp())-p_timestamp)>120 or length(p_payload)>65536 then raise exception 'Unauthorized push worker' using errcode='42501';end if;
 expected:=encode(extensions.hmac(convert_to(p_timestamp::text||E'\n'||p_nonce::text||E'\n'||p_action||E'\n'||p_payload,'UTF8'),convert_to(secret,'UTF8'),'sha256'),'hex');
 if p_signature is null or length(p_signature)<>64 or p_signature<>expected then raise exception 'Unauthorized push worker' using errcode='42501';end if;
 insert into phone_push_private.requests(nonce) values(p_nonce) on conflict do nothing;
 if not found then raise exception 'Push worker request already processed' using errcode='42501';end if;
 args:=p_payload::jsonb;
 if p_action='dispatch' then return jsonb_build_object('ok',true);
 elsif p_action='claim' then
 if not (select enabled from phone_push_private.configuration) then return '[]'::jsonb;end if;
 update phone_push_private.worker_health set last_claim_at=now() where singleton=true;
 -- Drop delivery metadata after 60 days. Operational completion/audit records are unaffected.
 delete from phone_push_private.requests where created_at<now()-interval '10 minutes';
 delete from phone_push_private.jobs where created_at<now()-interval '60 days' and state not in('pending','sending');
 update phone_push_private.jobs set state='cancelled',lease=null,lease_until=null where state in('pending','sending') and expires_at<=now();
 for j in select * from phone_push_private.jobs where (state='pending' or (state='sending' and lease_until<now())) and next_at<=now() and (args->>'job_id' is null or id=(args->>'job_id')::uuid) order by created_at for update skip locked limit 30 loop
 select * into d from phone_push_private.devices where id=j.device_id;
 if not d.active or d.user_id<>j.user_id or d.generation<>j.generation
 or not exists(select 1 from public.hris_users where id=j.user_id and auth_user_id=d.auth_user_id and lower(status)='active')
 or not exists(select 1 from auth.sessions where id=d.session_id and user_id=d.auth_user_id)
 or (j.kind<>'test' and not coalesce((d.preferences->>j.kind)::boolean,true))
 or (j.notification_id is not null and not exists(select 1 from public.notifications where id=j.notification_id and not is_read))
 or (j.link like '%assignment=%' and not exists(select 1 from public.ops_assignments a where a.id::text=substring(j.link from 'assignment=([0-9a-f-]{36})') and a.assignee_id=j.user_id and a.status in('Assigned','In Progress') and operations_private.member(j.user_id,a.business_unit_id))) then
 update phone_push_private.jobs set state='cancelled',lease=null,lease_until=null where id=j.id;continue;end if;
 if j.kind='reminders' and exists(select 1 from operations_private.ops_snoozes s where s.assignment_id::text=substring(j.link from 'assignment=([0-9a-f-]{36})') and s.user_id=j.user_id and s.state='Queued' and s.until_at>now()) then
 update phone_push_private.jobs set state='pending',lease=null,lease_until=null,next_at=(select until_at from operations_private.ops_snoozes s where s.assignment_id::text=substring(j.link from 'assignment=([0-9a-f-]{36})') and s.user_id=j.user_id) where id=j.id;continue;end if;
 lease_id:=gen_random_uuid();update phone_push_private.jobs set state='sending',lease=lease_id,lease_until=now()+interval '3 minutes',attempts=attempts+1 where id=j.id;
 results:=results||jsonb_build_array(jsonb_build_object('id',j.id,'lease',lease_id,'subscription',d.subscription,'expires_at',j.expires_at,'payload',jsonb_build_object(
 'title',case j.kind when 'test' then 'TNG HRIS · Notifications enabled' when 'assignments' then 'TNG HRIS · New task assigned' when 'coverage' then 'TNG HRIS · Team coverage needs attention' else 'TNG HRIS · Task reminder' end,
 'body',case when j.kind='test' then 'Your phone can receive TNG HRIS alerts. Tap to return to HRIS.' else 'Open Operations Station to view the latest update.' end,
 'url',j.link,'owner',j.user_id,'job',j.id,'receipt',j.receipt_token,'tag','tng-hris-'||j.id)));
 end loop;return results;
 elsif p_action='finish' then
 for item in select value from jsonb_array_elements(args->'results') loop
 select * into j from phone_push_private.jobs where id=(item->>'id')::uuid and lease=(item->>'lease')::uuid and state='sending' for update;
 if not found then continue;end if;st:=item->>'status';
 if st='sent' then update phone_push_private.jobs set state='sent',accepted_at=now(),lease=null,lease_until=null where id=j.id;update phone_push_private.devices set last_accepted_at=now() where id=j.device_id and user_id=j.user_id and generation=j.generation;
 elsif st in('expired','invalid') then update phone_push_private.jobs set state='failed',lease=null,lease_until=null where id=j.id;update phone_push_private.devices set active=false,generation=generation+1,updated_at=now() where id=j.device_id and user_id=j.user_id and generation=j.generation;
 else update phone_push_private.jobs set state=case when attempts>=4 then 'failed' else 'pending' end,next_at=now()+make_interval(mins=>least(30,attempts*attempts)),lease=null,lease_until=null where id=j.id;end if;
 end loop;update phone_push_private.worker_health set last_finish_at=now() where singleton=true;return jsonb_build_object('ok',true);
 else raise exception 'Unsupported push worker action';end if;
end$$;
create or replace function phone_push_private.dispatch_tick() returns void language plpgsql security definer set search_path='' as $$
declare secret text;c phone_push_private.configuration;t bigint:=floor(extract(epoch from clock_timestamp()));n uuid:=gen_random_uuid();s text;r bigint;begin
 select * into c from phone_push_private.configuration;
 if not c.enabled or c.dispatch_url='' or not exists(select 1 from phone_push_private.jobs where (state='pending' or (state='sending' and lease_until<now())) and next_at<=now()) then return;end if;
 select decrypted_secret into secret from vault.decrypted_secrets where name='tng_phone_push_signing';if secret is null then return;end if;
 s:=encode(extensions.hmac(convert_to(t::text||E'\n'||n::text||E'\ndispatch\n{}','UTF8'),convert_to(secret,'UTF8'),'sha256'),'hex');
 r:=net.http_post(url:=c.dispatch_url,body:=jsonb_build_object('timestamp',t,'nonce',n,'signature',s),headers:='{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds:=60000);
 update phone_push_private.worker_health set last_requested_at=now(),request_id=r where singleton=true;
end$$;
