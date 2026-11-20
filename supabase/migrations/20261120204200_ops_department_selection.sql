create or replace function operations_private.rule_people(p_unit uuid,c jsonb,p_scope boolean default true) returns table(id uuid,name text) language sql stable security definer set search_path='' as $$
 select h.id,h.full_name from public.hris_users h where operations_private.member(h.id,p_unit) and lower(h.status)='active'
 and (jsonb_array_length(coalesce(c->'employee_ids','[]'))=0 or c->'employee_ids' ? h.id::text)
 and (nullif(c->>'department_id','') is null or h.department_id::text=c->>'department_id')
 and (jsonb_array_length(coalesce(c->'department_ids','[]'))=0 or (c->'department_ids') ? h.department_id::text)
 and (nullif(c->>'position','') is null or h.position=c->>'position')
 and (nullif(c->>'role','') is null or operations_private.role_unit(h.id,p_unit,array[c->>'role']))
 and (not p_scope or operations_private.can_assign(p_unit,h.id))
$$;
