-- Automated work has one authoritative responsibility/window record.
alter function operations_private.change_assignment(uuid,integer,text,text) rename to change_assignment_phase2;
create function operations_private.change_assignment(p_id uuid,p_revision integer,p_status text,p_note text) returns void language plpgsql security definer set search_path='' as $$begin
 if p_status='Cancelled' and exists(select 1 from public.ops_assignments where id=p_id and occurrence_id is not null) then raise exception 'Cancel recurring work through Coverage → Manage responsibility';end if;
 perform operations_private.change_assignment_phase2(p_id,p_revision,p_status,p_note);
end $$;
alter function operations_private.update_assignment(uuid,integer,timestamptz,text,text,text) rename to update_assignment_phase2;
create function operations_private.update_assignment(p_id uuid,p_revision integer,p_due timestamptz,p_priority text,p_instructions text,p_note text) returns void language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from public.ops_assignments where id=p_id and occurrence_id is not null) then raise exception 'Update recurring work through its rule or Coverage → Manage responsibility';end if;
 perform operations_private.update_assignment_phase2(p_id,p_revision,p_due,p_priority,p_instructions,p_note);
end $$;
alter function operations_private.workspace(uuid) rename to workspace_phase2;
create function operations_private.workspace(p_unit uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare w jsonb:=operations_private.workspace_phase2(p_unit);begin
 return w||jsonb_build_object('assignments',(select coalesce(jsonb_agg(x||jsonb_build_object('occurrence_id',a.occurrence_id,'can_cancel',case when a.occurrence_id is null then (x->>'can_cancel')::bool else false end)),'[]') from jsonb_array_elements(w->'assignments') x join public.ops_assignments a on a.id=(x->>'id')::uuid));
end $$;
revoke all on function operations_private.change_assignment_phase2(uuid,integer,text,text),operations_private.update_assignment_phase2(uuid,integer,timestamptz,text,text,text),operations_private.workspace_phase2(uuid) from public,anon,authenticated;
revoke all on function operations_private.change_assignment(uuid,integer,text,text),operations_private.update_assignment(uuid,integer,timestamptz,text,text,text),operations_private.workspace(uuid) from public,anon;
grant execute on function operations_private.change_assignment(uuid,integer,text,text),operations_private.update_assignment(uuid,integer,timestamptz,text,text,text),operations_private.workspace(uuid) to authenticated;
