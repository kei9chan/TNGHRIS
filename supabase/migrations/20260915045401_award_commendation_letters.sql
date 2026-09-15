create schema award_private;
revoke all on schema award_private from public,anon;
grant usage on schema award_private to authenticated;
-- Versioned branding and private, immutable issued commendation files.
alter table public.employee_awards add column if not exists award_date date;

create table public.commendation_templates (
 id uuid primary key default gen_random_uuid(), business_unit_id uuid references public.business_units(id),
 award_type_id uuid references public.award_templates(id), name text not null,
 version integer not null default 1, active boolean not null default true,
 config jsonb not null, updated_at timestamptz not null default now()
);
create unique index commendation_template_scope on public.commendation_templates
 (coalesce(business_unit_id,'00000000-0000-0000-0000-000000000000'::uuid),coalesce(award_type_id,'00000000-0000-0000-0000-000000000000'::uuid));
alter table public.commendation_templates enable row level security;
revoke all on public.commendation_templates from public,anon,authenticated;

create function award_private.commendation_admin() returns boolean language sql stable security invoker set search_path='' as $$
 select auth.uid() is not null and (public.has_active_role('Admin') or public.has_active_role('HR Manager') or public.has_active_role('HR Staff'))
$$;
revoke all on function award_private.commendation_admin() from public,anon;
grant execute on function award_private.commendation_admin() to authenticated;
create policy commendation_template_read on public.commendation_templates for select to authenticated
 using (award_private.commendation_admin() or public.has_feature_permission('Evaluation','create') or public.has_feature_permission('Evaluation','manage'));
create policy commendation_template_manage on public.commendation_templates for all to authenticated
 using(award_private.commendation_admin()) with check(award_private.commendation_admin());
grant select,insert,update on public.commendation_templates to authenticated;

create table public.award_letters (
 award_id uuid primary key references public.employee_awards(id),
 template_id uuid not null references public.commendation_templates(id), template_version integer not null,
 snapshot jsonb not null, file_path text not null unique,
 state text not null default 'Draft' check(state in ('Draft','Issued','Withdrawn')),
 last_error text, issued_at timestamptz, opened_at timestamptz, acknowledged_at timestamptz,
 created_at timestamptz not null default now(), withdrawn_reason text
);
alter table public.award_letters enable row level security;
revoke all on public.award_letters from public,anon,authenticated;
grant select on public.award_letters to authenticated;

create function award_private.commendation_access(p_id uuid,p_issue boolean default false) returns boolean
 language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.employee_awards a where a.id=p_id and
 case when p_issue then a.status::text='Approved' and
  (public.is_hr_or_admin() or a.created_by_user_id=public.current_hris_user_id() or a.approver_id=public.current_hris_user_id())
 else award_private.commendation_admin() or (a.employee_id=public.current_hris_user_id() and a.status::text='Issued') end)
$$;
revoke all on function award_private.commendation_access(uuid,boolean) from public,anon;
grant execute on function award_private.commendation_access(uuid,boolean) to authenticated;
create policy commendation_private_read on public.award_letters for select to authenticated
 using(award_private.commendation_access(award_id,false));

create function award_private.commendation_template_version() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not award_private.commendation_admin() then raise exception 'Admin or HR access required.' using errcode='42501'; end if;
 if nullif(btrim(new.name),'') is null or nullif(btrim(new.config->>'wordmark'),'') is null
  or coalesce(new.config->>'accent','') !~ '^#[0-9A-Fa-f]{6}$'
  or coalesce(new.config->>'textColor','') !~ '^#[0-9A-Fa-f]{6}$'
 then raise exception 'Template name, brand wordmark and valid colors are required.'; end if;
 if octet_length(new.config::text)>1500000 then raise exception 'Brand assets exceed the template size limit.'; end if;
 if coalesce(new.config->>'logo','')<>'' and new.config->>'logo' !~ '^data:image/(png|jpeg);base64,' then raise exception 'Upload a PNG/JPEG logo to freeze its exact image with the letter.'; end if;
 if exists(select 1 from jsonb_array_elements(coalesce(new.config->'signatures','[]'::jsonb)) sig where coalesce(sig->>'image','') !~ '^data:image/(png|jpeg);base64,' or not exists(select 1 from public.hris_users where id::text=sig->>'userId')) then raise exception 'Signatures require an employee and uploaded PNG/JPEG image.'; end if;
 if tg_op='UPDATE' then new.version:=old.version+1; else new.version:=1; end if;
 new.updated_at:=now();
 perform private.award_audit('UPDATE',new.id,'Commendation template saved, version '||new.version);
 return new;
