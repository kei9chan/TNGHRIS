-- Additive internal discussion alerts. Existing case RLS and approval rules remain unchanged.
create or replace function private.notify_case_discussion_message()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id(); msg jsonb; recipient record; target_nte uuid;
begin
 if actor is null or new.chat_thread is not distinct from old.chat_thread then return new; end if;
 if actor=new.reported_by or actor=any(coalesce(new.involved_employee_ids,'{}'::uuid[])) then return new; end if;
 for msg in select value from jsonb_array_elements(coalesce(new.chat_thread,'[]'::jsonb)) m
 where nullif(value->>'id','') is not null and value->>'userId'=actor::text
 and length(trim(coalesce(value->>'text','')))>0
 and not exists(select 1 from jsonb_array_elements(coalesce(old.chat_thread,'[]'::jsonb)) prior where prior->>'id'=m.value->>'id')
 loop
  for recipient in
   select distinct u.id from public.hris_users u
   where u.status='Active' and u.auth_user_id is not null and u.id<>actor
   and u.id is distinct from new.reported_by
   and not(u.id=any(coalesce(new.involved_employee_ids,'{}'::uuid[])))
   and (
    u.id=new.assigned_to_id
    or exists(select 1 from jsonb_array_elements(coalesce(old.chat_thread,'[]'::jsonb)) p where p->>'userId'=u.id::text)
    or exists(select 1 from public.ntes n where n.incident_report_id=new.id and (n.issued_by_user_id=u.id or exists(select 1 from public.nte_approvals a where a.nte_id=n.id and a.approver_user_id=u.id)))
   )
   -- Match existing incident HR/assigned-manager read policies or explicit NTE access.
   and (
    exists(select 1 from private.effective_role_ids(u.id) r where r.role_id in ('Admin','HR Manager','HR Staff'))
    or (u.id=new.assigned_to_id and u.role='Manager')
    or exists(select 1 from public.ntes n where n.incident_report_id=new.id and (n.issued_by_user_id=u.id or new.assigned_to_id=u.id or exists(select 1 from public.nte_approvals a where a.nte_id=n.id and a.approver_user_id=u.id)))
   )
  loop
   select n.id into target_nte from public.ntes n where n.incident_report_id=new.id
    and (n.issued_by_user_id=recipient.id or new.assigned_to_id=recipient.id or exists(select 1 from public.nte_approvals a where a.nte_id=n.id and a.approver_user_id=recipient.id)) order by n.created_at desc limit 1;
   insert into public.notifications(user_id,type,title,message,link,related_entity_id,dedupe_key)
   values(recipient.id::text,'CASE_DISCUSSION_MESSAGE','New internal case message','A new message was posted in an internal case discussion you participate in.',
    case when target_nte is not null then '/feedback/nte/'||target_nte else '/feedback/cases?caseId='||new.id end,
    new.id::text,'case-discussion:'||new.id||':'||(msg->>'id')||':'||recipient.id)
   on conflict (user_id,dedupe_key) do nothing;
  end loop;
 end loop;
 return new;
end $$;
revoke all on function private.notify_case_discussion_message() from public,anon,authenticated;
drop trigger if exists notify_case_discussion_message on public.incident_reports;
create trigger notify_case_discussion_message after update of chat_thread on public.incident_reports
for each row execute function private.notify_case_discussion_message();
