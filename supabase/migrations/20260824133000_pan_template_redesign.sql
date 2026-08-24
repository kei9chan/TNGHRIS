-- Configurable PAN templates and immutable document snapshots.
-- Existing PAN/template rows are preserved and backfilled in place.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.pan_templates
  add column if not exists business_unit_id uuid references public.business_units(id) on delete set null,
  add column if not exists action_type text not null default 'general',
  add column if not exists status text not null default 'published',
  add column if not exists version integer not null default 1,
  add column if not exists document_title text not null default 'PERSONNEL ACTION NOTICE',
  add column if not exists document_code text not null default 'TNG-HRD-022',
  add column if not exists footer_text text not null default '',
  add column if not exists color_accent text not null default '#172554',
  add column if not exists paper_size text not null default 'A4',
  add column if not exists orientation text not null default 'portrait',
  add column if not exists sections jsonb not null default '[]'::jsonb,
  add column if not exists field_config jsonb not null default '[]'::jsonb,
  add column if not exists published_at timestamptz,
  add column if not exists published_by uuid references public.hris_users(id) on delete set null,
  add column if not exists updated_by uuid references public.hris_users(id) on delete set null,
  add column if not exists is_default boolean not null default false;

alter table public.pan_templates drop constraint if exists pan_templates_action_type_check;
alter table public.pan_templates add constraint pan_templates_action_type_check
  check (action_type in ('general','status_change','promotion','transfer','salary_increase','job_title_change','other')) not valid;
alter table public.pan_templates validate constraint pan_templates_action_type_check;

alter table public.pan_templates drop constraint if exists pan_templates_status_check;
alter table public.pan_templates add constraint pan_templates_status_check
  check (status in ('draft','published','archived')) not valid;
alter table public.pan_templates validate constraint pan_templates_status_check;

alter table public.pan_templates drop constraint if exists pan_templates_paper_size_check;
alter table public.pan_templates add constraint pan_templates_paper_size_check check (paper_size in ('A4','Letter')) not valid;
alter table public.pan_templates validate constraint pan_templates_paper_size_check;

alter table public.pan_templates drop constraint if exists pan_templates_orientation_check;
alter table public.pan_templates add constraint pan_templates_orientation_check check (orientation in ('portrait','landscape')) not valid;
alter table public.pan_templates validate constraint pan_templates_orientation_check;

update public.pan_templates
set action_type = case
      when coalesce((action_taken->>'transfer')::boolean, false) then 'transfer'
      when coalesce((action_taken->>'promotion')::boolean, false) then 'promotion'
      when coalesce((action_taken->>'salaryIncrease')::boolean, false) then 'salary_increase'
      when coalesce((action_taken->>'changeOfJobTitle')::boolean, false) then 'job_title_change'
      when coalesce((action_taken->>'changeOfStatus')::boolean, false) then 'status_change'
      when nullif(action_taken->>'others','') is not null then 'other'
      else 'general'
    end,
    status = coalesce(nullif(status,''), 'published'),
    version = greatest(coalesce(version,1),1),
    sections = case when jsonb_array_length(coalesce(sections,'[]'::jsonb)) > 0 then sections else
      '[
        {"key":"employee_information","label":"Employee information","visible":true,"required":true,"order":1},
        {"key":"action_taken","label":"Action taken","visible":true,"required":true,"order":2},
        {"key":"effective_date","label":"Effectivity date","visible":true,"required":true,"order":3},
        {"key":"from_to","label":"From vs To comparison","visible":true,"required":true,"order":4},
        {"key":"salary_package","label":"Salary package","visible":true,"required":false,"order":5},
        {"key":"remarks","label":"Remarks / justifications","visible":true,"required":false,"order":6},
        {"key":"approval_signatures","label":"Approval / signature blocks","visible":true,"required":true,"order":7},
        {"key":"employee_acknowledgement","label":"Employee acknowledgement","visible":true,"required":true,"order":8}
      ]'::jsonb end,
    field_config = case when jsonb_array_length(coalesce(field_config,'[]'::jsonb)) > 0 then field_config else
      '[
        {"key":"employee_name","label":"Employee''s Name","visible":true,"required":true,"section":"employee_information","display":"text","order":1},
        {"key":"date_hired","label":"Date Hired","visible":true,"required":false,"section":"employee_information","display":"text","order":2},
        {"key":"department","label":"Department","visible":true,"required":false,"section":"from_to","display":"table","order":3},
        {"key":"position","label":"Position","visible":true,"required":false,"section":"from_to","display":"table","order":4},
        {"key":"business_unit","label":"Business Unit / Company","visible":true,"required":false,"section":"from_to","display":"table","order":5},
        {"key":"other_business_units","label":"Other Business Unit(s) / Affiliates","visible":true,"required":false,"section":"from_to","display":"table","order":6},
        {"key":"employment_status","label":"Employment Status","visible":true,"required":false,"section":"from_to","display":"table","order":7},
        {"key":"salary","label":"Salary / Compensation","visible":true,"required":false,"section":"salary_package","display":"table","order":8},
        {"key":"remarks","label":"Remarks / Justifications","visible":true,"required":false,"section":"remarks","display":"text","order":9},
        {"key":"signatures","label":"Signatures","visible":true,"required":true,"section":"approval_signatures","display":"signature","order":10}
      ]'::jsonb end,
    published_at = case when coalesce(nullif(status,''),'published') = 'published' then coalesce(published_at,updated_at,created_at,now()) else published_at end;

