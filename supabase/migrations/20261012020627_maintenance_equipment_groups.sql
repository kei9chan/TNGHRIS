-- Group containers reuse the existing asset-based recurring engine. No second worker.
-- Filename matches the installed database migration version.
create table operations_private.equipment_groups(
 asset_id uuid primary key references public.assets(id),business_unit_id uuid not null references public.business_units(id),
 category text not null check(category in('Speakers / Audio','Air Conditioning','Other')),location text not null default '',
 revision int not null default 1,created_by uuid not null references public.hris_users(id),updated_at timestamptz not null default now());
create table operations_private.equipment_members(
 id uuid primary key default gen_random_uuid(),group_id uuid not null references operations_private.equipment_groups(asset_id),
 name text not null check(length(trim(name)) between 1 and 120),asset_id uuid references public.assets(id),active bool not null default true);
create index equipment_members_group on operations_private.equipment_members(group_id);
create table operations_private.equipment_issues(
 id uuid primary key default gen_random_uuid(),group_id uuid not null references operations_private.equipment_groups(asset_id),
 member_id uuid not null references operations_private.equipment_members(id),occurrence_id uuid references public.ops_occurrences(id),
 description text not null check(length(trim(description)) between 3 and 2000),severity text not null check(severity in('Normal','Urgent / Stop use')),
 status text not null default 'Open' check(status in('Open','Resolved')),reported_by uuid not null references public.hris_users(id),
 reported_at timestamptz not null default now(),resolved_by uuid references public.hris_users(id),resolved_at timestamptz,resolution text,
 client_id uuid not null unique);
create index equipment_issues_group on operations_private.equipment_issues(group_id,reported_at desc);
alter table operations_private.equipment_groups enable row level security;
alter table operations_private.equipment_members enable row level security;
alter table operations_private.equipment_issues enable row level security;
revoke all on operations_private.equipment_groups,operations_private.equipment_members,operations_private.equipment_issues from public,anon,authenticated;

create function operations_private.equipment_group_json(p_asset uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',g.asset_id,'business_unit_id',g.business_unit_id,'category',g.category,'location',g.location,'revision',g.revision,
 'members',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'asset_id',m.asset_id,'active',m.active) order by m.name,m.id) from operations_private.equipment_members m where m.group_id=g.asset_id and m.active),'[]'::jsonb))
 from operations_private.equipment_groups g where g.asset_id=p_asset
$$;
revoke all on function operations_private.equipment_group_json(uuid) from public,anon,authenticated;

-- A container's original unit is immutable, just like existing maintenance plans.
create function operations_private.equipment_group_unit_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from operations_private.equipment_groups g join public.business_units u on u.id=g.business_unit_id where g.asset_id=new.id and new.business_unit_id not in(u.id::text,u.name)) then raise exception 'Equipment groups cannot transfer business units. Create a new group in the destination unit.';end if;
 return new;
end $$;
revoke all on function operations_private.equipment_group_unit_guard() from public,anon,authenticated;
create trigger equipment_group_unit_guard before update of business_unit_id on public.assets for each row execute function operations_private.equipment_group_unit_guard();

create function public.ops_save_equipment_group(p_id uuid,p_unit uuid,p_name text,p_category text,p_location text,p_members jsonb,p_revision int default null) returns uuid
 language plpgsql security definer set search_path='' as $$
