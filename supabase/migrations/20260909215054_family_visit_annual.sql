-- Additive family-visit records. Existing benefit routing remains authoritative.
create schema if not exists family_visit_private;
revoke all on schema family_visit_private from public, anon, authenticated;

create table public.family_visit_destinations (
  business_unit_id uuid primary key references public.business_units(id),
  brand text not null check (brand in ('The Dessert Museum','Gootopia','Bakebe','The Fun Roof','Inflatable Island')),
  active boolean not null default true
);
insert into public.family_visit_destinations(business_unit_id,brand)
select id,case when name ilike 'Gootopia%' then 'Gootopia' when name ilike 'Bakebe%' then 'Bakebe'
 when name ilike 'Inflatable Island%' then 'Inflatable Island' else name end
from public.business_units where name in ('The Dessert Museum','The Fun Roof')
 or name ilike 'Gootopia%' or name ilike 'Bakebe%' or name ilike 'Inflatable Island%';
alter table public.family_visit_destinations enable row level security;
revoke all on public.family_visit_destinations from anon,authenticated;
grant select on public.family_visit_destinations to authenticated;
create policy family_destination_read on public.family_visit_destinations for select to authenticated using (public.current_hris_user_id() is not null);

create table public.family_visit_operations_recipients (
 business_unit_id uuid references public.business_units(id), user_id uuid references public.hris_users(id),
 created_at timestamptz not null default now(), created_by uuid not null,
 primary key(business_unit_id,user_id)
);
alter table public.family_visit_operations_recipients enable row level security;
revoke all on public.family_visit_operations_recipients from anon,authenticated;

alter table public.benefit_requests add column family_visit jsonb;
create index family_visit_annual_idx on public.benefit_requests(employee_id,date_needed)
 where family_visit is not null;
-- Preserve uncertain history and its entitlement consumption, never infer from free text.
update public.benefit_requests set family_visit=jsonb_build_object('legacy',true,'destination_name','Destination BU Not Recorded')
where benefit_type_name ilike '%family%visit%';
update public.benefit_types set description='Four different participating BU visits per calendar year, subject to approval. Each visit includes entry for the employee and up to four immediate family members (five total guests). Entry only. Food, games, activities, souvenirs, transportation and other charges are excluded. Unused visits expire at year end. Guest slots and visits cannot be transferred, carried over or converted to cash.'
where name ilike '%family%visit%';

create table public.family_visit_audit (
 id uuid primary key default gen_random_uuid(), request_id uuid not null references public.benefit_requests(id),
 actor_id uuid, authenticated_user_id uuid, action text not null,
 previous_value jsonb, new_value jsonb, created_at timestamptz not null default clock_timestamp()
);
create index family_visit_audit_request_idx on public.family_visit_audit(request_id,created_at);
alter table public.family_visit_audit enable row level security;
revoke all on public.family_visit_audit from anon,authenticated;

create function family_visit_private.is_hr() returns boolean language sql stable security definer set search_path='' as $$
 select public.current_hris_user_id() is not null and public.is_hr_or_admin()
$$;
create function family_visit_private.is_ops(p_bu uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.hris_users u where u.id=public.current_hris_user_id() and lower(u.status)='active' and (
 (u.business_unit_id=p_bu and public.has_active_role('Business Unit Manager')) or exists(
 select 1 from public.family_visit_operations_recipients r where r.business_unit_id=p_bu and r.user_id=u.id)))
