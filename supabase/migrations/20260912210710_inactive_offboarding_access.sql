set local lock_timeout='5s';
-- Offboarding uses a revocable, checklist-scoped capability, NOT an unbanned
-- Supabase login. Inactive employees never receive a regular authenticated JWT.
create schema offboarding_access;
revoke all on schema offboarding_access from public,anon,authenticated;
create table offboarding_access.grants(
 checklist_id uuid primary key references public.onboarding_checklists(id),
 employee_id uuid not null references public.hris_users(id),
 token_hash text not null unique,expires_at timestamptz not null,
 granted_by uuid not null references public.hris_users(id),granted_at timestamptz not null default clock_timestamp(),
 revoked_at timestamptz,reason text not null
);
alter table offboarding_access.grants enable row level security;
create index on offboarding_access.grants(employee_id);
create function offboarding_access.hr(p_employee uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.current_hris_user_id() is not null and
 (public.has_active_role('Admin') or public.has_active_role('HR Manager') or public.has_active_role('HR Staff'))
 and public.can_access_hris_user(p_employee)
$$;
create function offboarding_access.audit(p_employee uuid,p_action text,p_details jsonb) returns void
language sql security definer set search_path='' as $$
 insert into public.audit_logs(user_id,action,entity,entity_id,details)
 values(coalesce(public.current_hris_user_id()::text,case when p_action in('SUBMIT','UPLOAD') then p_employee::text else 'system' end),p_action,'Offboarding Access',p_employee::text,
 (p_details||jsonb_build_object('actorType',case when public.current_hris_user_id() is not null then 'HR/Admin' when p_action in('SUBMIT','UPLOAD') then 'Offboarding-only employee' else 'System' end))::text)
$$;

create function public.manage_offboarding_access(p_checklist uuid,p_expiry timestamptz,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.onboarding_checklists;prior offboarding_access.grants;token text;
begin
 select * into c from public.onboarding_checklists where id=p_checklist for update;
 if c.id is null or not offboarding_access.hr(c.employee_id) then raise exception 'Authorized HR/Admin scope required' using errcode='42501';end if;
 if length(trim(coalesce(p_reason,'')))<5 then raise exception 'Enter a reason of at least 5 characters';end if;
 select * into prior from offboarding_access.grants where checklist_id=c.id;
 if p_expiry is null then
 update offboarding_access.grants set revoked_at=coalesce(revoked_at,clock_timestamp()),reason=trim(p_reason) where checklist_id=c.id;
 if prior.checklist_id is not null and prior.revoked_at is null then perform offboarding_access.audit(c.employee_id,'REVOKE',jsonb_build_object('checklist',c.id,'previous','Offboarding access active','new','Revoked','reason',p_reason));end if;
 return jsonb_build_object('status','Revoked');end if;
 if p_expiry<=clock_timestamp() or p_expiry>clock_timestamp()+interval '30 days' then raise exception 'Choose an expiration within the next 30 days';end if;
 if not exists(select 1 from public.hris_users where id=c.employee_id and lower(status)='inactive') or c.status::text in('Completed','Approved')
 or not exists(select 1 from public.onboarding_checklist_templates t where t.id=c.template_id and t.template_type::text='Offboarding')
 or exists(select 1 from public.resignations where offboarding_checklist_id=c.id and status='Completed') then raise exception 'An inactive employee with an unfinished offboarding checklist is required';end if;
 token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into offboarding_access.grants(checklist_id,employee_id,token_hash,expires_at,granted_by,reason)
 values(c.id,c.employee_id,encode(extensions.digest(token,'sha256'),'hex'),p_expiry,public.current_hris_user_id(),trim(p_reason))
 on conflict(checklist_id) do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at,granted_by=excluded.granted_by,granted_at=clock_timestamp(),revoked_at=null,reason=excluded.reason;
 perform offboarding_access.audit(c.employee_id,'GRANT',jsonb_build_object('checklist',c.id,'previousExpiry',prior.expires_at,'newExpiry',p_expiry,'reason',p_reason));
 return jsonb_build_object('status','Offboarding access active','token',token,'expiresAt',p_expiry);
end $$;

create function public.get_offboarding_access_admin() returns jsonb
language plpgsql stable security definer set search_path='' as $$begin
 if public.current_hris_user_id() is null or not (public.has_active_role('Admin') or public.has_active_role('HR Manager') or public.has_active_role('HR Staff')) then raise exception 'HR/Admin access required' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'employee',h.full_name,'employmentStatus',h.employment_status,'accountStatus',h.status,'checklistStatus',c.status,'expiresAt',g.expires_at,
 'accessStatus',case when g.revoked_at is not null then 'Revoked' when c.status::text in('Completed','Approved') or exists(select 1 from public.resignations r where r.offboarding_checklist_id=c.id and r.status='Completed') then 'Completed' when g.expires_at<=clock_timestamp() then 'Expired' when g.checklist_id is not null then 'Offboarding access active' else 'Not granted' end) order by h.full_name),'[]')
 from public.onboarding_checklists c join public.onboarding_checklist_templates t on t.id=c.template_id join public.hris_users h on h.id=c.employee_id
 left join offboarding_access.grants g on g.checklist_id=c.id where t.template_type::text='Offboarding' and lower(h.status)='inactive' and offboarding_access.hr(h.id));