declare actor uuid:=operations_private.actor();g operations_private.equipment_groups;result uuid;entry jsonb;mid uuid;linked uuid;seen uuid[]:='{}';begin
 if p_unit is null or not operations_private.can_edit(p_unit) then raise exception 'Equipment group is not authorized' using errcode='42501';end if;
 if length(trim(coalesce(p_name,''))) not between 3 and 180 or p_category not in('Speakers / Audio','Air Conditioning','Other') or length(coalesce(p_location,''))>180 then raise exception 'Choose a group name, category and valid location';end if;
 if jsonb_typeof(p_members) is distinct from 'array' or jsonb_array_length(p_members) not between 1 and 100 then raise exception 'Add 1–100 equipment items';end if;
 if p_id is null then
 result:=gen_random_uuid();
 insert into public.assets(id,name,asset_tag,type,business_unit_id,purchase_date,value,status,requires_maintenance,notes)
 values(result,trim(p_name),'GROUP-'||result::text,'Other',p_unit::text,current_date,0,'Available',true,'Maintenance group container; not a separately purchased asset.');
 insert into operations_private.equipment_groups(asset_id,business_unit_id,category,location,created_by) values(result,p_unit,p_category,coalesce(p_location,''),actor);
 else
 select * into g from operations_private.equipment_groups where asset_id=p_id for update;
 if not found or g.business_unit_id<>p_unit then raise exception 'Equipment group is not authorized' using errcode='42501';end if;
 if g.revision is distinct from p_revision then raise exception 'Group changed. Refresh before saving.' using errcode='40001';end if;
 result:=p_id;
 update public.assets set name=trim(p_name),updated_at=now() where id=result;
 update operations_private.equipment_groups set category=p_category,location=coalesce(p_location,''),revision=revision+1,updated_at=now() where asset_id=result;
 end if;
 for entry in select value from jsonb_array_elements(p_members) loop
 if length(trim(coalesce(entry->>'name',''))) not between 1 and 120 then raise exception 'Each equipment item needs a name (up to 120 characters)';end if;
 mid:=nullif(entry->>'id','')::uuid;linked:=nullif(entry->>'asset_id','')::uuid;
 if linked is not null and (linked=result or exists(select 1 from operations_private.equipment_groups where asset_id=linked) or operations_private.maintenance_asset_reason(linked,p_unit) is not null) then raise exception 'Linked equipment must be an eligible individual asset in this business unit';end if;
 if mid is null then
 insert into operations_private.equipment_members(group_id,name,asset_id) values(result,trim(entry->>'name'),linked) returning id into mid;
 else
 if mid=any(seen) or not exists(select 1 from operations_private.equipment_members where id=mid and group_id=result) then raise exception 'Equipment item is outside this group or duplicated';end if;
 update operations_private.equipment_members set name=trim(entry->>'name'),asset_id=linked,active=true where id=mid and group_id=result;
 end if;
 seen:=array_append(seen,mid);
 end loop;
 update operations_private.equipment_members set active=false where group_id=result and not(id=any(seen));
 insert into public.ops_audit_log(business_unit_id,actor_id,action,detail) values(p_unit,actor,'Save equipment group',jsonb_build_object('group_id',result,'members',seen));
 return result;
end $$;

-- Freeze the member list at occurrence creation; later group edits never rewrite history.
create or replace function operations_private.maintenance_capture() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.ops_rules;a public.assets;group_data jsonb;begin
 select * into r from public.ops_rules where id=new.rule_id;
 if r.asset_id is not null then
 if r.maintenance_blocked is not null or operations_private.maintenance_asset_reason(r.asset_id,r.business_unit_id) is not null then raise exception 'Maintenance plan blocked; review asset eligibility';end if;
 select * into a from public.assets where id=r.asset_id;
 group_data:=operations_private.equipment_group_json(a.id);
 new.asset_context:=jsonb_build_object('id',a.id,'name',a.name,'asset_tag',a.asset_tag,'type',a.type,'brand',a.brand,'model',a.model,'serial_number',a.serial_number,'business_unit_id',r.business_unit_id,'unit_name',(select name from public.business_units where id=r.business_unit_id),'plan_id',r.id,'activity',r.title,'maintenance',r.config->'maintenance','group',group_data);
 end if;return new;
end $$;

create function public.ops_equipment_issues(p_group uuid,p_occurrence uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid;begin
 perform operations_private.actor();select business_unit_id into u from operations_private.equipment_groups where asset_id=p_group;
 if u is null or not (operations_private.can_use_library(u) or (p_occurrence is not null and exists(select 1 from public.ops_occurrences where id=p_occurrence and asset_context->>'id'=p_group::text and operations_private.occ_view(id)))) then raise exception 'Equipment issues are not authorized' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object('member_name',m.name,'reporter_name',h.full_name) order by i.reported_at desc),'[]') from operations_private.equipment_issues i join operations_private.equipment_members m on m.id=i.member_id join public.hris_users h on h.id=i.reported_by where i.group_id=p_group and (p_occurrence is null or i.occurrence_id=p_occurrence));
end $$;

