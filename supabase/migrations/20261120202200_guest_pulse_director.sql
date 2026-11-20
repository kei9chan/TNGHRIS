create or replace function guest_pulse.allowed(u uuid,edit boolean) returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from public.hris_users h where h.id=public.current_hris_user_id() and lower(h.status::text)='active' and (public.has_active_role('Admin') or public.has_active_role('Board of Director') or (not edit and (public.has_active_role('GeneralManager') or (public.has_active_role('Operations Director') or lower(trim(h.position))='operations director'))) or (public.has_active_role('Business Unit Manager') and h.business_unit_id=u)))
$$;
create or replace function guest_pulse.weekly() returns void language sql security definer set search_path='' as $$
with bounds as (select date_trunc('week',now() at time zone 'Asia/Manila') at time zone 'Asia/Manila' as finish), counts as (
 select f.*,b.name,finish,count(r.id) as n,count(r.id) filter(where r.manager) as followups from guest_pulse.forms f join public.business_units b on b.id=f.unit cross join bounds left join guest_pulse.tables t on t.form=f.id left join guest_pulse.reviews r on r.token=t.token and r.created_at>=finish-interval '7 days' and r.created_at<finish group by f.id,b.name,finish)
insert into public.notifications(user_id,type,title,message,link,dedupe_key)
select distinct h.id::text,'GENERAL',case when c.n=0 then 'Guest Pulse · No feedback received' else 'Guest Pulse · Weekly feedback report' end,
 c.name||' · '||c.title||' · Week of '||to_char((finish at time zone 'Asia/Manila')-interval '7 days','Mon DD')||'. '||case when c.n=0 then 'Zero responses. Please check QR placement and whether guests are being invited.' else c.n||' responses, '||c.followups||' manager requests.' end,
 '/operations?view=Guest+Pulse','guest-pulse:'||c.id||':'||h.id||':'||extract(epoch from finish)
 from counts c join public.hris_users h on lower(h.status::text)='active' join lateral (select h.role::text role union select role_id from public.user_roles where user_id=h.id and is_active) roles on true
 where (c.n>0 and (lower(trim(h.position))='operations director' or roles.role in ('Board of Director','Admin','Operations Director','GeneralManager') or (roles.role='Business Unit Manager' and h.business_unit_id=c.unit))) or (roles.role='Board of Director' and c.n=0 and c.active and c.active_since<=finish-interval '7 days') on conflict do nothing;
$$;
