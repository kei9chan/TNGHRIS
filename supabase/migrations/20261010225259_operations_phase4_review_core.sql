-- Phase 4: private review records, immutable submissions and decisions. Existing execution enums stay intact.
alter table public.ops_permissions add column can_review boolean not null default false;
create table operations_private.review_settings(
 business_unit_id uuid primary key references public.business_units(id),review_hours int not null default 24 check(review_hours between 1 and 168),
 daily_time time not null default '23:00',repeat_count int not null default 3 check(repeat_count between 2 and 20),repeat_days int not null default 30 check(repeat_days between 1 and 365),updated_by uuid references public.hris_users(id),updated_at timestamptz not null default now()
);
create table operations_private.reviews(
 id uuid primary key default gen_random_uuid(),assignment_id uuid not null unique references public.ops_assignments(id),run_id uuid unique references public.ops_checklist_runs(id),business_unit_id uuid not null references public.business_units(id),
 mode text not null check(mode in('Daily Summary','Individual Verification','Individual Verification + BOD')),critical bool not null default false,
 operating_date date not null,original_due timestamptz not null,review_due timestamptz not null,correction_due timestamptz,
 state text not null default 'Executing' check(state in('Executing','Confirmed','Awaiting verification','Awaiting BOD review','Needs correction','Verified','Cancelled','Historical')),
 submission int not null default 0,revision int not null default 1,reviewer_id uuid references public.hris_users(id),first_reviewer uuid references public.hris_users(id),equipment_condition text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index ops_review_unit_date on operations_private.reviews(business_unit_id,operating_date);
create index ops_review_pending on operations_private.reviews(review_due) where state in('Awaiting verification','Awaiting BOD review','Needs correction');
create index ops_review_reviewer on operations_private.reviews(reviewer_id);
create table operations_private.review_submissions(
 id uuid primary key default gen_random_uuid(),review_id uuid not null references operations_private.reviews(id),number int not null,actor_id uuid references public.hris_users(id),submitted_at timestamptz not null default now(),snapshot jsonb not null,unique(review_id,number)
);
create table operations_private.review_decisions(
 id uuid primary key default gen_random_uuid(),review_id uuid not null references operations_private.reviews(id),submission int not null,actor_id uuid not null references public.hris_users(id),action text not null,method text,condition text,note text not null default '',detail jsonb not null default '{}',created_at timestamptz not null default now()
);
create index ops_review_decision_actor on operations_private.review_decisions(actor_id);
create table operations_private.review_issues(
 id uuid primary key default gen_random_uuid(),review_id uuid not null references operations_private.reviews(id),submission int not null,description text not null,severity text not null check(severity in('Routine','Important','Critical')),cause text not null check(cause in('Execution quality','Missing supplies or tools','Equipment defect','Staffing or coverage','Training or instructions','Other')),
 responsible_id uuid references public.hris_users(id),reporter_id uuid not null references public.hris_users(id),due_at timestamptz not null,
 status text not null default 'Open' check(status in('Open','Action in progress','Awaiting recheck','Resolved')),action_plan text not null default '',resolution text not null default '',confirmed_quality bool not null default false,revision int not null default 1,created_at timestamptz not null default now(),resolved_at timestamptz
);
create unique index ops_issue_one_incident on operations_private.review_issues(review_id,submission) where status<>'Resolved';
create index ops_issues_pending on operations_private.review_issues(due_at) where status<>'Resolved';
create index ops_issues_responsible on operations_private.review_issues(responsible_id,created_at);
create table operations_private.review_issue_events(id uuid primary key default gen_random_uuid(),issue_id uuid not null references operations_private.review_issues(id),actor_id uuid not null references public.hris_users(id),action text not null,detail jsonb not null,created_at timestamptz not null default now());
create index ops_issue_event_actor on operations_private.review_issue_events(actor_id);
create table operations_private.daily_reviews(
 id uuid primary key default gen_random_uuid(),business_unit_id uuid not null references public.business_units(id),operating_date date not null,samples uuid[] not null default '{}',checks jsonb not null default '{}',scope jsonb not null default '[]',actor_id uuid not null references public.hris_users(id),revision int not null default 1,completed_at timestamptz,note text not null default '',unique(business_unit_id,operating_date)
);
create index ops_daily_actor on operations_private.daily_reviews(actor_id);
create table operations_private.hr_review_referrals(id uuid primary key default gen_random_uuid(),issue_id uuid not null unique references operations_private.review_issues(id),incident_id uuid not null references public.incident_reports(id),actor_id uuid not null references public.hris_users(id),created_at timestamptz not null default now());
create index ops_referral_actor on operations_private.hr_review_referrals(actor_id);
create table operations_private.review_notices(recipient uuid not null references public.hris_users(id),event_key text not null,created_at timestamptz not null default now(),primary key(recipient,event_key));
do $$declare n text;begin foreach n in array array['review_settings','reviews','review_submissions','review_decisions','review_issues','review_issue_events','daily_reviews','hr_review_referrals','review_notices'] loop execute format('alter table operations_private.%I enable row level security',n);execute format('revoke all on operations_private.%I from public,anon,authenticated',n);end loop;end$$;

create function operations_private.review_manager(u uuid) returns boolean language sql stable security definer set search_path='' as $$
 select operations_private.manager(u) or (operations_private.member(public.current_hris_user_id(),u) and exists(select 1 from public.ops_permissions where user_id=public.current_hris_user_id() and business_unit_id=u and can_review))
$$;
create function operations_private.review_view(rid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from operations_private.reviews r where r.id=rid and public.current_hris_user_id() is not null and (operations_private.manager(r.business_unit_id) or operations_private.can_view_assignment(r.assignment_id) or (r.run_id is not null and operations_private.can_view_run(r.run_id))))
$$;
create function operations_private.review_eligible(rid uuid,bod bool default false,who uuid default public.current_hris_user_id()) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from operations_private.reviews r where r.id=rid and exists(select 1 from public.hris_users where id=who and lower(status)='active')
 and (case when bod then operations_private.role_unit(who,r.business_unit_id,array['Admin','Board of Director']) and r.first_reviewer is distinct from who
 else (operations_private.role_unit(who,r.business_unit_id,array['Admin','Board of Director','Business Unit Manager','GeneralManager']) or (operations_private.member(who,r.business_unit_id) and exists(select 1 from public.ops_permissions p where p.user_id=who and p.business_unit_id=r.business_unit_id and p.can_review) and not exists(select 1 from public.ops_assignments a where (a.id=r.assignment_id or a.checklist_run_id=r.run_id) and not private.is_direct_reporting_manager(who,a.assignee_id)))) end)
 and not exists(select 1 from public.ops_assignments a where (a.id=r.assignment_id or a.checklist_run_id=r.run_id) and a.assignee_id=who)
 and not exists(select 1 from public.ops_responses s join public.ops_run_items i on i.id=s.item_id where i.run_id=r.run_id and s.actor_id=who)
 and not exists(select 1 from public.ops_item_checks c where c.run_id=r.run_id and c.actor_id=who)
 and not exists(select 1 from public.ops_evidence e join public.ops_run_items i on i.id=e.item_id where i.run_id=r.run_id and e.uploader_id=who)
 and not exists(select 1 from operations_private.review_submissions s where s.review_id=r.id and (s.actor_id=who or s.snapshot->'actors' ? who::text)))
