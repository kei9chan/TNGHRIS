-- Existing deployed entrypoints captured before Phase 3; synthetic dependencies
-- are supplied by timekeepingReviewTest.mjs. No employee data is stored here.
CREATE OR REPLACE FUNCTION public.get_payroll_time_package(p_package_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.payroll_time_packages;review jsonb;begin
 select * into strict p from public.payroll_time_packages where id=p_package_id;
 if not private.payroll_time_permission(p.scope_id,'view') then raise exception 'Timekeeping package access denied.' using errcode='42501';end if;
 review:=private.payroll_time_review(p.scope_id,p.date_from,p.date_to);
 return jsonb_build_object('id',p.id,'version',p.version,'status',p.status,'result',p.result,'previousId',p.previous_id,'current',p.source_hash=review->>'sourceHash','dateFrom',p.date_from,'dateTo',p.date_to,'reason',p.reason);
end $function$;

CREATE OR REPLACE FUNCTION public.preview_payroll_time(p_scope_id uuid, p_date_from date, p_date_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare review jsonb;begin
 if not private.payroll_time_permission(p_scope_id,'view') then raise exception 'A scoped timekeeping/payroll duty and existing Timekeeping access are required.' using errcode='42501';end if;
 review:=private.payroll_time_review(p_scope_id,p_date_from,p_date_to);
 return (review-'source')||jsonb_build_object('holidays',review#>'{source,holidays}','rules',review#>'{source,rules}','templates',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'start',t.start_time,'end',t.end_time) order by t.name) from public.shift_templates t join public.payroll_access_scopes s on (s.business_unit_id=t.business_unit_id or t.business_unit_id is null) where s.id=p_scope_id and private.schedule_preset_visible(t.created_by)),'[]'),
 'packages',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'version',p.version,'status',p.status,'createdAt',p.created_at,'submittedAt',p.submitted_at,'reason',p.reason,'previousId',p.previous_id,'current',p.source_hash=review->>'sourceHash','blockedDays',p.result->'blockedDays') order by p.version desc) from public.payroll_time_packages p where p.scope_id=p_scope_id and p.date_from=p_date_from and p.date_to=p_date_to),'[]'));
end $function$;

CREATE OR REPLACE FUNCTION public.save_payroll_time_package(p_scope_id uuid, p_date_from date, p_date_to date, p_source_hash text, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare review jsonb;id uuid;previous public.payroll_time_packages;begin
 perform pg_advisory_xact_lock(hashtextextended('payroll-schedule-publication',0));
 if not private.payroll_time_permission(p_scope_id,'finalize') then raise exception 'Finalize and submit timekeeping duty is required.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_scope_id::text,3));
 review:=private.payroll_time_review(p_scope_id,p_date_from,p_date_to);
 if p_source_hash is distinct from review->>'sourceHash' then raise exception 'Time sources changed. Refresh the review first.' using errcode='40001';end if;
 select p.id into id from public.payroll_time_packages p where p.scope_id=p_scope_id and p.date_from=p_date_from and p.date_to=p_date_to and p.source_hash=p_source_hash;if id is not null then return id;end if;
 select * into previous from public.payroll_time_packages p where p.scope_id=p_scope_id and p.date_from=p_date_from and p.date_to=p_date_to order by p.version desc limit 1;
 insert into public.payroll_time_packages(scope_id,date_from,date_to,version,source_hash,source_snapshot,result,previous_id,created_by,reason)
 values(p_scope_id,p_date_from,p_date_to,coalesce(previous.version,0)+1,p_source_hash,review->'source',review->'result',previous.id,private.payroll_actor_id(),p_reason) returning payroll_time_packages.id into id;
 insert into public.payroll_time_audit(scope_id,actor_id,action,record_id,reason) values(p_scope_id,private.payroll_actor_id(),'review_saved',id,p_reason);return id;
end $function$;

CREATE OR REPLACE FUNCTION public.submit_payroll_time_package(p_package_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.payroll_time_packages;review jsonb;begin
 perform pg_advisory_xact_lock(hashtextextended('payroll-schedule-publication',0));
 select * into strict p from public.payroll_time_packages where id=p_package_id for update;
 if not private.payroll_time_permission(p.scope_id,'finalize') then raise exception 'Finalize and submit timekeeping duty is required.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p.scope_id::text,3));review:=private.payroll_time_review(p.scope_id,p.date_from,p.date_to);
 if p.source_hash is distinct from review->>'sourceHash' then raise exception 'Submitted inputs changed. Save a linked new version.' using errcode='40001';end if;
 if (review#>>'{result,totalDays}')::int=0 or (review#>>'{result,blockedDays}')::int>0 or p.date_to>=(now() at time zone 'Asia/Manila')::date then raise exception 'Resolve the listed blockers and complete the period before submission.';end if;
 if exists(select 1 from public.payroll_time_packages x where x.scope_id=p.scope_id and x.status='submitted' and x.date_from<=p.date_to and x.date_to>=p.date_from and (x.date_from<>p.date_from or x.date_to<>p.date_to)) then raise exception 'This range overlaps another submitted period. Use its exact dates for a linked correction.';end if;
 if p.status='submitted' then return;end if;
 update public.payroll_time_packages set status='submitted',submitted_by=private.payroll_actor_id(),submitted_at=now() where id=p.id;
 insert into public.payroll_time_audit(scope_id,actor_id,action,record_id,reason) values(p.scope_id,private.payroll_actor_id(),'submitted_to_finance',p.id,p.reason);
end $function$;
