-- Home-screen web push. Private endpoint/key records; existing HRIS identities only.
create schema if not exists phone_push_private;
revoke all on schema phone_push_private from public,anon,authenticated;
create table phone_push_private.configuration(
 singleton boolean primary key default true check(singleton), public_key text not null default '', dispatch_url text not null default '', enabled boolean not null default false
);
insert into phone_push_private.configuration(singleton) values(true);
create table phone_push_private.devices(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.hris_users(id), auth_user_id uuid not null,
 session_id uuid not null, endpoint text not null unique, subscription jsonb not null, active boolean not null default true,
 preferences jsonb not null default '{"assignments":true,"reminders":true,"coverage":true}', generation integer not null default 1,
 label text not null default 'This device', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), last_accepted_at timestamptz, last_displayed_at timestamptz
);
create index phone_devices_user on phone_push_private.devices(user_id) where active;
create index phone_devices_session on phone_push_private.devices(session_id);
create table phone_push_private.jobs(
 id uuid primary key default gen_random_uuid(), device_id uuid not null references phone_push_private.devices(id) on delete cascade,
 user_id uuid not null references public.hris_users(id), generation integer not null, notification_id uuid references public.notifications(id) on delete set null,
 kind text not null check(kind in('assignments','reminders','coverage','test')), link text not null, state text not null default 'pending' check(state in('pending','sending','sent','failed','cancelled')),
 attempts integer not null default 0, next_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '24 hours',
 lease uuid, lease_until timestamptz, receipt_token uuid not null default gen_random_uuid(), created_at timestamptz not null default now(), accepted_at timestamptz, displayed_at timestamptz,
 unique(device_id,notification_id)
);
create index phone_jobs_pending on phone_push_private.jobs(next_at,created_at) where state in('pending','sending');
create index phone_jobs_device on phone_push_private.jobs(device_id,created_at desc);
create index phone_jobs_user on phone_push_private.jobs(user_id);
create index phone_jobs_notification on phone_push_private.jobs(notification_id);
create table phone_push_private.requests(nonce uuid primary key,created_at timestamptz not null default now());
create table phone_push_private.worker_health(singleton boolean primary key default true check(singleton),last_claim_at timestamptz,last_finish_at timestamptz,last_requested_at timestamptz,request_id bigint);
insert into phone_push_private.worker_health(singleton) values(true);
do $$declare t text;begin foreach t in array array['configuration','devices','jobs','requests','worker_health'] loop
 execute format('alter table phone_push_private.%I enable row level security',t);
 execute format('revoke all on phone_push_private.%I from public,anon,authenticated',t);
 end loop;end$$;

create function phone_push_private.actor() returns uuid language plpgsql stable security definer set search_path='' as $$
declare a uuid:=public.current_hris_user_id();begin
 if auth.uid() is null or a is null or not exists(select 1 from public.hris_users where id=a and lower(status)='active') then raise exception 'Active HRIS sign-in required' using errcode='42501';end if;return a;end$$;
