-- Focused, additive enhancements for requester follow-ups, employee Benefits
-- access, correspondence attachments, and announcement recipient tracking.

-- ---------------------------------------------------------------------------
-- Incident Report and Helpdesk follow-up metadata
-- ---------------------------------------------------------------------------

alter table public.incident_reports
  add column if not exists sla_deadline timestamptz,
  add column if not exists follow_up_count integer not null default 0,
  add column if not exists last_follow_up_at timestamptz,
  add column if not exists follow_up_history jsonb not null default '[]'::jsonb;

update public.incident_reports
set sla_deadline = created_at + interval '3 days'
where sla_deadline is null;

alter table public.incident_reports
  alter column sla_deadline set default (now() + interval '3 days');

alter table public.tickets
  add column if not exists follow_up_count integer not null default 0,
  add column if not exists last_follow_up_at timestamptz,
  add column if not exists follow_up_history jsonb not null default '[]'::jsonb;

update public.tickets
set sla_deadline = created_at + case priority::text
  when 'Urgent' then interval '2 hours'
  when 'High' then interval '4 hours'
  when 'Medium' then interval '8 hours'
  else interval '24 hours'
end
where sla_deadline is null;

create index if not exists incident_reports_sla_deadline_idx
  on public.incident_reports (sla_deadline)
  where status not in ('Closed'::public.ir_status, 'NoAction'::public.ir_status);

create index if not exists tickets_sla_deadline_idx
  on public.tickets (sla_deadline)
  where status not in ('Resolved'::public.ticket_status, 'Closed'::public.ticket_status);

create or replace function public.follow_up_incident_report(p_incident_report_id uuid)
returns public.incident_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := public.current_hris_user_id();
  v_actor_name text;
  v_actor_email text;
  v_report public.incident_reports%rowtype;
  v_target_id uuid;
  v_case_label text;
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required to follow up an incident report.';
  end if;

  select * into v_report
  from public.incident_reports
  where id = p_incident_report_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'The incident report could not be found.';
  end if;

  if v_report.reported_by is distinct from v_actor_id
     and not public.has_feature_permission('IncidentReports', 'manage') then
    raise exception using errcode = '42501', message = 'Only the requester or an authorized case manager can follow up this incident report.';
  end if;

  if v_report.status::text in ('Closed', 'NoAction') then
    raise exception using errcode = '22023', message = 'Closed incident reports cannot be followed up.';
  end if;

  if v_report.last_follow_up_at is not null
     and v_report.last_follow_up_at > now() - interval '12 hours' then
    raise exception using errcode = '22023', message = 'A follow-up was already sent recently. Please wait 12 hours before sending another reminder.';
  end if;

  select full_name, email into v_actor_name, v_actor_email
  from public.hris_users where id = v_actor_id;
  v_case_label := case when v_report.case_number is not null
    then 'TNGIR-' || lpad(v_report.case_number::text, 5, '0')
    else v_report.id::text end;

  update public.incident_reports
  set follow_up_count = follow_up_count + 1,
      last_follow_up_at = now(),
      follow_up_history = coalesce(follow_up_history, '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object(
          'sentAt', now(),
          'sentById', v_actor_id,
          'sentByName', coalesce(v_actor_name, 'Employee')
        )
      ),
      updated_at = now()
  where id = p_incident_report_id
  returning * into v_report;

  if v_report.assigned_to_id is not null then
    insert into public.notifications(user_id, type, title, message, link, related_entity_id)
    values (
      v_report.assigned_to_id::text,
      'INCIDENT_FOLLOW_UP',
      'Incident report follow-up',
      format('%s followed up on %s. Please review the outstanding case.', coalesce(v_actor_name, 'The requester'), v_case_label),
      '/feedback/cases?action=view_case&caseId=' || v_report.id::text,
      v_report.id::text
    );
  else
    for v_target_id in
      select distinct ur.user_id
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id and r.is_active
      join public.hris_users u on u.id = ur.user_id
      where ur.is_active
        and ur.role_id in ('HR Staff', 'HR Manager', 'Board of Director')
        and lower(coalesce(u.status, 'active')) = 'active'
        and ur.user_id <> v_actor_id
    loop
      insert into public.notifications(user_id, type, title, message, link, related_entity_id)
      values (
        v_target_id::text,
        'INCIDENT_FOLLOW_UP',
        'Unassigned incident report follow-up',
        format('%s followed up on unassigned case %s.', coalesce(v_actor_name, 'The requester'), v_case_label),
        '/feedback/cases?action=view_case&caseId=' || v_report.id::text,
        v_report.id::text
      );
    end loop;
  end if;

  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  values (
    v_actor_id::text,
    v_actor_email,
    'UPDATE',
    'IncidentReport',
    v_report.id::text,
    format('Sent follow-up #%s for %s.', v_report.follow_up_count, v_case_label)
  );

  return v_report;
