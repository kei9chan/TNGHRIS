-- Let the calculated normal payroll hand off to Finance with one action.
-- The existing Finance, HR and two distinct BOD approval stages remain authoritative.
create or replace function public.request_normal_payroll_approval(p_net_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare n public.payroll_net_runs;actor uuid:=public.current_hris_user_id();h public.hris_users;existing uuid;
begin
 select * into n from public.payroll_net_runs where id=p_net_id;
 if actor is null or n.id is null or not private.payroll_gross_permission(n.scope_id,'view') then
  raise exception 'Scoped payroll access required.' using errcode='42501';
 end if;
 if (public.get_payroll_net_run(n.id)->>'current') is distinct from 'true' then
  raise exception 'Payroll inputs changed. Recalculate the current version before submission.';
 end if;
 select id into existing from public.payroll_approval_runs where net_run_id=n.id order by submitted_at desc limit 1;
 if existing is not null then return jsonb_build_object('status','submitted','runId',existing);end if;
 for h in select * from public.hris_users where private.workflow_user_has_role(id,'Finance Staff') loop
  insert into public.notifications(user_id,type,title,message,link,related_entity_id,dedupe_key)
  values(h.id::text,'GENERAL','Payroll ready for Finance submission',
   'A calculated payroll for '||n.date_from::text||'–'||n.date_to::text||' is ready. Review and submit the saved version for HR and BOD approval.',
   '/payroll/approvals?net='||n.id::text,n.id::text,'normal-payroll-finance-submit:'||n.id::text)
  on conflict(user_id,dedupe_key) do nothing;
 end loop;
 return jsonb_build_object('status','finance_notified','runId',null);
end $$;
revoke all on function public.request_normal_payroll_approval(uuid) from public,anon;
grant execute on function public.request_normal_payroll_approval(uuid) to authenticated;

create or replace function public.get_normal_payroll_approval(p_net_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare n public.payroll_net_runs;run_id uuid;
begin
 select * into n from public.payroll_net_runs where id=p_net_id;
 if public.current_hris_user_id() is null or n.id is null or not private.payroll_gross_permission(n.scope_id,'view') then
  raise exception 'Scoped payroll access required.' using errcode='42501';
 end if;
 select id into run_id from public.payroll_approval_runs where net_run_id=n.id order by submitted_at desc limit 1;
 return case when run_id is null then null else private.payroll_approval_state(run_id) end;
end $$;
revoke all on function public.get_normal_payroll_approval(uuid) from public,anon;
grant execute on function public.get_normal_payroll_approval(uuid) to authenticated;

-- A BOD who calculated this version may sign only after HR and an independent
-- Finance authorizer have completed their own stages; own pay is still excluded.
create or replace function private.payroll_approval_state(p_run uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s jsonb;r public.payroll_approval_runs;actor uuid:=public.current_hris_user_id();step_no int;
begin
 s:=private.payroll_phase8_approval_state(p_run);
 select * into r from public.payroll_approval_runs where id=p_run;
 step_no:=(s->>'step')::int;
 -- The sole scoped Finance operator may authorize after a separate HR Manager
 -- authorization. The audit still records both distinct decisions and actors.
 if step_no=3 and s->>'current'='true' and s->>'returned'='false' and s->>'paid'='false'
    and private.payroll_approval_mode(r.scope_id) is not null
    and private.payroll_approval_role(3,r.scope_id)
    and exists(select 1 from public.payroll_approval_actions a where a.run_id=r.id and a.step=2 and a.action='approve' and a.actor_id<>actor)
    and not exists(select 1 from jsonb_array_elements(r.source_snapshot->'employees') e where e->>'employeeId'=actor::text) then
  s:=s||jsonb_build_object('canAct',true);
 end if;
 if step_no in(4,5) and s->>'current'='true' and s->>'returned'='false' and s->>'paid'='false'
    and private.payroll_approval_mode(r.scope_id) is not null
    and private.payroll_approval_role(step_no,r.scope_id)
    and not exists(select 1 from public.payroll_approval_actions a where a.run_id=r.id and a.step in(4,5) and a.actor_id=actor)
    and not exists(select 1 from jsonb_array_elements(r.source_snapshot->'employees') e where e->>'employeeId'=actor::text) then
  s:=s||jsonb_build_object('canAct',true);
 end if;
 if r.mode='live' and (private.payroll_approval_mode(r.scope_id) is distinct from 'live'
    or not private.payroll_live_window(r.scope_id,(r.source_snapshot->>'from')::date,(r.source_snapshot->>'to')::date)) then
  s:=s||jsonb_build_object('canAct',false,'canDisburse',false,'stage','Live processing stopped or outside authorized cutoff');
 end if;
 return s;
end $$;
revoke all on function private.payroll_approval_state(uuid) from public,anon,authenticated;

create or replace function private.notify_normal_payroll_reviewers()
returns trigger language plpgsql security definer set search_path='' as $$
declare h public.hris_users;r public.payroll_approval_runs;permission_name text;role_name text;stage_name text;
begin
 if new.action<>'approve' or new.step not between 0 and 3 then return new;end if;
 select * into r from public.payroll_approval_runs where id=new.run_id;
 permission_name:=case new.step when 0 then 'review_endorse' when 1 then 'authorize_hr' when 2 then 'authorize_finance' else 'approve_bod' end;
 role_name:=case new.step when 0 then 'HR Staff' when 1 then 'HR Manager' when 2 then 'Finance Staff' else 'Board of Director' end;
 stage_name:=private.payroll_approval_stage(new.step+1);
 for h in select * from public.hris_users u where lower(u.status)='active' and not coalesce(u.is_duplicate,false)
  and (private.workflow_user_has_role(u.id,role_name) or (new.step=0 and private.workflow_user_has_role(u.id,'HR Manager')))
  and exists(select 1 from public.payroll_access_grants g where g.auth_user_id=u.auth_user_id and g.revoked_at is null and g.permission=permission_name and private.payroll_scope_covers(g.scope_id,r.scope_id)) loop
  insert into public.notifications(user_id,type,title,message,link,related_entity_id,dedupe_key)
  values(h.id::text,'GENERAL','Payroll approval: '||stage_name,
   'Payroll for '||(r.source_snapshot->>'from')||'–'||(r.source_snapshot->>'to')||' is ready for your review. Open the summary and employee breakdown before deciding.',
   '/payroll/approvals?run='||r.id::text,r.id::text,'normal-payroll-step:'||(new.step+1)::text||':'||r.id::text)
  on conflict(user_id,dedupe_key) do nothing;
 end loop;
 return new;
end $$;
revoke all on function private.notify_normal_payroll_reviewers() from public,anon,authenticated;
create trigger notify_normal_payroll_reviewers after insert on public.payroll_approval_actions
for each row execute function private.notify_normal_payroll_reviewers();

create or replace function private.notify_normal_payroll_submission()
returns trigger language plpgsql security definer set search_path='' as $$
declare h public.hris_users;
begin
 for h in select * from public.hris_users u where lower(u.status)='active' and not coalesce(u.is_duplicate,false)
  and (private.workflow_user_has_role(u.id,'HR Staff') or private.workflow_user_has_role(u.id,'HR Manager'))
  and exists(select 1 from public.payroll_access_grants g where g.auth_user_id=u.auth_user_id and g.revoked_at is null and g.permission='review_endorse' and private.payroll_scope_covers(g.scope_id,new.scope_id)) loop
  insert into public.notifications(user_id,type,title,message,link,related_entity_id,dedupe_key)
  values(h.id::text,'GENERAL','Payroll submitted for HR validation',
   'Finance submitted payroll for '||(new.source_snapshot->>'from')||'–'||(new.source_snapshot->>'to')||'. Review the summary and employee breakdown.',
   '/payroll/approvals?run='||new.id::text,new.id::text,'normal-payroll-step:0:'||new.id::text)
  on conflict(user_id,dedupe_key) do nothing;
 end loop;
 return new;
end $$;
revoke all on function private.notify_normal_payroll_submission() from public,anon,authenticated;
create trigger notify_normal_payroll_submission after insert on public.payroll_approval_runs
for each row execute function private.notify_normal_payroll_submission();