$$;
create function operations_private.review_policy(aid uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.ops_assignments;v public.ops_template_versions;o public.ops_occurrences;c bool;m text;begin
 select * into a from public.ops_assignments where id=aid;select * into v from public.ops_template_versions where id=a.template_version_id;select * into o from public.ops_occurrences where id=a.occurrence_id;
 c:=coalesce((v.content->>'safety_critical')::bool,false) or exists(select 1 from public.ops_checklist_items where checklist_version_id=v.id and coalesce((snapshot->>'safety_critical')::bool,false));
 m:=coalesce(v.content->>'review_mode','Daily Summary');
 if m='Daily Summary' and (c or a.requires_verification or v.content->>'category'='Maintenance' or v.asset_id is not null or o.asset_context is not null or o.config ? 'event_window') then m:='Individual Verification';end if;
 if exists(select 1 from public.ops_checklist_items where checklist_version_id=v.id and snapshot->>'review_mode'='Individual Verification + BOD') then m:='Individual Verification + BOD';
 elsif m='Daily Summary' and exists(select 1 from public.ops_checklist_items where checklist_version_id=v.id and snapshot->>'review_mode'='Individual Verification') then m:='Individual Verification';end if;
 return jsonb_build_object('mode',m,'critical',c);
end$$;
create function operations_private.ensure_review(aid uuid,historical bool default false) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.ops_assignments;r operations_private.reviews;p jsonb;o public.ops_occurrences;hrs int;begin
 select * into a from public.ops_assignments where id=aid;if a.id is null then return null;end if;
 select * into r from operations_private.reviews where assignment_id=a.id or (a.checklist_run_id is not null and run_id=a.checklist_run_id) limit 1;if found then return r.id;end if;
 p:=operations_private.review_policy(a.id);select * into o from public.ops_occurrences where id=a.occurrence_id;select coalesce(review_hours,24) into hrs from operations_private.review_settings where business_unit_id=a.business_unit_id;hrs:=coalesce(hrs,24);
 insert into operations_private.reviews(assignment_id,run_id,business_unit_id,mode,critical,operating_date,original_due,review_due,state)
 values(a.id,a.checklist_run_id,a.business_unit_id,p->>'mode',(p->>'critical')::bool,coalesce(o.operating_date,(a.due_at at time zone 'Asia/Manila')::date),a.due_at,case when o.config ? 'event_window' then a.due_at else a.due_at+make_interval(hours=>hrs) end,case when a.status='Cancelled' then 'Cancelled' when historical and a.status='Completed' then 'Historical' else 'Executing' end)
 on conflict do nothing returning id into aid;
 if aid is null then select id into aid from operations_private.reviews where assignment_id=a.id or (a.checklist_run_id is not null and run_id=a.checklist_run_id) limit 1;end if;return aid;
end$$;
create function operations_private.review_snapshot(rid uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('content',v.content,'instructions',a.instructions,'asset',o.asset_context,'event',o.config->'event_window','original_due',r.original_due,'mode',r.mode,'critical',r.critical,
 'participants',(select coalesce(jsonb_agg(jsonb_build_object('id',x.assignee_id,'name',h.full_name)),'[]') from public.ops_assignments x join public.hris_users h on h.id=x.assignee_id where x.id=r.assignment_id or x.checklist_run_id=r.run_id),
 'actors',(select coalesce(jsonb_agg(distinct who::text),'[]') from (select assignee_id who from public.ops_assignments where id=r.assignment_id or checklist_run_id=r.run_id union select s.actor_id from public.ops_responses s join public.ops_run_items i on i.id=s.item_id where i.run_id=r.run_id and s.actor_id is not null union select c.actor_id from public.ops_item_checks c where c.run_id=r.run_id and c.actor_id is not null union select e.uploader_id from public.ops_evidence e join public.ops_run_items i on i.id=e.item_id where i.run_id=r.run_id) x),
 'items',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'snapshot',i.snapshot,'required',i.required,'response_type',i.response_type,'response',to_jsonb(s),'evidence',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'expires_at',e.expires_at,'uploader_name',e.uploader_name,'bytes',e.bytes)),'[]') from public.ops_evidence e where e.item_id=i.id and e.state='Ready')) order by i.ordinal),'[]') from public.ops_run_items i join public.ops_responses s on s.item_id=i.id where i.run_id=r.run_id),
 'phase1_checks',(select coalesce(jsonb_agg(to_jsonb(c)),'[]') from public.ops_item_checks c where c.run_id=r.run_id))
 from operations_private.reviews r join public.ops_assignments a on a.id=r.assignment_id join public.ops_template_versions v on v.id=a.template_version_id left join public.ops_occurrences o on o.id=a.occurrence_id where r.id=rid
