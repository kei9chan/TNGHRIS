-- A legacy Approved status without an approved quantity is not zero OT.
-- Retain the record and surface one precise employee-week review task.
alter function private.ot_week_summary(uuid,date) rename to ot_week_summary_before_quantity_guard;
create function private.ot_week_summary(p_employee uuid,p_date date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;missing jsonb;approved_missing integer;reviewed_missing integer;
begin
 result:=private.ot_week_summary_before_quantity_guard(p_employee,p_date);
 select coalesce(jsonb_agg(r.id order by r.date,r.id),'[]'),count(*) filter(where r.status::text='Approved'),count(*) filter(where r.status::text='PendingBOD') into missing,approved_missing,reviewed_missing
 from public.ot_requests r where r.employee_id=p_employee and r.date between date_trunc('week',p_date)::date and date_trunc('week',p_date)::date+6
 and ((r.status::text='Approved' and r.final_approved_minutes is null and r.approved_hours is null) or (r.status::text='PendingBOD' and r.manager_confirmed_minutes is null and r.approved_hours is null));
 result:=result||jsonb_build_object('quantitiesMissing',jsonb_array_length(missing)>0,'quantityIssueIds',missing,'knownApprovedMinutes',result->'approvedMinutes','knownReviewedMinutes',result->'reviewedMinutes');
 if jsonb_array_length(missing)>0 then
 result:=result||jsonb_build_object('projectedMinutes',null,'totalWeekHours',null,'weekOtHours',null,'requiresBod',null,'approvedMinutes',case when approved_missing>0 then null else (result->>'approvedMinutes')::integer end,'reviewedMinutes',case when reviewed_missing>0 then null else (result->>'reviewedMinutes')::integer end,'reason',format('%s older approved or escalated requests have no recorded approved quantity. Review their approved hours before using a weekly total.',jsonb_array_length(missing)));
 end if;
 return result;
end $$;
revoke all on function private.ot_week_summary(uuid,date),private.ot_week_summary_before_quantity_guard(uuid,date) from public,anon,authenticated;

do $$declare ddl text;needle text;begin
 ddl:=pg_get_functiondef('public.decide_ot_week(uuid[],jsonb,text,uuid,text,text)'::regprocedure);
 needle:=$old$if (summary->>'baselineMissing')::boolean then$old$;
 if strpos(ddl,needle)=0 then raise exception 'Manual OT review changed. Inspect quantity guard integration.';end if;
 ddl:=replace(ddl,needle,$new$if coalesce((summary->>'quantitiesMissing')::boolean,false) and first_row.status::text='PendingBOD' then raise exception 'Older approved requests in this week have no recorded approved hours. HR must reconcile those records; no total or approval was guessed.';end if;
 if (summary->>'baselineMissing')::boolean or coalesce((summary->>'quantitiesMissing')::boolean,false) then$new$);
 ddl:=replace(ddl,$old$outcome:=jsonb_build_object('reviewed',cardinality(p_ids),'baselineNeeded',true);$old$,$new$outcome:=jsonb_build_object('reviewed',cardinality(p_ids),'baselineNeeded',(summary->>'baselineMissing')::boolean,'quantityReviewNeeded',coalesce((summary->>'quantitiesMissing')::boolean,false));$new$);
 execute ddl;
end $$;
notify pgrst,'reload schema';
