-- Keep approval on the canonical, assignment-aware on-call workflow. The old
-- generic manpower bulk branch predates this route and must not be used here.
create function private.oncall_approval_snapshot(r public.manpower_requests)
returns jsonb language sql immutable set search_path = ''
return jsonb_build_object(
  'date_needed',r.date_needed,'date_mode',r.date_mode,'start_date',r.start_date,
  'end_date',r.end_date,'coverage_days',r.coverage_days,'items',r.items,
  'grand_total',r.grand_total,'general_note',r.general_note,'revision',r.revision,
  'approval_stage',r.approval_stage,'approval_route_step',r.approval_route_step,
  'approval_route_snapshot',r.approval_route_snapshot,'clarification_status',r.clarification_status
);
revoke all on function private.oncall_approval_snapshot(public.manpower_requests) from public,anon,authenticated;

create function private.approve_oncall_queue_item(p_request_id uuid,p_expected_snapshot jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid:=public.current_hris_user_id();r public.manpower_requests;decision jsonb;
begin
  if auth.uid() is null or actor is null then
    raise exception 'Authentication is required.' using errcode='42501';
  end if;
  if p_expected_snapshot is null then
    raise exception 'Refresh this on-call request before approving it.' using errcode='22023';
  end if;
  select * into r from public.manpower_requests where id=p_request_id for update;
  if r.id is null or r.status<>'Pending' or r.requester_id=actor
     or r.clarification_status='requested' or nullif(trim(r.approval_issue),'') is not null
     or private.oncall_approval_snapshot(r) is distinct from p_expected_snapshot
     or not exists(select 1 from public.manpower_request_approval_assignments a
                   where a.request_id=r.id and a.approver_user_id=actor
                     and a.approval_stage=r.approval_stage and a.status='Pending') then
    return jsonb_build_object('outcome','skipped','reason',
      'Request changed, needs review, or is no longer awaiting your approval. Refresh to review it.');
  end if;
  -- This function owns route progression, pool cleanup, daily records, audit
  -- history and notifications. Its request lock is already held above.
  decision:=public.process_manpower_request_approval(p_request_id,'approve',null);
  return jsonb_build_object('outcome','approved','status',decision->>'status','approvalStage',decision->>'approvalStage');
end;
$$;
revoke all on function private.approve_oncall_queue_item(uuid,jsonb) from public,anon;
grant execute on function private.approve_oncall_queue_item(uuid,jsonb) to authenticated;

create function public.approve_oncall_queue_item(p_request_id uuid,p_expected_snapshot jsonb)
returns jsonb language sql security invoker set search_path = ''
return private.approve_oncall_queue_item(p_request_id,p_expected_snapshot);
revoke all on function public.approve_oncall_queue_item(uuid,jsonb) from public,anon;
grant execute on function public.approve_oncall_queue_item(uuid,jsonb) to authenticated;