end $$;
revoke all on function award_private.commendation_template_version() from public,anon,authenticated;

-- Seed requested approved corporate and BU letter layouts; no employee awards are created.
insert into public.commendation_templates(name,config) values('Corporate Letter of Commendation',
 '{"wordmark":"TNG HRIS","accent":"#4f46e5","textColor":"#172033","opening":"We are pleased to recognize your contribution and present you with this award.","closing":"Thank you for your dedication and for making every experience memorable.","signatures":[]}'::jsonb);
insert into public.commendation_templates(business_unit_id,name,config)
 select id,name||' Letter of Commendation',jsonb_build_object('wordmark',upper(name),'accent',
 case when name ilike '%bakebe%' then '#f56600' when name ilike '%gootopia%' then '#7c3aed' when name ilike '%dessert%' then '#e11d48' when name ilike '%inflatable%' then '#0f766e' when name ilike '%fun roof%' then '#db2777' else '#4f46e5' end,
 'textColor','#431407','opening','We are pleased to recognize your contribution and present you with this award.',
 'closing','Thank you for your dedication and for making every experience memorable.','signatures','[]'::jsonb)
 from public.business_units;
create trigger commendation_template_version before insert or update on public.commendation_templates
 for each row execute function award_private.commendation_template_version();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('award-commendations','award-commendations',false,5242880,array['application/pdf']);
create policy commendation_upload on storage.objects for insert to authenticated with check
 (bucket_id='award-commendations' and exists(select 1 from public.award_letters l where l.file_path=name and l.state='Draft' and award_private.commendation_access(l.award_id,true)));
-- Upload checks need to see their own prepared draft; final letters stay private.
create policy commendation_issuer_draft on public.award_letters for select to authenticated
 using(state='Draft' and award_private.commendation_access(award_id,true));
create policy commendation_download on storage.objects for select to authenticated using
 (bucket_id='award-commendations' and exists(select 1 from public.award_letters l where l.file_path=name and
 ((l.state='Issued' and award_private.commendation_access(l.award_id,false)) or (l.state='Draft' and award_private.commendation_access(l.award_id,true)) or award_private.commendation_admin())));
-- No UPDATE/DELETE policies: uploaded snapshots cannot be overwritten by clients.

create function award_private.commendation_action(p_id uuid,p_action text,p_payload jsonb) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare a public.employee_awards; l public.award_letters; t public.commendation_templates;
 actor uuid:=public.current_hris_user_id(); e public.hris_users; issuer public.hris_users;
 bu text; title text; approvers jsonb; snap jsonb; reason text;
