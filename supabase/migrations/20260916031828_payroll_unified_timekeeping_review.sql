set local lock_timeout='5s';
-- Presentation-only evidence projection. Never changes interpretation, source hashes,
-- original snapshots, approval decisions, or payroll calculations.
create function private.payroll_time_evidence(p_result jsonb,p_source jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare days jsonb;shifts jsonb;events jsonb;leaves jsonb;ots jsonb;rows jsonb;
begin
 select coalesce(jsonb_object_agg(x->>'employeeId'||'/'||(x->>'date'),x->'status'),'{}') into days from jsonb_array_elements(coalesce(p_source->'scheduleDays','[]')) x;
 select coalesce(jsonb_object_agg(s.k,s.v),'{}') into shifts from (select x->>'employeeId'||'/'||(x->>'date') k,jsonb_agg(x order by x->>'start',x->>'id') v from jsonb_array_elements(coalesce(p_source->'shifts','[]')) x group by 1) s;
 select coalesce(jsonb_object_agg(x->>'id',jsonb_build_object('id',x->'id','type',x->'type','timestamp',x->'timestamp','source',x->'source','sessionId',x->'clockSessionId','revision',x->'clockRevision')),'{}') into events from jsonb_array_elements(coalesce(p_source->'events','[]')) x where x->>'id' is not null;
 select coalesce(jsonb_object_agg(x->>'id',jsonb_build_object('id',x->'id','type',x->'type','status',x->'status','startDate',x->'startDate','endDate',x->'endDate','days',x->'days','configurationRequired',x->'configurationRequired')),'{}') into leaves from jsonb_array_elements(coalesce(p_source->'leave','[]')) x;
 select coalesce(jsonb_object_agg(x->>'id',jsonb_build_object('id',x->'id','type',x->'type','status',x->'status','approvedHours',x->'approvedHours','start',x->'start','end',x->'end','reviewRef',x->'reviewRef','configurationRequired',x->'configurationRequired')),'{}') into ots from jsonb_array_elements(coalesce(p_source->'ot','[]')) x;
 select coalesce(jsonb_agg(r||jsonb_build_object('evidence',jsonb_build_object(
   'scheduleStatus',coalesce(days->>k,'unavailable'),'shifts',coalesce(shifts->k,'[]'),
   'punches',coalesce((select jsonb_agg(events->x order by events->x->>'timestamp',x) from jsonb_array_elements_text(coalesce(r->'eventIds','[]')) x where events?x),'[]'),
   'leave',coalesce((select jsonb_agg(leaves->x order by x) from jsonb_array_elements_text(coalesce(r->'leaveIds','[]')) x where leaves?x),'[]'),
   'ot',coalesce((select jsonb_agg(ots->(x->>'id') order by x->>'id') from jsonb_array_elements(coalesce(r->'ot','[]')) x where ots?(x->>'id')),'[]')
  )) order by ordinal),'[]') into rows from jsonb_array_elements(p_result->'rows') with ordinality a(r,ordinal) cross join lateral (select (r->>'employeeId')||'/'||(r->>'date') k) keys;
 return p_result||jsonb_build_object('rows',rows);
end $$;
revoke all on function private.payroll_time_evidence(jsonb,jsonb) from public,anon,authenticated;

-- Only committed test records are shown. Preview rows and duplicate uploads are
-- never evidence. Current employee/BU access is rechecked on every read.
create function payroll_history_private.review_evidence(p_scope uuid,p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not coalesce(private.payroll_time_permission(p_scope,'view'),false) then raise exception 'Scoped timekeeping review access required.' using errcode='42501';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>30 then raise exception 'Choose a cutoff of at most 31 days.';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'batchId',b.id,'employeeId',r.employee_id,'employeeName',h.full_name,'workDate',r.work_date,'kind',r.kind,'payload',r.payload,'sourceRow',r.source_row,'filename',b.filename,'reference',b.reference) order by h.full_name,r.work_date,r.kind,r.source_row,r.id)
 from payroll_history_private.records r join payroll_history_private.batches b on b.id=r.batch_id
 join public.hris_users h on h.id=r.employee_id join public.payroll_access_scopes s on s.id=r.scope_id
 where r.scope_id=p_scope and r.work_date between p_from and p_to and r.mode='test' and b.mode='test' and b.status='imported'
 and h.business_unit_id=s.business_unit_id and public.can_access_hris_user(h.id)),'[]');