create index if not exists pan_templates_scope_idx on public.pan_templates(business_unit_id, action_type, status, updated_at desc);
with ranked_defaults as (
  select id,row_number() over(partition by coalesce(business_unit_id,'00000000-0000-0000-0000-000000000000'::uuid),action_type order by updated_at desc,id) as default_rank
  from public.pan_templates where is_default and status='published'
)
update public.pan_templates t set is_default=false
from ranked_defaults r where t.id=r.id and r.default_rank>1;
create unique index if not exists pan_templates_one_published_default_idx
  on public.pan_templates(coalesce(business_unit_id,'00000000-0000-0000-0000-000000000000'::uuid), action_type)
  where is_default and status = 'published';

alter table public.pans
  add column if not exists business_unit_id uuid references public.business_units(id) on delete set null,
  add column if not exists template_id uuid references public.pan_templates(id) on delete set null,
  add column if not exists template_version integer,
  add column if not exists template_name text,
  add column if not exists template_snapshot jsonb,
  add column if not exists action_type text;

create index if not exists pans_template_idx on public.pans(template_id) where template_id is not null;
create index if not exists pans_business_unit_action_idx on public.pans(business_unit_id, action_type, updated_at desc);

update public.pans p
set business_unit_id = coalesce(p.business_unit_id, nullif(p.particulars->'from'->>'businessUnitId','')::uuid),
    action_type = coalesce(p.action_type, case
      when coalesce((p.action_taken->>'transfer')::boolean, false) then 'transfer'
      when coalesce((p.action_taken->>'promotion')::boolean, false) then 'promotion'
      when coalesce((p.action_taken->>'salaryIncrease')::boolean, false) then 'salary_increase'
      when coalesce((p.action_taken->>'changeOfJobTitle')::boolean, false) then 'job_title_change'
      when coalesce((p.action_taken->>'changeOfStatus')::boolean, false) then 'status_change'
      when nullif(p.action_taken->>'others','') is not null then 'other'
      else 'general' end);

create or replace function private.pan_template_actor_can_manage()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select public.has_active_role('Admin')
      or public.has_active_role('HR Manager')
      or public.has_feature_permission('PersonnelActionNotices','manage')
      or public.has_feature_permission('PersonnelActionNotices','publish')
$$;

revoke all on function private.pan_template_actor_can_manage() from public, anon, authenticated;

create or replace function private.enforce_pan_template_manager()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('postgres','supabase_admin','service_role') then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if public.current_hris_user_id() is null or not private.pan_template_actor_can_manage() then
    raise exception 'Forbidden: PAN template management permission is required.' using errcode = '42501';
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function private.enforce_pan_template_manager() from public, anon, authenticated;
grant execute on function private.pan_template_actor_can_manage() to authenticated;
drop trigger if exists enforce_pan_template_manager on public.pan_templates;
create trigger enforce_pan_template_manager before insert or update or delete on public.pan_templates
for each row execute function private.enforce_pan_template_manager();

alter table public.pan_templates enable row level security;
drop policy if exists pan_templates_published_read on public.pan_templates;
drop policy if exists pan_templates_manager_insert on public.pan_templates;
drop policy if exists pan_templates_manager_update on public.pan_templates;
drop policy if exists pan_templates_manager_delete on public.pan_templates;

create policy pan_templates_published_read on public.pan_templates for select to authenticated using (
  status = 'published' or private.pan_template_actor_can_manage()
);
create policy pan_templates_manager_insert on public.pan_templates for insert to authenticated with check (
  private.pan_template_actor_can_manage() and created_by_user_id = public.current_hris_user_id()
);
create policy pan_templates_manager_update on public.pan_templates for update to authenticated using (
  private.pan_template_actor_can_manage()
) with check (
  private.pan_template_actor_can_manage()
);
create policy pan_templates_manager_delete on public.pan_templates for delete to authenticated using (
  private.pan_template_actor_can_manage()
);

