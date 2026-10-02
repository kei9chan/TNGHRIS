-- Review once within the same locked transaction; retain submission guards and triggers.
create or replace function public.prepare_payroll_attendance_for_calculation(
 p_scope uuid,p_from date,p_to date,p_source_hash text,p_note text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare
 review jsonb;
 package public.payroll_time_packages;
 previous public.payroll_time_packages;
 reason text:=coalesce(nullif(btrim(p_note),''),'Verified attendance handed to payroll through Prepare');
begin
 if auth.uid() is null or not private.payroll_time_permission(p_scope,'finalize') then
 raise exception 'The assigned HR timekeeping finalizer must hand over attendance.' using errcode='42501';end if;
 -- Match save/submit lock ordering to avoid cross-operation deadlocks.
 perform pg_advisory_xact_lock(hashtextextended('payroll-schedule-publication',0));
 perform pg_advisory_xact_lock(hashtextextended(p_scope::text,3));
 if exists(select 1 from private.payroll_attendance_import_reviews
 where scope_id=p_scope and date_from<=p_to and date_to>=p_from
 and status in('pending_hr_manager','pending_bod')) then
 raise exception 'Attendance fixes still await approval. Complete those decisions before calculating payroll.';end if;
 review:=private.payroll_time_review(p_scope,p_from,p_to);
 perform private.payroll_require_ready_time(review->'result',p_to);
 if p_source_hash is distinct from review->>'sourceHash' then
 raise exception 'Time sources changed. Refresh the review first.' using errcode='40001';end if;
 if exists(select 1 from public.payroll_time_packages x
 where x.scope_id=p_scope and x.status='submitted' and x.date_from<=p_to and x.date_to>=p_from
 and (x.date_from<>p_from or x.date_to<>p_to)) then
 raise exception 'This range overlaps another submitted period. Use its exact dates for a linked correction.';end if;
 select * into package from public.payroll_time_packages p
 where p.scope_id=p_scope and p.date_from=p_from and p.date_to=p_to and p.source_hash=p_source_hash for update;
 if package.id is null then
 select * into previous from public.payroll_time_packages p
 where p.scope_id=p_scope and p.date_from=p_from and p.date_to=p_to order by p.version desc limit 1;
 insert into public.payroll_time_packages
 (scope_id,date_from,date_to,version,source_hash,source_snapshot,result,previous_id,created_by,reason)
 values(p_scope,p_from,p_to,coalesce(previous.version,0)+1,p_source_hash,
 review->'source',review->'result',previous.id,private.payroll_actor_id(),reason)
 returning * into package;
 insert into public.payroll_time_audit(scope_id,actor_id,action,record_id,reason)
 values(p_scope,private.payroll_actor_id(),'review_saved',package.id,reason);
 end if;
 if package.status='submitted' then return package.id;end if;
 -- Keep the update transition: immutable-version and schedule-freeze triggers must run.
 update public.payroll_time_packages set status='submitted',submitted_by=private.payroll_actor_id(),submitted_at=now()
 where id=package.id;
 insert into public.payroll_time_audit(scope_id,actor_id,action,record_id,reason)
 values(p_scope,private.payroll_actor_id(),'submitted_to_finance',package.id,package.reason);
 return package.id;
end $$;
revoke all on function public.prepare_payroll_attendance_for_calculation(uuid,date,date,text,text) from public,anon;
grant execute on function public.prepare_payroll_attendance_for_calculation(uuid,date,date,text,text) to authenticated;