end $$;
revoke all on function payroll_history_private.review_evidence(uuid,date,date) from public,anon,authenticated;
create function public.get_payroll_time_test_evidence(p_scope_id uuid,p_date_from date,p_date_to date) returns jsonb
language sql stable security invoker set search_path='' as $$select payroll_history_private.review_evidence(p_scope_id,p_date_from,p_date_to)$$;
revoke all on function public.get_payroll_time_test_evidence(uuid,date,date) from public,anon;
grant execute on function public.get_payroll_time_test_evidence(uuid,date,date),payroll_history_private.review_evidence(uuid,date,date) to authenticated;

-- Fail closed on incomplete results, including calls from old clients.
create function private.payroll_require_ready_time(p_result jsonb,p_to date) returns void
language plpgsql stable set search_path='' as $$
begin
 if coalesce((p_result->>'totalDays')::int,0)<=0 or coalesce((p_result->>'blockedDays')::int,-1)<>0
 or jsonb_typeof(p_result->'rows') is distinct from 'array'
 or jsonb_array_length(p_result->'rows')<>(p_result->>'totalDays')::int
 or exists(select 1 from jsonb_array_elements(p_result->'rows') r where not coalesce((r->>'ready')::boolean,false) or coalesce(jsonb_array_length(r->'issues'),1)<>0)
 or p_to is null or p_to>=(now() at time zone 'Asia/Manila')::date then
  raise exception 'Resolve all attendance blockers and complete the cutoff before saving or submitting a review version.' using errcode='23514';
 end if;
end $$;
revoke all on function private.payroll_require_ready_time(jsonb,date) from public,anon,authenticated;

-- Patch the existing entrypoints, preserving publication locks, scoped duties,
-- stale-source/overlap guards, version links, freezes and audit writes.
do $$declare ddl text;needle text;sig text;begin
 sig:='public.save_payroll_time_package(uuid,date,date,text,text)';ddl:=pg_get_functiondef(sig::regprocedure);
 needle:='review:=private.payroll_time_review(p_scope_id,p_date_from,p_date_to);';
 if strpos(ddl,needle)=0 then raise exception 'Unexpected save function definition';end if;
 execute replace(ddl,needle,needle||E'\n perform private.payroll_require_ready_time(review->''result'',p_date_to);');
 sig:='public.submit_payroll_time_package(uuid)';ddl:=pg_get_functiondef(sig::regprocedure);
 needle:='review:=private.payroll_time_review(p.scope_id,p.date_from,p.date_to);';
 if strpos(ddl,needle)=0 then raise exception 'Unexpected submit function definition';end if;
 execute replace(ddl,needle,needle||E'\n perform private.payroll_require_ready_time(review->''result'',p.date_to);');
 sig:='public.preview_payroll_time(uuid,date,date)';ddl:=pg_get_functiondef(sig::regprocedure);
 needle:='review:=private.payroll_time_review(p_scope_id,p_date_from,p_date_to);';
 if strpos(ddl,needle)=0 then raise exception 'Unexpected preview function definition';end if;
 execute replace(ddl,needle,needle||E'\n review:=review||jsonb_build_object(''result'',private.payroll_time_evidence(review->''result'',review->''source''));');
 sig:='public.get_payroll_time_package(uuid)';ddl:=pg_get_functiondef(sig::regprocedure);
 needle:='''result'',p.result';
 if strpos(ddl,needle)=0 then raise exception 'Unexpected saved package definition';end if;
 execute replace(ddl,needle,'''result'',private.payroll_time_evidence(p.result,p.source_snapshot)');
 sig:='public.get_my_payroll_offset_reviews()';ddl:=pg_get_functiondef(sig::regprocedure);
 needle:='''id'',c.id,''employeeName''';
 if strpos(ddl,needle)=0 then raise exception 'Unexpected offset review definition';end if;
 execute replace(ddl,needle,'''id'',c.id,''employeeId'',c.employee_id,''scopeId'',c.scope_id,''requestId'',c.ot_request_id,''employeeName''');
end $$;

notify pgrst,'reload schema';
