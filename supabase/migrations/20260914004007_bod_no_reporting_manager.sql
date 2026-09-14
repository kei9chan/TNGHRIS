-- BOD is an organization-level role, including secondary active assignments.
create function private.clear_bod_reporting_manager() returns trigger language plpgsql security definer set search_path='' as $$
declare previous_manager text;begin
 if new.role::text='Board of Director' or exists(select 1 from public.user_roles r where r.user_id=new.id and r.role_id='Board of Director' and r.is_active) then
 previous_manager:=case when tg_op='UPDATE' then old.reports_to else new.reports_to end;
 if new.reports_to is not null or previous_manager is not null then
 insert into public.audit_logs(user_id,user_email,action,entity,entity_id,details)
 values(coalesce(public.current_hris_user_id()::text,'system'),null,'BOD_REPORTING_MANAGER_CLEARED','Employee',new.id::text,
 jsonb_build_object('previous',previous_manager,'attempted',new.reports_to,'new',null,'reason','BOD role does not report to a manager')::text);
 end if;
 new.reports_to:=null;
 end if;return new;
end $$;
create trigger bod_no_reporting_manager before insert or update of role,reports_to on public.hris_users for each row execute function private.clear_bod_reporting_manager();
create function private.clear_reporting_on_bod_role() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.role_id='Board of Director' and new.is_active then
 update public.hris_users set reports_to=null where id=new.user_id and reports_to is not null;
 end if;return new;
end $$;
create trigger bod_role_no_reporting_manager after insert or update of role_id,is_active,user_id on public.user_roles for each row execute function private.clear_reporting_on_bod_role();
revoke all on function private.clear_bod_reporting_manager(),private.clear_reporting_on_bod_role() from public,anon,authenticated;
update public.hris_users h set reports_to=null where reports_to is not null and
 (h.role::text='Board of Director' or exists(select 1 from public.user_roles r where r.user_id=h.id and r.role_id='Board of Director' and r.is_active));
create or replace function schedule_compliance.bod_manager(p_employee uuid) returns uuid language sql stable security definer set search_path='' as $$
 select b.id from public.hris_users e join public.hris_users b on b.id::text=e.reports_to
 where e.id=p_employee and e.id<>b.id and lower(e.status::text)='active'
 and not private.workflow_user_has_role(e.id,'Board of Director')
 and private.workflow_user_has_role(b.id,'Board of Director');
$$;
notify pgrst,'reload schema';
