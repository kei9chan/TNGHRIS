-- Phase 1: additive access controls only. Existing HRIS roles/RLS/RPCs are untouched.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table public.payroll_access_scopes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  kind text not null check (kind in ('organization', 'business_unit', 'payroll_group')),
  business_unit_id uuid references public.business_units(id) on delete restrict,
  processing_mode text not null default 'off' check (processing_mode in ('off','shadow','live')),
  created_at timestamptz not null default now(),
  constraint payroll_scope_shape check ((kind = 'organization') = (business_unit_id is null)),
  -- Only a later, reviewed engine migration can enable processing.
  constraint payroll_phase1_processing_off check (processing_mode = 'off')
);
create unique index payroll_one_organization_scope on public.payroll_access_scopes(kind) where kind = 'organization';
create unique index payroll_one_business_unit_scope on public.payroll_access_scopes(business_unit_id) where kind = 'business_unit';
create unique index payroll_group_scope_name on public.payroll_access_scopes(business_unit_id, lower(name)) where kind = 'payroll_group';

create table public.payroll_access_state (
  singleton boolean primary key default true check (singleton),
  bootstrapped_at timestamptz,
  bootstrapped_by uuid references auth.users(id) on delete restrict,
  check ((bootstrapped_at is null) = (bootstrapped_by is null))
);
insert into public.payroll_access_state(singleton) values (true);

create table public.payroll_access_grants (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  scope_id uuid not null references public.payroll_access_scopes(id) on delete restrict,
  permission text not null check (permission in (
    'finalize_timekeeping','prepare_pr','review_endorse','authorize_hr',
    'authorize_finance','approve_bod','release_payroll','manage_access'
  )),
  granted_at timestamptz not null default now(),
  granted_by uuid not null references auth.users(id) on delete restrict,
  grant_reason text not null check (length(btrim(grant_reason)) between 3 and 1000),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete restrict,
  revoke_reason text,
  constraint payroll_revocation_complete check (
    (revoked_at is null and revoked_by is null and revoke_reason is null)
    or (revoked_at is not null and revoked_by is not null and revoke_reason is not null and length(btrim(revoke_reason)) between 3 and 1000)
  )
);
create unique index payroll_active_grant_unique on public.payroll_access_grants(auth_user_id, scope_id, permission) where revoked_at is null;
create index payroll_grant_scope_idx on public.payroll_access_grants(scope_id);
create index payroll_granted_by_idx on public.payroll_access_grants(granted_by);
create index payroll_revoked_by_idx on public.payroll_access_grants(revoked_by);

create table public.payroll_access_audit (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  target_auth_user_id uuid references auth.users(id) on delete restrict,
  scope_id uuid not null references public.payroll_access_scopes(id) on delete restrict,
  grant_id uuid references public.payroll_access_grants(id) on delete restrict,
  action text not null check (action in ('bootstrap','grant','revoke','scope_created','processing_off')),
  permission text,
  reason text not null check (length(btrim(reason)) between 3 and 1000)
);
create index payroll_audit_scope_time_idx on public.payroll_access_audit(scope_id, occurred_at desc);
create index payroll_audit_actor_idx on public.payroll_access_audit(actor_auth_user_id);
create index payroll_audit_target_idx on public.payroll_access_audit(target_auth_user_id);
create index payroll_audit_grant_idx on public.payroll_access_audit(grant_id);
create index payroll_bootstrap_actor_idx on public.payroll_access_state(bootstrapped_by);

alter table public.payroll_access_scopes enable row level security;
alter table public.payroll_access_state enable row level security;
alter table public.payroll_access_grants enable row level security;
alter table public.payroll_access_audit enable row level security;
revoke all on public.payroll_access_scopes, public.payroll_access_state, public.payroll_access_grants, public.payroll_access_audit from public, anon, authenticated;
grant select on public.payroll_access_scopes, public.payroll_access_grants, public.payroll_access_audit to authenticated;

-- Security scopes reuse existing BUs; these are not salary/payroll-group masters.
insert into public.payroll_access_scopes(name, kind) values ('All business units', 'organization');
insert into public.payroll_access_scopes(name, kind, business_unit_id)
select name, 'business_unit', id from public.business_units;

create function private.payroll_actor_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select u.auth_user_id from public.hris_users u
  where u.auth_user_id = auth.uid() and lower(u.status) = 'active'
    and not coalesce(u.is_duplicate, false)
    and exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
                where ur.user_id = u.id and ur.is_active and r.is_active)
  limit 1