end $$;

create function public.offboarding_portal(p_token text,p_task text default null,p_response text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g offboarding_access.grants;c public.onboarding_checklists;task jsonb;changed jsonb;visible jsonb;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Offboarding access is unavailable or has expired' using errcode='42501';end if;
 select * into g from offboarding_access.grants where token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
 if g.checklist_id is null or g.revoked_at is not null or g.expires_at<=clock_timestamp() or not exists(select 1 from public.hris_users where id=g.employee_id and lower(status)='inactive') then raise exception 'Offboarding access is unavailable or has expired' using errcode='42501';end if;
 select * into c from public.onboarding_checklists where id=g.checklist_id and employee_id=g.employee_id for update;
 select * into g from offboarding_access.grants where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
 if g.checklist_id is null or g.revoked_at is not null or g.expires_at<=clock_timestamp() then raise exception 'Offboarding access is unavailable or has expired' using errcode='42501';end if;
 if c.id is null or c.status::text in('Completed','Approved') or exists(select 1 from public.resignations r where r.offboarding_checklist_id=c.id and r.status='Completed') then raise exception 'Offboarding is complete; access has ended' using errcode='42501';end if;
 if p_task is not null then
 select value into task from jsonb_array_elements(c.tasks) where value->>'id'=p_task and value->>'ownerUserId'=g.employee_id::text;
 if task is null then raise exception 'Only your assigned offboarding tasks may be submitted' using errcode='42501';end if;
 if task->>'status'='Completed' then raise exception 'This task is already complete';end if;
 if length(trim(coalesce(p_response,''))) not between 1 and 10000 then raise exception 'Enter a response of up to 10,000 characters';end if;
 changed:=task||jsonb_build_object('submissionValue',p_response,'isAcknowledged',true,'submittedAt',clock_timestamp(),'status','Pending Approval');
 -- Employee submissions always go to existing HR clearance review; no self approval.
 update public.onboarding_checklists set tasks=(select jsonb_agg(case when value->>'id'=p_task then changed else value end order by ord) from jsonb_array_elements(c.tasks) with ordinality x(value,ord)),updated_at=clock_timestamp() where id=c.id returning * into c;
 perform offboarding_access.audit(g.employee_id,'SUBMIT',jsonb_build_object('checklist',c.id,'task',p_task,'previousStatus',task->>'status','newStatus','Pending Approval','via','Offboarding-only access'));
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',t->>'id','name',t->>'name','description',t->>'description','dueDate',t->>'dueDate','taskType',t->>'taskType','status',t->>'status','readContent',t->>'readContent','assetDescription',t->>'assetDescription','submissionValue',t->>'submissionValue','canSubmit',t->>'ownerUserId'=g.employee_id::text and t->>'status'<>'Completed') order by ord),'[]') into visible from jsonb_array_elements(c.tasks) with ordinality x(t,ord)
 where t->>'ownerUserId'=g.employee_id::text;
 return jsonb_build_object('employee',(select full_name from public.hris_users where id=g.employee_id),'status',c.status,'expiresAt',g.expires_at,'tasks',visible);
end $$;

-- Universal lifecycle guard covers profile edits as well as the existing end-date RPC.
create function offboarding_access.inactive_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id();previous_ban timestamptz;
begin
 if lower(coalesce(new.employment_status,''))='inactive' then new.status:='Inactive';end if;
 if lower(new.status)='inactive' and lower(old.status) is distinct from 'inactive' then
 if auth.uid() is not null and (actor=new.id or not offboarding_access.hr(new.id)) then raise exception 'Authorized HR/Admin must deactivate the employee' using errcode='42501';end if;
 if exists(select 1 from public.user_roles where user_id=new.id and role_id='Admin' and is_active) and not exists(select 1 from public.user_roles r join public.hris_users h on h.id=r.user_id where r.role_id='Admin' and r.is_active and lower(h.status)='active' and h.id<>new.id) then raise exception 'Cannot deactivate the final active Admin';end if;
 if length(trim(coalesce(new.account_lifecycle_reason,'')))<5 then new.account_lifecycle_reason:='Employment or account status changed to Inactive by authorized HR/Admin';end if;
 select banned_until into previous_ban from auth.users where id=new.auth_user_id for update;
 new.pre_deactivation_banned_until:=coalesce(new.pre_deactivation_banned_until,case when previous_ban<'9999-01-01'::timestamptz then previous_ban end);
 new.account_inactivated_at:=clock_timestamp();new.account_inactivated_by:=actor;
 update auth.users set banned_until='9999-12-31 23:59:59+00',updated_at=clock_timestamp() where id=new.auth_user_id;
 update auth.refresh_tokens set revoked=true,updated_at=clock_timestamp() where user_id=new.auth_user_id::text and not revoked;
 delete from auth.sessions where user_id=new.auth_user_id;
 perform offboarding_access.audit(new.id,'DEACTIVATE',jsonb_build_object('previousStatus',old.status,'newStatus',new.status,'reason',new.account_lifecycle_reason,'actor',actor));
 end if;return new;
end $$;
create trigger inactive_access_guard before update of status,employment_status on public.hris_users for each row execute function offboarding_access.inactive_guard();

-- Revoked refresh tokens do not revoke an already issued JWT. The Data API
-- guard checks current account state on every request, including legacy RPCs.
create function public.assert_hris_account_active() returns void
language plpgsql stable security definer set search_path='' as $$begin
 if auth.uid() is not null and exists(select 1 from public.hris_users where auth_user_id=auth.uid() and lower(status)='inactive') then
 raise exception 'Your account is inactive. Please contact HR.' using errcode='42501';end if;
end $$;
revoke all on function public.assert_hris_account_active() from public;
grant execute on function public.assert_hris_account_active() to anon,authenticated,service_role;
do $$begin
 if exists(select 1 from pg_db_role_setting where setconfig::text like '%pgrst.db_pre_request=%') then raise exception 'Existing Data API request hook must be composed, not replaced';end if;
end $$;
alter role authenticator set pgrst.db_pre_request='public.assert_hris_account_active';
notify pgrst,'reload config';
create function public.hris_storage_account_active() returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.hris_users where auth_user_id=auth.uid() and lower(status)='inactive')
$$;
revoke all on function public.hris_storage_account_active() from public,anon;
grant execute on function public.hris_storage_account_active() to authenticated;
create policy inactive_hris_storage_guard on storage.objects as restrictive for all to authenticated
 using((select public.hris_storage_account_active())) with check((select public.hris_storage_account_active()));

