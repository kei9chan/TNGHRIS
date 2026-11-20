create function operations_private.checklist_result_units(p_actor uuid)
returns table(id uuid, name text) language sql stable security definer set search_path='' as $$
  with leadership as (
    select lower(trim(h.position))='operations director' or coalesce(bool_or(r.id='Operations Director'),false) as od,
           coalesce(bool_or(r.id='GeneralManager'),false) as gm
    from public.hris_users h
    left join public.user_roles ur on ur.user_id=h.id and ur.is_active
    left join public.roles r on r.id=ur.role_id and r.is_active
    where h.id=p_actor and lower(h.status)='active'
    group by h.id,h.position
  )
  select b.id,b.name::text from public.business_units b cross join leadership l
  where case when l.od then b.id <> 'e61c2c4f-5f69-4e53-a37e-c9d7ecbebe2c'::uuid
        else l.gm or operations_private.role_unit(p_actor,b.id,array['Admin','Board of Director','Business Unit Manager']) end
$$;
revoke all on function operations_private.checklist_result_units(uuid) from public,anon,authenticated;

create function public.ops_checklist_results(p_date date,p_unit uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=operations_private.actor(); units uuid[]; choices jsonb;
begin
  select array_agg(u.id),jsonb_agg(to_jsonb(u) order by u.name) into units,choices
  from operations_private.checklist_result_units(actor) u;
  if units is null or (p_unit is not null and not p_unit=any(units)) then
    raise exception 'Checklist results unavailable' using errcode='42501';
  end if;
  if p_date is null then raise exception 'Choose a submission date'; end if;
  return jsonb_build_object('units',choices,'results',(
    select coalesce(jsonb_agg(to_jsonb(x) order by x.submitted_at desc,x.id),'[]'::jsonb)
    from (
      select r.id,b.name as unit,v.content->>'title' as title,coalesce(r.submitted_at,legacy.completed_at) as submitted_at,
        coalesce(r.outcome,'Completed') as outcome,h.full_name as submitted_by,
        case when r.execution_phase=1 then
          (select jsonb_agg(jsonb_build_object('title',i.snapshot->>'title','value',c.checked) order by i.ordinal)
           from public.ops_item_checks c join public.ops_checklist_items i on i.id=c.item_id where c.run_id=r.id)
        else
          (select jsonb_agg(jsonb_build_object('title',i.snapshot->>'title','value',s.value,'remarks',s.remarks,'issue',s.issue) order by i.ordinal)
           from public.ops_run_items i left join public.ops_responses s on s.item_id=i.id where i.run_id=r.id)
        end as items
      from public.ops_checklist_runs r join public.business_units b on b.id=r.business_unit_id
      join public.ops_template_versions v on v.id=r.template_version_id
      join public.ops_templates t on t.id=v.template_id and t.kind='checklist'
      left join public.hris_users h on h.id=r.submitted_by
      left join lateral (select max(a.completed_at) as completed_at from public.ops_assignments a
        where r.execution_phase=1 and a.checklist_run_id=r.id and a.status='Completed') legacy on true
      where b.id=any(units) and (p_unit is null or b.id=p_unit)
        and coalesce(r.submitted_at,legacy.completed_at)>=p_date::timestamp at time zone 'Asia/Manila'
        and coalesce(r.submitted_at,legacy.completed_at)<(p_date+1)::timestamp at time zone 'Asia/Manila'
    ) x
  ));
end $$;
revoke all on function public.ops_checklist_results(date,uuid) from public,anon;
grant execute on function public.ops_checklist_results(date,uuid) to authenticated;