create function public.phone_push_configuration() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin perform phone_push_private.actor();return(select jsonb_build_object('enabled',enabled,'public_key',public_key) from phone_push_private.configuration);end$$;
create function public.phone_push_save(p_subscription jsonb,p_preferences jsonb default null,p_label text default 'This device') returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=phone_push_private.actor();ep text:=p_subscription->>'endpoint';d phone_push_private.devices;s uuid:=nullif(auth.jwt()->>'session_id','')::uuid;prefs jsonb;begin
 if s is null or not exists(select 1 from auth.sessions where id=s and user_id=auth.uid()) then raise exception 'Please sign in again' using errcode='42501';end if;
 if not (select enabled from phone_push_private.configuration) then raise exception 'Phone notifications are not enabled yet';end if;
 if length(ep)>4096 or ep !~ '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|[a-z0-9-]+[.]push[.]apple[.]com)/[^#[:space:]]+$'
 or coalesce(p_subscription->'keys'->>'p256dh','') !~ '^[A-Za-z0-9_-]{87}=?$' or coalesce(p_subscription->'keys'->>'auth','') !~ '^[A-Za-z0-9_-]{22}={0,2}$' then raise exception 'This browser provided an unsupported push subscription';end if;
 perform pg_advisory_xact_lock(hashtextextended(ep,747621));
 select * into d from phone_push_private.devices where endpoint=ep for update;
 if (d.id is null or d.user_id<>a or not d.active) and (select count(*) from phone_push_private.devices where user_id=a and active)>=8 then raise exception 'Maximum of 8 notification devices. Disable an unused device first.';end if;
 prefs:=jsonb_build_object('assignments',coalesce((p_preferences->>'assignments')::boolean,true),'reminders',coalesce((p_preferences->>'reminders')::boolean,true),'coverage',coalesce((p_preferences->>'coverage')::boolean,true));
 if d.id is not null and d.user_id=a and p_preferences is null then prefs:=d.preferences;end if;
 insert into phone_push_private.devices(user_id,auth_user_id,session_id,endpoint,subscription,preferences,label) values(a,auth.uid(),s,ep,jsonb_build_object('endpoint',ep,'keys',p_subscription->'keys'),prefs,left(p_label,60))
 on conflict(endpoint) do update set user_id=a,auth_user_id=auth.uid(),session_id=s,subscription=excluded.subscription,preferences=prefs,label=excluded.label,active=true,
 generation=case when devices.user_id<>a or devices.session_id<>s or not devices.active then devices.generation+1 else devices.generation end,updated_at=now() returning * into d;
 return jsonb_build_object('id',d.id,'active',d.active,'preferences',d.preferences,'last_accepted_at',d.last_accepted_at,'last_displayed_at',d.last_displayed_at);
