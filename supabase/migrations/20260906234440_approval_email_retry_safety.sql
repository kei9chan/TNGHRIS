-- Prefer the employee profile first name in the greeting. No secret or routing changes.
create or replace function public.get_approval_email_recipient(p_user_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare h public.hris_users;groups jsonb;begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server access required' using errcode='42501';end if;
 select * into h from public.hris_users where id=p_user_id;
 if h.id is null then return null;end if;
 if lower(coalesce(h.status,''))<>'active' or coalesce(h.is_duplicate,false) or h.auth_user_id is null then return jsonb_build_object('id',h.id,'skip','Inactive or unlinked account');end if;
 select coalesce(jsonb_agg(jsonb_build_object('type',request_type,'label',type_label,'count',n)),'[]') into groups
 from (select request_type,type_label,count(*) n from public.get_actionable_approval_tasks_for_actor(h.id) group by request_type,type_label) q;
 return jsonb_build_object('id',h.id,'email',h.email,'name',coalesce(nullif(btrim(h.first_name),''),h.full_name),'groups',groups);
end $$;

-- Read the account eligibility flag through a bounded boolean helper; do not widen column grants.
create or replace function public.approval_email_actor_allowed(p_actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select p_actor is not null and (p_actor=public.current_hris_user_id() or auth.role()='service_role')
 and exists(select 1 from public.hris_users h where h.id=p_actor and lower(h.status)='active' and not coalesce(h.is_duplicate,false) and h.auth_user_id is not null);
$$;
create or replace function public.get_actionable_approval_tasks_for_actor(p_actor uuid)
returns table(request_type text,request_id uuid,type_label text)
language sql stable security invoker set search_path='' as $$
 with tasks as (
 select q.request_type,q.request_id,initcap(q.request_type)||' Requests' as type_label
 from public.get_my_pending_time_approval_ids_for_actor(p_actor) q
 where (q.request_type='leave' and exists(select 1 from public.leave_requests r where r.id=q.request_id and r.status::text in ('Pending','PendingGM','PendingBOD')))
 or (q.request_type='wfh' and exists(select 1 from public.wfh_requests r where r.id=q.request_id and r.status::text in ('WFH_PENDING_DEPT_HEAD_APPROVAL','WFH_PENDING_GM_APPROVAL','WFH_PENDING_BOD_APPROVAL','WFH_FOR_TIMEKEEPING')))
 or (q.request_type='overtime' and exists(select 1 from public.ot_requests r where r.id=q.request_id and r.status::text in ('Submitted','PendingGM','PendingBOD')))
 union all select 'manpower',request_id,'Manpower Requests' from public.get_my_pending_manpower_approval_ids_for_actor(p_actor)
 union all select 'nte',id,'NTE Approvals' from public.get_my_pending_nte_approvals_for_actor(p_actor)
 union all select 'requisition',id,'Job Requisitions' from public.get_my_pending_job_requisition_approvals_for_actor(p_actor)
 union all select 'offer',request_id,'Offer Approvals' from public.get_my_pending_offer_approval_ids_for_actor(p_actor)
 union all select 'asset',request_id,'Asset Requests' from public.get_my_asset_request_approval_queue_for_actor(p_actor) where is_actionable
 union all select 'pan',p.id,'Personnel Actions' from public.pans p
 where p.status::text='Pending Approval' and exists(select 1 from jsonb_array_elements(coalesce(p.routing_steps,'[]')) s where s->>'userId'=p_actor::text and s->>'status'='Pending')
 union all select 'award',a.id,'Award Approvals' from public.employee_awards a
 where a.status::text in ('PendingApproval','Pending Approval') and exists(select 1 from jsonb_array_elements(coalesce(a.approver_steps,'[]')) s where s->>'userId'=p_actor::text and lower(s->>'status')='pending')
 ) select distinct t.request_type,t.request_id,t.type_label from tasks t
 where public.approval_email_actor_allowed(p_actor);
$$;