end;
$$;

revoke all on function public.follow_up_incident_report(uuid) from public, anon;
grant execute on function public.follow_up_incident_report(uuid) to authenticated;

create or replace function public.follow_up_ticket(p_ticket_id uuid)
returns public.tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := public.current_hris_user_id();
  v_actor_name text;
  v_actor_email text;
  v_ticket public.tickets%rowtype;
  v_target_id uuid;
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required to follow up a ticket.';
  end if;

  select * into v_ticket
  from public.tickets
  where id = p_ticket_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'The ticket could not be found.';
  end if;

  if v_ticket.requester_id is distinct from v_actor_id
     and not public.has_feature_permission('Helpdesk', 'manage') then
    raise exception using errcode = '42501', message = 'Only the requester or an authorized helpdesk user can follow up this ticket.';
  end if;

  if v_ticket.status::text in ('Resolved', 'Closed') then
    raise exception using errcode = '22023', message = 'Resolved or closed tickets cannot be followed up.';
  end if;

  if v_ticket.last_follow_up_at is not null
     and v_ticket.last_follow_up_at > now() - interval '12 hours' then
    raise exception using errcode = '22023', message = 'A follow-up was already sent recently. Please wait 12 hours before sending another reminder.';
  end if;

  select full_name, email into v_actor_name, v_actor_email
  from public.hris_users where id = v_actor_id;

  update public.tickets
  set follow_up_count = follow_up_count + 1,
      last_follow_up_at = now(),
      follow_up_history = coalesce(follow_up_history, '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object(
          'sentAt', now(),
          'sentById', v_actor_id,
          'sentByName', coalesce(v_actor_name, 'Employee')
        )
      )
  where id = p_ticket_id
  returning * into v_ticket;

  if v_ticket.assigned_to_id is not null then
    insert into public.notifications(user_id, type, title, message, link, related_entity_id)
    values (
      v_ticket.assigned_to_id::text,
      'TICKET_FOLLOW_UP',
      'Helpdesk ticket follow-up',
      format('%s followed up on ticket %s. Please review the outstanding request.', coalesce(v_actor_name, 'The requester'), v_ticket.id),
      '/helpdesk/tickets?ticketId=' || v_ticket.id::text,
      v_ticket.id::text
    );
  else
    for v_target_id in
      select distinct ur.user_id
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id and r.is_active
      join public.hris_users u on u.id = ur.user_id
      where ur.is_active
        and ur.role_id in ('IT', 'HR Staff', 'HR Manager', 'Admin')
        and lower(coalesce(u.status, 'active')) = 'active'
        and ur.user_id <> v_actor_id
    loop
      insert into public.notifications(user_id, type, title, message, link, related_entity_id)
      values (
        v_target_id::text,
        'TICKET_FOLLOW_UP',
        'Unassigned helpdesk ticket follow-up',
        format('%s followed up on unassigned ticket %s.', coalesce(v_actor_name, 'The requester'), v_ticket.id),
        '/helpdesk/tickets?ticketId=' || v_ticket.id::text,
        v_ticket.id::text
      );
    end loop;
  end if;

  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  values (
    v_actor_id::text,
    v_actor_email,
    'UPDATE',
    'Ticket',
    v_ticket.id::text,
    format('Sent ticket follow-up #%s.', v_ticket.follow_up_count)
  );

  return v_ticket;
