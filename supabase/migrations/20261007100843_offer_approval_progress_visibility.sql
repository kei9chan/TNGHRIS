-- A participant needs complete stage counts, even when assignment RLS exposes
-- only their own row. Return a narrow summary using the existing packet access
-- rule; never accept a caller-supplied actor or expose documents/pay terms.
create or replace function private.job_offer_approval_progress(p_request_ids uuid[])
returns table(request_id uuid, progress jsonb)
language sql stable security definer set search_path = ''
as $$
 select r.id, jsonb_build_object(
   'stage', r.approval_stage,
   'hrApproved', exists(select 1 from public.job_offer_approval_assignments a where a.request_id=r.id and a.approval_stage='HR_MANAGER' and a.status='Approved'),
   'bodApproved', (select count(distinct a.approver_user_id) from public.job_offer_approval_assignments a where a.request_id=r.id and a.approval_stage='BOD_GM' and a.approver_role='Board of Director' and a.status='Approved'),
   'pendingNames', coalesce((select jsonb_agg(n.name order by n.name) from (
     select distinct coalesce(nullif(u.full_name,''),a.approver_role) name
     from public.job_offer_approval_assignments a left join public.hris_users u on u.id=a.approver_user_id
     where a.request_id=r.id and a.approval_stage=r.approval_stage and a.status='Pending'
   ) n),'[]'::jsonb)
 )
 from public.job_offer_approval_requests r
 where auth.uid() is not null and public.current_hris_user_id() is not null
   and r.id=any(p_request_ids) and r.status='Pending Approval'
   and private.offer_approval_actor_can_view(r.id);
$$;
revoke all on function private.job_offer_approval_progress(uuid[]) from public, anon, authenticated;

-- The wrapper needs owner privileges only to enter the non-exposed private
-- schema. All row authorization lives in the private implementation above.
create or replace function public.get_job_offer_approval_progress(p_request_ids uuid[])
returns table(request_id uuid, progress jsonb)
language sql stable security definer set search_path = ''
as $$ select * from private.job_offer_approval_progress(p_request_ids); $$;
revoke all on function public.get_job_offer_approval_progress(uuid[]) from public, anon;
grant execute on function public.get_job_offer_approval_progress(uuid[]) to authenticated;