begin
 if auth.uid() is null or actor is null then raise exception 'Sign in required.' using errcode='42501'; end if;
 select * into a from public.employee_awards where id=p_id for update;
 if not found then raise exception 'Award not found or unavailable.' using errcode='42501'; end if;
 select * into l from public.award_letters where award_id=p_id;
 if p_action in ('prepare','finalize','error') then
  if not award_private.commendation_access(p_id,true) then raise exception 'Approved award and issuance permission required.' using errcode='42501'; end if;
  if p_action='prepare' then
   if l.award_id is not null then
    if l.state='Draft' and l.last_error is not null and not exists(select 1 from storage.objects where bucket_id='award-commendations' and name=l.file_path) then
     delete from public.award_letters where award_id=p_id;
     perform private.award_audit('UPDATE',p_id,'Retrying unsaved draft with current approved branding.');
    else return to_jsonb(l); end if;
   end if;
   select * into t from public.commendation_templates where active and
    (business_unit_id=a.business_unit_id or business_unit_id is null) and (award_type_id=a.award_template_id or award_type_id is null)
    order by (business_unit_id is not null) desc,(award_type_id is not null) desc,id limit 1;
   if not found then raise exception 'No approved active corporate or business-unit letter template. Ask Admin/HR to configure one.'; end if;
   select * into e from public.hris_users where id=a.employee_id;
   select * into issuer from public.hris_users where id=a.created_by_user_id;
   select name into bu from public.business_units where id=a.business_unit_id;
   select at.title into title from public.award_templates at where at.id=a.award_template_id;
   select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.full_name,'position',coalesce(nullif(u.position,''),u.role::text)) order by step.ordinality),'[]'::jsonb) into approvers
    from jsonb_array_elements(a.approver_steps) with ordinality step(value,ordinality)
    join public.hris_users u on u.id::text=step.value->>'userId' where step.value->>'status'='Approved';
   snap:=jsonb_build_object('employeeName',e.full_name,'employeeId',e.id,'awardTitle',title,
    'awardDate',coalesce(a.award_date,a.submitted_at::date,current_date),'citation',a.notes,'businessUnit',bu,
    'issuer',jsonb_build_object('id',issuer.id,'name',issuer.full_name,'position',coalesce(nullif(issuer.position,''),issuer.role::text)),
    'approvers',approvers,'brand',jsonb_set(t.config,'{signatures}',coalesce((select jsonb_agg(sig) from jsonb_array_elements(coalesce(t.config->'signatures','[]'::jsonb)) sig where sig->>'userId'=issuer.id::text or exists(select 1 from jsonb_array_elements(approvers) approved where approved->>'id'=sig->>'userId')),'[]'::jsonb)),'fallback',t.business_unit_id is null,'templateVersion',t.version);
   insert into public.award_letters(award_id,template_id,template_version,snapshot,file_path)
    values(p_id,t.id,t.version,snap,p_id::text||'/'||gen_random_uuid()::text||'.pdf') returning * into l;
   perform private.award_audit('CREATE',p_id,'Prepared private commendation draft; template version '||t.version);
  elsif p_action='error' then
   update public.award_letters set last_error=left(p_payload->>'message',500) where award_id=p_id and state='Draft' returning * into l;
   perform private.award_audit('UPDATE',p_id,'Commendation generation/storage failed; not issued.');
  else
   if l.state is distinct from 'Draft' or not exists(select 1 from storage.objects where bucket_id='award-commendations' and name=l.file_path and coalesce((metadata->>'size')::bigint,0)>0) then
    raise exception 'Letter PDF is not stored. Award remains unissued; retry generation.';
   end if;
   update public.award_letters set state='Issued',issued_at=now(),last_error=null where award_id=p_id returning * into l;
   perform public.mark_employee_award_issued(p_id,'private:award-commendations/'||l.file_path);
   update public.notifications set title='You received an award.',message='View your Letter of Commendation, download it and acknowledge receipt.',link='/evaluation/awards?letter='||p_id::text
    where user_id=a.employee_id::text and dedupe_key='award-issued:'||p_id::text;
  end if;
 elsif p_action in ('open','acknowledge') then
  if l.state is distinct from 'Issued' or not award_private.commendation_access(p_id,false) then raise exception 'This private letter is unavailable.' using errcode='42501'; end if;
  if p_action='open' and a.employee_id=actor then
   update public.award_letters set opened_at=coalesce(opened_at,now()) where award_id=p_id returning * into l;
   perform private.award_audit('UPDATE',p_id,'Employee opened the commendation letter.');
  elsif p_action='acknowledge' then
   if a.employee_id<>actor or l.opened_at is null then raise exception 'Open your own letter before acknowledging receipt.' using errcode='42501'; end if;
   if l.acknowledged_at is null then
    update public.award_letters set acknowledged_at=now() where award_id=p_id returning * into l;
    update public.employee_awards set is_acknowledged_by_employee=true where id=p_id;
    perform private.award_audit('UPDATE',p_id,'Employee acknowledged receipt of the commendation letter.');
   end if;
  end if;
 elsif p_action='withdraw' then
  if not award_private.commendation_admin() then raise exception 'Admin or HR access required.' using errcode='42501'; end if;
  reason:=nullif(btrim(p_payload->>'reason'),'');
  if reason is null then raise exception 'A withdrawal reason is required.'; end if;
  update public.award_letters set state='Withdrawn',withdrawn_reason=reason where award_id=p_id returning * into l;
  update public.employee_awards set status='Rejected',rejection_reason='Withdrawn: '||reason where id=p_id;
  perform private.award_audit('UPDATE',p_id,'Award withdrawn: '||reason);
 else raise exception 'Unsupported commendation action.';
 end if;
 return to_jsonb(l);