end;
$$;

revoke all on function public.follow_up_ticket(uuid) from public, anon;
grant execute on function public.follow_up_ticket(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Benefits: every employee can view the catalog and submit their own request.
-- Administrative tabs remain protected by the existing role checks and RLS.
-- ---------------------------------------------------------------------------

insert into public.role_permissions(role_id, resource_id, permissions, updated_at)
values ('Employee', 'Benefits', array['view', 'create', 'submit']::text[], now())
on conflict (role_id, resource_id) do update
set permissions = array(
      select distinct permission
      from unnest(public.role_permissions.permissions || excluded.permissions) permission
      order by permission
    ),
    updated_at = now();

insert into public.role_workflow_permissions(role_id, workflow_key, actions, updated_at)
values ('Employee', 'Benefits', array['submit', 'cancel']::text[], now())
on conflict (role_id, workflow_key) do update
set actions = array(
      select distinct action
      from unnest(public.role_workflow_permissions.actions || excluded.actions) action
      order by action
    ),
    updated_at = now();

-- ---------------------------------------------------------------------------
-- Employee Correspondence attachments
-- ---------------------------------------------------------------------------

alter table public.envelopes
  add column if not exists attachments jsonb not null default '[]'::jsonb;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'employee_correspondence_attachments',
  'employee_correspondence_attachments',
  false,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists correspondence_attachments_insert on storage.objects;
drop policy if exists correspondence_attachments_select on storage.objects;
drop policy if exists correspondence_attachments_delete on storage.objects;

create policy correspondence_attachments_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'employee_correspondence_attachments'
  and (storage.foldername(name))[1] = public.current_hris_user_id()::text
  and (
    public.has_feature_permission('ContractsSigning', 'create')
    or public.has_feature_permission('ContractsSigning', 'manage')
  )
);

create policy correspondence_attachments_select
on storage.objects for select to authenticated
using (
  bucket_id = 'employee_correspondence_attachments'
  and exists (
    select 1
    from public.envelopes envelope
    cross join lateral jsonb_array_elements(coalesce(envelope.attachments, '[]'::jsonb)) attachment
    where attachment ->> 'path' = storage.objects.name
      and (
        envelope.employee_id = public.current_hris_user_id()
        or envelope.created_by_user_id = public.current_hris_user_id()
        or exists (
          select 1
          from jsonb_array_elements(coalesce(envelope.routing_steps, '[]'::jsonb)) routing_step
          where routing_step ->> 'userId' = public.current_hris_user_id()::text
        )
        or (
          public.has_feature_permission('ContractsSigning', 'view')
          and public.can_access_hris_user(envelope.employee_id)
        )
      )
  )
);

create policy correspondence_attachments_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'employee_correspondence_attachments'
  and (storage.foldername(name))[1] = public.current_hris_user_id()::text
  and public.has_feature_permission('ContractsSigning', 'manage')
);

-- ---------------------------------------------------------------------------
-- Announcement recipient delivery/read/acknowledgement tracking
-- ---------------------------------------------------------------------------

create table if not exists public.announcement_recipients (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null references public.hris_users(id) on delete cascade,
  notified_at timestamptz,
  read_at timestamptz,
  acknowledged_at timestamptz,
  reminder_count integer not null default 0,
  last_reminder_at timestamptz,
  created_at timestamptz not null default now(),
  unique (announcement_id, user_id)
);

create index if not exists announcement_recipients_announcement_idx
  on public.announcement_recipients (announcement_id);
create index if not exists announcement_recipients_user_idx
  on public.announcement_recipients (user_id);
create index if not exists announcement_recipients_outstanding_idx
  on public.announcement_recipients (announcement_id, read_at, acknowledged_at);

