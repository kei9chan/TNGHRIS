begin;
alter table public.password_reset_rate_limits add column if not exists hris_user_id uuid references public.hris_users(id);
alter table public.password_reset_rate_limits add column if not exists outcome text not null default 'legacy_unknown';
alter table public.password_reset_rate_limits add column if not exists provider_message_id text;
alter table public.password_reset_rate_limits add column if not exists failure_code text;
create or replace function public.reserve_password_recovery(p_email_hash text,p_ip_hash text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('password-recovery-rate',0));
 if (select count(*) from public.password_reset_rate_limits where email_hash=p_email_hash and requested_at>now()-interval '15 minutes')>=3
 or (select count(*) from public.password_reset_rate_limits where ip_hash=p_ip_hash and requested_at>now()-interval '15 minutes')>=20 then return null;end if;
 insert into public.password_reset_rate_limits(email_hash,ip_hash,outcome) values(p_email_hash,p_ip_hash,'requested') returning id into result;
 return result;
end $$;
revoke all on function public.reserve_password_recovery(text,text) from public,anon,authenticated;
grant execute on function public.reserve_password_recovery(text,text) to service_role;
create or replace function public.get_account_access_diagnostics(p_user_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_active_role('Admin') then raise exception 'Only an active Admin can inspect account access' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from (
 select h.id,h.full_name,h.status,h.role,h.business_unit,h.created_at,
 left(h.email,1)||'***@'||split_part(h.email,'@',2) as masked_email,
 a.id is not null auth_exists,a.email_confirmed_at is not null email_confirmed,
 coalesce(a.banned_until>now(),false) banned,a.last_sign_in_at,
 a.id is not null and lower(trim(a.email))=lower(trim(h.email)) as link_valid,
 exists(select 1 from auth.identities i where i.user_id=a.id and i.provider='email') email_identity,
 exists(select 1 from public.business_units b where b.id=h.business_unit_id) business_unit_valid,
 (select count(*) from public.hris_users x where lower(trim(x.email))=lower(trim(h.email))) email_profile_count,
 (select count(*) from public.hris_users x where x.auth_user_id=h.auth_user_id) auth_profile_count,
 (select count(*) from public.hris_users x where lower(trim(x.full_name))=lower(trim(h.full_name)) and lower(x.status)='active') active_name_count,
 (select coalesce(jsonb_agg(r.role_id),'[]') from public.user_roles r where r.user_id=h.id and r.is_active) active_roles,
 (select max(r.requested_at) from public.password_reset_rate_limits r where r.hris_user_id=h.id or r.email_hash=encode(extensions.digest(lower(trim(h.email)),'sha256'),'hex')) last_reset_request,
 (select r.outcome from public.password_reset_rate_limits r where r.hris_user_id=h.id or r.email_hash=encode(extensions.digest(lower(trim(h.email)),'sha256'),'hex') order by requested_at desc limit 1) reset_status,
 (select r.failure_code from public.password_reset_rate_limits r where r.hris_user_id=h.id order by requested_at desc limit 1) reset_failure,
 null::integer recent_failed_login_count,
 case when lower(h.status)<>'active' then 'Inactive account: verify employment status before any access change'
 when a.id is null then 'Missing auth account: use the approved provisioning flow'
 when lower(trim(a.email)) is distinct from lower(trim(h.email)) then 'Email mismatch: verify ownership before repairing'
 when a.banned_until>now() then 'Auth account unavailable: review lifecycle history'
 when a.email_confirmed_at is null then 'Send recovery email; employee must verify ownership using the emailed link'
 else 'Identity linked: check reset delivery and employee login result' end recommended_action
 from public.hris_users h left join auth.users a on a.id=h.auth_user_id
 where p_user_id is null or h.id=p_user_id order by h.full_name,h.id) d);
end $$;
revoke all on function public.get_account_access_diagnostics(uuid) from public,anon;
grant execute on function public.get_account_access_diagnostics(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
