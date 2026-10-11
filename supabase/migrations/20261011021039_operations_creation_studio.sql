-- A single transaction publishes library content and its optional recurring schedule.
-- Reuse the existing permission, snapshot, concurrency, and maintenance engines.
create table operations_private.template_schedules (
 template_id uuid primary key references public.ops_templates(id),
 rule_id uuid not null unique references public.ops_rules(id)
);
alter table operations_private.template_schedules enable row level security;
revoke all on operations_private.template_schedules from public,anon,authenticated;

-- Connect an existing ordinary schedule only when a unit template has exactly one.
-- Master templates, multi-schedule templates, event stages, and maintenance plans stay separate.
insert into operations_private.template_schedules(template_id,rule_id)
select t.id,(array_agg(r.id))[1]
from public.ops_templates t
join public.ops_template_versions v on v.template_id=t.id
join public.ops_rules r on r.template_version_id=v.id and r.business_unit_id=t.business_unit_id
where t.status<>'Archived' and r.status<>'Archived' and r.asset_id is null
and not r.config ?| array['maintenance','event_window']
group by t.id having count(*)=1;
update public.ops_templates t
set draft=jsonb_set(t.draft,'{creation}',jsonb_build_object('enabled',r.status='Active','config',r.config,'rule_id',r.id,'pending',false)),revision=t.revision+1
from operations_private.template_schedules s join public.ops_rules r on r.id=s.rule_id
where t.id=s.template_id;

create function public.ops_creation_state(p_template uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.ops_templates;r public.ops_rules;begin
 perform operations_private.actor();
 select * into t from public.ops_templates where id=p_template;
 if t.id is null or not operations_private.can_view_template(t.id) then raise exception 'Template unavailable' using errcode='42501';end if;
 select x.* into r from operations_private.template_schedules s join public.ops_rules x on x.id=s.rule_id where s.template_id=t.id;
 if r.id is null then return jsonb_build_object('rule',null);end if;
 if not operations_private.rule_manage(r.id) then raise exception 'The linked schedule needs its authorized manager' using errcode='42501';end if;
 return jsonb_build_object('rule',jsonb_build_object('id',r.id,'revision',r.revision,'config',r.config,'status',r.status));
end$$;

create function operations_private.save_creation(p_id uuid,p_unit uuid,p_kind text,p_content jsonb,p_revision integer,p_publish boolean,p_schedule jsonb,p_rule_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=operations_private.actor();tid uuid;vid uuid;rid uuid;r public.ops_rules;item jsonb;items jsonb:='[]';source uuid;content jsonb:=p_content;begin
 -- Lock the template before its linked rule, and reject changed templates/rules.
 if p_id is not null then
  perform 1 from public.ops_templates where id=p_id for update;
  select x.* into r from operations_private.template_schedules s join public.ops_rules x on x.id=s.rule_id where s.template_id=p_id for update of x;
  if r.id is not null and (not operations_private.rule_manage(r.id) or r.business_unit_id is distinct from p_unit) then raise exception 'The linked schedule needs its authorized manager' using errcode='42501';end if;
  if r.id is not null and r.revision is distinct from p_rule_revision then raise exception 'Schedule changed. Reopen the editor before saving.' using errcode='40001';end if;
 end if;
 -- Incoming rule IDs are never trusted or copied between templates.
 content:=jsonb_set(content,'{creation}',(coalesce(content->'creation','{}')-'rule_id')||jsonb_build_object('pending',not p_publish));
 if p_publish and p_kind='checklist' then
  for item in select value from jsonb_array_elements(coalesce(content->'items','[]')) loop
   if nullif(item->>'task_version_id','') is not null then
    select v.id into source from public.ops_template_versions old
     join public.ops_templates t on t.id=old.template_id
     join public.ops_template_versions v on v.template_id=t.id and v.version=t.latest_version
     where old.id=(item->>'task_version_id')::uuid and t.kind='task' and t.status='Published'
     and (t.business_unit_id is null or t.business_unit_id=p_unit) and operations_private.can_view_template(t.id);
    if source is null then raise exception 'A checklist task is unavailable. Choose a published library task.' using errcode='42501';end if;
    item:=jsonb_set(item,'{task_version_id}',to_jsonb(source::text));
   end if;
   items:=items||jsonb_build_array(item);
  end loop;
  content:=jsonb_set(content,'{items}',items);
 end if;
 tid:=operations_private.save_template(p_id,p_unit,p_kind,content,p_revision,p_publish);
 if p_publish then
  select id into vid from public.ops_template_versions where template_id=tid order by version desc limit 1;
  if p_schedule is not null then
   if p_unit is null or jsonb_typeof(p_schedule)<>'object' or p_schedule ?| array['maintenance','event_window'] then raise exception 'Choose a business unit and use its ordinary task schedule';end if;
   rid:=operations_private.save_rule(r.id,p_unit,content->>'title',vid,p_schedule,'Active',r.revision,'Published task and schedule together');
   insert into operations_private.template_schedules(template_id,rule_id) values(tid,rid) on conflict(template_id) do update set rule_id=excluded.rule_id;
  elsif r.id is not null then
   rid:=operations_private.save_rule(r.id,p_unit,r.title,r.template_version_id,r.config,'Paused',r.revision,'Changed library task to as needed');
  end if;
 end if;
 -- Drafts never activate or pause schedules. Return the link only in mutable draft metadata.
 rid:=coalesce(rid,r.id);
 if rid is not null then update public.ops_templates set draft=jsonb_set(draft,'{creation,rule_id}',to_jsonb(rid::text)) where id=tid;end if;
 return jsonb_build_object('template_id',tid,'version_id',vid,'rule_id',rid);
end$$;
create function public.ops_save_creation(p_id uuid,p_unit uuid,p_kind text,p_content jsonb,p_revision integer,p_publish boolean,p_schedule jsonb,p_rule_revision integer) returns jsonb
language sql security definer set search_path='' as $$select operations_private.save_creation(p_id,p_unit,p_kind,p_content,p_revision,p_publish,p_schedule,p_rule_revision)$$;
revoke all on function public.ops_creation_state(uuid),public.ops_save_creation(uuid,uuid,text,jsonb,integer,boolean,jsonb,integer),operations_private.save_creation(uuid,uuid,text,jsonb,integer,boolean,jsonb,integer) from public,anon;
revoke all on function operations_private.save_creation(uuid,uuid,text,jsonb,integer,boolean,jsonb,integer) from authenticated;
grant execute on function public.ops_creation_state(uuid),public.ops_save_creation(uuid,uuid,text,jsonb,integer,boolean,jsonb,integer) to authenticated;
