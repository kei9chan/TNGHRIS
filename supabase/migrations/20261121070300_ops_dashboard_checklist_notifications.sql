create function public.ops_my_dashboard_tasks() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.due_at nulls last,x.id),'[]') from (
    select distinct on (coalesce(a.checklist_run_id,a.id)) a.id,a.due_at,a.status,
      v.content->>'title' title,b.name unit,t.kind
    from public.ops_assignments a
    join public.ops_template_versions v on v.id=a.template_version_id
    join public.ops_templates t on t.id=v.template_id
    join public.business_units b on b.id=a.business_unit_id
    left join public.ops_checklist_runs r on r.id=a.checklist_run_id
    where a.assignee_id=operations_private.actor() and a.status in ('Assigned','In Progress')
      and r.submitted_at is null and operations_private.can_view_assignment(a.id)
    order by coalesce(a.checklist_run_id,a.id),a.due_at,a.id
  ) x
$$;
revoke all on function public.ops_my_dashboard_tasks() from public,anon;
grant execute on function public.ops_my_dashboard_tasks() to authenticated;

-- Count shared runs once; include scheduled rounds which never had an assignee.
create function operations_private.checklist_reporting_rows(lo timestamptz,hi timestamptz)
returns table(work_id uuid,unit_id uuid,title text,due_at timestamptz,deadline timestamptz,submitted timestamptz,unassigned boolean)
language sql stable set search_path='' as $$
  select coalesce(a.checklist_run_id,a.id),a.business_unit_id,v.content->>'title',a.due_at,
         a.due_at+make_interval(mins=>coalesce((o.config->>'grace_minutes')::int,0)),
         coalesce(r.submitted_at,min(a.completed_at) filter(where a.status='Completed')),false
  from public.ops_assignments a join public.ops_template_versions v on v.id=a.template_version_id
  join public.ops_templates t on t.id=v.template_id and t.kind='checklist'
  left join public.ops_checklist_runs r on r.id=a.checklist_run_id
  left join public.ops_occurrences o on o.id=a.occurrence_id
  where a.status<>'Cancelled' and a.due_at>=lo and a.due_at<hi and coalesce(o.status,'Open')<>'Cancelled'
  group by coalesce(a.checklist_run_id,a.id),a.business_unit_id,v.content->>'title',a.due_at,o.config->>'grace_minutes',r.submitted_at
  union all
  select o.id,o.business_unit_id,o.title,o.due_at,o.due_at+make_interval(mins=>coalesce((o.config->>'grace_minutes')::int,0)),null::timestamptz,true
  from public.ops_occurrences o join public.ops_template_versions v on v.id=o.template_version_id
  join public.ops_templates t on t.id=v.template_id and t.kind='checklist'
  where o.status='Open' and o.due_at>=lo and o.due_at<hi
    and not exists(select 1 from public.ops_assignments a where a.occurrence_id=o.id)
$$;
revoke all on function operations_private.checklist_reporting_rows(timestamptz,timestamptz) from public,anon,authenticated;

