-- Guard the displayed expected pax as part of the approval snapshot.
set local lock_timeout='5s';
create or replace function private.oncall_approval_snapshot(r public.manpower_requests)
returns jsonb language sql immutable set search_path = ''
return jsonb_build_object(
  'date_needed',r.date_needed,'date_mode',r.date_mode,'start_date',r.start_date,
  'end_date',r.end_date,'coverage_days',r.coverage_days,'forecasted_pax',r.forecasted_pax,'items',r.items,
  'grand_total',r.grand_total,'general_note',r.general_note,'revision',r.revision,
  'approval_stage',r.approval_stage,'approval_route_step',r.approval_route_step,
  'approval_route_snapshot',r.approval_route_snapshot,'clarification_status',r.clarification_status
);