$$;

create function private.payroll_scope_covers(p_granted_scope uuid, p_target_scope uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.payroll_access_scopes g cross join public.payroll_access_scopes t
    where g.id = p_granted_scope and t.id = p_target_scope
      and (g.id = t.id or g.kind = 'organization'
           or (g.kind = 'business_unit' and t.kind = 'payroll_group' and g.business_unit_id = t.business_unit_id))
  )
$$;

create function private.payroll_has_access(p_permission text, p_scope_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.payroll_access_grants g
    where g.auth_user_id = private.payroll_actor_id() and g.revoked_at is null
      and g.permission = p_permission and private.payroll_scope_covers(g.scope_id, p_scope_id))
$$;

create function private.payroll_can_bootstrap() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.payroll_actor_id() is not null and public.is_system_admin()
    and exists (select 1 from public.payroll_access_state where singleton and bootstrapped_at is null)
$$;

create function private.payroll_can_read_scope(p_scope_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.payroll_can_bootstrap() or exists (
    select 1 from public.payroll_access_grants g
    where g.auth_user_id = private.payroll_actor_id() and g.revoked_at is null
      and private.payroll_scope_covers(g.scope_id, p_scope_id))
$$;

create policy payroll_scopes_read on public.payroll_access_scopes for select to authenticated
  using (private.payroll_can_read_scope(id));
create policy payroll_grants_read on public.payroll_access_grants for select to authenticated
  using (auth_user_id = private.payroll_actor_id() or private.payroll_has_access('manage_access', scope_id));
create policy payroll_audit_read on public.payroll_access_audit for select to authenticated
  using (target_auth_user_id = private.payroll_actor_id() or private.payroll_has_access('manage_access', scope_id));

create function private.payroll_audit_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'Payroll access history is append-only.' using errcode = '42501'; end
$$;
create trigger payroll_audit_immutable before update or delete on public.payroll_access_audit
for each row execute function private.payroll_audit_immutable();

create function public.get_payroll_access_context(p_employee_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid := private.payroll_actor_id(); v_target uuid; v_self uuid; v_can_bootstrap boolean;
begin
  if v_actor is null then raise exception 'An active HRIS account is required.' using errcode = '42501'; end if;
  select id into v_self from public.hris_users where auth_user_id = v_actor limit 1;
  select auth_user_id into v_target from public.hris_users where id = coalesce(p_employee_id, v_self);
  if v_target is distinct from v_actor and not exists (
    select 1 from public.payroll_access_scopes s where private.payroll_has_access('manage_access',s.id)
  ) then v_target := null; end if;
  v_can_bootstrap := private.payroll_can_bootstrap();
  return jsonb_build_object(
    'canBootstrap', v_can_bootstrap,
    'isSelf', coalesce(p_employee_id, v_self) = v_self,
    'targetLinked', v_target is not null,
    'scopes', coalesce((select jsonb_agg(jsonb_build_object(
      'id',s.id,'name',s.name,'kind',s.kind,'businessUnitId',s.business_unit_id,
      'mode',s.processing_mode,'canManage',private.payroll_has_access('manage_access',s.id)
    ) order by s.kind,s.name) from public.payroll_access_scopes s where private.payroll_can_read_scope(s.id)), '[]'::jsonb),
    'myGrants', coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'scopeId',g.scope_id,'permission',g.permission))
      from public.payroll_access_grants g where g.auth_user_id = v_actor and g.revoked_at is null),'[]'::jsonb),
    'grants', coalesce((select jsonb_agg(jsonb_build_object(
      'id',g.id,'scopeId',g.scope_id,'permission',g.permission,'grantedAt',g.granted_at
    ) order by g.granted_at) from public.payroll_access_grants g
      where g.auth_user_id = v_target and g.revoked_at is null
        and (v_target = v_actor or private.payroll_has_access('manage_access',g.scope_id))), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(x order by x."occurredAt" desc) from (
      select a.action, a.permission, a.reason, a.scope_id as "scopeId", a.occurred_at as "occurredAt"
      from public.payroll_access_audit a where a.target_auth_user_id = v_target
        and (v_target = v_actor or private.payroll_has_access('manage_access',a.scope_id))
      order by a.occurred_at desc limit 10
    ) x), '[]'::jsonb)
  );
end
$$;