create or replace function public.save_pan_template(p_template jsonb)
returns public.pan_templates
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  template_id uuid := nullif(p_template->>'id','')::uuid;
  unit_id uuid := nullif(p_template->>'businessUnitId','')::uuid;
  action_value text := coalesce(nullif(p_template->>'actionType',''),'general');
  status_value text := coalesce(nullif(p_template->>'status',''),'draft');
  make_default boolean := coalesce((p_template->>'isDefault')::boolean,false);
  template_row public.pan_templates;
  sections_value jsonb := coalesce(p_template->'sections','[]'::jsonb);
  fields_value jsonb := coalesce(p_template->'fieldConfig','[]'::jsonb);
begin
  if actor_id is null or not private.pan_template_actor_can_manage() then
    raise exception 'Forbidden: PAN template management permission is required.' using errcode='42501';
  end if;
  if nullif(btrim(p_template->>'name'),'') is null then raise exception 'Template name is required.'; end if;
  if action_value not in ('general','status_change','promotion','transfer','salary_increase','job_title_change','other') then raise exception 'Invalid PAN action type.'; end if;
  if status_value not in ('draft','published','archived') then raise exception 'Invalid PAN template status.'; end if;
  if status_value <> 'published' then make_default := false; end if;
  if not (sections_value @> '[{"key":"employee_information","visible":true},{"key":"action_taken","visible":true},{"key":"effective_date","visible":true},{"key":"approval_signatures","visible":true},{"key":"employee_acknowledgement","visible":true}]'::jsonb) then
    raise exception 'Required PAN document sections cannot be removed or hidden.';
  end if;
  if not (fields_value @> '[{"key":"employee_name","visible":true,"required":true},{"key":"signatures","visible":true,"required":true}]'::jsonb) then
    raise exception 'Required PAN workflow fields cannot be removed or hidden.';
  end if;

  if make_default then
    update public.pan_templates set is_default=false, updated_by=actor_id, updated_at=now()
    where coalesce(business_unit_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(unit_id,'00000000-0000-0000-0000-000000000000'::uuid)
      and action_type=action_value and status='published' and (template_id is null or id<>template_id);
  end if;

  if template_id is null then
    insert into public.pan_templates(name,action_taken,notes,logo_url,preparer_name,preparer_signature_url,created_by_user_id,is_default,business_unit_id,action_type,status,version,document_title,document_code,footer_text,color_accent,paper_size,orientation,sections,field_config,published_at,published_by,updated_by)
    values(btrim(p_template->>'name'),coalesce(p_template->'actionTaken','{}'::jsonb),coalesce(p_template->>'notes',''),nullif(p_template->>'logoUrl',''),nullif(p_template->>'preparerName',''),nullif(p_template->>'preparerSignatureUrl',''),actor_id,make_default,unit_id,action_value,status_value,1,coalesce(nullif(p_template->>'documentTitle',''),'PERSONNEL ACTION NOTICE'),coalesce(p_template->>'documentCode','TNG-HRD-022'),coalesce(p_template->>'footerText',''),coalesce(nullif(p_template->>'colorAccent',''),'#172554'),coalesce(nullif(p_template->>'paperSize',''),'A4'),coalesce(nullif(p_template->>'orientation',''),'portrait'),sections_value,fields_value,case when status_value='published' then now() end,case when status_value='published' then actor_id end,actor_id)
    returning * into template_row;
  else
    update public.pan_templates set
      name=btrim(p_template->>'name'), action_taken=coalesce(p_template->'actionTaken','{}'::jsonb), notes=coalesce(p_template->>'notes',''),
      logo_url=nullif(p_template->>'logoUrl',''), preparer_name=nullif(p_template->>'preparerName',''), preparer_signature_url=nullif(p_template->>'preparerSignatureUrl',''),
      is_default=make_default, business_unit_id=unit_id, action_type=action_value, status=status_value, version=version+1,
      document_title=coalesce(nullif(p_template->>'documentTitle',''),'PERSONNEL ACTION NOTICE'), document_code=coalesce(p_template->>'documentCode','TNG-HRD-022'),
      footer_text=coalesce(p_template->>'footerText',''), color_accent=coalesce(nullif(p_template->>'colorAccent',''),'#172554'), paper_size=coalesce(nullif(p_template->>'paperSize',''),'A4'), orientation=coalesce(nullif(p_template->>'orientation',''),'portrait'),
      sections=sections_value, field_config=fields_value, published_at=case when status_value='published' then coalesce(published_at,now()) else published_at end,
      published_by=case when status_value='published' then coalesce(published_by,actor_id) else published_by end, updated_by=actor_id, updated_at=now()
    where id=template_id returning * into template_row;
    if template_row.id is null then raise exception 'PAN template not found.'; end if;
  end if;
  return template_row;
end;
$$;

create or replace function public.archive_pan_template(p_template_id uuid)
returns public.pan_templates language plpgsql security invoker set search_path='' as $$
declare row_value public.pan_templates;
begin
  if public.current_hris_user_id() is null or not private.pan_template_actor_can_manage() then raise exception 'Forbidden.' using errcode='42501'; end if;
  update public.pan_templates set status='archived',is_default=false,updated_by=public.current_hris_user_id(),updated_at=now() where id=p_template_id returning * into row_value;
  if row_value.id is null then raise exception 'PAN template not found.'; end if;
  return row_value;
end; $$;

create or replace function public.set_default_pan_template(p_template_id uuid)
returns public.pan_templates language plpgsql security invoker set search_path='' as $$
declare actor_id uuid:=public.current_hris_user_id(); row_value public.pan_templates;
begin
  if actor_id is null or not private.pan_template_actor_can_manage() then raise exception 'Forbidden.' using errcode='42501'; end if;
  select * into row_value from public.pan_templates where id=p_template_id and status='published' for update;
  if row_value.id is null then raise exception 'Only a published PAN template can be set as default.'; end if;
  update public.pan_templates set is_default=false,updated_by=actor_id,updated_at=now()
  where coalesce(business_unit_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(row_value.business_unit_id,'00000000-0000-0000-0000-000000000000'::uuid) and action_type=row_value.action_type and id<>row_value.id;
  update public.pan_templates set is_default=true,updated_by=actor_id,updated_at=now() where id=row_value.id returning * into row_value;
  return row_value;
end; $$;

revoke all on function public.save_pan_template(jsonb) from public,anon,authenticated;
revoke all on function public.archive_pan_template(uuid) from public,anon,authenticated;
revoke all on function public.set_default_pan_template(uuid) from public,anon,authenticated;
grant execute on function public.save_pan_template(jsonb) to authenticated;
grant execute on function public.archive_pan_template(uuid) to authenticated;
grant execute on function public.set_default_pan_template(uuid) to authenticated;

create or replace function private.capture_pan_template_snapshot()
returns trigger language plpgsql security invoker set search_path='' as $$
declare template_row public.pan_templates;
begin
  if new.template_id is null then return new; end if;
  if tg_op='UPDATE' and new.template_id is not distinct from old.template_id and new.template_snapshot is not null then return new; end if;
  select * into template_row from public.pan_templates where id=new.template_id;
  if template_row.id is null or template_row.status<>'published' then raise exception 'A published PAN template is required.'; end if;
  new.template_version:=template_row.version; new.template_name:=template_row.name; new.business_unit_id:=coalesce(new.business_unit_id,template_row.business_unit_id); new.action_type:=coalesce(new.action_type,template_row.action_type);
  new.template_snapshot:=jsonb_build_object('id',template_row.id,'name',template_row.name,'version',template_row.version,'businessUnitId',template_row.business_unit_id,'actionType',template_row.action_type,'documentTitle',template_row.document_title,'documentCode',template_row.document_code,'footerText',template_row.footer_text,'colorAccent',template_row.color_accent,'paperSize',template_row.paper_size,'orientation',template_row.orientation,'logoUrl',template_row.logo_url,'preparerName',template_row.preparer_name,'preparerSignatureUrl',template_row.preparer_signature_url,'sections',template_row.sections,'fieldConfig',template_row.field_config);
  return new;
end; $$;

revoke all on function private.capture_pan_template_snapshot() from public,anon,authenticated;
drop trigger if exists capture_pan_template_snapshot on public.pans;
create trigger capture_pan_template_snapshot before insert or update of template_id on public.pans for each row execute function private.capture_pan_template_snapshot();

update public.pans p set
  template_version=t.version,
  template_name=t.name,
  template_snapshot=jsonb_build_object('id',t.id,'name',t.name,'version',t.version,'businessUnitId',t.business_unit_id,'actionType',t.action_type,'documentTitle',t.document_title,'documentCode',t.document_code,'footerText',t.footer_text,'colorAccent',t.color_accent,'paperSize',t.paper_size,'orientation',t.orientation,'logoUrl',t.logo_url,'preparerName',t.preparer_name,'preparerSignatureUrl',t.preparer_signature_url,'sections',t.sections,'fieldConfig',t.field_config)
from public.pan_templates t where p.template_id=t.id and p.template_snapshot is null;