$$;
create function family_visit_private.can_read(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.current_hris_user_id() is not null and exists(select 1 from public.benefit_requests r where r.id=p_id and r.family_visit is not null and (
 r.employee_id=public.current_hris_user_id() or family_visit_private.is_hr()
 or public.has_active_role('Board of Director') or public.has_active_role('GeneralManager')
 or (r.bod_approved_at is not null and family_visit_private.is_ops((r.family_visit->>'destination_id')::uuid))))
$$;
create function family_visit_private.audit_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Family visit audit records cannot be edited or deleted'; end $$;
create trigger family_audit_immutable before update or delete on public.family_visit_audit for each row execute function family_visit_private.audit_immutable();

create table public.family_visit_configuration_audit (
 id uuid primary key default gen_random_uuid(), actor_id uuid not null, action text not null,
 previous_value jsonb,new_value jsonb, reason text not null,created_at timestamptz not null default clock_timestamp()
);
alter table public.family_visit_configuration_audit enable row level security;
revoke all on public.family_visit_configuration_audit from anon,authenticated;
create trigger family_configuration_immutable before update or delete on public.family_visit_configuration_audit for each row execute function family_visit_private.audit_immutable();
create function public.family_visit_ops_settings(p_bu uuid default null,p_user uuid default null,p_remove boolean default false,p_reason text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare old_value jsonb;
begin
 if not family_visit_private.is_hr() then raise exception 'Authorized HR/Admin access required' using errcode='42501'; end if;
 if p_bu is not null or p_user is not null then
  if p_bu is null or p_user is null or nullif(btrim(p_reason),'') is null then raise exception 'Destination, recipient and reason are required'; end if;
  if not exists(select 1 from public.family_visit_destinations where business_unit_id=p_bu) then raise exception 'Invalid destination'; end if;
  if not p_remove and not exists(select 1 from public.hris_users where id=p_user and lower(status)='active') then raise exception 'Select an active recipient'; end if;
  select to_jsonb(o) into old_value from public.family_visit_operations_recipients o where business_unit_id=p_bu and user_id=p_user;
  if p_remove then delete from public.family_visit_operations_recipients where business_unit_id=p_bu and user_id=p_user;
  else insert into public.family_visit_operations_recipients(business_unit_id,user_id,created_by) values(p_bu,p_user,public.current_hris_user_id()) on conflict do nothing; end if;
  insert into public.family_visit_configuration_audit(actor_id,action,previous_value,new_value,reason) values(public.current_hris_user_id(),case when p_remove then 'Operations recipient removed' else 'Operations recipient added' end,old_value,jsonb_build_object('business_unit_id',p_bu,'user_id',p_user),p_reason);
 end if;
 return jsonb_build_object('people',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',full_name) order by full_name),'[]') from public.hris_users where lower(status)='active'),
 'recipients',(select coalesce(jsonb_agg(jsonb_build_object('business_unit_id',o.business_unit_id,'user_id',o.user_id,'name',u.full_name,'destination',b.name)),'[]') from public.family_visit_operations_recipients o join public.hris_users u on u.id=o.user_id join public.business_units b on b.id=o.business_unit_id));
end $$;
revoke all on function public.family_visit_ops_settings(uuid,uuid,boolean,text) from public,anon;
grant execute on function public.family_visit_ops_settings(uuid,uuid,boolean,text) to authenticated;

-- Family-specific changes go through authenticated RPCs, not arbitrary row updates.
create policy family_visit_update_rpc_only on public.benefit_requests as restrictive for update to authenticated
 using (family_visit is null) with check (family_visit is null);
create policy family_visit_delete_protected on public.benefit_requests as restrictive for delete to authenticated using (family_visit is null);

create function family_visit_private.eligibility(p_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r public.benefit_requests%rowtype; used_count int; pending_count int; conflict_id uuid; reason text;
begin
 select * into r from public.benefit_requests where id=p_id;
 select count(*) filter(where b.status::text in ('Approved','Fulfilled') or (b.bod_approved_at is not null and coalesce(b.family_visit->>'restored','false')<>'true')),
 count(*) filter(where b.status::text in ('Pending HR Review','Pending Board Approval'))
 into used_count,pending_count from public.benefit_requests b where b.employee_id=r.employee_id and b.family_visit is not null and extract(year from b.date_needed)=extract(year from r.date_needed) and b.id<>r.id;
 select b.id into conflict_id from public.benefit_requests b where b.employee_id=r.employee_id and b.id<>r.id and b.family_visit is not null
 and extract(year from b.date_needed)=extract(year from r.date_needed)
 and (b.status::text in ('Approved','Fulfilled','Pending HR Review','Pending Board Approval') or (b.bod_approved_at is not null and coalesce(b.family_visit->>'restored','false')<>'true'))
 and (b.family_visit->>'brand'=r.family_visit->>'brand' or b.family_visit->>'destination_id' is null) limit 1;
 if not exists(select 1 from public.hris_users u where u.id=r.employee_id and lower(u.employment_status)='regular' and lower(u.status)='active') then reason:='Not Eligible – Employee Is Not Regular';
 elsif r.date_needed is null or extract(year from r.date_needed)<>extract(year from now() at time zone 'Asia/Manila') or r.date_needed<(now() at time zone 'Asia/Manila')::date then reason:='Not Eligible – Select a valid visit date in the current calendar year';
 elsif r.family_visit->>'destination_id' is null then reason:='Requires Review – Destination BU Not Recorded';
 elsif not exists(select 1 from public.family_visit_destinations d where d.business_unit_id=(r.family_visit->>'destination_id')::uuid and d.active) then reason:='Not Eligible – Destination is not participating';
 elsif used_count>=4 then reason:='Not Eligible – Four Annual Visits Already Used';
 elsif conflict_id is not null then reason:='Requires Review – Business Unit already used/pending, or historical destination not recorded';
 elsif jsonb_typeof(r.family_visit->'family') is distinct from 'array' then reason:='Family member details are required';
 elsif jsonb_array_length(r.family_visit->'family')>4 then reason:='Not Eligible – More Than Five Total Guests';
 elsif exists(select 1 from jsonb_array_elements(r.family_visit->'family') f where nullif(btrim(f->>'name'),'') is null or nullif(btrim(f->>'relationship'),'') is null) then reason:='Every family member needs a full name and relationship';
 end if;
 return jsonb_build_object('eligible',reason is null,'reason',coalesce(reason,'Eligible for Approval'),'used',used_count,'pending',pending_count+case when r.status::text like 'Pending%' then 1 else 0 end,'remaining_after_approval',greatest(0,3-used_count),'conflict_id',conflict_id);
end $$;

create function family_visit_private.guard() returns trigger language plpgsql security definer set search_path='' as $$
declare e public.hris_users%rowtype; d record; check_result jsonb; family_type boolean;
begin
 select name ilike '%family%visit%' into family_type from public.benefit_types where id=new.benefit_type_id;
 if not coalesce(family_type,false) and new.family_visit is null then return new; end if;
 if new.family_visit is null then raise exception 'Use the Family Visit form: destination and family details are required' using errcode='22023'; end if;
 -- Serialize ALL requests for the same employee, including concurrent approvals.
 select * into e from public.hris_users where id=new.employee_id for update;
 if tg_op='INSERT' then
  if new.employee_id is distinct from public.current_hris_user_id() then raise exception 'You may submit only your own visit' using errcode='42501'; end if;
  if new.status::text<>'Pending HR Review' then raise exception 'New visits must start with HR review'; end if;
  if lower(e.employment_status) is distinct from 'regular' or lower(e.status) is distinct from 'active' then raise exception 'Not Eligible – Employee Is Not Regular'; end if;
  if new.date_needed is null or new.date_needed<(now() at time zone 'Asia/Manila')::date or extract(year from new.date_needed)<>extract(year from now() at time zone 'Asia/Manila') then raise exception 'Select a valid visit date in the current calendar year'; end if;
  select b.id,b.name,fd.brand into d from public.family_visit_destinations fd join public.business_units b on b.id=fd.business_unit_id where fd.business_unit_id=(new.family_visit->>'destination_id')::uuid and fd.active;
  if not found then raise exception 'Select a participating destination'; end if;
  if jsonb_typeof(new.family_visit->'family') is distinct from 'array' then raise exception 'Family details are required'; end if;
  if jsonb_array_length(new.family_visit->'family')>4 then raise exception 'Maximum four family members and five total guests'; end if;
  if exists(select 1 from jsonb_array_elements(new.family_visit->'family') f where nullif(btrim(f->>'name'),'') is null or nullif(btrim(f->>'relationship'),'') is null or length(f->>'name')>160 or length(f->>'relationship')>80) then raise exception 'Enter each family member name and relationship'; end if;
  if new.family_visit->>'entry_only' is distinct from 'true' or new.family_visit->>'confirmed' is distinct from 'true' then raise exception 'Both employee confirmations are required'; end if;
  if (select count(*) from public.benefit_requests b where b.employee_id=new.employee_id and b.family_visit is not null and extract(year from b.date_needed)=extract(year from new.date_needed) and (b.status::text in ('Pending HR Review','Pending Board Approval','Approved','Fulfilled') or (b.bod_approved_at is not null and coalesce(b.family_visit->>'restored','false')<>'true')))>=4 then raise exception 'Four annual visits are used or reserved by pending requests'; end if;
  if exists(select 1 from public.benefit_requests b where b.employee_id=new.employee_id and b.family_visit is not null and extract(year from b.date_needed)=extract(year from new.date_needed) and (b.status::text in ('Pending HR Review','Pending Board Approval','Approved','Fulfilled') or (b.bod_approved_at is not null and coalesce(b.family_visit->>'restored','false')<>'true')) and (b.family_visit->>'brand'=d.brand or b.family_visit->>'destination_id' is null)) then raise exception 'Destination already used/pending, or historical destination requires HR correction'; end if;
  new.employee_name:=e.full_name; new.submission_date:=clock_timestamp();
  new.hr_endorsed_by:=null; new.hr_endorsed_at:=null; new.bod_approved_by:=null; new.bod_approved_at:=null;
  new.fulfilled_by:=null; new.fulfilled_at:=null; new.voucher_code:=null; new.rejection_reason:=null;
  new.family_visit:=jsonb_build_object('destination_id',d.id,'destination_name',d.name,'brand',d.brand,'family',new.family_visit->'family','entry_only',true,'confirmed',true,'employee_number',e.employee_id,'home_bu',e.business_unit,'employment_status',e.employment_status,'reference','FVP-'||extract(year from new.date_needed)::text||'-'||new.id::text);
 elsif new.employee_id<>old.employee_id or new.benefit_type_id<>old.benefit_type_id then raise exception 'Visit ownership and type cannot be changed';
 elsif new.status::text in ('Pending Board Approval','Approved') and new.status is distinct from old.status then
  check_result:=family_visit_private.eligibility(old.id);
  if not (check_result->>'eligible')::boolean then raise exception '%',check_result->>'reason' using errcode='22023',detail=check_result::text; end if;
 end if;
 new.updated_at:=clock_timestamp();
 return new;
end $$;
create trigger family_visit_guard before insert or update on public.benefit_requests for each row execute function family_visit_private.guard();

create function family_visit_private.record_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.family_visit is not null then
 insert into public.family_visit_audit(request_id,actor_id,authenticated_user_id,action,previous_value,new_value)
 values(new.id,public.current_hris_user_id(),auth.uid(),case when tg_op='INSERT' then 'Submitted' else 'Updated' end,case when tg_op='UPDATE' then to_jsonb(old) end,to_jsonb(new));
 end if; return new;
end $$;
create trigger family_visit_audit after insert or update on public.benefit_requests for each row execute function family_visit_private.record_change();

create table public.family_visit_drafts (
 employee_id uuid primary key references public.hris_users(id), payload jsonb not null,
 updated_at timestamptz not null default clock_timestamp()
);
create table public.family_visit_draft_audit (
 id uuid primary key default gen_random_uuid(),employee_id uuid not null,authenticated_user_id uuid not null,
 previous_value jsonb,new_value jsonb,created_at timestamptz not null default clock_timestamp()
);
alter table public.family_visit_drafts enable row level security;
alter table public.family_visit_draft_audit enable row level security;
revoke all on public.family_visit_drafts,public.family_visit_draft_audit from anon,authenticated;
create trigger family_draft_audit_immutable before update or delete on public.family_visit_draft_audit for each row execute function family_visit_private.audit_immutable();
create function public.save_family_visit_draft(p_payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id(); old_payload jsonb; clean jsonb;
begin
 if actor is null or auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if pg_column_size(p_payload)>12000 then raise exception 'Draft is too large'; end if;
 select payload into old_payload from public.family_visit_drafts where employee_id=actor for update;
 clean:=jsonb_build_object('destination',p_payload->>'destination','date',p_payload->>'date','family',p_payload->'family','entry',p_payload->'entry','confirmed',p_payload->'confirmed');
 insert into public.family_visit_drafts(employee_id,payload) values(actor,clean) on conflict(employee_id) do update set payload=excluded.payload,updated_at=clock_timestamp();
 insert into public.family_visit_draft_audit(employee_id,authenticated_user_id,previous_value,new_value) values(actor,auth.uid(),old_payload,clean);
end $$;
revoke all on function public.save_family_visit_draft(jsonb) from public,anon;
grant execute on function public.save_family_visit_draft(jsonb) to authenticated;

create function public.get_family_visits(p_year int default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id(); result jsonb;
begin
 if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select jsonb_build_object('year',coalesce(p_year,extract(year from now() at time zone 'Asia/Manila')::int),
 'employee',(select jsonb_build_object('id',u.id,'name',u.full_name,'number',u.employee_id,'home_bu',u.business_unit,'employment_status',u.employment_status,'eligible',lower(u.employment_status)='regular' and lower(u.status)='active') from public.hris_users u where u.id=actor),
 'hr',family_visit_private.is_hr(), 'draft',(select payload from public.family_visit_drafts where employee_id=actor),
 'destinations',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'brand',d.brand,'color',b.color) order by d.brand,b.name),'[]') from public.family_visit_destinations d join public.business_units b on b.id=d.business_unit_id where d.active),
 'requests',(select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('eligibility',case when r.employee_id=actor or family_visit_private.is_hr() or public.has_active_role('Board of Director') or public.has_active_role('GeneralManager') then family_visit_private.eligibility(r.id) end,'can_review',(r.status::text='Pending HR Review' and public.has_active_role('HR Manager')) or (r.status::text='Pending Board Approval' and (public.has_active_role('Board of Director') or public.has_active_role('GeneralManager'))),'can_operate',family_visit_private.is_hr() or family_visit_private.is_ops((r.family_visit->>'destination_id')::uuid)) order by r.submission_date desc),'[]') from public.benefit_requests r where r.family_visit is not null and extract(year from r.date_needed)=coalesce(p_year,extract(year from now() at time zone 'Asia/Manila')::int) and family_visit_private.can_read(r.id))) into result;
 return result;