$$;
create function operations_private.review_audit(rid uuid,act text,details jsonb) returns void language plpgsql security definer set search_path='' as $$begin
 insert into public.ops_audit_log(business_unit_id,assignment_id,actor_id,action,detail) select business_unit_id,assignment_id,operations_private.actor(),act,details||jsonb_build_object('review_id',id,'actor_name',(select full_name from public.hris_users where id=operations_private.actor())) from operations_private.reviews where id=rid;
end$$;
-- Snapshot only new confirmations. Deferred capture sees the final shared run after assignment creation.
create function operations_private.capture_review() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.ops_assignments;r operations_private.reviews;rid uuid;by_user uuid;begin
 select * into a from public.ops_assignments where id=new.id;rid:=operations_private.ensure_review(a.id);select * into r from operations_private.reviews where id=rid for update;
 if not exists(select 1 from public.ops_assignments x where (x.id=r.assignment_id or x.checklist_run_id=r.run_id) and x.status<>'Cancelled') then update operations_private.reviews set state='Cancelled',revision=revision+1,updated_at=now() where id=rid and state<>'Cancelled';return null;end if;
 if a.status='Completed' and r.state in('Executing','Needs correction') and not exists(select 1 from public.ops_assignments x where (x.id=r.assignment_id or x.checklist_run_id=r.run_id) and x.status not in('Completed','Cancelled')) then
 select submitted_by into by_user from public.ops_checklist_runs where id=r.run_id;by_user:=coalesce(by_user,public.current_hris_user_id(),a.assignee_id);
 insert into operations_private.review_submissions(review_id,number,actor_id,snapshot) values(rid,r.submission+1,by_user,operations_private.review_snapshot(rid));
 update operations_private.reviews set submission=submission+1,state=case when mode='Daily Summary' then 'Confirmed' else 'Awaiting verification' end,first_reviewer=null,equipment_condition=null,revision=revision+1,updated_at=now() where id=rid;
 end if;return null;
end$$;
create constraint trigger ops_review_capture after insert or update on public.ops_assignments deferrable initially deferred for each row execute function operations_private.capture_review();
-- Existing completions remain historical and explicitly unverified. Open work receives the new policy.
do $$declare a record;begin for a in select id from public.ops_assignments order by created_at,id loop perform operations_private.ensure_review(a.id,true);end loop;end$$;
alter function operations_private.validate_content(uuid,text,jsonb) rename to validate_content_before_review;
create function operations_private.validate_content(p_unit uuid,p_kind text,p_content jsonb) returns void language plpgsql security definer set search_path='' as $$begin
 perform operations_private.validate_content_before_review(p_unit,p_kind,p_content);
 if p_content ? 'review_mode' and coalesce(p_content->>'review_mode','') not in('Daily Summary','Individual Verification','Individual Verification + BOD') then raise exception 'Invalid review mode';end if;
end$$;
do $$declare f regprocedure;begin for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='operations_private' and (p.proname like 'review_%' or p.proname in('ensure_review','capture_review','validate_content_before_review')) loop execute format('revoke all on function %s from public,anon,authenticated',f);end loop;end$$;
