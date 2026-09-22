-- Org-chart based request routing and on-call submission repairs.
-- New requests receive an immutable route snapshot. Existing pending requests
-- retain their existing approval assignments and continue on the legacy path.

create table if not exists public.org_chart_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.hris_users(id) on delete cascade,
  position_name text not null,
  organizational_level text not null check (organizational_level in (
    'RANK_AND_FILE','TEAM_LEADER','OIC','SUPERVISOR','UNIT_HEAD',
    'DEPARTMENT_HEAD','BUSINESS_UNIT_HEAD','GENERAL_MANAGER','BOARD_OF_DIRECTORS'
  )),
  business_unit_id uuid references public.business_units(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  operational_unit text,
  reports_to_user_id uuid references public.hris_users(id) on delete set null,
  effective_from date not null default current_date,
  effective_until date,
  is_approved boolean not null default false,
  approved_by uuid references public.hris_users(id) on delete set null,
  approved_at timestamptz,
  source text not null default 'HR org chart',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_until is null or effective_until >= effective_from)
);
create unique index if not exists org_chart_assignments_active_position_key
  on public.org_chart_assignments(user_id, business_unit_id, coalesce(department_id,'00000000-0000-0000-0000-000000000000'::uuid), effective_from);
create index if not exists org_chart_assignments_parent_idx on public.org_chart_assignments(reports_to_user_id, business_unit_id);

create table if not exists public.approval_authority_matrix (
  id uuid primary key default gen_random_uuid(),
  request_type text not null,
  organizational_level text not null check (organizational_level in (
    'RANK_AND_FILE','TEAM_LEADER','OIC','SUPERVISOR','UNIT_HEAD',
    'DEPARTMENT_HEAD','BUSINESS_UNIT_HEAD','GENERAL_MANAGER','BOARD_OF_DIRECTORS'
  )),
  authority_kind text not null check (authority_kind in ('REVIEW','RECOMMEND','FIRST_LEVEL_APPROVAL','FINAL_APPROVAL')),
  sequence integer not null,
  max_amount numeric,
  max_days numeric,
  same_branch_required boolean not null default true,
  higher_approval_required boolean not null default false,
  is_active boolean not null default true,
  effective_from date not null default current_date,
  effective_until date,
  approved_by uuid references public.hris_users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(request_type, organizational_level, effective_from),
  check (effective_until is null or effective_until >= effective_from)
);

create table if not exists public.temporary_approval_authorities (
  id uuid primary key default gen_random_uuid(),
  principal_user_id uuid not null references public.hris_users(id) on delete cascade,
  delegate_user_id uuid not null references public.hris_users(id) on delete cascade,
  request_type text,
  effective_from timestamptz not null,
  effective_until timestamptz not null,
  is_approved boolean not null default false,
  approved_by uuid references public.hris_users(id) on delete set null,
  approved_at timestamptz,
  reason text not null,
  created_at timestamptz not null default now(),
  check (delegate_user_id <> principal_user_id),
  check (effective_until > effective_from)
);