end $$;

create function public.submit_family_visit(p_destination uuid,p_date date,p_family jsonb,p_entry_only boolean,p_confirmed boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare type_row public.benefit_types%rowtype; result uuid;
begin
 if public.current_hris_user_id() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into type_row from public.benefit_types where name ilike '%family%visit%' and is_active order by created_at limit 1;
 if not found then raise exception 'Family Visit benefit is not enabled'; end if;
 insert into public.benefit_requests(employee_id,employee_name,benefit_type_id,benefit_type_name,details,date_needed,status,family_visit)
 values(public.current_hris_user_id(),'Employee',type_row.id,type_row.name,'Entry-only Family Visit',p_date,'Pending HR Review',jsonb_build_object('destination_id',p_destination,'family',p_family,'entry_only',p_entry_only,'confirmed',p_confirmed)) returning id into result;
 delete from public.family_visit_drafts where employee_id=public.current_hris_user_id();
 return result;
end $$;

create function public.get_family_visit_detail(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not family_visit_private.can_read(p_id) then raise exception 'Visit access denied' using errcode='42501'; end if;
 return jsonb_build_object('request',(select to_jsonb(r) from public.benefit_requests r where id=p_id),'audit',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'action',a.action,'actor',coalesce(u.full_name,'System'),'created_at',a.created_at,'previous_value',a.previous_value,'new_value',a.new_value) order by a.created_at),'[]') from public.family_visit_audit a left join public.hris_users u on u.id=a.actor_id where a.request_id=p_id),'approver',(select u.full_name from public.benefit_requests r join public.hris_users u on u.id=r.bod_approved_by where r.id=p_id));
