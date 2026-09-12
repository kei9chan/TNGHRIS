-- Dedicated public kiosk capabilities. No employee Auth sessions are created.
create schema punch_station;
revoke all on schema punch_station from public,anon,authenticated;
create table punch_station.devices(
 device_id uuid primary key references public.attendance_devices(id), token_hash text not null unique,
 expires_at timestamptz not null, enabled boolean not null default true,
 created_by uuid not null references public.hris_users(id), created_at timestamptz not null default now());
create table punch_station.credentials(
 employee_id uuid primary key references public.hris_users(id),badge_hash text unique,pin_hash text,
 supervisor_hash text,active boolean not null default true);
create table punch_station.attempts(
 id bigint generated always as identity primary key, device_id uuid not null references public.attendance_devices(id),
 employee_id uuid references public.hris_users(id), subject_hash text, success boolean not null,
 reason text not null, created_at timestamptz not null default clock_timestamp());
create index on punch_station.attempts(device_id,created_at);
create index on punch_station.attempts(subject_hash,created_at) where not success;
create table punch_station.tickets(
 token_hash text primary key, device_id uuid not null references public.attendance_devices(id),
 employee_id uuid not null references public.hris_users(id),method text not null,
 expires_at timestamptz not null,used boolean not null default false);
create table punch_station.captures(
 id uuid primary key, device_id uuid not null references public.attendance_devices(id),
 employee_id uuid references public.hris_users(id), badge_hash text, action text not null
 check(action in('CLOCK_IN','START_BREAK','END_BREAK','CLOCK_OUT')),
 method text not null check(method in('BADGE','EMPLOYEE_ID_PIN')), captured_at timestamptz not null,
 received_at timestamptz not null default clock_timestamp(),work_date date,
 photo bytea not null check(octet_length(photo) between 4 and 200000),
 status text not null check(status in('Pending HR verification','Accepted','Rejected')),
 event_id uuid references public.attendance_clock_events(id),reviewed_by uuid references public.hris_users(id),reason text);
create index on punch_station.captures(device_id,received_at desc);
-- Images live in private database storage, atomically with punch evidence; never public URLs.
do $$declare t text;begin foreach t in array array['devices','credentials','attempts','tickets','captures'] loop
 execute format('alter table punch_station.%I enable row level security',t);
 execute format('revoke all on punch_station.%I from public,anon,authenticated',t);end loop;end $$;
create function punch_station.hash(t text) returns text language sql immutable set search_path='' as $$
 select encode(extensions.digest(coalesce(t,''),'sha256'),'hex') $$;
create function punch_station.device(t text) returns uuid language sql stable security definer set search_path='' as $$
 select p.device_id from punch_station.devices p join public.attendance_devices d on d.id=p.device_id
 where p.token_hash=punch_station.hash(t) and p.enabled and p.expires_at>now() and d.active $$;