create table if not exists public.request_approval_route_snapshots (
  id uuid primary key default gen_random_uuid(),
  request_type text not null,
  request_id uuid not null,
  requester_id uuid not null references public.hris_users(id) on delete restrict,
  business_unit_id uuid references public.business_units(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  route jsonb not null check (jsonb_typeof(route)='array'),
  routing_basis text not null default 'ORG_CHART_AND_AUTHORITY_MATRIX',
  created_at timestamptz not null default now(),
  created_by uuid references public.hris_users(id) on delete set null,
  unique(request_type, request_id)
);

create table if not exists public.org_routing_audit (
  id bigint generated always as identity primary key,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  actor_id uuid references public.hris_users(id) on delete set null,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

alter table public.manpower_requests add column if not exists approval_route_snapshot jsonb;
alter table public.manpower_requests add column if not exists approval_route_step integer;
alter table public.manpower_requests add column if not exists routing_basis text;

alter table public.org_chart_assignments enable row level security;
alter table public.approval_authority_matrix enable row level security;
alter table public.temporary_approval_authorities enable row level security;
alter table public.request_approval_route_snapshots enable row level security;
alter table public.org_routing_audit enable row level security;

drop policy if exists org_chart_authenticated_read on public.org_chart_assignments;
create policy org_chart_authenticated_read on public.org_chart_assignments for select to authenticated using (true);
drop policy if exists authority_matrix_authenticated_read on public.approval_authority_matrix;
create policy authority_matrix_authenticated_read on public.approval_authority_matrix for select to authenticated using (true);
drop policy if exists temporary_authority_authenticated_read on public.temporary_approval_authorities;
create policy temporary_authority_authenticated_read on public.temporary_approval_authorities for select to authenticated using (true);
drop policy if exists route_snapshot_participant_read on public.request_approval_route_snapshots;
create policy route_snapshot_participant_read on public.request_approval_route_snapshots for select to authenticated using (
  requester_id=public.current_hris_user_id()
  or exists(select 1 from jsonb_array_elements(route) step where step->>'approverUserId'=public.current_hris_user_id()::text)
  or public.has_feature_permission('OrganizationalChart','manage')
);
drop policy if exists org_routing_audit_hr_read on public.org_routing_audit;
create policy org_routing_audit_hr_read on public.org_routing_audit for select to authenticated using (
  private.workflow_user_has_role(public.current_hris_user_id(),'Admin')
  or private.workflow_user_has_role(public.current_hris_user_id(),'HR Manager')
  or private.workflow_user_has_role(public.current_hris_user_id(),'Board of Director')
);

revoke all on public.org_chart_assignments, public.approval_authority_matrix,
  public.temporary_approval_authorities, public.request_approval_route_snapshots,
  public.org_routing_audit from anon, authenticated;
grant select on public.org_chart_assignments, public.approval_authority_matrix,
  public.temporary_approval_authorities, public.request_approval_route_snapshots,
  public.org_routing_audit to authenticated;

create or replace function private.org_level_from_formal_roles(p_user_id uuid)
returns text language sql stable security definer set search_path='' as $$
  select case
    when private.workflow_user_has_role(p_user_id,'Board of Director') then 'BOARD_OF_DIRECTORS'
    when private.workflow_user_has_role(p_user_id,'GeneralManager') then 'GENERAL_MANAGER'
    when private.workflow_user_has_role(p_user_id,'Business Unit Manager') then 'BUSINESS_UNIT_HEAD'
    when private.workflow_user_has_role(p_user_id,'Manager') or private.workflow_user_has_role(p_user_id,'HR Manager') then 'UNIT_HEAD'
    else 'RANK_AND_FILE' end
$$;

-- Initial approved assignments come only from formal role records and the
-- approved Reporting To relationship. Job-title text is never interpreted.
insert into public.org_chart_assignments(
  user_id,position_name,organizational_level,business_unit_id,department_id,
  reports_to_user_id,effective_from,is_approved,approved_at,source
)
select u.id,coalesce(nullif(btrim(u.position),''),'Unspecified position'),
  private.org_level_from_formal_roles(u.id),u.business_unit_id,u.department_id,
  case when u.reports_to ~* '^[0-9a-f-]{36}$' and exists(select 1 from public.hris_users p where p.id=u.reports_to::uuid) then u.reports_to::uuid end,
  current_date,true,now(),'Existing approved HRIS org chart'
from public.hris_users u
where lower(u.status::text)='active'
  and not exists(select 1 from public.org_chart_assignments a where a.user_id=u.id and a.business_unit_id is not distinct from u.business_unit_id);

insert into public.approval_authority_matrix(request_type,organizational_level,authority_kind,sequence,same_branch_required,higher_approval_required,approved_at)
values
 ('Manpower','TEAM_LEADER','FIRST_LEVEL_APPROVAL',10,true,true,now()),
 ('Manpower','OIC','FIRST_LEVEL_APPROVAL',10,true,true,now()),
 ('Manpower','SUPERVISOR','FIRST_LEVEL_APPROVAL',10,true,true,now()),
 ('Manpower','UNIT_HEAD','REVIEW',20,true,true,now()),
 ('Manpower','DEPARTMENT_HEAD','REVIEW',20,true,true,now()),
 ('Manpower','BUSINESS_UNIT_HEAD','REVIEW',30,true,true,now()),
 ('Manpower','GENERAL_MANAGER','FINAL_APPROVAL',40,false,false,now()),
 ('Manpower','BOARD_OF_DIRECTORS','FINAL_APPROVAL',40,false,false,now())
on conflict(request_type,organizational_level,effective_from) do update
set authority_kind=excluded.authority_kind,sequence=excluded.sequence,
    same_branch_required=excluded.same_branch_required,higher_approval_required=excluded.higher_approval_required,
    is_active=true,updated_at=now();

-- Laner is the formally assigned Business Unit Head for both Bakebe sites.
update public.user_roles ur
set scope_type='SPECIFIC',
    allowed_business_unit_ids=(select array_agg(b.id order by b.name) from public.business_units b where b.name in('Bakebe - SM Aura','Bakebe - S Maison')),
    updated_at=now()
from public.hris_users u
where ur.user_id=u.id and lower(u.email)='bakebephchef@gmail.com'
  and ur.role_id='Business Unit Manager' and ur.is_active;

insert into public.org_chart_assignments(
 user_id,position_name,organizational_level,business_unit_id,department_id,
 reports_to_user_id,effective_from,is_approved,approved_at,source
)
select u.id,'Business Unit Manager','BUSINESS_UNIT_HEAD',b.id,null,
  case when u.reports_to ~* '^[0-9a-f-]{36}$' then u.reports_to::uuid end,current_date,true,now(),'HR-approved multi-site assignment'
from public.hris_users u cross join public.business_units b
where lower(u.email)='bakebephchef@gmail.com' and b.name='Bakebe - S Maison'
and not exists(select 1 from public.org_chart_assignments a where a.user_id=u.id and a.business_unit_id=b.id);

create or replace function private.user_can_request_for_business_unit(p_user_id uuid,p_business_unit_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
   select 1 from public.hris_users u join public.user_roles ur on ur.user_id=u.id and ur.is_active
   where u.id=p_user_id and lower(u.status::text)='active' and (
     ur.scope_type='GLOBAL'
     or (ur.scope_type='SPECIFIC' and p_business_unit_id=any(ur.allowed_business_unit_ids))
     or (ur.scope_type in('HOME_ONLY','DEPARTMENT','DIRECT_REPORTS','SELF') and u.business_unit_id=p_business_unit_id)
   )
 )
$$;

create or replace function private.resolve_org_approval_route(
 p_requester_id uuid,p_request_type text,p_business_unit_id uuid,p_department_id uuid,
 p_amount numeric default null,p_days numeric default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_current uuid:=p_requester_id;v_parent uuid;v_assignment public.org_chart_assignments;v_matrix public.approval_authority_matrix;
 v_delegate uuid;v_route jsonb:='[]'::jsonb;v_seen uuid[]:=array[p_requester_id];v_depth integer:=0;
 v_requester_level text;v_requester_rank integer:=0;v_candidate_rank integer;v_final uuid;
begin
 select a.organizational_level into v_requester_level from public.org_chart_assignments a
 where a.user_id=p_requester_id and a.is_approved and current_date between a.effective_from and coalesce(a.effective_until,'infinity'::date)
 order by (a.business_unit_id=p_business_unit_id) desc,a.effective_from desc limit 1;
 v_requester_rank:=case v_requester_level when 'RANK_AND_FILE' then 1 when 'TEAM_LEADER' then 2 when 'OIC' then 3 when 'SUPERVISOR' then 4 when 'UNIT_HEAD' then 5 when 'DEPARTMENT_HEAD' then 6 when 'BUSINESS_UNIT_HEAD' then 7 when 'GENERAL_MANAGER' then 8 when 'BOARD_OF_DIRECTORS' then 9 else 0 end;
 loop
   v_depth:=v_depth+1;exit when v_depth>20;
   select a.reports_to_user_id into v_parent from public.org_chart_assignments a
   where a.user_id=v_current and a.is_approved and current_date between a.effective_from and coalesce(a.effective_until,'infinity'::date)
   order by (a.business_unit_id=p_business_unit_id) desc,a.effective_from desc limit 1;
   exit when v_parent is null or v_parent=any(v_seen);v_seen:=array_append(v_seen,v_parent);
   select a.* into v_assignment from public.org_chart_assignments a
   where a.user_id=v_parent and a.is_approved and current_date between a.effective_from and coalesce(a.effective_until,'infinity'::date)
   order by (a.business_unit_id=p_business_unit_id) desc,a.effective_from desc limit 1;
   if not found then v_current:=v_parent;continue;end if;
   v_candidate_rank:=case v_assignment.organizational_level when 'RANK_AND_FILE' then 1 when 'TEAM_LEADER' then 2 when 'OIC' then 3 when 'SUPERVISOR' then 4 when 'UNIT_HEAD' then 5 when 'DEPARTMENT_HEAD' then 6 when 'BUSINESS_UNIT_HEAD' then 7 when 'GENERAL_MANAGER' then 8 when 'BOARD_OF_DIRECTORS' then 9 else 0 end;
   select m.* into v_matrix from public.approval_authority_matrix m where m.request_type=p_request_type and m.organizational_level=v_assignment.organizational_level and m.is_active and current_date between m.effective_from and coalesce(m.effective_until,'infinity'::date) and (m.max_amount is null or coalesce(p_amount,0)<=m.max_amount) and (m.max_days is null or coalesce(p_days,0)<=m.max_days) and (not m.same_branch_required or v_assignment.business_unit_id=p_business_unit_id) order by m.effective_from desc limit 1;
   if found and v_parent<>p_requester_id and v_candidate_rank>v_requester_rank then
     select t.delegate_user_id into v_delegate from public.temporary_approval_authorities t join public.hris_users d on d.id=t.delegate_user_id and lower(d.status::text)='active'
     where t.principal_user_id=v_parent and t.is_approved and now() between t.effective_from and t.effective_until and (t.request_type is null or t.request_type=p_request_type) and t.delegate_user_id<>p_requester_id
       and (not v_matrix.same_branch_required or exists(select 1 from public.org_chart_assignments da where da.user_id=t.delegate_user_id and da.is_approved and da.business_unit_id=p_business_unit_id and current_date between da.effective_from and coalesce(da.effective_until,'infinity'::date)))
     order by t.effective_from desc limit 1;
     v_route:=v_route||jsonb_build_array(jsonb_build_object('stepIndex',jsonb_array_length(v_route),'sequence',v_matrix.sequence,'approverUserId',coalesce(v_delegate,v_parent),'principalUserId',v_parent,'approverName',(select full_name from public.hris_users where id=coalesce(v_delegate,v_parent)),'organizationalLevel',v_assignment.organizational_level,'authorityKind',v_matrix.authority_kind,'delegated',v_delegate is not null,'businessUnitId',v_assignment.business_unit_id,'departmentId',v_assignment.department_id,'configurationFallback',false));
     if v_matrix.authority_kind='FINAL_APPROVAL' and not v_matrix.higher_approval_required then exit;end if;
   end if;
   v_current:=v_parent;
 end loop;
 if not exists(select 1 from jsonb_array_elements(v_route) s where s->>'authorityKind'='FINAL_APPROVAL') then
   select u.id into v_final from public.hris_users u where lower(u.status::text)='active' and u.auth_user_id is not null and u.id<>p_requester_id and (private.workflow_user_has_role(u.id,'GeneralManager') or private.workflow_user_has_role(u.id,'Board of Director')) order by private.workflow_user_has_role(u.id,'GeneralManager') desc,u.full_name limit 1;
   if v_final is not null and not exists(select 1 from jsonb_array_elements(v_route) s where s->>'approverUserId'=v_final::text) then
     v_route:=v_route||jsonb_build_array(jsonb_build_object('stepIndex',jsonb_array_length(v_route),'sequence',999,'approverUserId',v_final,'principalUserId',v_final,'approverName',(select full_name from public.hris_users where id=v_final),'organizationalLevel',case when private.workflow_user_has_role(v_final,'GeneralManager') then 'GENERAL_MANAGER' else 'BOARD_OF_DIRECTORS' end,'authorityKind','FINAL_APPROVAL','delegated',false,'businessUnitId',null,'departmentId',null,'configurationFallback',true));
   end if;
 end if;
 return v_route;
end $$;

create or replace function public.admin_upsert_org_chart_assignment(p_assignment jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.current_hris_user_id(); v_id uuid:=nullif(p_assignment->>'id','')::uuid; v_old jsonb; v_new jsonb;
begin
 if not (private.workflow_user_has_role(v_actor,'Admin') or private.workflow_user_has_role(v_actor,'HR Manager')) then
   raise exception 'Only Admin or HR Manager may approve organizational chart assignments.' using errcode='42501';
 end if;
 if v_id is not null then select to_jsonb(a) into v_old from public.org_chart_assignments a where a.id=v_id for update; end if;
 if v_id is null then
   insert into public.org_chart_assignments(user_id,position_name,organizational_level,business_unit_id,department_id,operational_unit,reports_to_user_id,effective_from,effective_until,is_approved,approved_by,approved_at,source)
   values((p_assignment->>'userId')::uuid,btrim(p_assignment->>'positionName'),p_assignment->>'organizationalLevel',nullif(p_assignment->>'businessUnitId','')::uuid,nullif(p_assignment->>'departmentId','')::uuid,nullif(btrim(p_assignment->>'operationalUnit'),''),nullif(p_assignment->>'reportsToUserId','')::uuid,coalesce(nullif(p_assignment->>'effectiveFrom','')::date,current_date),nullif(p_assignment->>'effectiveUntil','')::date,true,v_actor,now(),'HR-approved org chart') returning id into v_id;
 else
   update public.org_chart_assignments set position_name=btrim(p_assignment->>'positionName'),organizational_level=p_assignment->>'organizationalLevel',business_unit_id=nullif(p_assignment->>'businessUnitId','')::uuid,department_id=nullif(p_assignment->>'departmentId','')::uuid,operational_unit=nullif(btrim(p_assignment->>'operationalUnit'),''),reports_to_user_id=nullif(p_assignment->>'reportsToUserId','')::uuid,effective_from=coalesce(nullif(p_assignment->>'effectiveFrom','')::date,effective_from),effective_until=nullif(p_assignment->>'effectiveUntil','')::date,is_approved=true,approved_by=v_actor,approved_at=now(),updated_at=now() where id=v_id;
 end if;
 select to_jsonb(a) into v_new from public.org_chart_assignments a where a.id=v_id;
 insert into public.org_routing_audit(entity_type,entity_id,action,actor_id,old_value,new_value) values('ORG_CHART_ASSIGNMENT',v_id::text,case when v_old is null then 'CREATE' else 'UPDATE' end,v_actor,v_old,v_new);
 return v_id;
end $$;
revoke all on function public.admin_upsert_org_chart_assignment(jsonb) from public,anon;
grant execute on function public.admin_upsert_org_chart_assignment(jsonb) to authenticated;

-- Repair ambiguous PL/pgSQL identifier by using v_department_id throughout.
create or replace function private.normalize_manpower_coverage_days(p_days jsonb,p_business_unit_id uuid,p_exclude_request uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare raw_day jsonb;raw_item jsonb;normalized_days jsonb:='[]';normalized_items jsonb;coverage_date date;coverage_required boolean;required_fte numeric;reporting_fte numeric;needed numeric;rate numeric;v_department_id uuid;department_name text;shift_time text;reason text;day_staff numeric;day_cost numeric;first_date date;last_date date;expected_count integer;actual_count integer:=0;seen_dates date[]:=array[]::date[];seen_departments uuid[];
begin
 if p_business_unit_id is null then raise exception 'Select a valid Business Unit.' using errcode='22023';end if;
 if p_days is null or jsonb_typeof(p_days)<>'array' or jsonb_array_length(p_days)=0 then raise exception 'At least one coverage date is required.' using errcode='22023';end if;
 for raw_day in select value from jsonb_array_elements(p_days) loop
  coverage_date:=nullif(raw_day->>'date','')::date;if coverage_date is null or coverage_date=any(seen_dates) then raise exception 'Every included calendar date must appear exactly once.' using errcode='23505';end if;
  seen_dates:=array_append(seen_dates,coverage_date);actual_count:=actual_count+1;first_date:=least(coalesce(first_date,coverage_date),coverage_date);last_date:=greatest(coalesce(last_date,coverage_date),coverage_date);coverage_required:=coalesce((raw_day->>'coverageRequired')::boolean,true);normalized_items:='[]';day_staff:=0;day_cost:=0;seen_departments:=array[]::uuid[];
  if coverage_required then
   if jsonb_typeof(raw_day->'items')<>'array' or jsonb_array_length(raw_day->'items')=0 then raise exception 'Every coverage date needs at least one department.' using errcode='23514';end if;
   for raw_item in select value from jsonb_array_elements(raw_day->'items') loop
    v_department_id:=nullif(coalesce(raw_item->>'departmentId',raw_item->>'department_id'),'')::uuid;
    if v_department_id is null or v_department_id=any(seen_departments) then raise exception 'Each department may appear only once per coverage date.' using errcode='23505';end if;
    select d.name into department_name from public.departments d where d.id=v_department_id and d.business_unit_id=p_business_unit_id;
    if department_name is null then raise exception 'A coverage department does not belong to the selected Business Unit.' using errcode='23514';end if;seen_departments:=array_append(seen_departments,v_department_id);
    required_fte:=nullif(raw_item->>'requiredFte','')::numeric;reporting_fte:=coalesce(nullif(raw_item->>'reportingFte','')::numeric,0);if required_fte is null or required_fte<0 or reporting_fte<0 then raise exception 'Every coverage date needs a valid staff requirement.' using errcode='23514';end if;
    needed:=greatest(required_fte-reporting_fte,0);rate:=nullif(coalesce(raw_item->>'ratePerDay',raw_item->>'costPerHead'),'')::numeric;if rate is null or rate<=0 then raise exception 'A positive daily rate is required.' using errcode='23514';end if;
    shift_time:=nullif(btrim(raw_item->>'shiftTime'),'');if shift_time is null then raise exception 'Shift coverage is required.' using errcode='23514';end if;reason:=nullif(btrim(coalesce(raw_item->>'reason',raw_item->>'justification',raw_day->>'reason')),'');if needed>0 and reason is null then raise exception 'Explain the operational reason for every date with on-call coverage.' using errcode='23514';end if;
    if exists(select 1 from public.manpower_requests r cross join lateral jsonb_array_elements(r.coverage_days) day cross join lateral jsonb_array_elements(day->'items') item where r.id is distinct from p_exclude_request and r.business_unit_id=p_business_unit_id and r.status in('Pending','Approved') and coalesce((day->>'coverageRequired')::boolean,true) and (day->>'date')::date=coverage_date and coalesce(item->>'departmentId',item->>'department_id')=v_department_id::text) then raise exception 'An approved or pending on-call request already overlaps this department and date.' using errcode='23P01';end if;
    normalized_items:=normalized_items||jsonb_build_array(raw_item||jsonb_build_object('departmentId',v_department_id,'departmentName',department_name,'requiredFte',required_fte,'reportingFte',reporting_fte,'onCallNeeded',needed,'currentFte',reporting_fte,'requestedCount',needed,'ratePerDay',rate,'costPerHead',rate,'totalItemCost',needed*rate,'shiftTime',shift_time,'reason',coalesce(reason,''),'justification',coalesce(reason,'')));day_staff:=day_staff+needed;day_cost:=day_cost+(needed*rate);
   end loop;
  end if;
  normalized_days:=normalized_days||jsonb_build_array(raw_day||jsonb_build_object('date',coverage_date,'coverageRequired',coverage_required,'forecastedPax',greatest(coalesce(nullif(raw_day->>'forecastedPax','')::integer,0),0),'items',normalized_items,'totalStaff',day_staff,'totalCost',day_cost));
 end loop;
 expected_count:=(last_date-first_date)+1;if actual_count<>expected_count then raise exception 'Every calendar date in the selected range must be included and explicitly marked Coverage required or No coverage needed.' using errcode='23514';end if;return normalized_days;
end $$;

-- Enforce server-side BU scope before normalization or insertion.
create or replace function public.create_manpower_request_v2(p_request jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id();actor_row public.hris_users;new_request_id uuid:=gen_random_uuid();days jsonb;v_start_date date;v_end_date date;first_day jsonb;totals record;v_bu uuid;
begin
 if actor is null or not public.has_feature_permission('Manpower','create') or not public.has_workflow_permission('Manpower','submit') then raise exception 'You are not authorized to submit on-call requests.' using errcode='42501';end if;
 select * into strict actor_row from public.hris_users where id=actor and lower(status)='active';v_bu:=(p_request->>'businessUnitId')::uuid;
 if not private.user_can_request_for_business_unit(actor,v_bu) then raise exception 'You are not authorized to submit an on-call request for this Business Unit.' using errcode='42501';end if;
 v_start_date:=nullif(p_request->>'startDate','')::date;v_end_date:=nullif(p_request->>'endDate','')::date;if v_start_date is null or v_end_date is null or v_end_date<v_start_date then raise exception 'The end date must be on or after the start date.' using errcode='22023';end if;
 days:=private.normalize_manpower_coverage_days(p_request->'coverageDays',v_bu,null);if jsonb_array_length(days)<>(v_end_date-v_start_date)+1 or (days->0->>'date')::date<>v_start_date or (days->(jsonb_array_length(days)-1)->>'date')::date<>v_end_date then raise exception 'The coverage dates must exactly match the selected inclusive date range.' using errcode='23514';end if;
 select count(*) filter(where coalesce((day->>'coverageRequired')::boolean,true)) as coverage_count,
   coalesce(sum((day->>'totalStaff')::numeric),0) as staff_days,
   coalesce(sum((day->>'totalCost')::numeric),0) as total_cost
 into totals from jsonb_array_elements(days) day;
 select day into first_day from jsonb_array_elements(days) day where coalesce((day->>'coverageRequired')::boolean,true) order by (day->>'date')::date limit 1;if first_day is null then raise exception 'Mark at least one date as Coverage required.' using errcode='23514';end if;
 insert into public.manpower_requests(id,business_unit_id,business_unit_name,requester_id,requester_name,date_needed,date_mode,start_date,end_date,coverage_days,coverage_day_count,total_staff_days,forecasted_pax,general_note,attachment_url,items,grand_total,status,department_id,clarification_status,revision)
 values(new_request_id,v_bu,p_request->>'businessUnitName',actor,actor_row.full_name,v_start_date,case when v_start_date=v_end_date then 'single' else 'range' end,v_start_date,v_end_date,days,totals.coverage_count,totals.staff_days,coalesce((days->0->>'forecastedPax')::integer,0),nullif(btrim(p_request->>'generalNote'),''),nullif(btrim(p_request->>'attachmentUrl'),''),first_day->'items',totals.total_cost,'Pending',nullif(first_day->'items'->0->>'departmentId','')::uuid,'none',1);
 insert into private.manpower_request_revisions(request_id,revision,action,actor_id,approval_stage,snapshot) select new_request_id,1,'Submitted',actor,stored.approval_stage,to_jsonb(stored) from public.manpower_requests stored where stored.id=new_request_id;
 return jsonb_build_object('requestId',new_request_id);
end $$;

create or replace function public.initialize_manpower_request_workflow()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=coalesce(public.current_hris_user_id(),new.requester_id);v_route jsonb;v_step jsonb;v_approver uuid;v_stage text;v_history jsonb;
begin
 v_route:=private.resolve_org_approval_route(new.requester_id,'Manpower',new.business_unit_id,new.department_id,new.grand_total,new.coverage_day_count);
 -- Safe configured fallback: an active GM/BOD other than the requester. This is
 -- only used while HR completes an org-chart branch; it is recorded explicitly.
 if jsonb_array_length(v_route)=0 then
  select jsonb_build_array(jsonb_build_object('stepIndex',0,'sequence',999,'approverUserId',u.id,'principalUserId',u.id,'approverName',u.full_name,'organizationalLevel',case when private.workflow_user_has_role(u.id,'GeneralManager') then 'GENERAL_MANAGER' else 'BOARD_OF_DIRECTORS' end,'authorityKind','FINAL_APPROVAL','delegated',false,'businessUnitId',u.business_unit_id,'departmentId',u.department_id))
  into v_route from public.hris_users u where lower(u.status::text)='active' and u.auth_user_id is not null and u.id<>new.requester_id and (private.workflow_user_has_role(u.id,'GeneralManager') or private.workflow_user_has_role(u.id,'Board of Director'))
  order by private.workflow_user_has_role(u.id,'GeneralManager') desc,u.full_name limit 1;
 end if;
 if v_route is null or jsonb_array_length(v_route)=0 then
  perform set_config('app.manpower_workflow_mutation','on',true);
  update public.manpower_requests set approval_issue='Approver Configuration Required',routing_basis='ORG_CHART_CONFIGURATION_REQUIRED' where id=new.id;
  return new;
 end if;
 v_step:=v_route->0;v_approver:=(v_step->>'approverUserId')::uuid;
 v_stage:=case when v_step->>'authorityKind'='FINAL_APPROVAL' then 'BOD_GM' else 'BUSINESS_UNIT_MANAGER' end;
 v_history:=jsonb_build_object('stage',v_stage,'action','Submitted / Assigned','approverName',new.requester_name,'approverRole',private.manpower_role_label(new.requester_id),'assignedApproverId',v_approver,'assignedApproverName',v_step->>'approverName','assignedApproverRole',v_step->>'organizationalLevel','authorityKind',v_step->>'authorityKind','routeStep',0,'timestamp',now(),'newStatus','Pending','newStage',v_stage,'routingBasis','ORG_CHART_AND_AUTHORITY_MATRIX');
 perform set_config('app.manpower_workflow_mutation','on',true);
 update public.manpower_requests set approval_stage=v_stage,approval_issue=null,approval_history=coalesce(approval_history,'[]')||jsonb_build_array(v_history),approval_route_snapshot=v_route,approval_route_step=0,routing_basis='ORG_CHART_AND_AUTHORITY_MATRIX' where id=new.id;
 insert into public.request_approval_route_snapshots(request_type,request_id,requester_id,business_unit_id,department_id,route,created_by) values('Manpower',new.id,new.requester_id,new.business_unit_id,new.department_id,v_route,v_actor) on conflict(request_type,request_id) do nothing;
 insert into public.manpower_request_approval_assignments(request_id,approval_stage,approver_user_id,approver_role,status) values(new.id,v_stage,v_approver,coalesce(v_step->>'organizationalLevel','Configured approver'),'Pending') on conflict(request_id,approval_stage,approver_user_id) do nothing;
 insert into public.notifications(user_id,type,title,message,link,is_read,related_entity_id,dedupe_key) values(v_approver::text,'MANPOWER_REQUEST_SUBMITTED','New On-Call Request',format('A new on-call request for %s was submitted by %s.',coalesce(new.business_unit_name,'the selected Business Unit'),new.requester_name),'/approvals?type=manpower&item='||new.id,false,new.id::text,format('manpower:%s:ORG:%s:0',new.id,v_approver)) on conflict(user_id,dedupe_key) do nothing;
 insert into public.audit_logs(user_id,user_email,action,entity,entity_id,details) select v_actor::text,u.email,'SUBMIT','ManpowerRequest',new.id::text,jsonb_build_object('routingBasis','ORG_CHART_AND_AUTHORITY_MATRIX','route',v_route,'newStage',v_stage)::text from public.hris_users u where u.id=v_actor;
 return new;
end $$;

create or replace function public.process_manpower_request_approval(p_request_id uuid,p_decision text,p_comments text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.current_hris_user_id();v_request public.manpower_requests%rowtype;v_assignment public.manpower_request_approval_assignments%rowtype;v_decision text:=lower(btrim(coalesce(p_decision,'')));v_comments text:=nullif(btrim(coalesce(p_comments,'')),'');v_actor_name text;v_step integer;v_next jsonb;v_next_user uuid;v_next_stage text;v_history jsonb;
begin
 if v_actor is null then raise exception 'Your active HRIS account could not be resolved.' using errcode='42501';end if;
 if v_decision not in('approve','reject') then raise exception 'Approval decision must be approve or reject.' using errcode='22023';end if;
 if v_decision='reject' and v_comments is null then raise exception 'A comment is required when rejecting an on-call request.' using errcode='22023';end if;
 select * into v_request from public.manpower_requests r where r.id=p_request_id for update;if not found or v_request.status<>'Pending' then raise exception 'This on-call request is not available.' using errcode='P0002';end if;
 if v_actor=v_request.requester_id then raise exception 'Requesters cannot approve their own on-call request.' using errcode='42501';end if;
 select * into v_assignment from public.manpower_request_approval_assignments a where a.request_id=p_request_id and a.approver_user_id=v_actor and a.status='Pending' and a.approval_stage=v_request.approval_stage for update;
 if not found then raise exception 'This on-call request is not assigned to you for approval.' using errcode='42501';end if;
 select full_name into v_actor_name from public.hris_users where id=v_actor;
 perform set_config('app.manpower_approval_context',format('%s:%s',p_request_id,v_actor),true);perform set_config('app.manpower_workflow_mutation','on',true);
 update public.manpower_request_approval_assignments set status=case when v_decision='approve' then 'Approved' else 'Rejected' end,comments=v_comments,decided_at=now(),updated_at=now() where id=v_assignment.id;
 if v_decision='reject' then
  update public.manpower_request_approval_assignments set status='Cancelled',updated_at=now() where request_id=p_request_id and status='Pending';
  v_history:=jsonb_build_object('stage',v_request.approval_stage,'action','Rejected','approverName',v_actor_name,'approverRole',v_assignment.approver_role,'timestamp',now(),'newStatus','Rejected','newStage','REJECTED','comments',v_comments,'routeStep',v_request.approval_route_step);
  update public.manpower_requests set status='Rejected',approval_stage='REJECTED',approved_by=v_actor,approved_at=now(),rejection_reason=v_comments,approval_history=coalesce(approval_history,'[]')||jsonb_build_array(v_history) where id=p_request_id;
 else
  v_step:=coalesce(v_request.approval_route_step,0)+1;
  if v_request.approval_route_snapshot is not null and v_step<jsonb_array_length(v_request.approval_route_snapshot) then
   v_next:=v_request.approval_route_snapshot->v_step;v_next_user:=(v_next->>'approverUserId')::uuid;v_next_stage:=case when v_next->>'authorityKind'='FINAL_APPROVAL' then 'BOD_GM' else 'BUSINESS_UNIT_MANAGER' end;
   if v_next_user=v_request.requester_id then raise exception 'The configured route would allow self-approval. HR must correct the Organizational Chart.' using errcode='42501';end if;
   insert into public.manpower_request_approval_assignments(request_id,approval_stage,approver_user_id,approver_role,status) values(p_request_id,v_next_stage,v_next_user,coalesce(v_next->>'organizationalLevel','Configured approver'),'Pending') on conflict(request_id,approval_stage,approver_user_id) do update set status='Pending',comments=null,decided_at=null,updated_at=now();
   v_history:=jsonb_build_object('stage',v_request.approval_stage,'action','Approved','approverName',v_actor_name,'approverRole',v_assignment.approver_role,'timestamp',now(),'newStatus','Pending','newStage',v_next_stage,'comments',v_comments,'routeStep',v_request.approval_route_step,'nextRouteStep',v_step,'assignedApproverId',v_next_user,'assignedApproverName',v_next->>'approverName','assignedApproverRole',v_next->>'organizationalLevel');
   update public.manpower_requests set approval_stage=v_next_stage,approval_route_step=v_step,approval_history=coalesce(approval_history,'[]')||jsonb_build_array(v_history) where id=p_request_id;
   insert into public.notifications(user_id,type,title,message,link,is_read,related_entity_id,dedupe_key) values(v_next_user::text,'MANPOWER_REQUEST_SUBMITTED','On-Call Request Awaiting Approval',format('An on-call request for %s is awaiting your approval.',v_request.business_unit_name),'/approvals?type=manpower&item='||p_request_id,false,p_request_id::text,format('manpower:%s:ORG:%s:%s',p_request_id,v_next_user,v_step)) on conflict(user_id,dedupe_key) do nothing;
  else
   update public.manpower_request_approval_assignments set status='Cancelled',updated_at=now() where request_id=p_request_id and status='Pending';
   v_history:=jsonb_build_object('stage',v_request.approval_stage,'action','Approved','approverName',v_actor_name,'approverRole',v_assignment.approver_role,'timestamp',now(),'newStatus','Approved','newStage','COMPLETED','comments',v_comments,'routeStep',v_request.approval_route_step);
   update public.manpower_requests set status='Approved',approval_stage='COMPLETED',approval_issue=null,approved_by=v_actor,approved_at=now(),rejection_reason=null,approval_history=coalesce(approval_history,'[]')||jsonb_build_array(v_history) where id=p_request_id;
   insert into public.notifications(user_id,type,title,message,link,is_read,related_entity_id,dedupe_key) values(v_request.requester_id::text,'MANPOWER_REQUEST_APPROVED','On-Call Request Approved',format('Your on-call request for %s was approved by %s.',v_request.business_unit_name,v_actor_name),'/payroll/manpower-planning?requestId='||p_request_id,false,p_request_id::text,format('manpower:%s:COMPLETED',p_request_id)) on conflict(user_id,dedupe_key) do nothing;
  end if;
 end if;
 insert into public.audit_logs(user_id,user_email,action,entity,entity_id,details) select v_actor::text,u.email,upper(v_decision),'ManpowerRequest',p_request_id::text,jsonb_build_object('approvalStage',v_request.approval_stage,'routeStep',v_request.approval_route_step,'approverName',v_actor_name,'approverRole',v_assignment.approver_role,'comments',v_comments,'routingBasis',v_request.routing_basis)::text from public.hris_users u where u.id=v_actor;
 select * into v_request from public.manpower_requests where id=p_request_id;
 return jsonb_build_object('requestId',v_request.id,'status',v_request.status,'approvalStage',v_request.approval_stage,'approvalIssue',v_request.approval_issue,'approverName',v_actor_name,'approverRole',v_assignment.approver_role,'approvalHistory',v_request.approval_history);
end $$;

revoke all on function private.org_level_from_formal_roles(uuid),private.user_can_request_for_business_unit(uuid,uuid),private.resolve_org_approval_route(uuid,text,uuid,uuid,numeric,numeric) from public,anon,authenticated;
grant execute on function public.create_manpower_request_v2(jsonb),public.process_manpower_request_approval(uuid,text,text) to authenticated;
