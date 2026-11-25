-- Compact previews and optimistic approval for existing PAN/requisition/pay workflows.
-- No approval route, payroll activation, or required sign-off is replaced here.
create or replace function private.approval_change_preview(p_kind text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  actor uuid:=public.current_hris_user_id();
  request_data jsonb;
  prior_data jsonb;
  preview_data jsonb;
begin
  if actor is null then return null; end if;
  if p_kind='pan' then
    select to_jsonb(p) into request_data from public.pans p
    where p.id=p_id and p.status::text='Pending Approval'
      and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(p.routing_steps)='array' then p.routing_steps else '[]'::jsonb end) s
        where s->>'userId'=actor::text and s->>'status'='Pending');
    if request_data is null then return null; end if;
    preview_data:=jsonb_build_object('action',request_data->'action_taken',
      'particulars',request_data->'particulars','effectiveDate',request_data->'effective_date',
      'reason',request_data->'notes');
  elsif p_kind='requisition' then
    select to_jsonb(r) into request_data from public.job_requisitions r
    where r.id=p_id and r.status::text in ('PendingApproval','Pending Approval')
      and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(r.routing_steps)='array' then r.routing_steps else '[]'::jsonb end) s
        where s->>'userId'=actor::text and s->>'status'='Pending');
    if request_data is null then return null; end if;
    preview_data:=jsonb_build_object('headcount',request_data->'headcount',
      'employmentType',request_data->'employment_type','seasonalMonths',request_data->'seasonal_months',
      'salaryMin',request_data->'budgeted_salary_min','salaryMax',request_data->'budgeted_salary_max',
      'location',request_data->'work_location','locationType',request_data->'location_type',
      'reason',request_data->'justification','urgent',request_data->'is_urgent');
  elsif p_kind='pay_package' then
    select to_jsonb(p) into request_data from public.payroll_pay_packages p
    where p.id=p_id and p.status='draft' and p.approval_state='pending'
      and p.source_kind is distinct from 'approved_pan'
      and private.payroll_actor_id() is not null
      and p.created_by<>actor and p.created_by<>private.payroll_actor_id()
      and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(p.approval_steps)='array' then p.approval_steps else '[]'::jsonb end) s
        where s->>'userId'=actor::text and s->>'status'='Pending');
    if request_data is null then return null; end if;
    -- Match the same employee, scope, engagement and stream. Future or unrelated
    -- packages cannot become a misleading "current" compensation comparison.
    select to_jsonb(p) into prior_data from public.payroll_pay_packages p
    where p.employee_id=(request_data->>'employee_id')::uuid
      and p.scope_id=(request_data->>'scope_id')::uuid
      and p.stream=request_data->>'stream'
      and p.engagement_key is not distinct from request_data->>'engagement_key'
      and p.id<>p_id and p.status in ('active','approved','superseded')
      and p.effective_from<=(request_data->>'effective_from')::date
    order by (p.id::text=coalesce(request_data->>'correction_of_id',request_data->>'replaces_id')) desc,
      p.effective_from desc,p.approved_at desc nulls last,p.created_at desc limit 1;
    preview_data:=jsonb_build_object(
      'proposed',jsonb_build_object('base_amount',request_data->'base_amount','rate_type',request_data->'rate_type',
        'components',request_data->'components','treatment',request_data->'treatment'),
      'previous',case when prior_data is not null then jsonb_build_object(
        'base_amount',prior_data->'base_amount','rate_type',prior_data->'rate_type',
        'components',prior_data->'components','treatment',prior_data->'treatment') else null end,
      'effectiveDate',request_data->'effective_from','reason',request_data->'reason');
  else
    raise exception 'Unsupported approval type.' using errcode='22023';
  end if;
  return jsonb_build_object('id',p_id,'kind',p_kind,
    'snapshot',md5(jsonb_build_object('request',request_data,'prior',prior_data)::text),'data',preview_data);
end $$;
revoke all on function private.approval_change_preview(text,uuid) from public,anon,authenticated;

create or replace function public.get_approval_change_previews(p_kind text,p_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare item_id uuid; preview jsonb; result jsonb:='[]';
begin
  if public.current_hris_user_id() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if p_kind not in ('pan','requisition','pay_package') or p_kind is null then raise exception 'Unsupported approval type.'; end if;
  if coalesce(cardinality(p_ids),0)>250 then raise exception 'Load previews in groups of 250 or fewer.'; end if;
  for item_id in select distinct unnest(p_ids) loop
    preview:=private.approval_change_preview(p_kind,item_id);
    if preview is not null then result:=result||jsonb_build_array(preview); end if;
  end loop;
  return result;
end $$;
revoke all on function public.get_approval_change_previews(text,uuid[]) from public,anon;
grant execute on function public.get_approval_change_previews(text,uuid[]) to authenticated;

create or replace function public.approve_change_queue_item(p_kind text,p_id uuid,p_expected_snapshot text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare preview jsonb;
begin
  if public.current_hris_user_id() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if p_kind='pan' then perform 1 from public.pans where id=p_id for update;
  elsif p_kind='requisition' then perform 1 from public.job_requisitions where id=p_id for update;
  elsif p_kind='pay_package' then perform 1 from public.payroll_pay_packages where id=p_id for update;
  else raise exception 'Unsupported approval type.' using errcode='22023'; end if;
  preview:=private.approval_change_preview(p_kind,p_id);
  if preview is null then return jsonb_build_object('outcome','skipped','reason','No longer awaiting your assigned approval.'); end if;
  if p_expected_snapshot is null or preview->>'snapshot' is distinct from p_expected_snapshot then
    return jsonb_build_object('outcome','skipped','reason','Details changed after the preview. Refresh and review again.');
  end if;
  if p_kind='pan' then perform public.approve_pan(p_id,null);
  elsif p_kind='requisition' then perform public.process_job_requisition_approval(p_id,'approve',null);
  else perform public.review_payroll_pay_package(p_id,true,''); end if;
  return jsonb_build_object('outcome','approved');
end $$;
revoke all on function public.approve_change_queue_item(text,uuid,text) from public,anon;
grant execute on function public.approve_change_queue_item(text,uuid,text) to authenticated;
