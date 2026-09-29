-- One upload can stage attendance and create separate, normally routed pay requests.
-- These links do not confer approval or change approved quantities.
set local lock_timeout='5s';
set local statement_timeout='30s';
create table private.payroll_attendance_pay_requests(
 review_id uuid not null references private.payroll_attendance_import_reviews(id),
 employee_id uuid not null references public.hris_users(id),work_date date not null,
 kind text not null check(kind in('overtime','leave')),request_id uuid not null,
 requested_quantity numeric not null,created_at timestamptz not null default now(),
 primary key(review_id,employee_id,work_date,kind)
);
alter table private.payroll_attendance_pay_requests enable row level security;
revoke all on private.payroll_attendance_pay_requests from public,anon,authenticated;

create function private.attendance_pay_requests(p_scope uuid,p_rows jsonb,p_review uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;e public.hris_users;bu uuid;d date;qty numeric;beg timestamptz;fin timestamptz;
 source uuid;state text;manager uuid;lt uuid;result jsonb:='[]';item jsonb;failure text;kind text;count_match int;
begin
 if auth.uid() is null or not private.actual_attendance_access(p_scope) then raise exception 'Scoped attendance access required.' using errcode='42501';end if;
 select business_unit_id into bu from public.payroll_access_scopes where id=p_scope;
 if p_review is not null and not exists(select 1 from private.payroll_attendance_import_reviews where id=p_review and scope_id=p_scope and submitted_by=auth.uid() and rows=p_rows and status in('pending_hr_manager','pending_bod')) then raise exception 'The reviewed attendance batch does not match.';end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  select * into e from public.hris_users where employee_id=r->>'employeeId' and business_unit_id=bu and not coalesce(is_duplicate,false);
  for kind in select unnest(array['overtime','leave']) loop
   if (kind='overtime' and nullif(r->>'requestedOtHours','') is null) or (kind='leave' and nullif(r->>'leaveType','') is null) then continue;end if;
   source:=null;failure:=null;state:=null;qty:=null;manager:=null;
   begin
    d:=(r->>'workDate')::date;
    if e.id is null or e.date_hired is null or d<e.date_hired or d>coalesce(e.end_date,d) then raise exception 'Employee or employment date is invalid.';end if;
    if p_review is not null then perform pg_advisory_xact_lock(hashtextextended('attendance-pay-request:'||e.id::text||':'||d::text,0));end if;
    manager:=private.resolve_direct_manager_id(e.id);
    if kind='overtime' then
     qty:=(r->>'requestedOtHours')::numeric;beg:=(r->>'otStart')::timestamptz;fin:=(r->>'otEnd')::timestamptz;
     if qty is null or qty<=0 or qty>24 or qty='NaN'::numeric or beg is null or fin is null or fin<=beg or qty*3600>extract(epoch from(fin-beg)) or length(btrim(coalesce(r->>'otReason','')))<1 then raise exception 'OT requires hours, start/end and a reason; hours must fit the interval.';end if;
     if (beg at time zone 'Asia/Manila')::date<>d or (fin at time zone 'Asia/Manila')::date not in(d,d+1) or fin-beg>=interval '24 hours' then raise exception 'OT must start on the work date and end within the next 24 hours.';end if;
     select count(*),min(id::text)::uuid into count_match,source from public.ot_requests where employee_id=e.id and date=d and status::text not in('Rejected','Cancelled')
      and start_time=(beg at time zone 'Asia/Manila')::time and end_time=(fin at time zone 'Asia/Manila')::time;
     if count_match>1 then raise exception 'Multiple existing OT requests match. Resolve the duplicates in Overtime Requests.';end if;
     if source is null and exists(select 1 from public.ot_requests where employee_id=e.id and date=d and status::text not in('Rejected','Cancelled')) then raise exception 'Existing OT on this date has different times. Review that request instead of creating a duplicate.';end if;
     if source is null and manager is null then raise exception 'No active direct manager is configured. HR must set the reporting manager.';end if;
     if source is null and p_review is not null then
      insert into public.ot_requests(employee_id,employee_name,date,start_time,end_time,hours,reason,status,submitted_at,business_unit_id,department_id,ot_type,paid_ot_type,history_log)
      values(e.id,e.full_name,d,(beg at time zone 'Asia/Manila')::time,(fin at time zone 'Asia/Manila')::time,qty,r->>'otReason','Submitted',now(),bu,e.department_id,'Paid',
       case r->>'classification' when 'Rest day' then 'Rest Day' when 'Regular holiday' then 'Legal Holiday' when 'Special nonworking day' then 'Special Holiday' else 'Regular Overtime' end,
       jsonb_build_array(jsonb_build_object('action','Imported for manager approval','userId',public.current_hris_user_id(),'timestamp',now(),'attendanceReviewId',p_review,'requestedHours',qty,'details',r))) returning id into source;
     end if;
     select status::text into state from public.ot_requests where id=source;
    else
     qty:=(r->>'leaveDays')::numeric;
     select id into lt from public.leave_types where lower(name)=lower(r->>'leaveType');
     if lt is null or qty is null or qty<=0 or qty>1 or qty='NaN'::numeric or length(btrim(coalesce(r->>'leaveReason','')))<1 then raise exception 'Leave needs a configured type, quantity (0–1 day) and reason.';end if;
     if qty<1 and (nullif(r->>'leaveStart','') is null or nullif(r->>'leaveEnd','') is null or (r->>'leaveStart')::time >= (r->>'leaveEnd')::time) then raise exception 'Partial leave requires start and end times.';end if;
     select count(*),min(id::text)::uuid into count_match,source from public.leave_requests where employee_id=e.id and start_date<=d and end_date>=d and status::text not in('Rejected','Cancelled');
     if count_match>1 then raise exception 'Multiple leave requests overlap this date. Resolve the source requests.';end if;
     if source is not null and not exists(select 1 from public.leave_requests where id=source and leave_type_id=lt and (start_date<end_date or duration_days=qty) and coalesce(start_time,'')=coalesce(r->>'leaveStart','') and coalesce(end_time,'')=coalesce(r->>'leaveEnd','')) then raise exception 'Existing leave differs in type or duration. Review that request instead of creating a duplicate.';end if;
     if source is null and manager is null then raise exception 'No active direct manager is configured. HR must set the reporting manager.';end if;
     if source is null and p_review is not null then
      insert into public.leave_requests(employee_id,employee_name,leave_type_id,selected_leave_type_id,selected_leave_type,start_date,end_date,start_time,end_time,duration_days,reason,status,business_unit_id,department_id,history_log)
      values(e.id,e.full_name,lt,lt,r->>'leaveType',d,d,nullif(r->>'leaveStart',''),nullif(r->>'leaveEnd',''),qty,r->>'leaveReason','Pending',bu,e.department_id,
       jsonb_build_array(jsonb_build_object('action','Imported for manager approval','userId',public.current_hris_user_id(),'timestamp',now(),'attendanceReviewId',p_review,'details',r))) returning id into source;
     end if;
     select status::text into state from public.leave_requests where id=source;
    end if;
    if p_review is not null then insert into private.payroll_attendance_pay_requests(review_id,employee_id,work_date,kind,request_id,requested_quantity) values(p_review,e.id,d,kind,source,qty) on conflict do nothing;end if;
   exception when others then
    if p_review is not null then raise exception 'Row % — %: %',r->>'sourceRow',kind,sqlerrm;end if;
    failure:=sqlerrm;
   end;
   item:=jsonb_build_object('row',r->'sourceRow','employee',e.full_name,'employeeId',e.id,'date',r->>'workDate','kind',kind,'quantity',qty,'requestId',source,'status',coalesce(state,'Will be sent to direct manager'),'manager',(select full_name from public.hris_users where id=manager),'error',failure);
   result:=result||jsonb_build_array(item);
  end loop;
 end loop;
 return result;
end $$;
revoke all on function private.attendance_pay_requests(uuid,jsonb,uuid) from public,anon,authenticated;

-- Extend preview and submission without changing attendance approval authority.
do $$
declare ddl text;needle text;
begin
 ddl:=pg_get_functiondef('public.import_actual_attendance(uuid,date,date,text,jsonb,boolean)'::regprocedure);
 execute replace(ddl,'FUNCTION public.import_actual_attendance(','FUNCTION private.import_actual_attendance_before_pay_requests(');
 ddl:=pg_get_functiondef('public.submit_actual_attendance_import(uuid,date,date,text,jsonb,jsonb,text)'::regprocedure);
 needle:='v_preview:=private.import_actual_attendance_core(p_scope,p_from,p_to,p_filename,p_rows,false);';
 if strpos(ddl,needle)=0 then raise exception 'Unexpected attendance submission function.';end if;
 ddl:=replace(ddl,needle,needle||E'\n perform private.attendance_pay_requests(p_scope,p_rows,null);');
 needle:='values(v_review.id,auth.uid(),''submitted'');';
 if strpos(ddl,needle)=0 then raise exception 'Unexpected attendance audit function.';end if;
 ddl:=replace(ddl,needle,needle||E'\n perform private.attendance_pay_requests(p_scope,p_rows,v_review.id);');
 execute ddl;
 ddl:=pg_get_functiondef('public.get_actual_attendance_import_reviews(uuid,date,date)'::regprocedure);
 execute replace(ddl,'FUNCTION public.get_actual_attendance_import_reviews(','FUNCTION private.attendance_reviews_before_pay_requests(');
end $$;
revoke all on function private.import_actual_attendance_before_pay_requests(uuid,date,date,text,jsonb,boolean),private.attendance_reviews_before_pay_requests(uuid,date,date) from public,anon,authenticated;
create or replace function public.import_actual_attendance(p_scope uuid,p_from date,p_to date,p_filename text,p_rows jsonb,p_confirm boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;decisions jsonb;
begin
 if p_confirm then return public.submit_actual_attendance_import(p_scope,p_from,p_to,p_filename,p_rows,null,null);end if;
 result:=private.import_actual_attendance_before_pay_requests(p_scope,p_from,p_to,p_filename,p_rows,false);
 decisions:=private.attendance_pay_requests(p_scope,p_rows,null);
 return result||jsonb_build_object('payDecisions',decisions,'errors',coalesce(result->'errors','[]')||(select coalesce(jsonb_agg(jsonb_build_object('row',x->'row','message',(x->>'kind')||': '||(x->>'error'))),'[]') from jsonb_array_elements(decisions)x where x->>'error' is not null));
end $$;
create or replace function public.get_actual_attendance_import_reviews(p_scope uuid,p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 result:=private.attendance_reviews_before_pay_requests(p_scope,p_from,p_to);
 return (select coalesce(jsonb_agg(r||jsonb_build_object('payDecisions',(select coalesce(jsonb_agg(jsonb_build_object('kind',l.kind,'requestId',l.request_id,'employee',h.full_name,'date',l.work_date,'quantity',l.requested_quantity,'status',case when l.kind='overtime' then o.status::text else q.status::text end,'approvedHours',o.approved_hours,'manager',m.full_name)),'[]')
 from private.payroll_attendance_pay_requests l join public.hris_users h on h.id=l.employee_id
 left join public.ot_requests o on l.kind='overtime' and o.id=l.request_id left join public.leave_requests q on l.kind='leave' and q.id=l.request_id
 left join public.hris_users m on m.id=coalesce(o.direct_manager_id,q.direct_manager_id)
 where l.review_id=(r->>'id')::uuid))),'[]') from jsonb_array_elements(result)r);
end $$;
notify pgrst,'reload schema';