create function offboarding_access.expire_grants() returns void language plpgsql security definer set search_path='' as $$declare g record;begin
 for g in update offboarding_access.grants entry set revoked_at=clock_timestamp(),reason=case when expires_at<=clock_timestamp() then 'Access expired' else 'Offboarding completed or employee reactivated' end
 where revoked_at is null and (expires_at<=clock_timestamp() or not exists(select 1 from public.hris_users h where h.id=entry.employee_id and lower(h.status)='inactive') or exists(select 1 from public.onboarding_checklists c where c.id=entry.checklist_id and c.status::text in('Completed','Approved')) or exists(select 1 from public.resignations r where r.offboarding_checklist_id=entry.checklist_id and r.status='Completed')) returning * loop
 perform offboarding_access.audit(g.employee_id,'AUTO_REVOKE',jsonb_build_object('checklist',g.checklist_id,'reason',g.reason));end loop;
end $$;
select cron.schedule('expire-offboarding-access','* * * * *','select offboarding_access.expire_grants()');
-- Small clearance uploads remain RPC-only and never get public object URLs.
create table offboarding_access.documents(
 id uuid primary key,checklist_id uuid not null references public.onboarding_checklists(id),
 task_id text not null,filename text not null,content bytea not null check(octet_length(content) between 1 and 1048576),
 created_at timestamptz not null default clock_timestamp()
);
alter table offboarding_access.documents enable row level security;
create index on offboarding_access.documents(checklist_id);
create function public.upload_offboarding_document(p_token text,p_task text,p_id uuid,p_filename text,p_content text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g offboarding_access.grants;doc offboarding_access.documents;content bytea;result jsonb;
begin
 -- Recheck capability, task ownership, expiry and completion for every upload.
 perform public.offboarding_portal(p_token);
 select * into g from offboarding_access.grants where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
 if p_id is null or p_filename is null or p_content is null or length(p_filename) not between 1 and 150 or p_filename !~* '\.(pdf|png|jpg|jpeg|txt)$' or length(p_content)>1398104 then raise exception 'Upload a PDF, image or text document up to 1 MB';end if;
 content:=decode(p_content,'base64');
 if octet_length(content) not between 1 and 1048576 then raise exception 'Upload a document up to 1 MB';end if;
 select * into doc from offboarding_access.documents where id=p_id;
 if doc.id is not null then
 if doc.checklist_id<>g.checklist_id or doc.task_id<>p_task or doc.content<>content then raise exception 'Upload retry does not match the original document';end if;
 return public.offboarding_portal(p_token);end if;
 result:=public.offboarding_portal(p_token,p_task,'Uploaded document: '||p_filename||' ['||p_id::text||']');
 insert into offboarding_access.documents(id,checklist_id,task_id,filename,content) values(p_id,g.checklist_id,p_task,p_filename,content);
 perform offboarding_access.audit(g.employee_id,'UPLOAD',jsonb_build_object('checklist',g.checklist_id,'task',p_task,'document',p_id,'filename',p_filename));
 return result;
end $$;
create function public.get_offboarding_documents(p_checklist uuid,p_document uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$declare employee uuid;begin
 select employee_id into employee from public.onboarding_checklists where id=p_checklist;
 if employee is null or not offboarding_access.hr(employee) then raise exception 'HR/Admin scope required' using errcode='42501';end if;
 if p_document is not null then
 perform offboarding_access.audit(employee,'DOWNLOAD',jsonb_build_object('checklist',p_checklist,'document',p_document));
 return (select jsonb_build_object('filename',filename,'content',encode(content,'base64')) from offboarding_access.documents where checklist_id=p_checklist and id=p_document);end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'filename',filename,'createdAt',created_at) order by created_at),'[]') from offboarding_access.documents where checklist_id=p_checklist);
