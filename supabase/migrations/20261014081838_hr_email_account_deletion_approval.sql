-- Delete an obsolete HRIS sign-in only after the named BOD's approval.
-- Employee, payroll, attendance, document, and audit rows are never deleted.
create table private.email_account_deletion_routing (
 singleton boolean primary key default true check(singleton),
 requester_id uuid not null references public.hris_users(id),
 approver_id uuid not null references public.hris_users(id),
 check(requester_id<>approver_id)
);
insert into private.email_account_deletion_routing(singleton,requester_id,approver_id)
select true,h.id,b.id from public.hris_users h cross join public.hris_users b
where lower(h.email)='hrs@thenextperience.com' and lower(b.email)='kay@thenextperience.com'
and lower(h.status)='active' and lower(b.status)='active';
do $$begin if not exists(select 1 from private.email_account_deletion_routing) then raise exception 'Verified HR Manager and BOD routing accounts are required';end if;end$$;

create table private.email_account_deletion_requests (
 id uuid primary key default gen_random_uuid(),
 target_user_id uuid not null references public.hris_users(id),
 target_auth_user_id uuid not null,
 target_email text not null,target_name text not null,
 requested_by uuid not null references public.hris_users(id),
 approver_id uuid not null references public.hris_users(id),
 reason text not null check(length(btrim(reason)) between 5 and 2000),
 status text not null default 'Pending' check(status in ('Pending','Rejected','Approved','Completed')),
 execution_status text not null default 'Not started' check(execution_status in ('Not started','Executing','Failed','Completed')),
 decision_comment text,decided_at timestamptz,created_at timestamptz not null default now(),completed_at timestamptz,
 execution_token uuid,lease_until timestamptz,error_summary text,
 check(requested_by<>approver_id and target_user_id<>requested_by and target_user_id<>approver_id)
);
create unique index email_account_deletion_open_target on private.email_account_deletion_requests(target_user_id) where status in ('Pending','Approved');
create index email_account_deletion_approver_queue on private.email_account_deletion_requests(approver_id,created_at desc);
create index email_account_deletion_requester_history on private.email_account_deletion_requests(requested_by,created_at desc);
alter table private.email_account_deletion_routing enable row level security;
alter table private.email_account_deletion_requests enable row level security;
revoke all on private.email_account_deletion_routing,private.email_account_deletion_requests from public,anon,authenticated;

create function private.email_account_deletion_can_request() returns boolean language sql stable security definer set search_path='' as $$
 select public.has_active_role('HR Manager') and exists(select 1 from private.email_account_deletion_routing where requester_id=public.current_hris_user_id())
$$;
create function private.email_account_deletion_can_approve() returns boolean language sql stable security definer set search_path='' as $$
 select public.has_active_role('Board of Director') and exists(select 1 from private.email_account_deletion_routing where approver_id=public.current_hris_user_id())
$$;
create function private.email_account_deletion_protected(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.email_account_deletion_routing where p_user in(requester_id,approver_id))
 or exists(select 1 from public.hris_users where id=p_user and role in('Admin','Board of Director','HR Manager'))
 or exists(select 1 from public.user_roles where user_id=p_user and is_active and role_id in('Admin','Board of Director','HR Manager'))
$$;
create function public.get_email_account_deletion_workspace() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id();can_request boolean:=private.email_account_deletion_can_request();can_approve boolean:=private.email_account_deletion_can_approve();requests jsonb;targets jsonb;approver text;begin
 if actor is null or not(can_request or can_approve) then return jsonb_build_object('canRequest',false,'canApprove',false,'requests','[]'::jsonb,'targets','[]'::jsonb);end if;
 select u.full_name into approver from private.email_account_deletion_routing c join public.hris_users u on u.id=c.approver_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'targetId',r.target_user_id,'employeeName',r.target_name,'email',r.target_email,'reason',r.reason,'requestedBy',u.full_name,'status',r.status,'executionStatus',r.execution_status,'createdAt',r.created_at,'decisionComment',r.decision_comment,'completedAt',r.completed_at,'error',r.error_summary,'isActionable',can_approve and (r.status='Pending' or (r.status='Approved' and (r.execution_status='Failed' or r.lease_until<now())))) order by r.created_at desc),'[]') into requests
 from private.email_account_deletion_requests r join public.hris_users u on u.id=r.requested_by where actor in(r.requested_by,r.approver_id);
 if can_request then
  select coalesce(jsonb_agg(jsonb_build_object('id',u.id)),'[]') into targets from public.hris_users u
  where u.auth_user_id is not null and public.can_access_hris_user(u.id) and not private.email_account_deletion_protected(u.id)
  and not exists(select 1 from private.email_account_deletion_requests r where r.target_user_id=u.id and r.status in('Pending','Approved'));
 end if;
 return jsonb_build_object('canRequest',can_request,'canApprove',can_approve,'approverName',approver,'requests',requests,'targets',coalesce(targets,'[]'));