alter table public.announcement_recipients enable row level security;

drop policy if exists announcement_recipients_scoped_select on public.announcement_recipients;
create policy announcement_recipients_scoped_select
on public.announcement_recipients for select to authenticated
using (
  user_id = public.current_hris_user_id()
  or public.has_feature_permission('Announcements', 'manage')
);

revoke all on table public.announcement_recipients from anon, authenticated;
grant select on table public.announcement_recipients to authenticated;

create schema if not exists private;

create or replace function private.sync_announcement_recipients()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  with eligible as (
    select distinct u.id
    from public.hris_users u
    left join public.user_roles ur on ur.user_id = u.id and ur.is_active
    where lower(coalesce(u.status, '')) = 'active'
      and (new.business_unit_id is null or u.business_unit_id = new.business_unit_id)
      and (
        lower(new.target_group) = 'all'
        or (lower(new.target_group) = 'management' and coalesce(ur.role_id, u.role) in (
          'Board of Director', 'GeneralManager', 'Business Unit Manager', 'Manager', 'Operations Director', 'HR Manager'
        ))
        or (lower(new.target_group) = 'hr' and (
          coalesce(ur.role_id, u.role) in ('HR Staff', 'HR Manager')
          or lower(coalesce(u.department, '')) like '%human resource%'
          or lower(coalesce(u.department, '')) = 'hr'
        ))
        or (lower(new.target_group) = 'operations' and (
          coalesce(ur.role_id, u.role) in ('Operations Director', 'Business Unit Manager', 'Manager')
          or lower(coalesce(u.department, '')) like '%operation%'
        ))
        or (lower(new.target_group) = 'finance' and (
          coalesce(ur.role_id, u.role) = 'Finance Staff'
          or lower(coalesce(u.department, '')) like '%finance%'
        ))
        or lower(coalesce(u.department, '')) = lower(new.target_group)
      )
  ), inserted as (
    insert into public.announcement_recipients(announcement_id, user_id, notified_at)
    select new.id, eligible.id, now()
    from eligible
    on conflict (announcement_id, user_id) do nothing
    returning user_id
  )
  insert into public.notifications(user_id, type, title, message, link, related_entity_id)
  select
    inserted.user_id::text,
    'ANNOUNCEMENT_PUBLISHED',
    case when new.type::text = 'Policy' then 'New policy announcement' else 'New announcement' end,
    new.title,
    '/helpdesk/announcements?announcementId=' || new.id::text,
    new.id::text
  from inserted;

  return new;
end;
$$;

revoke all on function private.sync_announcement_recipients() from public, anon, authenticated;

drop trigger if exists announcements_sync_recipients on public.announcements;
create trigger announcements_sync_recipients
after insert or update of target_group, business_unit_id
on public.announcements
for each row execute function private.sync_announcement_recipients();

-- Preserve old announcement history without generating retroactive alerts.
insert into public.announcement_recipients(
  announcement_id, user_id, notified_at, read_at, acknowledged_at
)
select
  announcement.id,
  employee.id,
  announcement.created_at,
  case when employee.id = any(announcement.acknowledgement_user_ids) then announcement.updated_at end,
  case when employee.id = any(announcement.acknowledgement_user_ids) then announcement.updated_at end
from public.announcements announcement
join public.hris_users employee
  on lower(coalesce(employee.status, '')) = 'active'
 and (announcement.business_unit_id is null or employee.business_unit_id = announcement.business_unit_id)
where announcement.target_group = 'All'
   or lower(coalesce(employee.department, '')) = lower(announcement.target_group)
on conflict (announcement_id, user_id) do nothing;

create or replace function public.mark_announcement_read(p_announcement_id uuid)
returns public.announcement_recipients
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := public.current_hris_user_id();
  v_recipient public.announcement_recipients%rowtype;
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  update public.announcement_recipients
  set read_at = coalesce(read_at, now())
  where announcement_id = p_announcement_id and user_id = v_actor_id
  returning * into v_recipient;

  if not found then
    raise exception using errcode = '42501', message = 'This announcement is not assigned to your account.';
  end if;

  return v_recipient;