end $$;

create function public.family_visit_action(p_id uuid,p_action text,p_note text default null,p_value text default null) returns void language plpgsql security definer set search_path='' as $$
declare r public.benefit_requests%rowtype; actor uuid:=public.current_hris_user_id(); v jsonb; d record; next_date date;
begin
 if actor is null or not family_visit_private.can_read(p_id) then raise exception 'Visit access denied' using errcode='42501'; end if;
 select * into r from public.benefit_requests where id=p_id for update; v:=r.family_visit;
 if p_action in ('withdraw','cancel_request') then
  if r.employee_id<>actor and not family_visit_private.is_hr() then raise exception 'Only employee or HR may request cancellation'; end if;
  if nullif(btrim(p_note),'') is null then raise exception 'Reason required'; end if;
  if p_action='withdraw' and r.status::text in ('Pending HR Review','Pending Board Approval') then
   update public.benefit_requests set status='Cancelled',family_visit=v||jsonb_build_object('withdrawn',true,'withdrawal_reason',p_note) where id=p_id;
  elsif p_action='cancel_request' and r.status::text='Approved' then
   update public.benefit_requests set family_visit=v||jsonb_build_object('cancellation',jsonb_build_object('status','Pending HR Review','reason',p_note,'requested_by',actor,'requested_at',clock_timestamp())) where id=p_id;
  else raise exception 'This request cannot be withdrawn or cancelled in its current state'; end if;
 elsif p_action in ('cancel_approve','cancel_reject') then
  if not family_visit_private.is_hr() then raise exception 'HR cancellation review required'; end if;
  if r.status::text<>'Approved' or v#>>'{cancellation,status}' is distinct from 'Pending HR Review' then raise exception 'No pending cancellation'; end if;
  if nullif(btrim(p_note),'') is null then raise exception 'Review reason required'; end if;
  v:=v||jsonb_build_object('cancellation',(v->'cancellation')||jsonb_build_object('status',p_action,'reviewed_by',actor,'reviewed_at',clock_timestamp(),'review_reason',p_note),'restored',p_action='cancel_approve');
  update public.benefit_requests set family_visit=v,status=case when p_action='cancel_approve' then 'Cancelled'::public.benefit_request_status else status end where id=p_id;
 elsif p_action='correct_destination' then
  if not family_visit_private.is_hr() or coalesce((v->>'legacy')::boolean,false)=false or nullif(btrim(p_note),'') is null then raise exception 'Historical corrections require HR and a reason'; end if;
  select b.id,b.name,fd.brand into d from public.family_visit_destinations fd join public.business_units b on b.id=fd.business_unit_id where fd.business_unit_id=p_value::uuid;
  if not found then raise exception 'Invalid destination'; end if;
  update public.benefit_requests set family_visit=v||jsonb_build_object('destination_id',d.id,'destination_name',d.name,'brand',d.brand,'correction_reason',p_note) where id=p_id;
 elsif p_action='reschedule' then
  if not family_visit_private.is_hr() or r.status::text<>'Approved' or nullif(btrim(p_note),'') is null then raise exception 'Approved visits can be rescheduled by HR with a reason'; end if;
  next_date:=p_value::date;
  if next_date<(now() at time zone 'Asia/Manila')::date or extract(year from next_date)<>extract(year from r.date_needed) then raise exception 'Visit must remain in the entitlement year and not in the past'; end if;
  update public.benefit_requests set date_needed=next_date,family_visit=(v-'operations_acknowledged_at'-'operations_acknowledged_by')||jsonb_build_object('reschedule_reason',p_note) where id=p_id;
 elsif p_action in ('acknowledge','fulfill','no_show','discrepancy') then
  if not (family_visit_private.is_hr() or family_visit_private.is_ops((v->>'destination_id')::uuid)) then raise exception 'Destination operations access required'; end if;
  if r.status::text<>'Approved' then raise exception 'Only approved visits can be processed'; end if;
  if p_action='acknowledge' then
   if v->>'operations_acknowledged_at' is not null then return; end if;
   update public.benefit_requests set family_visit=v||jsonb_build_object('operations_acknowledged_at',clock_timestamp(),'operations_acknowledged_by',actor) where id=p_id;
  elsif p_action='fulfill' then
   if r.date_needed<>(now() at time zone 'Asia/Manila')::date then raise exception 'Fulfillment can be recorded on the approved visit date only'; end if;
   update public.benefit_requests set status='Fulfilled',fulfilled_at=clock_timestamp(),fulfilled_by=actor,family_visit=v||jsonb_build_object('operational_note',p_note) where id=p_id;
  else
   if nullif(btrim(p_note),'') is null then raise exception 'Operational note required'; end if;
   update public.benefit_requests set family_visit=v||jsonb_build_object('review_flag',p_action,'operational_note',p_note) where id=p_id;
  end if;
 elsif p_action='pdf_generated' then
  if r.status::text not in ('Approved','Fulfilled') then raise exception 'Approved visit required for a pass'; end if;
 else raise exception 'Unknown visit action'; end if;
 insert into public.family_visit_audit(request_id,actor_id,authenticated_user_id,action,previous_value,new_value)
 values(p_id,actor,auth.uid(),p_action,to_jsonb(r),jsonb_build_object('note',p_note,'value',p_value));