end$$;

create function public.request_email_account_deletion(p_target uuid,p_reason text,p_confirm_email text,p_request uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id();t public.hris_users;r private.email_account_deletion_requests;b uuid;begin
 if not private.email_account_deletion_can_request() or not public.can_access_hris_user(p_target) then raise exception 'Only the authorized HR Manager can request this deletion' using errcode='42501';end if;
 if p_request is null or length(btrim(coalesce(p_reason,''))) not between 5 and 2000 then raise exception 'Provide a reason of 5 to 2000 characters';end if;
 select * into t from public.hris_users where id=p_target for update;
 if t.id is null or t.auth_user_id is null or private.email_account_deletion_protected(t.id) then raise exception 'This login is unavailable or protected' using errcode='42501';end if;
 if lower(btrim(p_confirm_email)) is distinct from lower(t.email) then raise exception 'The email changed. Reload the account before requesting deletion';end if;
 if not exists(select 1 from auth.users where id=t.auth_user_id and lower(email)=lower(t.email) and deleted_at is null) then raise exception 'The linked sign-in identity needs account diagnostics';end if;
 select * into r from private.email_account_deletion_requests where id=p_request;
 if r.id is not null then
  if r.requested_by=actor and r.target_user_id=t.id and r.target_email=t.email and r.reason=btrim(p_reason) then return r.id;end if;
  raise exception 'This request reference is already in use';
 end if;
 if exists(select 1 from private.email_account_deletion_requests where target_user_id=t.id and status in('Pending','Approved')) then raise exception 'This login already has a pending or approved deletion request';end if;
 select approver_id into b from private.email_account_deletion_routing;
 if not exists(select 1 from public.hris_users u join public.user_roles ur on ur.user_id=u.id join public.roles role on role.id=ur.role_id where u.id=b and lower(u.status)='active' and ur.role_id='Board of Director' and ur.is_active and role.is_active) then raise exception 'The assigned BOD approver is unavailable';end if;
 insert into private.email_account_deletion_requests(id,target_user_id,target_auth_user_id,target_email,target_name,requested_by,approver_id,reason) values(p_request,t.id,t.auth_user_id,t.email,t.full_name,actor,b,btrim(p_reason));
 insert into public.audit_logs(user_id,user_email,action,entity,entity_id,details) select actor::text,email,'REQUEST','EmailAccountDeletion',p_request::text,jsonb_build_object('email',t.email,'reason',btrim(p_reason),'newStatus','Pending')::text from public.hris_users where id=actor;
 insert into public.notifications(user_id,type,title,message,link,related_entity_id,is_read,dedupe_key) values(b::text,'EMAIL_ACCOUNT_DELETION_PENDING','Email-account deletion needs your approval',t.full_name||' · '||t.email,'/admin/users?review='||p_request,p_request::text,false,'email-account-deletion:'||p_request||':pending') on conflict(user_id,dedupe_key) do nothing;
 return p_request;
end$$;

create function private.guard_email_account_deletion_identity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.email_account_deletion_requests r where r.target_user_id=old.id and r.status='Approved' and r.id::text is distinct from current_setting('app.email_account_deletion',true))
 and (new.auth_user_id is distinct from old.auth_user_id or new.email is distinct from old.email or new.status is distinct from old.status) then raise exception 'An approved login deletion is still being completed. Retry its execution first';end if;
 return new;