-- Only minimal recipient identity is returned; this grants no HR profile/salary access.
create function public.get_payroll_access_recipients() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.payroll_actor_id() is null then raise exception 'Access denied.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.full_name,'employeeCode',u.employee_id) order by u.full_name)
    from public.hris_users u where lower(u.status)='active' and not coalesce(u.is_duplicate,false)
    and u.auth_user_id is not null and exists (
      select 1 from public.payroll_access_scopes s
      where private.payroll_has_access('manage_access',s.id)
        and (s.kind='organization' or s.business_unit_id=u.business_unit_id)
    )), '[]'::jsonb);
end
$$;

create function public.bootstrap_payroll_access(p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.payroll_actor_id(); v_scope uuid; v_grant uuid;
begin
  perform 1 from public.payroll_access_state where singleton for update;
  if not private.payroll_can_bootstrap() then raise exception 'Initial setup requires an existing Admin and is available only once.' using errcode = '42501'; end if;
  if p_reason is null or length(btrim(p_reason)) not between 3 and 1000 then raise exception 'Enter a reason (3–1000 characters).'; end if;
  select id into v_scope from public.payroll_access_scopes where kind='organization';
  -- The sole bootstrap exception: manage access only, never salary/approval duties.
  insert into public.payroll_access_grants(auth_user_id,scope_id,permission,granted_by,grant_reason)
    values(v_actor,v_scope,'manage_access',v_actor,btrim(p_reason)) returning id into v_grant;
  update public.payroll_access_state set bootstrapped_at=now(),bootstrapped_by=v_actor where singleton;
  insert into public.payroll_access_audit(actor_auth_user_id,target_auth_user_id,scope_id,grant_id,action,permission,reason)
    values(v_actor,v_actor,v_scope,v_grant,'bootstrap','manage_access',btrim(p_reason));
  return v_grant;
end
$$;

create function public.grant_payroll_access(p_employee_id uuid,p_scope_id uuid,p_permission text,p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.payroll_actor_id(); v_target uuid; v_grant uuid;
begin
  -- Serialize permission changes so a concurrent revocation cannot authorize a grant.
  perform 1 from public.payroll_access_state where singleton for update;
  if v_actor is null or not private.payroll_has_access('manage_access',p_scope_id) then raise exception 'You cannot manage payroll access for this scope.' using errcode = '42501'; end if;
  select u.auth_user_id into v_target from public.hris_users u
    where u.id=p_employee_id and lower(u.status)='active' and not coalesce(u.is_duplicate,false)
      and exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
                 where ur.user_id=u.id and ur.is_active and r.is_active);
  if v_target is null then raise exception 'Select an active employee with a linked HRIS account.'; end if;
  if v_target=v_actor then raise exception 'You cannot grant or expand your own payroll access.' using errcode='42501'; end if;
  if p_reason is null or length(btrim(p_reason)) not between 3 and 1000 then raise exception 'Enter a reason (3–1000 characters).'; end if;
  insert into public.payroll_access_grants(auth_user_id,scope_id,permission,granted_by,grant_reason)
    values(v_target,p_scope_id,p_permission,v_actor,btrim(p_reason))
    on conflict(auth_user_id,scope_id,permission) where revoked_at is null do nothing returning id into v_grant;
  if v_grant is not null then
    insert into public.payroll_access_audit(actor_auth_user_id,target_auth_user_id,scope_id,grant_id,action,permission,reason)
      values(v_actor,v_target,p_scope_id,v_grant,'grant',p_permission,btrim(p_reason));
  else
    select id into v_grant from public.payroll_access_grants where auth_user_id=v_target and scope_id=p_scope_id and permission=p_permission and revoked_at is null;
  end if;
  return v_grant;
end
$$;

create function public.revoke_payroll_access(p_grant_id uuid,p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.payroll_actor_id(); v_grant public.payroll_access_grants;
begin
  perform 1 from public.payroll_access_state where singleton for update;
  select * into v_grant from public.payroll_access_grants where id=p_grant_id;
  if v_actor is null or v_grant.id is null or not private.payroll_has_access('manage_access',v_grant.scope_id) then raise exception 'You cannot revoke this payroll grant.' using errcode='42501'; end if;
  if v_grant.auth_user_id=v_actor then raise exception 'Another payroll access manager must change your access.' using errcode='42501'; end if;
  if p_reason is null or length(btrim(p_reason)) not between 3 and 1000 then raise exception 'Enter a reason (3–1000 characters).'; end if;
  if v_grant.revoked_at is not null then return; end if;
  -- Keep one organization manager to avoid an unrecoverable administration lockout.
  if v_grant.permission='manage_access' and exists(select 1 from public.payroll_access_scopes where id=v_grant.scope_id and kind='organization')
    and not exists(select 1 from public.payroll_access_grants g join public.payroll_access_scopes s on s.id=g.scope_id
      where g.id<>v_grant.id and g.permission='manage_access' and g.revoked_at is null and s.kind='organization'
      and exists(select 1 from public.hris_users u where u.auth_user_id=g.auth_user_id and lower(u.status)='active' and not coalesce(u.is_duplicate,false)
        and exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=u.id and ur.is_active and r.is_active)))
    then raise exception 'Assign another organization payroll access manager first.'; end if;
  update public.payroll_access_grants set revoked_at=now(),revoked_by=v_actor,revoke_reason=btrim(p_reason) where id=v_grant.id;
  insert into public.payroll_access_audit(actor_auth_user_id,target_auth_user_id,scope_id,grant_id,action,permission,reason)
    values(v_actor,v_grant.auth_user_id,v_grant.scope_id,v_grant.id,'revoke',v_grant.permission,btrim(p_reason));
end
$$;

create function public.create_payroll_group_scope(p_business_unit_id uuid,p_name text,p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=private.payroll_actor_id(); v_parent uuid; v_scope uuid;
begin
  perform 1 from public.payroll_access_state where singleton for update;
  select id into v_parent from public.payroll_access_scopes where kind='business_unit' and business_unit_id=p_business_unit_id;
  if v_actor is null or not private.payroll_has_access('manage_access',v_parent) then raise exception 'You cannot add a payroll group in this business unit.' using errcode='42501'; end if;
  if p_reason is null or length(btrim(p_reason)) not between 3 and 1000 then raise exception 'Enter a reason (3–1000 characters).'; end if;
  insert into public.payroll_access_scopes(name,kind,business_unit_id) values(btrim(p_name),'payroll_group',p_business_unit_id) returning id into v_scope;
  insert into public.payroll_access_audit(actor_auth_user_id,scope_id,action,reason) values(v_actor,v_scope,'scope_created',btrim(p_reason));
  return v_scope;
end
$$;

create function public.check_payroll_access(p_permission text,p_scope_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.payroll_has_access(p_permission,p_scope_id)
$$;

create function public.check_payroll_operation(p_permission text,p_scope_id uuid,p_operation text) returns boolean
language sql stable security definer set search_path = '' as $$
  -- Unknown operations and off scopes fail closed. Permission alone never starts processing.
  select private.payroll_has_access(p_permission,p_scope_id) and exists(
    select 1 from public.payroll_access_scopes s where s.id=p_scope_id
      and ((p_operation='calculate' and p_permission='prepare_pr' and s.processing_mode in ('shadow','live'))
        or (p_operation='approve' and p_permission in ('review_endorse','authorize_hr','authorize_finance','approve_bod') and s.processing_mode='live')
        or (p_operation in ('release','official_export','loan_post','payment') and p_permission='release_payroll' and s.processing_mode='live'))
      and not exists(select 1 from public.payroll_access_scopes parent
        where parent.id<>s.id and private.payroll_scope_covers(parent.id,s.id) and parent.processing_mode='off')
  )
$$;

-- Definer functions are necessary for protected identity lookup and audited mutations.
-- Every caller is checked against current database assignments, never JWT user metadata.
revoke all on function private.payroll_actor_id(), private.payroll_scope_covers(uuid,uuid),
  private.payroll_has_access(text,uuid), private.payroll_can_bootstrap(), private.payroll_can_read_scope(uuid),
  private.payroll_audit_immutable() from public, anon, authenticated;
grant execute on function private.payroll_actor_id(), private.payroll_has_access(text,uuid), private.payroll_can_read_scope(uuid) to authenticated;
revoke all on function public.get_payroll_access_context(uuid),public.get_payroll_access_recipients(),
  public.bootstrap_payroll_access(text),public.grant_payroll_access(uuid,uuid,text,text),public.revoke_payroll_access(uuid,text),
  public.create_payroll_group_scope(uuid,text,text),public.check_payroll_access(text,uuid),public.check_payroll_operation(text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.get_payroll_access_context(uuid),public.get_payroll_access_recipients(),
  public.bootstrap_payroll_access(text),public.grant_payroll_access(uuid,uuid,text,text),public.revoke_payroll_access(uuid,text),
  public.create_payroll_group_scope(uuid,text,text),public.check_payroll_access(text,uuid),public.check_payroll_operation(text,uuid,text)
  to authenticated;
notify pgrst, 'reload schema';