end $$;
revoke all on function award_private.commendation_action(uuid,text,jsonb) from public,anon;
grant execute on function award_private.commendation_action(uuid,text,jsonb) to authenticated;
create function public.award_letter_action(p_id uuid,p_action text,p_payload jsonb default '{}'::jsonb) returns jsonb
 language sql security invoker set search_path='' as $$ select award_private.commendation_action(p_id,p_action,p_payload) $$;
revoke all on function public.award_letter_action(uuid,text,jsonb) from public,anon;
grant execute on function public.award_letter_action(uuid,text,jsonb) to authenticated;

create function award_private.commendation_issue_gate() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.is_acknowledged_by_employee and not coalesce(old.is_acknowledged_by_employee,false) and
  (new.employee_id is distinct from public.current_hris_user_id() or not exists(select 1 from public.award_letters where award_id=new.id and opened_at is not null and acknowledged_at is not null)) then
  raise exception 'Only the recipient may acknowledge an opened letter.' using errcode='42501';
 end if;
 if new.status::text='Issued' and old.status::text<>'Issued' and not exists(select 1 from public.award_letters l join storage.objects o on o.name=l.file_path and o.bucket_id='award-commendations' where l.award_id=new.id and l.state='Issued' and coalesce((o.metadata->>'size')::bigint,0)>0) then
  raise exception 'A stored, versioned commendation letter is required before issuance.';
 end if;
 if old.status::text='Issued' and (new.employee_id,new.award_template_id,new.notes,new.business_unit_id,new.award_date,new.certificate_snapshot_url) is distinct from (old.employee_id,old.award_template_id,old.notes,old.business_unit_id,old.award_date,old.certificate_snapshot_url) then
  raise exception 'Issued award contents are immutable. Withdraw the award with an audit reason instead.';
 end if;
 return new;
end $$;
revoke all on function award_private.commendation_issue_gate() from public,anon,authenticated;
create trigger commendation_issue_gate before update on public.employee_awards for each row execute function award_private.commendation_issue_gate();

create function award_private.submit_formal_award(p_employee_id uuid,p_award_template_id uuid,p_notes text,p_business_unit_id uuid,p_department_id uuid,p_approver_ids uuid[],p_award_date date)
 returns public.employee_awards language plpgsql security definer set search_path='' as $$
declare a public.employee_awards;
begin
 if auth.uid() is null then raise exception 'Sign in required.' using errcode='42501'; end if;
 if p_award_date is null or nullif(btrim(p_notes),'') is null then raise exception 'Award date and personalized commendation are required.'; end if;
 a:=public.submit_employee_award(p_employee_id,p_award_template_id,p_notes,p_business_unit_id,p_department_id,p_approver_ids);
 update public.employee_awards set award_date=p_award_date where id=a.id returning * into a;
 return a;
end $$;
revoke all on function award_private.submit_formal_award(uuid,uuid,text,uuid,uuid,uuid[],date) from public,anon;
grant execute on function award_private.submit_formal_award(uuid,uuid,text,uuid,uuid,uuid[],date) to authenticated;
create function public.submit_formal_award(p_employee_id uuid,p_award_template_id uuid,p_notes text,p_business_unit_id uuid,p_department_id uuid,p_approver_ids uuid[],p_award_date date)
 returns public.employee_awards language sql security invoker set search_path='' as $$
 select award_private.submit_formal_award(p_employee_id,p_award_template_id,p_notes,p_business_unit_id,p_department_id,p_approver_ids,p_award_date)
$$;
revoke all on function public.submit_formal_award(uuid,uuid,text,uuid,uuid,uuid[],date) from public,anon;
grant execute on function public.submit_formal_award(uuid,uuid,text,uuid,uuid,uuid[],date) to authenticated;
notify pgrst,'reload schema';