end$$;
create trigger guard_approved_email_account_deletion before update of auth_user_id,email,status on public.hris_users for each row execute function private.guard_email_account_deletion_identity();

create function public.decide_email_account_deletion(p_request uuid,p_decision text,p_comment text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id();r private.email_account_deletion_requests;t public.hris_users;ticket uuid:=gen_random_uuid();begin
 if not private.email_account_deletion_can_approve() then raise exception 'Only the assigned BOD, Kay Lacap, can approve or reject deletion' using errcode='42501';end if;
 select * into r from private.email_account_deletion_requests where id=p_request for update;
 if r.id is null or r.approver_id<>actor or r.requested_by=actor then raise exception 'This request is outside your approval authority' using errcode='42501';end if;
 if p_decision is null or p_decision not in('approve','reject') then raise exception 'Choose approve or reject';end if;
 if r.status in('Completed','Rejected') then raise exception 'This request is already finished';end if;
 if p_decision='reject' then
  if r.status<>'Pending' then raise exception 'Deletion was already approved. Retry its execution';end if;
  if length(btrim(coalesce(p_comment,'')))<5 then raise exception 'A rejection reason is required';end if;
  update private.email_account_deletion_requests set status='Rejected',decision_comment=btrim(p_comment),decided_at=now() where id=r.id;
 else
  if r.status='Approved' and r.execution_status='Executing' and r.lease_until>now() then raise exception 'Deletion is already being completed. Please refresh shortly';end if;
  select * into t from public.hris_users where id=r.target_user_id for update;
  if t.auth_user_id is distinct from r.target_auth_user_id or t.email is distinct from r.target_email or private.email_account_deletion_protected(t.id) then raise exception 'The account changed or is protected. Deletion was blocked';end if;
  if r.status='Pending' then
   update private.email_account_deletion_requests set status='Approved',decision_comment=btrim(coalesce(p_comment,'')),decided_at=now() where id=r.id;
   perform set_config('app.email_account_deletion',r.id::text,true);
   update public.hris_users set status='Inactive',account_lifecycle_reason='BOD-approved email-login deletion: '||r.reason,account_inactivated_at=now(),account_inactivated_by=actor where id=t.id;
  end if;
  update private.email_account_deletion_requests set execution_status='Executing',execution_token=ticket,lease_until=now()+interval '2 minutes',error_summary=null where id=r.id;
 end if;
 if r.status='Pending' then
  insert into public.audit_logs(user_id,user_email,action,entity,entity_id,details) select actor::text,email,case when p_decision='approve' then 'APPROVE' else 'REJECT' end,'EmailAccountDeletion',r.id::text,jsonb_build_object('email',r.target_email,'approvalStage','BOD Kay Lacap','previousStatus','Pending','newStatus',case when p_decision='approve' then 'Approved' else 'Rejected' end,'comments',p_comment)::text from public.hris_users where id=actor;
 end if;
 if p_decision='reject' then
  insert into public.notifications(user_id,type,title,message,link,related_entity_id,is_read,dedupe_key) values(r.requested_by::text,'EMAIL_ACCOUNT_DELETION_UPDATE','Email-account deletion rejected',r.target_email||' · '||btrim(p_comment),'/admin/users?review='||r.id,r.id::text,false,'email-account-deletion:'||r.id||':rejected') on conflict(user_id,dedupe_key) do nothing;
  return jsonb_build_object('status','Rejected');
 end if;
 return jsonb_build_object('status','Approved','requestId',r.id,'authUserId',r.target_auth_user_id,'email',r.target_email,'executionToken',ticket,'authDeleted',not exists(select 1 from auth.users where id=r.target_auth_user_id and deleted_at is null));
end$$;

-- Only the authenticated server executor can record managed Auth deletion.
create function public.finish_email_account_deletion(p_request uuid,p_token uuid,p_success boolean,p_error text default null) returns void language plpgsql security definer set search_path='' as $$
declare r private.email_account_deletion_requests;begin
 select * into r from private.email_account_deletion_requests where id=p_request for update;
 if r.id is null or r.status<>'Approved' or r.execution_status<>'Executing' or r.execution_token is distinct from p_token then raise exception 'Deletion execution lease is invalid';end if;
 if p_success then
  perform set_config('app.email_account_deletion',r.id::text,true);
  update public.hris_users set auth_user_id=null,status='Inactive' where id=r.target_user_id and auth_user_id=r.target_auth_user_id and email=r.target_email;
  if not found then raise exception 'The linked identity changed during deletion';end if;
  update private.email_account_deletion_requests set status='Completed',execution_status='Completed',completed_at=now(),execution_token=null,lease_until=null,error_summary=null where id=r.id;
  insert into public.audit_logs(user_id,user_email,action,entity,entity_id,details) select r.approver_id::text,email,'DELETE_LOGIN','EmailAccountDeletion',r.id::text,jsonb_build_object('email',r.target_email,'employeeRecordsPreserved',true,'newStatus','Completed')::text from public.hris_users where id=r.approver_id;
  insert into public.notifications(user_id,type,title,message,link,related_entity_id,is_read,dedupe_key) values(r.requested_by::text,'EMAIL_ACCOUNT_DELETION_UPDATE','Email-account deletion completed',r.target_email||' · Employee records retained','/admin/users?review='||r.id,r.id::text,false,'email-account-deletion:'||r.id||':completed') on conflict(user_id,dedupe_key) do nothing;
 else
  update private.email_account_deletion_requests set execution_status='Failed',execution_token=null,lease_until=null,error_summary=left(coalesce(p_error,'Deletion could not complete. Kay can retry.'),300) where id=r.id;
 end if;
end$$;

create function public.get_email_account_deletion_tasks_for_actor(p_actor uuid) returns table(request_type text,request_id uuid,type_label text) language sql stable security definer set search_path='' as $$
 select 'account_deletion',r.id,'Email Account Deletions' from private.email_account_deletion_requests r
 join private.email_account_deletion_routing c on c.approver_id=r.approver_id
 where r.approver_id=p_actor and public.approval_email_actor_allowed(p_actor)
 and exists(select 1 from public.user_roles ur join public.roles role on role.id=ur.role_id where ur.user_id=p_actor and ur.role_id='Board of Director' and ur.is_active and role.is_active)
 and (r.status='Pending' or (r.status='Approved' and (r.execution_status='Failed' or r.lease_until<now())))
$$;
alter function public.get_actionable_approval_tasks_for_actor(uuid) rename to get_actionable_approval_tasks_before_email_deletion;
create function public.get_actionable_approval_tasks_for_actor(p_actor uuid) returns table(request_type text,request_id uuid,type_label text) language sql stable security invoker set search_path='' as $$
 select * from public.get_actionable_approval_tasks_before_email_deletion(p_actor)
 union select * from public.get_email_account_deletion_tasks_for_actor(p_actor)
$$;
create or replace function public.get_my_actionable_approval_tasks() returns table(request_type text,request_id uuid,type_label text) language sql stable security invoker set search_path='' as $$
 select * from public.get_actionable_approval_tasks_for_actor(public.current_hris_user_id())
$$;
revoke all on function private.email_account_deletion_can_request(),private.email_account_deletion_can_approve(),private.email_account_deletion_protected(uuid),private.guard_email_account_deletion_identity() from public,anon,authenticated;
revoke all on function public.get_email_account_deletion_workspace(),public.request_email_account_deletion(uuid,text,text,uuid),public.decide_email_account_deletion(uuid,text,text),public.finish_email_account_deletion(uuid,uuid,boolean,text),public.get_email_account_deletion_tasks_for_actor(uuid),public.get_actionable_approval_tasks_for_actor(uuid) from public,anon;
revoke all on function public.finish_email_account_deletion(uuid,uuid,boolean,text) from authenticated;
grant execute on function public.get_email_account_deletion_workspace(),public.request_email_account_deletion(uuid,text,text,uuid),public.decide_email_account_deletion(uuid,text,text) to authenticated;
grant execute on function public.finish_email_account_deletion(uuid,uuid,boolean,text) to service_role;
grant execute on function public.get_email_account_deletion_tasks_for_actor(uuid),public.get_actionable_approval_tasks_for_actor(uuid) to authenticated,service_role;