end;
$$;

revoke all on function public.mark_announcement_read(uuid) from public, anon;
grant execute on function public.mark_announcement_read(uuid) to authenticated;

create or replace function public.acknowledge_announcement(p_announcement_id uuid)
returns public.announcement_recipients
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := public.current_hris_user_id();
  v_actor_email text;
  v_recipient public.announcement_recipients%rowtype;
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  update public.announcement_recipients
  set read_at = coalesce(read_at, now()),
      acknowledged_at = coalesce(acknowledged_at, now())
  where announcement_id = p_announcement_id and user_id = v_actor_id
  returning * into v_recipient;

  if not found then
    raise exception using errcode = '42501', message = 'This announcement is not assigned to your account.';
  end if;

  update public.announcements
  set acknowledgement_user_ids = array(
        select distinct acknowledgement_id
        from unnest(acknowledgement_user_ids || array[v_actor_id]) acknowledgement_id
      ),
      updated_at = now()
  where id = p_announcement_id;

  select email into v_actor_email from public.hris_users where id = v_actor_id;
  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  values (v_actor_id::text, v_actor_email, 'UPDATE', 'Announcement', p_announcement_id::text, 'Read and acknowledged announcement.');

  return v_recipient;
end;
$$;

revoke all on function public.acknowledge_announcement(uuid) from public, anon;
grant execute on function public.acknowledge_announcement(uuid) to authenticated;

create or replace function public.send_announcement_reminders(
  p_announcement_id uuid,
  p_mode text default 'outstanding',
  p_user_ids uuid[] default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := public.current_hris_user_id();
  v_actor_email text;
  v_title text;
  v_type text;
  v_count integer := 0;
begin
  if v_actor_id is null or not public.has_feature_permission('Announcements', 'manage') then
    raise exception using errcode = '42501', message = 'You do not have permission to send announcement reminders.';
  end if;

  select title, type::text into v_title, v_type
  from public.announcements where id = p_announcement_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'The announcement could not be found.';
  end if;

  with targets as (
    select recipient.id, recipient.user_id
    from public.announcement_recipients recipient
    where recipient.announcement_id = p_announcement_id
      and (
        (p_mode = 'unread' and recipient.read_at is null)
        or (p_mode = 'unacknowledged' and recipient.acknowledged_at is null)
        or (p_mode = 'outstanding' and (
          (v_type = 'Policy' and recipient.acknowledged_at is null)
          or (v_type <> 'Policy' and recipient.read_at is null)
        ))
        or (p_mode = 'selected' and recipient.user_id = any(coalesce(p_user_ids, '{}'::uuid[])))
      )
  ), updated as (
    update public.announcement_recipients recipient
    set reminder_count = recipient.reminder_count + 1,
        last_reminder_at = now()
    from targets
    where recipient.id = targets.id
    returning recipient.user_id
  ), notified as (
    insert into public.notifications(user_id, type, title, message, link, related_entity_id)
    select
      updated.user_id::text,
      'ANNOUNCEMENT_REMINDER',
      'Announcement reminder',
      v_title,
      '/helpdesk/announcements?announcementId=' || p_announcement_id::text,
      p_announcement_id::text
    from updated
    returning 1
  )
  select count(*) into v_count from notified;

  select email into v_actor_email from public.hris_users where id = v_actor_id;
  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  values (
    v_actor_id::text,
    v_actor_email,
    'UPDATE',
    'Announcement',
    p_announcement_id::text,
    format('Sent %s reminder(s) using mode %s.', v_count, p_mode)
  );

  return v_count;
end;
$$;

revoke all on function public.send_announcement_reminders(uuid, text, uuid[]) from public, anon;
grant execute on function public.send_announcement_reminders(uuid, text, uuid[]) to authenticated;