end $$;

revoke all on all functions in schema family_visit_private from public,anon,authenticated;
revoke all on function public.get_family_visits(int), public.submit_family_visit(uuid,date,jsonb,boolean,boolean), public.get_family_visit_detail(uuid), public.family_visit_action(uuid,text,text,text) from public,anon;
grant execute on function public.get_family_visits(int), public.submit_family_visit(uuid,date,jsonb,boolean,boolean), public.get_family_visit_detail(uuid), public.family_visit_action(uuid,text,text,text) to authenticated;
create function family_visit_private.notify_ops(p_id uuid,p_event text) returns void language plpgsql security definer set search_path='' as $$
declare r public.benefit_requests%rowtype; recipient record; notification_id uuid; recipient_count int:=0;
begin
 select * into r from public.benefit_requests where id=p_id;
 if r.family_visit->>'destination_id' is null then return; end if;
 for recipient in select distinct u.id from public.hris_users u where lower(u.status)='active' and (
 (u.business_unit_id=(r.family_visit->>'destination_id')::uuid and (u.role='Business Unit Manager' or exists(select 1 from public.user_roles ur join public.roles ro on ro.id=ur.role_id where ur.user_id=u.id and ur.is_active and ro.is_active and ur.role_id='Business Unit Manager')))
 or exists(select 1 from public.family_visit_operations_recipients o where o.user_id=u.id and o.business_unit_id=(r.family_visit->>'destination_id')::uuid)) loop
  insert into public.notifications(user_id,type,title,message,link,is_read,related_entity_id,created_at,dedupe_key)
  values(recipient.id::text,'AWARD_RECEIVED','Family Visit: '||p_event,
   r.employee_name||' ('||coalesce(r.family_visit->>'employee_number','Employee ID not recorded')||') · Home BU: '||coalesce(r.family_visit->>'home_bu','Not recorded')||' · Destination: '||coalesce(r.family_visit->>'destination_name','Not recorded')||' · Date: '||r.date_needed::text||' · Guests: '||(1+coalesce(jsonb_array_length(r.family_visit->'family'),0))::text||' · Family: '||coalesce((select string_agg(f->>'name',', ') from jsonb_array_elements(r.family_visit->'family') f),'None')||' · Reference: '||coalesce(r.family_visit->>'reference',r.id::text)||' · Open the request for the approved PDF pass.',
   '/employees/benefits?tab=family_visits&requestId='||r.id::text,false,r.id::text,clock_timestamp(),
   'family:'||r.id::text||':'||p_event||':'||r.date_needed::text||case when p_event in ('Visit today','Visit tomorrow') then '' else ':'||r.updated_at::text end)
  on conflict(user_id,dedupe_key) do nothing returning id into notification_id;
  if notification_id is not null then
   recipient_count:=recipient_count+1;
   insert into public.family_visit_audit(request_id,actor_id,authenticated_user_id,action,new_value) values(r.id,public.current_hris_user_id(),auth.uid(),'In-app notification delivered',jsonb_build_object('event',p_event,'recipient',recipient.id,'notification_id',notification_id));
  end if;
 end loop;