end $$;
revoke all on all tables in schema offboarding_access from public,anon,authenticated;
revoke all on all functions in schema offboarding_access from public,anon,authenticated;
revoke all on function public.manage_offboarding_access(uuid,timestamptz,text),public.get_offboarding_access_admin(),public.offboarding_portal(text,text,text) from public,anon,authenticated;
grant execute on function public.manage_offboarding_access(uuid,timestamptz,text),public.get_offboarding_access_admin() to authenticated;
grant execute on function public.offboarding_portal(text,text,text) to anon;
revoke all on function public.upload_offboarding_document(text,text,uuid,text,text),public.get_offboarding_documents(uuid,uuid) from public,anon,authenticated;
grant execute on function public.upload_offboarding_document(text,text,uuid,text,text) to anon;
grant execute on function public.get_offboarding_documents(uuid,uuid) to authenticated;

create function public.complete_offboarding_clearance(p_resignation uuid) returns void
language plpgsql security definer set search_path='' as $$declare r public.resignations;g offboarding_access.grants;c public.onboarding_checklists;begin
 select * into r from public.resignations where id=p_resignation for update;
 if r.id is null or not offboarding_access.hr(r.employee_id) then raise exception 'Authorized HR/Admin scope required' using errcode='42501';end if;
 if r.status='Completed' then return;end if;
 select * into c from public.onboarding_checklists where id=r.offboarding_checklist_id and employee_id=r.employee_id for update;
 if c.id is null or exists(select 1 from jsonb_array_elements(c.tasks) t where t->>'status' is distinct from 'Completed') then raise exception 'Complete the assigned clearance checklist before closing offboarding';end if;
 if exists(select 1 from public.hris_users where id=r.employee_id and lower(status)='active') then
 perform public.set_employee_end_date(r.employee_id,r.last_working_day,'HR completed the offboarding clearance checklist');end if;
 update public.resignations set status='Completed',updated_at=clock_timestamp() where id=r.id;
 update public.onboarding_checklists set status='Completed',updated_at=clock_timestamp() where id=c.id;
 update offboarding_access.grants set revoked_at=coalesce(revoked_at,clock_timestamp()),reason='Offboarding completed' where checklist_id=r.offboarding_checklist_id returning * into g;
 perform offboarding_access.audit(r.employee_id,'COMPLETE',jsonb_build_object('resignation',r.id,'previousStatus',r.status,'newStatus','Completed','access','Revoked'));
end $$;
revoke all on function public.complete_offboarding_clearance(uuid) from public,anon;
grant execute on function public.complete_offboarding_clearance(uuid) to authenticated;