create function punch_station.context(e uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d date;today date:=(now() at time zone 'Asia/Manila')::date;s jsonb;begin
 select work_date into d from public.attendance_clock_sessions where employee_id=e and state in('working','on_break') limit 1;
 if d is null and not exists(select 1 from public.attendance_clock_sessions where employee_id=e and work_date=today) then
 s:=private.attendance_schedule(e,today-1);
 if (s->>'published')::boolean and exists(select 1 from jsonb_array_elements(s->'entries') x where x->>'kind'='work' and x->>'endDayOffset'='1' and now()<((today+(x->>'end')::time) at time zone 'Asia/Manila')) then d:=today-1;end if;end if;
 return private.attendance_day(e,coalesce(d,today));end $$;
create function public.punch_station_pair(p_device uuid) returns text language plpgsql security definer set search_path='' as $$
declare t text:=encode(extensions.gen_random_bytes(32),'hex');begin
 if not exists(select 1 from public.attendance_devices where id=p_device and active and kind='qr' and private.attendance_bu_admin(business_unit_id)) then raise exception 'Scoped HR/Admin access required' using errcode='42501';end if;
 insert into punch_station.devices(device_id,token_hash,expires_at,created_by) values(p_device,punch_station.hash(t),now()+interval '30 days',public.current_hris_user_id())
 on conflict(device_id) do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at,enabled=true,created_by=excluded.created_by,created_at=now();
 insert into public.attendance_device_audit(device_id,actor,detail) values(p_device,public.current_hris_user_id(),'{"action":"Punch Station paired","expiresInDays":30}');return t;end $$;
create function public.punch_station_credential(p_employee uuid,p_badge text,p_pin text,p_supervisor_pin text,p_active boolean,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.attendance_admin() or not public.can_access_hris_user(p_employee) then raise exception 'Scoped HR/Admin access required' using errcode='42501';end if;
 if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Reason required';end if;
 if p_pin is not null and p_pin!~'^[0-9]{4}$' then raise exception 'Personal PIN must be four digits';end if;
 if p_supervisor_pin is not null and p_supervisor_pin!~'^[0-9]{8,12}$' then raise exception 'Supervisor PIN must be 8–12 digits';end if;
 if p_badge is not null and p_badge!~'^[A-Za-z0-9_-]{8,128}$' then raise exception 'Invalid badge reader output';end if;
 insert into punch_station.credentials(employee_id,badge_hash,pin_hash,supervisor_hash,active)
 values(p_employee,case when p_badge is not null then punch_station.hash(p_badge) end,case when p_pin is not null then extensions.crypt(p_pin,extensions.gen_salt('bf',10)) end,
 case when p_supervisor_pin is not null then extensions.crypt(p_supervisor_pin,extensions.gen_salt('bf',10)) end,p_active)
 on conflict(employee_id) do update set badge_hash=coalesce(excluded.badge_hash,punch_station.credentials.badge_hash),pin_hash=coalesce(excluded.pin_hash,punch_station.credentials.pin_hash),supervisor_hash=coalesce(excluded.supervisor_hash,punch_station.credentials.supervisor_hash),active=excluded.active;
 -- Existing audit structure, containing no credentials.
 insert into public.attendance_device_audit(device_id,actor,detail)
 select d.id,public.current_hris_user_id(),jsonb_build_object('action','Punch credential changed','employee',p_employee,'active',p_active,'reason',p_reason)
 from public.attendance_devices d join public.hris_users h on h.business_unit_id=d.business_unit_id where h.id=p_employee and d.active;
end $$;
create function public.punch_station_status(p_device_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare d uuid:=punch_station.device(p_device_token);begin
 if d is null then return jsonb_build_object('error','This Punch Station needs supervisor setup before it can be used.');end if;
 return (select jsonb_build_object('deviceId',d,'name',a.name,'expiresAt',p.expires_at,'serverTime',clock_timestamp()) from public.attendance_devices a join punch_station.devices p on p.device_id=a.id where a.id=d);end $$;
create function public.punch_station_auth(p_device_token text,p_badge text default null,p_employee_code text default null,p_pin text default null,p_supervisor boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare d uuid:=punch_station.device(p_device_token);e uuid;subject text:=punch_station.hash(coalesce(p_employee_code,p_badge));c punch_station.credentials;t text;ctx jsonb;ok boolean:=false;begin
 if d is null then return jsonb_build_object('error','This Punch Station needs supervisor setup before it can be used.');end if;
 perform pg_advisory_xact_lock(hashtextextended('punch-auth:'||d::text,0));
 if (select count(*) from punch_station.attempts where device_id=d and created_at>now()-interval '1 minute')>=60 or
 (select count(*) from punch_station.attempts where subject_hash=subject and not success and created_at>now()-interval '15 minutes')>=5 then return jsonb_build_object('error','Too many attempts. Please contact your supervisor.');end if;
 select h.id into e from public.hris_users h join punch_station.credentials k on k.employee_id=h.id join public.attendance_devices a on a.id=d
 where lower(h.status)='active' and h.business_unit_id=a.business_unit_id and k.active and not coalesce(h.is_duplicate,false)
 and ((p_badge is not null and not p_supervisor and k.badge_hash=punch_station.hash(p_badge)) or (p_badge is null and h.employee_id=p_employee_code));
 if p_badge is null and (select count(*) from public.hris_users h join public.attendance_devices a on a.id=d where h.employee_id=p_employee_code and h.business_unit_id=a.business_unit_id)<>1 then e:=null;end if;
 select * into c from punch_station.credentials where employee_id=e;
 if e is not null then
 if p_supervisor then ok:=coalesce(extensions.crypt(coalesce(p_pin,''),c.supervisor_hash)=c.supervisor_hash,false) and exists(select 1 from private.effective_role_ids(e) r where r.role_id in('Admin','HR Manager','HR Staff','Business Unit Manager','Manager'));
 else ok:=p_badge is not null or coalesce(extensions.crypt(coalesce(p_pin,''),c.pin_hash)=c.pin_hash,false);end if;end if;
 insert into punch_station.attempts(device_id,employee_id,subject_hash,success,reason) values(d,e,subject,ok,case when ok then case when p_supervisor then 'Supervisor authenticated' else 'Authenticated' end else 'Credential rejected' end);
 if not ok then return jsonb_build_object('error','Badge or employee ID/PIN not recognized. Please try again.');end if;
 t:=encode(extensions.gen_random_bytes(32),'hex');
 insert into punch_station.tickets values(punch_station.hash(t),d,e,case when p_supervisor then 'SUPERVISOR' when p_badge is null then 'EMPLOYEE_ID_PIN' else 'BADGE' end,now()+interval '60 seconds',false);
 if p_supervisor then return jsonb_build_object('ticket',t,'supervisor',true,'message','Supervisor access active — camera test and reconnect only.');end if;
 ctx:=punch_station.context(e);
 return jsonb_build_object('ticket',t,'name',(select coalesce(first_name,'Employee') from public.hris_users where id=e),'state',ctx->>'state','requiresClock',ctx->'requiresClock','workDate',ctx->>'workDate','revision',ctx->'revision');end $$;
-- Same source tables, state transition and published-schedule validators as employee clocking.
create function punch_station.record(e uuid,a text,k uuid,stamp timestamptz,d date,actor uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare ctx jsonb;s public.attendance_clock_sessions;sch jsonb;line jsonb;next_state text;ev uuid;prev timestamptz;begin
 perform pg_advisory_xact_lock(hashtextextended('attendance-clock:'||e::text,0));
 ctx:=private.attendance_day(e,d);
 if not coalesce((ctx->>'requiresClock')::boolean,false) then raise exception 'Attendance is handled by your schedule';end if;
 if exists(select 1 from public.attendance_clock_adjustments x join public.attendance_clock_sessions c on c.id=x.session_id where c.employee_id=e and c.work_date=d) then raise exception 'This day has HR corrections; use attendance review';end if;
 next_state:=private.attendance_next_state(ctx->>'state',a);
 select max(occurred_at) into prev from public.attendance_clock_events where employee_id=e;
 if stamp>clock_timestamp()+interval '1 minute' or stamp<now()-interval '30 days' or (prev is not null and stamp<=prev) then raise exception 'Review recorded time and punch sequence';end if;
 if a='CLOCK_IN' then
 perform pg_advisory_xact_lock_shared(hashtextextended('payroll-schedule-publication',0));
 sch:=private.attendance_schedule(e,d);
 if not coalesce((sch->>'published')::boolean,false) or jsonb_array_length(sch->'entries')=0 then raise exception 'Publish the working schedule first';end if;
 for line in select value from jsonb_array_elements(sch->'entries') loop perform private.payroll_schedule_validate(line);if line->>'kind'<>'work' then raise exception 'No working shift scheduled';end if;end loop;
 insert into public.attendance_clock_sessions(employee_id,work_date,publication_id,schedule_snapshot) values(e,d,(sch->>'publicationId')::uuid,sch) returning * into s;
 else select * into s from public.attendance_clock_sessions where id=(ctx->>'sessionId')::uuid and employee_id=e;end if;
 insert into public.attendance_clock_events(session_id,employee_id,action,occurred_at,request_id,revision,created_by) values(s.id,e,a,stamp,k,s.revision+1,actor) returning id into ev;
 insert into public.time_events(id,employee_id,timestamp,type,source,timezone,created_by,notes) values(ev,e,stamp,case a when 'CLOCK_IN' then 'ClockIn' when 'CLOCK_OUT' then 'ClockOut' when 'START_BREAK' then 'BreakStart' else 'BreakEnd' end,'System','Asia/Manila',actor,'Punch Station — linked audit photo');
 update public.attendance_clock_sessions set state=next_state,revision=s.revision+1 where id=s.id;return ev;end $$;
create function public.punch_station_submit(p_device_token text,p_id uuid,p_ticket text,p_action text,p_photo text,p_captured_at timestamptz,p_offline_badge text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare d uuid:=punch_station.device(p_device_token);t punch_station.tickets;r punch_station.captures;photo bytea;ctx jsonb;e uuid;ev uuid;stamp timestamptz;offline boolean:=p_offline_badge is not null;begin
 if d is null then return jsonb_build_object('error','Device authorization expired. Keep pending captures and contact HR.');end if;
 perform pg_advisory_xact_lock(hashtextextended('punch-submit:'||d::text,0));
 select * into r from punch_station.captures where id=p_id;
 if r.id is not null then if r.device_id<>d then raise exception 'Invalid attempt' using errcode='42501';end if;return jsonb_build_object('id',r.id,'status',r.status,'timestamp',r.captured_at);end if;
 if (select count(*) from punch_station.captures where device_id=d and received_at>now()-interval '1 minute')>=60 then return jsonb_build_object('error','Please wait before syncing more captures.');end if;
 if length(p_photo)>270000 then raise exception 'Photo too large';end if;photo:=decode(p_photo,'base64');
 if substring(photo from 1 for 3)<>decode('ffd8ff','hex') or octet_length(photo) not between 4 and 200000 then raise exception 'A JPEG audit photo is required';end if;
 if offline then
 select h.id into e from punch_station.credentials c join public.hris_users h on h.id=c.employee_id join public.attendance_devices a on a.id=d where c.badge_hash=punch_station.hash(p_offline_badge) and c.active and lower(h.status)='active' and h.business_unit_id=a.business_unit_id;
 insert into punch_station.captures(id,device_id,employee_id,badge_hash,action,method,captured_at,photo,status) values(p_id,d,e,punch_station.hash(p_offline_badge),p_action,'BADGE',p_captured_at,photo,'Pending HR verification');
 else
 select * into t from punch_station.tickets where token_hash=punch_station.hash(p_ticket) and device_id=d for update;
 if t.employee_id is null or t.used or t.expires_at<now()-interval '30 days' or t.method not in('BADGE','EMPLOYEE_ID_PIN') then return jsonb_build_object('error','Authentication expired. Please start again.');end if;
 e:=t.employee_id;
 if not exists(select 1 from public.hris_users h join punch_station.credentials c on c.employee_id=h.id join public.attendance_devices a on a.id=d where h.id=e and lower(h.status)='active' and c.active and h.business_unit_id=a.business_unit_id) then return jsonb_build_object('error','Account is unavailable. Contact HR.');end if;
 if t.expires_at<=now() then
 insert into punch_station.captures(id,device_id,employee_id,action,method,captured_at,photo,status)
 values(p_id,d,e,p_action,t.method,p_captured_at,photo,'Pending HR verification');
 update punch_station.tickets set used=true where token_hash=t.token_hash;
 insert into punch_station.attempts(device_id,employee_id,success,reason) values(d,e,true,'Delayed authenticated capture pending review');
 return jsonb_build_object('id',p_id,'status','Pending HR verification','timestamp',p_captured_at);end if;
 ctx:=punch_station.context(e);stamp:=clock_timestamp();
 begin
 ev:=punch_station.record(e,p_action,p_id,stamp,(ctx->>'workDate')::date,e);
 insert into punch_station.captures(id,device_id,employee_id,action,method,captured_at,work_date,photo,status,event_id) values(p_id,d,e,p_action,t.method,stamp,(ctx->>'workDate')::date,photo,'Accepted',ev);
 exception when others then
 insert into punch_station.attempts(device_id,employee_id,success,reason) values(d,e,false,'Punch rejected: '||sqlstate);
 return jsonb_build_object('error','Punch not saved. Check your schedule and attendance with your supervisor.');end;
 update punch_station.tickets set used=true where token_hash=t.token_hash;
 end if;
 insert into punch_station.attempts(device_id,employee_id,success,reason) values(d,e,true,case when offline then 'Offline capture pending review' else 'Punch and audit photo saved' end);
 return (select jsonb_build_object('id',id,'status',status,'timestamp',captured_at) from punch_station.captures where id=p_id);end $$;
create function public.punch_station_review(p_id uuid,p_approve boolean,p_work_date date,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare r punch_station.captures;ev uuid;begin
 select * into r from punch_station.captures where id=p_id for update;
 if r.id is null or not exists(select 1 from public.attendance_devices d where d.id=r.device_id and private.attendance_bu_admin(d.business_unit_id)) then raise exception 'Scoped HR/Admin required' using errcode='42501';end if;
 if r.status<>'Pending HR verification' then return;end if;
 if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Review reason required';end if;
 if p_approve then
 if r.employee_id is null or not exists(select 1 from public.hris_users h join punch_station.credentials c on c.employee_id=h.id where h.id=r.employee_id and lower(h.status)='active' and c.active and (r.badge_hash is null or c.badge_hash=r.badge_hash)) then raise exception 'Inactive or unknown badge — use the existing HR correction workflow';end if;
 if p_work_date is null or r.captured_at<(p_work_date::timestamp at time zone 'Asia/Manila') or r.captured_at>=((p_work_date+2)::timestamp at time zone 'Asia/Manila') then raise exception 'Choose the actual shift work date';end if;
 ev:=punch_station.record(r.employee_id,r.action,r.id,r.captured_at,p_work_date,public.current_hris_user_id());end if;
 update punch_station.captures set status=case when p_approve then 'Accepted' else 'Rejected' end,event_id=ev,work_date=p_work_date,reviewed_by=public.current_hris_user_id(),reason=p_reason where id=r.id;
 insert into public.attendance_device_audit(device_id,actor,detail) values(r.device_id,public.current_hris_user_id(),jsonb_build_object('action','Offline punch reviewed','capture',r.id,'approved',p_approve,'reason',p_reason));end $$;
create function public.punch_station_admin() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not private.attendance_admin() then raise exception 'HR/Admin required' using errcode='42501';end if;
 return jsonb_build_object('captures',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select c.id,c.employee_id,h.full_name,c.action,c.method,c.captured_at,c.received_at,c.status,c.reason,c.device_id from punch_station.captures c join public.attendance_devices d on d.id=c.device_id left join public.hris_users h on h.id=c.employee_id where private.attendance_bu_admin(d.business_unit_id) order by c.received_at desc limit 200) x),
 'attempts',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select a.device_id,a.employee_id,a.reason,a.created_at from punch_station.attempts a join public.attendance_devices d on d.id=a.device_id where private.attendance_bu_admin(d.business_unit_id) order by a.created_at desc limit 100) x));end $$;
create function public.punch_station_supervisor_action(p_device_token text,p_ticket text,p_action text) returns void language plpgsql security definer set search_path='' as $$declare d uuid:=punch_station.device(p_device_token);t punch_station.tickets;begin
 select * into t from punch_station.tickets where token_hash=punch_station.hash(p_ticket) and device_id=d and method='SUPERVISOR' and expires_at>now();
 if t.employee_id is null or p_action not in('Camera test','Reconnect kiosk','Exit supervisor mode') or not exists(select 1 from public.hris_users where id=t.employee_id and lower(status)='active') or not exists(select 1 from private.effective_role_ids(t.employee_id) r where r.role_id in('Admin','HR Manager','HR Staff','Business Unit Manager','Manager')) then raise exception 'Supervisor authorization required' using errcode='42501';end if;
 insert into public.attendance_device_audit(device_id,actor,detail) values(d,t.employee_id,jsonb_build_object('action',p_action,'source','Punch Station supervisor'));
 if p_action='Exit supervisor mode' then delete from punch_station.tickets where token_hash=t.token_hash;end if;end $$;
create function public.punch_station_photo(p_id uuid) returns text language plpgsql security definer set search_path='' as $$declare r punch_station.captures;begin
 select * into r from punch_station.captures where id=p_id;
 if r.id is null or not exists(select 1 from public.attendance_devices d where d.id=r.device_id and private.attendance_bu_admin(d.business_unit_id)) then raise exception 'Scoped HR/Admin required' using errcode='42501';end if;
 insert into public.attendance_device_audit(device_id,actor,detail) values(r.device_id,public.current_hris_user_id(),jsonb_build_object('action','Punch photo viewed','capture',r.id));
 return encode(r.photo,'base64');end $$;
do $$declare f record;begin for f in select p.oid::regprocedure sig,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='punch_station' or (n.nspname='public' and p.proname like 'punch_station_%') loop
 execute 'revoke all on function '||f.sig||' from public,anon,authenticated';
 if f.nspname='public' then execute 'grant execute on function '||f.sig||' to '||case when f.proname in('punch_station_status','punch_station_auth','punch_station_submit','punch_station_supervisor_action') then 'anon' else 'authenticated' end;end if;end loop;end $$;
notify pgrst,'reload schema';