end $$;
create function family_visit_private.notify_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.family_visit is null then return new; end if;
 if new.status::text='Approved' and old.status::text<>'Approved' then perform family_visit_private.notify_ops(new.id,'Approved');
 elsif new.date_needed is distinct from old.date_needed and new.bod_approved_at is not null then perform family_visit_private.notify_ops(new.id,'Rescheduled');
 elsif new.status::text='Cancelled' and old.bod_approved_at is not null then perform family_visit_private.notify_ops(new.id,'Cancelled');
 end if;
 if new.family_visit->>'review_flag' is distinct from old.family_visit->>'review_flag' and new.family_visit->>'review_flag' is not null then
  insert into public.notifications(user_id,type,title,message,link,is_read,related_entity_id,created_at,dedupe_key)
  select u.id::text,'AWARD_RECEIVED','Family Visit Requires HR Review',new.employee_name||': '||(new.family_visit->>'review_flag'),'/employees/benefits?tab=family_visits&requestId='||new.id::text,false,new.id::text,clock_timestamp(),'family-review:'||new.id::text||':'||(new.family_visit->>'review_flag') from public.hris_users u where lower(u.status)='active' and u.role='HR Manager'
  on conflict(user_id,dedupe_key) do nothing;
 end if; return new;
end $$;
create trigger family_visit_notifications after update on public.benefit_requests for each row execute function family_visit_private.notify_change();
create function family_visit_private.reminders() returns void language plpgsql security definer set search_path='' as $$
declare r record;
begin
 for r in select id,date_needed from public.benefit_requests where family_visit is not null and status::text='Approved' and date_needed between (now() at time zone 'Asia/Manila')::date and (now() at time zone 'Asia/Manila')::date+1 loop
 perform family_visit_private.notify_ops(r.id,case when r.date_needed=(now() at time zone 'Asia/Manila')::date then 'Visit today' else 'Visit tomorrow' end);
 end loop;
end $$;
select cron.schedule('family-visit-operations-reminders','0 0 * * *','select family_visit_private.reminders()');
revoke all on all functions in schema family_visit_private from public,anon,authenticated;
notify pgrst,'reload schema';