create function public.ops_report_equipment_issue(p_group uuid,p_member uuid,p_occurrence uuid,p_description text,p_severity text,p_client uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=operations_private.actor();u uuid;result uuid;begin
 select business_unit_id into u from operations_private.equipment_groups where asset_id=p_group;
 if u is null then raise exception 'Equipment group unavailable';end if;
 if p_occurrence is null then
 if not operations_private.can_use_library(u) then raise exception 'Reporting is not authorized' using errcode='42501';end if;
 else
 if not exists(select 1 from public.ops_occurrences o join public.ops_assignments a on a.occurrence_id=o.id where o.id=p_occurrence and o.asset_context->>'id'=p_group::text and (operations_private.manager(u) or (a.assignee_id=actor and operations_private.can_write_run(a.checklist_run_id)))) then raise exception 'Reporting is not authorized for this occurrence' using errcode='42501';end if;
 end if;
 if not exists(select 1 from operations_private.equipment_members where id=p_member and group_id=p_group and (active or exists(select 1 from public.ops_occurrences o,jsonb_array_elements(o.asset_context->'group'->'members') m where o.id=p_occurrence and m->>'id'=p_member::text))) then raise exception 'Select equipment from this group';end if;
 if p_client is null or length(trim(coalesce(p_description,''))) not between 3 and 2000 or p_severity not in('Normal','Urgent / Stop use') then raise exception 'Describe the equipment issue and severity';end if;
 select id into result from operations_private.equipment_issues where client_id=p_client and group_id=p_group and reported_by=actor;
 if result is not null then return result;end if;
 insert into operations_private.equipment_issues(group_id,member_id,occurrence_id,description,severity,reported_by,client_id) values(p_group,p_member,p_occurrence,trim(p_description),p_severity,actor,p_client) returning id into result;
 insert into public.ops_audit_log(business_unit_id,actor_id,action,detail) values(u,actor,'Report equipment issue',jsonb_build_object('issue_id',result,'member_id',p_member,'occurrence_id',p_occurrence));
 insert into public.notifications(user_id,type,title,message,link,related_entity_id,dedupe_key)
 select h.id::text,'operations','Equipment issue reported',trim(p_description),'/operations?view=Maintenance&unit='||u::text,result::text,'ops-equipment:'||result::text from public.hris_users h where lower(h.status)='active' and operations_private.role_unit(h.id,u,array['Business Unit Manager','GeneralManager','Admin','Board of Director']) on conflict(user_id,dedupe_key) do nothing;
 return result;
end $$;

create function public.ops_resolve_equipment_issue(p_issue uuid,p_resolution text) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=operations_private.actor();i operations_private.equipment_issues;u uuid;begin
 select * into i from operations_private.equipment_issues where id=p_issue for update;
 select business_unit_id into u from operations_private.equipment_groups where asset_id=i.group_id;
 if u is null or not operations_private.manager(u) then raise exception 'Only an authorized manager can resolve an equipment issue' using errcode='42501';end if;
 if length(trim(coalesce(p_resolution,''))) not between 3 and 2000 then raise exception 'Record the repair or resolution';end if;
 if i.status='Resolved' then return;end if;
 update operations_private.equipment_issues set status='Resolved',resolution=trim(p_resolution),resolved_by=actor,resolved_at=now() where id=p_issue;
 insert into public.ops_audit_log(business_unit_id,actor_id,action,detail) values(u,actor,'Resolve equipment issue',jsonb_build_object('issue_id',p_issue,'resolution',trim(p_resolution)));
end $$;

-- Keep the existing workspace RPC unmodified; enrich its authorized assets in a new wrapper.
create function public.ops_grouped_maintenance_workspace(p_unit uuid,p_from date,p_to date,p_offset int default 0,p_filters jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare w jsonb;begin
 perform operations_private.actor();w:=public.ops_maintenance_workspace(p_unit,p_from,p_to,p_offset,p_filters);
 return jsonb_set(w,'{assets}',(select coalesce(jsonb_agg(a||jsonb_build_object('group',operations_private.equipment_group_json((a->>'id')::uuid))),'[]') from jsonb_array_elements(w->'assets') a));
end $$;
revoke all on function public.ops_save_equipment_group(uuid,uuid,text,text,text,jsonb,int),public.ops_equipment_issues(uuid,uuid),public.ops_report_equipment_issue(uuid,uuid,uuid,text,text,uuid),public.ops_resolve_equipment_issue(uuid,text),public.ops_grouped_maintenance_workspace(uuid,date,date,int,jsonb) from public,anon;
grant execute on function public.ops_save_equipment_group(uuid,uuid,text,text,text,jsonb,int),public.ops_equipment_issues(uuid,uuid),public.ops_report_equipment_issue(uuid,uuid,uuid,text,text,uuid),public.ops_resolve_equipment_issue(uuid,text),public.ops_grouped_maintenance_workspace(uuid,date,date,int,jsonb) to authenticated;
notify pgrst,'reload schema';
