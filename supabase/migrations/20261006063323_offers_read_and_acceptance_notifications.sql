-- Cache actor-only permission checks once per statement without changing scope.
alter policy application_record_access on public.job_applications
  using ((select public.has_recruitment_admin_access()) or public.can_access_requisition(requisition_id));
alter policy application_recruitment_write on public.job_applications
  using ((select public.has_recruitment_admin_access()))
  with check ((select public.has_recruitment_admin_access()));
alter policy candidate_record_access on public.job_candidates
  using ((select public.has_recruitment_admin_access()) or exists (
    select 1 from public.job_applications a
    where a.candidate_id = job_candidates.id and public.can_access_requisition(a.requisition_id)
  ));
alter policy candidate_recruitment_write on public.job_candidates
  using ((select public.has_recruitment_admin_access()))
  with check ((select public.has_recruitment_admin_access()));
alter policy offer_record_access on public.job_offers
  using ((select public.has_recruitment_admin_access()) or exists (
    select 1 from public.job_applications a
    where a.id = job_offers.application_id and public.can_access_requisition(a.requisition_id)
  ));
alter policy offer_recruitment_write on public.job_offers
  using ((select public.has_recruitment_admin_access()))
  with check ((select public.has_recruitment_admin_access()));
alter policy requisition_recruitment_write on public.job_requisitions
  using ((select public.has_recruitment_admin_access()) or created_by_user_id = (select public.current_hris_user_id()))
  with check ((select public.has_recruitment_admin_access()) or created_by_user_id = (select public.current_hris_user_id()));

-- Durable, recipient-specific jobs; no public/client access to email addresses.
create table public.offer_acceptance_email_queue (
  offer_id uuid not null references public.job_offers(id),
  recipient_user_id uuid not null references public.hris_users(id),
  recipient_email text not null,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (offer_id, recipient_user_id)
);
alter table public.offer_acceptance_email_queue enable row level security;
revoke all on public.offer_acceptance_email_queue from public, anon, authenticated;
grant select, insert, update on public.offer_acceptance_email_queue to service_role;

create or replace function private.queue_signed_offer_hr_notifications()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.status in ('Signed','Accepted and Signed') and old.status not in ('Signed','Accepted and Signed','Converted') then
    insert into public.offer_acceptance_email_queue (offer_id,recipient_user_id,recipient_email)
    select new.id,u.id,u.email from public.hris_users u
    where u.status = 'Active' and u.email is not null and (
      u.role in ('HR Staff','HR Manager') or exists (
        select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
        where ur.user_id=u.id and ur.is_active and r.is_active and ur.role_id in ('HR Staff','HR Manager')
      )
    ) on conflict do nothing;
    insert into public.notifications (user_id,type,title,message,link,related_entity_id)
    select q.recipient_user_id,'RECRUITMENT','Offer accepted and signed',
      coalesce(new.signature_name,'Candidate') || ' accepted and signed offer ' || new.offer_number || '. Review the offer and prepare onboarding.',
      '/recruitment/offers',new.id
    from public.offer_acceptance_email_queue q where q.offer_id=new.id;
  end if;
  return new;
end;
$$;
revoke all on function private.queue_signed_offer_hr_notifications() from public, anon, authenticated;
grant execute on function private.queue_signed_offer_hr_notifications() to service_role;
create trigger queue_signed_offer_hr_notifications after update of status on public.job_offers
for each row execute function private.queue_signed_offer_hr_notifications();
