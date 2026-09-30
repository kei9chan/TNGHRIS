-- Reuse the existing engine constants; do not treat a missing optional override as missing policy.
-- This leaves holiday coverage, leave, offset, split-shift and all pay authorizations intact.
alter function private.interpret_payroll_time(jsonb,date,date) rename to interpret_payroll_time_before_standing_defaults;
create function private.interpret_payroll_time(p_source jsonb,p_from date,p_to date) returns jsonb
language plpgsql immutable set search_path='' as $$
begin
 p_source:=jsonb_set(p_source,'{rules}',coalesce(p_source->'rules','[]')||jsonb_build_array(jsonb_build_object(
  'id','existing-standard-time-settings','revision',0,'effective_from','0001-01-01','effective_to','9999-12-31',
  'source_ref','Existing TNG engine constants; explicit reviewed overrides take precedence',
  'config',jsonb_build_object('graceMinutes',5,'unpaidLunchMinutes',60,'minimumOtMinutes',60,'timezone','Asia/Manila','holidayCoverageConfirmed',false,'splitShiftConfirmed',false,'restTemplates','[]'::jsonb,'meals','{}'::jsonb))));
 return private.interpret_payroll_time_before_standing_defaults(p_source,p_from,p_to);
end $$;
revoke all on function private.interpret_payroll_time(jsonb,date,date),private.interpret_payroll_time_before_standing_defaults(jsonb,date,date) from public,anon,authenticated;

-- Lightweight, scoped reviewer inbox. Hash each cutoff once, not once per employee/date.
create function public.get_payroll_break_review_inbox() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare answer jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in to view approvals.' using errcode='42501';end if;
 with actionable as materialized (
  select b.* from private.payroll_break_reviews b
  where b.submitted_by<>auth.uid() and b.hr_by is distinct from auth.uid()
   and ((b.status='pending_hr_manager' and public.has_active_role('HR Manager')) or (b.status='pending_bod' and public.has_active_role('Board of Director')))
   and private.actual_attendance_access(b.scope_id)
 ), scopes as materialized (select distinct scope_id,date_from,date_to from actionable),
 hashes as materialized (select s.*,md5(private.payroll_time_sources_before_break_review(scope_id,date_from,date_to)::text) hash from scopes s)
 select coalesce(jsonb_agg(to_jsonb(b)||jsonb_build_object('scopeName',s.name,'submitter',u.full_name,'hrName',h.full_name,'canAct',true,'stale',b.source_hash<>v.hash) order by b.submitted_at),'[]') into answer
 from actionable b join hashes v using(scope_id,date_from,date_to)
 join public.payroll_access_scopes s on s.id=b.scope_id
 left join public.hris_users u on u.auth_user_id=b.submitted_by
 left join public.hris_users h on h.auth_user_id=b.hr_by;
 return answer;
end $$;
revoke all on function public.get_payroll_break_review_inbox() from public,anon;
grant execute on function public.get_payroll_break_review_inbox() to authenticated;
notify pgrst,'reload schema';
