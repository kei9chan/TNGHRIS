-- Focused lifecycle, unpaid-leave, and awards workflow repair.
-- All changes are additive and preserve existing records and certificate history.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Employee lifecycle template removal
-- ---------------------------------------------------------------------------

alter table public.onboarding_checklist_templates
  add column if not exists is_active boolean not null default true,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.hris_users(id) on delete set null;

create index if not exists onboarding_templates_active_type_idx
  on public.onboarding_checklist_templates(is_active, template_type, name);
create index if not exists onboarding_templates_archived_by_idx
  on public.onboarding_checklist_templates(archived_by)
  where archived_by is not null;

create or replace function public.remove_onboarding_checklist_template(p_template_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_email text;
  template_name text;
  usage_count integer;
  removal_mode text;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not (
    public.is_hr_or_admin()
    or public.has_feature_permission('Employees', 'edit')
    or public.has_feature_permission('Lifecycle', 'manage')
  ) then
    raise exception 'You do not have permission to remove lifecycle templates.' using errcode = '42501';
  end if;

  select name into template_name
  from public.onboarding_checklist_templates
  where id = p_template_id
  for update;
  if not found then
    raise exception 'Lifecycle template not found.' using errcode = 'P0002';
  end if;

  select count(*) into usage_count
  from public.onboarding_checklists
  where template_id = p_template_id;

  if usage_count > 0 then
    update public.onboarding_checklist_templates
       set is_active = false, archived_at = now(), archived_by = actor_id
     where id = p_template_id;
    removal_mode := 'archived';
  else
    begin
      delete from public.onboarding_checklist_templates where id = p_template_id;
      removal_mode := 'deleted';
    exception when foreign_key_violation then
      update public.onboarding_checklist_templates
         set is_active = false, archived_at = now(), archived_by = actor_id
       where id = p_template_id;
      removal_mode := 'archived';
    end;
  end if;

  select email into actor_email from public.hris_users where id = actor_id;
  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  values(
    actor_id::text,
    actor_email,
    case when removal_mode = 'deleted' then 'DELETE' else 'UPDATE' end,
    'OnboardingChecklistTemplate',
    p_template_id::text,
    format('%s lifecycle template "%s"; %s linked checklist(s) preserved.', initcap(removal_mode), template_name, usage_count)
  );

  return jsonb_build_object(
    'id', p_template_id,
    'name', template_name,
    'mode', removal_mode,
    'linked_checklists', usage_count
  );
end;
$$;

revoke all on function public.remove_onboarding_checklist_template(uuid) from public, anon;
grant execute on function public.remove_onboarding_checklist_template(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Unpaid leave
-- ---------------------------------------------------------------------------

insert into public.leave_types(name, paid, unit, min_increment, requires_doc_after_days)
select 'Without Pay', false, 'day', 0.5, null
where not exists (
  select 1 from public.leave_types where lower(btrim(name)) = 'without pay'
);

-- ---------------------------------------------------------------------------
-- Award templates and approval lifecycle
-- ---------------------------------------------------------------------------

alter table public.award_templates
  add column if not exists business_unit_id uuid references public.business_units(id) on delete set null,
  add column if not exists category text,
  add column if not exists award_value_label text,
  add column if not exists is_default boolean not null default false,
  add column if not exists is_preset boolean not null default false,
  add column if not exists preset_key text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.employee_awards
  add column if not exists department_id uuid references public.departments(id) on delete set null,
  add column if not exists approver_steps jsonb not null default '[]'::jsonb,
  add column if not exists issued_at timestamptz,
  add column if not exists issued_by uuid references public.hris_users(id) on delete set null;

alter type public.award_status add value if not exists 'Issued' after 'Approved';

alter table public.award_templates enable row level security;
alter table public.employee_awards enable row level security;

create unique index if not exists award_templates_preset_key_unique
  on public.award_templates(preset_key) where preset_key is not null;
create unique index if not exists award_templates_one_default_per_bu
  on public.award_templates(business_unit_id) where is_default and business_unit_id is not null;
create index if not exists employee_awards_approver_status_idx
  on public.employee_awards(approver_id, status, submitted_at desc);
create index if not exists employee_awards_bu_department_idx
  on public.employee_awards(business_unit_id, department_id, submitted_at desc);
create index if not exists award_templates_created_by_idx
  on public.award_templates(created_by_user_id)
  where created_by_user_id is not null;
create index if not exists employee_awards_template_idx
  on public.employee_awards(award_template_id);
create index if not exists employee_awards_created_by_idx
  on public.employee_awards(created_by_user_id);
create index if not exists employee_awards_department_idx
  on public.employee_awards(department_id)
  where department_id is not null;
create index if not exists employee_awards_issued_by_idx
  on public.employee_awards(issued_by)
  where issued_by is not null;

-- Existing single-approver pending nominations become explicit approval steps.
update public.employee_awards ea
set approver_steps = jsonb_build_array(jsonb_build_object(
  'userId', ea.approver_id,
  'userName', coalesce(approver.full_name, 'Approver'),
  'status', 'Pending',
  'order', 1
))
from public.hris_users approver
where ea.approver_id = approver.id
  and ea.status::text in ('PendingApproval', 'Pending Approval', 'Pending')
  and coalesce(jsonb_array_length(ea.approver_steps), 0) = 0;

-- Editable starter designs for the five current business units.
with presets(bu_name, preset_key, title, description, primary_color, accent_color, header_text) as (
  values
    ('Dessert Museum', 'dessert-museum-award', 'Dessert Museum Recognition', 'A colorful Dessert Museum certificate preset.', '#7C3AED', '#EC4899', 'SWEET SUCCESS AWARD'),
    ('Gootopia', 'gootopia-award', 'Gootopia Recognition', 'A playful Gootopia certificate preset.', '#16A34A', '#A3E635', 'GOO-TASTIC ACHIEVEMENT'),
    ('Bakebe', 'bakebe-award', 'Bakebe Recognition', 'A warm Bakebe certificate preset.', '#DB2777', '#F9A8D4', 'BAKEBE STAR AWARD'),
    ('Inflatable Island', 'inflatable-island-award', 'Inflatable Island Recognition', 'A bright Inflatable Island certificate preset.', '#0284C7', '#F97316', 'ISLAND EXCELLENCE AWARD'),
    ('Fun Roof', 'fun-roof-award', 'Fun Roof Recognition', 'A bold Fun Roof certificate preset.', '#7E22CE', '#F59E0B', 'ROOFTOP ALL-STAR AWARD')
)
insert into public.award_templates(
  title, description, badge_icon_url, is_active, design, business_unit_id,
  category, is_default, is_preset, preset_key
)
select
  p.title,
  p.description,
  '',
  true,
  jsonb_build_object(
    'backgroundColor', '#FFFFFF',
    'backgroundImageUrl', '',
    'borderWidth', 12,
    'borderColor', p.primary_color,
    'fontFamily', 'serif',
    'titleColor', p.primary_color,
    'textColor', '#1F2937',
    'headerText', p.header_text,
    'bodyText', 'This certificate is proudly presented to\n\n{{employee_name}}\n{{position}} · {{department}}\n\nfor {{award_reason}}\n\nAwarded on {{award_date}} by {{business_unit}}.',
    'signatories', jsonb_build_array(jsonb_build_object('name', 'Authorized Signatory', 'title', 'Management')),
    'logoUrl', '',
    'accentColor', p.accent_color
  ),
  null,
  'Employee Recognition',
  false,
  true,
  p.preset_key
from presets p
where not exists (select 1 from public.award_templates existing where existing.preset_key = p.preset_key);

drop policy if exists award_templates_hr_manage on public.award_templates;
create policy award_templates_hr_manage on public.award_templates
for all to authenticated
using (public.is_hr_or_admin() or public.has_feature_permission('Evaluation', 'manage'))
with check (public.is_hr_or_admin() or public.has_feature_permission('Evaluation', 'manage'));

drop policy if exists award_templates_authenticated_read on public.award_templates;
create policy award_templates_authenticated_read on public.award_templates
for select to authenticated using (true);

drop policy if exists employee_awards_workflow_read on public.employee_awards;
create policy employee_awards_workflow_read on public.employee_awards
for select to authenticated
using (
  employee_id = public.current_hris_user_id()
  or created_by_user_id = public.current_hris_user_id()
  or approver_id = public.current_hris_user_id()
  or exists (
    select 1 from jsonb_array_elements(coalesce(approver_steps, '[]'::jsonb)) step
    where step->>'userId' = public.current_hris_user_id()::text
  )
  or public.is_hr_or_admin()
);

create or replace function private.award_notify(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_award_id uuid,
  p_dedupe_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then return; end if;
  insert into public.notifications(user_id, type, title, message, link, is_read, related_entity_id, dedupe_key)
  values(p_user_id::text, p_type, p_title, p_message, '/approvals?type=award&item=' || p_award_id::text, false, p_award_id::text, p_dedupe_key)
  on conflict(user_id, dedupe_key) do nothing;
end;
$$;

create or replace function private.award_audit(p_action text, p_award_id uuid, p_details text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := public.current_hris_user_id(); actor_email text;
begin
  select email into actor_email from public.hris_users where id = actor_id;
  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  values(coalesce(actor_id::text, 'system'), actor_email, p_action, 'EmployeeAward', p_award_id::text, p_details);
end;
$$;

revoke all on function private.award_notify(uuid,text,text,text,uuid,text) from public, anon, authenticated;
revoke all on function private.award_audit(text,uuid,text) from public, anon, authenticated;

create or replace function public.submit_employee_award(
  p_employee_id uuid,
  p_award_template_id uuid,
  p_notes text,
  p_business_unit_id uuid,
  p_department_id uuid,
  p_approver_ids uuid[]
)
returns public.employee_awards
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  employee_name text;
  employee_business_unit_id uuid;
  employee_department_id uuid;
  template_title text;
  approver_id uuid;
  approver_name text;
  steps jsonb := '[]'::jsonb;
  created_award public.employee_awards;
  step_order integer := 0;
begin
  if actor_id is null or not (
    public.is_hr_or_admin()
    or public.has_feature_permission('Evaluation', 'manage')
    or public.has_feature_permission('Evaluation', 'create')
  ) then
    raise exception 'You do not have permission to submit awards.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_approver_ids), 0) = 0 then
    raise exception 'At least one approver is required.';
  end if;
  if not exists (select 1 from public.hris_users where id = p_employee_id and lower(status::text) = 'active') then
    raise exception 'The selected employee is unavailable or inactive.';
  end if;
  if not exists (select 1 from public.award_templates where id = p_award_template_id and is_active) then
    raise exception 'The selected award template is unavailable.';
  end if;

  select full_name, business_unit_id, department_id
    into employee_name, employee_business_unit_id, employee_department_id
  from public.hris_users where id = p_employee_id;
  if p_business_unit_id is not null and p_business_unit_id is distinct from employee_business_unit_id then
    raise exception 'The selected employee does not belong to that business unit.';
  end if;
  if p_department_id is not null and p_department_id is distinct from employee_department_id then
    raise exception 'The selected employee does not belong to that department.';
  end if;
  select title into template_title from public.award_templates where id = p_award_template_id;

  foreach approver_id in array p_approver_ids loop
    if exists (
      select 1 from jsonb_array_elements(steps) s where s->>'userId' = approver_id::text
    ) then continue; end if;
    select full_name into approver_name from public.hris_users
      where id = approver_id and lower(status::text) = 'active';
    if approver_name is null then raise exception 'One or more selected approvers are unavailable.'; end if;
    step_order := step_order + 1;
    steps := steps || jsonb_build_array(jsonb_build_object(
      'userId', approver_id, 'userName', approver_name, 'status', 'Pending', 'order', step_order
    ));
  end loop;

  insert into public.employee_awards(
    employee_id, award_template_id, notes, business_unit_id, department_id,
    certificate_snapshot_url, created_by_user_id, status, submitted_at, level,
    approver_id, approver_steps
  ) values (
    p_employee_id, p_award_template_id, nullif(btrim(p_notes), ''), employee_business_unit_id, employee_department_id,
    null, actor_id, 'PendingApproval', now(), 'Bronze', p_approver_ids[1], steps
  ) returning * into created_award;

  foreach approver_id in array p_approver_ids loop
    perform private.award_notify(
      approver_id,
      'AWARD_APPROVAL_REQUEST',
      'Award Approval Needed',
      format('%s was nominated for "%s". Please review.', employee_name, template_title),
      created_award.id,
      'award-approval:' || created_award.id::text || ':' || approver_id::text
    );
  end loop;
  perform private.award_audit('CREATE', created_award.id, format('Submitted %s for %s; %s required approver(s).', template_title, employee_name, step_order));
  return created_award;
end;
$$;

create or replace function public.process_employee_award_approval(
  p_award_id uuid,
  p_approved boolean,
  p_rejection_reason text default null
)
returns public.employee_awards
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  award_row public.employee_awards;
  step jsonb;
  updated_steps jsonb := '[]'::jsonb;
  actor_has_pending_step boolean := false;
  remaining_count integer;
  next_approver uuid;
begin
  if actor_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  select * into award_row from public.employee_awards where id = p_award_id for update;
  if not found then raise exception 'Award request not found.' using errcode = 'P0002'; end if;
  if award_row.status::text not in ('PendingApproval', 'Pending Approval', 'Pending') then
    raise exception 'This award request is no longer pending.';
  end if;

  for step in select value from jsonb_array_elements(coalesce(award_row.approver_steps, '[]'::jsonb)) loop
    if step->>'userId' = actor_id::text and lower(step->>'status') = 'pending' then
      actor_has_pending_step := true;
      step := jsonb_set(step, '{status}', to_jsonb((case when p_approved then 'Approved' else 'Rejected' end)::text), true);
      step := jsonb_set(step, '{timestamp}', to_jsonb(now()::text), true);
      if not p_approved then
        step := jsonb_set(step, '{rejectionReason}', to_jsonb(coalesce(nullif(btrim(p_rejection_reason), ''), 'No reason provided')), true);
      end if;
    end if;
    updated_steps := updated_steps || jsonb_build_array(step);
  end loop;

  if not actor_has_pending_step and award_row.approver_id is distinct from actor_id then
    raise exception 'This award is not assigned to you for approval.' using errcode = '42501';
  end if;

  if not p_approved then
    update public.employee_awards
       set approver_steps = updated_steps,
           status = 'Rejected',
           rejection_reason = coalesce(nullif(btrim(p_rejection_reason), ''), 'No reason provided'),
           decided_at = now()
     where id = p_award_id returning * into award_row;
    perform private.award_notify(award_row.created_by_user_id, 'AWARD_APPROVAL_REQUEST', 'Award Nomination Rejected', 'Your award nomination was rejected.', award_row.id, 'award-rejected:' || award_row.id::text);
    perform private.award_audit('REJECT', award_row.id, 'Rejected award nomination.');
    return award_row;
  end if;

  select count(*) into remaining_count
  from jsonb_array_elements(updated_steps) s
  where lower(s->>'status') = 'pending';

  if remaining_count = 0 then
    update public.employee_awards
       set approver_steps = updated_steps,
           approver_id = actor_id,
           status = 'Approved',
           decided_at = now(),
           rejection_reason = null
     where id = p_award_id returning * into award_row;
    perform private.award_notify(award_row.created_by_user_id, 'AWARD_ISSUED', 'Award Nomination Approved', 'Your award nomination completed all required approvals.', award_row.id, 'award-approved:' || award_row.id::text);
    perform private.award_audit('APPROVE', award_row.id, 'Completed all required award approvals.');
  else
    select (s->>'userId')::uuid into next_approver
    from jsonb_array_elements(updated_steps) s
    where lower(s->>'status') = 'pending'
    order by coalesce((s->>'order')::integer, 999)
    limit 1;
    update public.employee_awards
       set approver_steps = updated_steps, approver_id = next_approver
     where id = p_award_id returning * into award_row;
    perform private.award_audit('APPROVE', award_row.id, format('Recorded approval; %s approval(s) remain.', remaining_count));
  end if;
  return award_row;
end;
$$;

create or replace function public.mark_employee_award_issued(p_award_id uuid, p_certificate_snapshot_url text)
returns public.employee_awards
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := public.current_hris_user_id(); award_row public.employee_awards;
begin
  if actor_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  select * into award_row from public.employee_awards where id = p_award_id for update;
  if not found then raise exception 'Award request not found.' using errcode = 'P0002'; end if;
  if award_row.status::text <> 'Approved' then raise exception 'The award must complete approval before issuance.'; end if;
  if nullif(btrim(p_certificate_snapshot_url), '') is null then raise exception 'A final certificate is required.'; end if;
  if not (public.is_hr_or_admin() or award_row.approver_id = actor_id or award_row.created_by_user_id = actor_id) then
    raise exception 'You do not have permission to issue this award.' using errcode = '42501';
  end if;
  update public.employee_awards
     set status = 'Issued', certificate_snapshot_url = p_certificate_snapshot_url,
         issued_at = now(), issued_by = actor_id
   where id = p_award_id returning * into award_row;
  perform private.award_notify(award_row.employee_id, 'AWARD_ISSUED', 'You received an award! 🏆', 'Your approved award certificate has been issued.', award_row.id, 'award-issued:' || award_row.id::text);
  perform private.award_audit('UPDATE', award_row.id, 'Issued approved award certificate to employee.');
  return award_row;
end;
$$;

revoke all on function public.submit_employee_award(uuid,uuid,text,uuid,uuid,uuid[]) from public, anon;
revoke all on function public.process_employee_award_approval(uuid,boolean,text) from public, anon;
revoke all on function public.mark_employee_award_issued(uuid,text) from public, anon;
grant execute on function public.submit_employee_award(uuid,uuid,text,uuid,uuid,uuid[]) to authenticated;
grant execute on function public.process_employee_award_approval(uuid,boolean,text) to authenticated;
grant execute on function public.mark_employee_award_issued(uuid,text) to authenticated;

-- Pending nominations cannot receive a final certificate through direct writes.
create or replace function public.enforce_employee_award_certificate_gate()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status::text in ('Draft', 'PendingApproval', 'Pending Approval', 'Pending', 'Rejected')
     and new.certificate_snapshot_url is not null
     and (tg_op = 'INSERT' or old.certificate_snapshot_url is distinct from new.certificate_snapshot_url) then
    raise exception 'A final award certificate cannot be stored before approval.';
  end if;
  if new.status::text = 'Issued' and nullif(btrim(new.certificate_snapshot_url), '') is null then
    raise exception 'An issued award requires a final certificate.';
  end if;
  return new;
end;
$$;

drop trigger if exists employee_awards_certificate_gate on public.employee_awards;
create trigger employee_awards_certificate_gate
before insert or update of status, certificate_snapshot_url on public.employee_awards
for each row execute function public.enforce_employee_award_certificate_gate();

revoke execute on function public.enforce_employee_award_certificate_gate() from public, anon;
grant execute on function public.enforce_employee_award_certificate_gate() to authenticated;

commit;
