create or replace function private.audit_on_call_manpower_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_email text;
  entity_name text := case when TG_TABLE_NAME = 'manpower_event_notes' then 'ManpowerEventNote' else 'OnCallReplacement' end;
  old_value jsonb := case when TG_OP = 'INSERT' then null else to_jsonb(OLD) end;
  new_value jsonb := case when TG_OP = 'DELETE' then null else to_jsonb(NEW) end;
begin
  if actor_id is null then return coalesce(NEW, OLD); end if;
  select email into actor_email from public.hris_users where id = actor_id;
  insert into public.audit_logs(user_id,user_email,action,entity,entity_id,details)
  values(actor_id::text,actor_email,TG_OP,entity_name,coalesce(NEW.id,OLD.id)::text,
    jsonb_build_object('previousValue',old_value,'newValue',new_value,'reason',coalesce(NEW.notes,OLD.notes))::text);
  return coalesce(NEW, OLD);
end;
$$;
revoke all on function private.audit_on_call_manpower_change() from public, anon, authenticated;
drop trigger if exists audit_manpower_event_notes on public.manpower_event_notes;
create trigger audit_manpower_event_notes after insert or update or delete on public.manpower_event_notes
  for each row execute function private.audit_on_call_manpower_change();
drop trigger if exists audit_on_call_replacements on public.on_call_replacements;
create trigger audit_on_call_replacements after insert or update or delete on public.on_call_replacements
  for each row execute function private.audit_on_call_manpower_change();
notify pgrst, 'reload schema';