end$$;
create function public.phone_push_status(p_endpoint text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=phone_push_private.actor();begin return(select jsonb_build_object('id',id,'active',active,'preferences',preferences,'last_accepted_at',last_accepted_at,'last_displayed_at',last_displayed_at,
 'last_test',(select jsonb_build_object('state',j.state,'accepted_at',j.accepted_at,'displayed_at',j.displayed_at) from phone_push_private.jobs j where j.device_id=d.id and j.user_id=a and j.generation=d.generation and j.kind='test' order by j.created_at desc limit 1)) from phone_push_private.devices d where endpoint=p_endpoint and user_id=a);end$$;
create function public.phone_push_disable(p_endpoint text) returns void language plpgsql security definer set search_path='' as $$
declare a uuid:=phone_push_private.actor();d uuid;begin
 update phone_push_private.devices set active=false,generation=generation+1,updated_at=now() where endpoint=p_endpoint and user_id=a returning id into d;
end$$;
create function public.phone_push_test(p_device uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=phone_push_private.actor();d phone_push_private.devices;j uuid;begin
 select * into d from phone_push_private.devices where id=p_device and user_id=a and auth_user_id=auth.uid() and active for update;
 if not found then raise exception 'Enable notifications on this device first' using errcode='42501';end if;
 if exists(select 1 from phone_push_private.jobs where device_id=d.id and kind='test' and created_at>now()-interval '30 seconds') then raise exception 'Please wait 30 seconds before sending another test';end if;
 insert into phone_push_private.jobs(device_id,user_id,generation,kind,link,expires_at) values(d.id,a,d.generation,'test','/notifications',now()+interval '10 minutes') returning id into j;
 return jsonb_build_object('job_id',j);
end$$;

create function phone_push_private.queue_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare k text;begin
 if new.link !~ '^/operations([?]|$)' then return new;end if;
 k:=case when new.link like '%view=Coverage%' or new.link like '%view=Maintenance%' then 'coverage' when new.dedupe_key like 'ops-phone-assignment:%' then 'assignments' else 'reminders' end;
 insert into phone_push_private.jobs(device_id,user_id,generation,notification_id,kind,link)
 select id,user_id,generation,new.id,k,new.link from phone_push_private.devices where user_id::text=new.user_id and active and coalesce((preferences->>k)::boolean,true);
 return new;
end$$;
create trigger phone_push_queue after insert on public.notifications for each row execute function phone_push_private.queue_notification();
create function phone_push_private.assignment_notification() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status in('Assigned','In Progress') then
 insert into public.notifications(user_id,type,title,message,link,related_entity_id,dedupe_key)
 values(new.assignee_id::text,'info','New task assigned','Open Operations Station to view your instructions and due date.','/operations?view=Tasks&assignment='||new.id,new.id::text,'ops-phone-assignment:'||new.id) on conflict(user_id,dedupe_key) do nothing;
 end if;return new;
end$$;
create trigger phone_push_assignment after insert on public.ops_assignments for each row execute function phone_push_private.assignment_notification();

-- Dedicated HMAC connection avoids borrowing or exposing a database service-role key.
-- Nonces and signatures bind every request to its action and exact payload. No raw key enters pg_net headers.
create function public.phone_push_worker(p_timestamp bigint,p_nonce uuid,p_action text,p_payload text,p_signature text) returns jsonb language plpgsql security definer set search_path='' as $$
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
 update phone_push_private.worker_health set last_claim_at=now();
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
 end loop;update phone_push_private.worker_health set last_finish_at=now();return jsonb_build_object('ok',true);
 else raise exception 'Unsupported push worker action';end if;
end$$;
-- Narrow capability: receipt can only mark that particular alert displayed, never read or mutate HRIS work.
create function public.phone_push_receipt(p_job uuid,p_token uuid) returns void language sql security definer set search_path='' as $$
 with done as(update phone_push_private.jobs set displayed_at=coalesce(displayed_at,now()) where id=p_job and receipt_token=p_token and state in('sending','sent') returning device_id,user_id,generation)
 update phone_push_private.devices d set last_displayed_at=now() from done where d.id=done.device_id and d.user_id=done.user_id and d.generation=done.generation;
$$;
create function phone_push_private.dispatch_tick() returns void language plpgsql security definer set search_path='' as $$
declare secret text;c phone_push_private.configuration;t bigint:=floor(extract(epoch from clock_timestamp()));n uuid:=gen_random_uuid();s text;r bigint;begin
 select * into c from phone_push_private.configuration;
 if not c.enabled or c.dispatch_url='' or not exists(select 1 from phone_push_private.jobs where (state='pending' or (state='sending' and lease_until<now())) and next_at<=now()) then return;end if;
 select decrypted_secret into secret from vault.decrypted_secrets where name='tng_phone_push_signing';if secret is null then return;end if;
 s:=encode(extensions.hmac(convert_to(t::text||E'\n'||n::text||E'\ndispatch\n{}','UTF8'),convert_to(secret,'UTF8'),'sha256'),'hex');
 r:=net.http_post(url:=c.dispatch_url,body:=jsonb_build_object('timestamp',t,'nonce',n,'signature',s),headers:='{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds:=60000);
 update phone_push_private.worker_health set last_requested_at=now(),request_id=r;
end$$;
-- Keep installation credentials out of migrations; configuration is supplied separately at release.
do $$begin if exists(select 1 from pg_extension where extname='pg_cron') then perform cron.schedule('hris-phone-push','* * * * *','select phone_push_private.dispatch_tick()');end if;end$$;
revoke all on all functions in schema phone_push_private from public,anon,authenticated;
revoke all on function public.phone_push_configuration(),public.phone_push_save(jsonb,jsonb,text),public.phone_push_status(text),public.phone_push_disable(text),public.phone_push_test(uuid),public.phone_push_worker(bigint,uuid,text,text,text),public.phone_push_receipt(uuid,uuid) from public,anon,authenticated;
grant execute on function public.phone_push_configuration(),public.phone_push_save(jsonb,jsonb,text),public.phone_push_status(text),public.phone_push_disable(text),public.phone_push_test(uuid) to authenticated;
grant execute on function public.phone_push_worker(bigint,uuid,text,text,text),public.phone_push_receipt(uuid,uuid) to anon,authenticated;