create table operations_private.checklist_mail (
  id uuid primary key default gen_random_uuid(), event_key text not null, recipient uuid not null references public.hris_users(id),
  unit_id uuid references public.business_units(id), subject text not null, message text not null,
  retry_at timestamptz default now() not null, lease uuid, sent_at timestamptz, provider text,
  unique(event_key,recipient)
);
revoke all on operations_private.checklist_mail from public,anon,authenticated;
create function public.ops_queue_checklist_mail() returns void language plpgsql security definer set search_path='' as $$
declare local_now timestamp:=now() at time zone 'Asia/Manila'; week_end date:=date_trunc('week',local_now)::date;
begin
  insert into operations_private.checklist_mail(event_key,recipient,unit_id,subject,message)
  select 'miss:'||w.work_id,h.id,b.id,'Missed checklist · '||b.name,
    w.title||E'\nDue '||to_char(w.due_at at time zone 'Asia/Manila','Mon DD, YYYY at HH12:MI AM')||' Manila time.'||
    case when w.unassigned then E'\nNo staff assignment was generated. Check schedule coverage.'
         when w.submitted is null then E'\nThe checklist was still open after its deadline. Please follow up with the team.'
         else E'\nThe team submitted it after the deadline.' end
  from operations_private.checklist_reporting_rows(greatest('2026-11-21 00:00+08'::timestamptz,now()-interval '7 days'),now()) w
  join public.business_units b on b.id=w.unit_id
  join public.hris_users h on lower(h.status)='active' and h.email like '%@%'
    and operations_private.role_unit(h.id,b.id,array['Business Unit Manager'])
  where w.deadline<=now() and (w.submitted is null or w.submitted>w.deadline)
  on conflict(event_key,recipient) do nothing;

  if local_now < week_end + time '08:00' or week_end < date '2026-11-23' then return; end if;
  with weekly as (
    select b.id,b.name,count(w.work_id) expected,
      count(w.work_id) filter(where w.submitted<=w.deadline) on_time,
      count(w.work_id) filter(where w.submitted>w.deadline) late,
      count(w.work_id) filter(where w.submitted is null and not w.unassigned) missing,
      count(w.work_id) filter(where w.unassigned) uncovered
    from public.business_units b left join operations_private.checklist_reporting_rows(
      (week_end-7)::timestamp at time zone 'Asia/Manila',week_end::timestamp at time zone 'Asia/Manila') w on w.unit_id=b.id
    group by b.id,b.name
  )
  insert into operations_private.checklist_mail(event_key,recipient,subject,message)
  select 'week:'||week_end,h.id,'Weekly checklist report · '||(week_end-7)||' to '||(week_end-1),
    string_agg(w.name||' — '||w.expected||' due, '||w.on_time||' on time, '||w.late||' late, '||w.missing||' still open, '||w.uncovered||' unassigned.',E'\n' order by w.name)
  from weekly w join public.hris_users h on lower(h.status)='active' and h.email like '%@%'
    and operations_private.role_unit(h.id,w.id,array['Board of Director'])
  group by h.id on conflict(event_key,recipient) do nothing;
end $$;
create function public.ops_claim_checklist_mail() returns jsonb language plpgsql security definer set search_path='' as $$
declare delivery operations_private.checklist_mail; address text;
begin
  select q.* into delivery from operations_private.checklist_mail q join public.hris_users h on h.id=q.recipient
  where q.sent_at is null and q.retry_at<=now() and lower(h.status)='active' and h.email like '%@%'
    and (case when q.unit_id is not null then operations_private.role_unit(h.id,q.unit_id,array['Business Unit Manager'])
      else operations_private.role_unit(h.id,null,array['Board of Director']) end)
  order by q.retry_at,q.id limit 1 for update of q skip locked;
  if not found then return null; end if;
  select email into address from public.hris_users where id=delivery.recipient;
  update operations_private.checklist_mail set lease=gen_random_uuid(),retry_at=now()+interval '15 minutes'
  where id=delivery.id returning * into delivery;
  return jsonb_build_object('id',delivery.id,'token',delivery.lease,'email',address,'subject',delivery.subject,'message',delivery.message,'unit',delivery.unit_id);
end $$;
create function public.ops_finish_checklist_mail(p_id uuid,p_token uuid,p_provider text) returns void
language sql security definer set search_path='' as $$
  update operations_private.checklist_mail set sent_at=now(),provider=p_provider,lease=null
  where id=p_id and lease=p_token and p_provider is not null and sent_at is null
$$;
revoke all on function public.ops_queue_checklist_mail(), public.ops_claim_checklist_mail(), public.ops_finish_checklist_mail(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.ops_queue_checklist_mail(), public.ops_claim_checklist_mail(), public.ops_finish_checklist_mail(uuid,uuid,text) to service_role;
