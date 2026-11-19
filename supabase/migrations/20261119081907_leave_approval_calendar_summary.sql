-- Request-scoped summary: reuse the existing approval visibility gate before
-- reading the employee's private credit ledger. No approval or policy changes.
create or replace function public.get_leave_approval_calendar_summary(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 r public.leave_requests; h public.hris_users; today date := (now() at time zone 'Asia/Manila')::date;
 ystart date; yend date; rows jsonb; context jsonb; request_kind text; request_name text;
begin
 if auth.uid() is null then raise exception 'Request unavailable' using errcode='42501'; end if;
 context := public.get_time_approval_progress('leave',p_request_id);
 select * into strict r from public.leave_requests where id=p_request_id;
 select * into strict h from public.hris_users where id=r.employee_id;
 ystart := make_date(extract(year from today)::int,1,1); yend := (ystart+interval '1 year' - interval '1 day')::date;
 perform private.sync_confirmed_leave(r.employee_id,today);
 select name, case when lower(name) like '%vacation%' then 'vacation' when lower(name) like '%sick%' then 'sick' when lower(name) like '%offset%' then 'offset' else 'lwop' end
 into request_name,request_kind from public.leave_types where id=r.leave_type_id;
 with kinds(kind,name) as (values ('sick','Sick leave'),('vacation','Vacation leave'),('offset','Offset leave'),('lwop','Leave without pay')),
 requests as (
  select q.*,case when q.final_classification='lwop' then 'lwop' when lower(t.name) like '%vacation%' then 'vacation' when lower(t.name) like '%sick%' then 'sick' when lower(t.name) like '%offset%' then 'offset' else 'lwop' end kind,
   greatest(0,least(q.end_date,today)-greatest(q.start_date,ystart)+1)::numeric / greatest(1,q.end_date-q.start_date+1) taken_fraction,
   greatest(0,least(q.end_date,yend)-greatest(q.start_date,today+1)+1)::numeric / greatest(1,q.end_date-q.start_date+1) future_fraction,
   greatest(0,least(q.end_date,yend)-greatest(q.start_date,ystart)+1)::numeric / greatest(1,q.end_date-q.start_date+1) year_fraction
  from public.leave_requests q join public.leave_types t on t.id=q.leave_type_id
  where q.employee_id=r.employee_id and q.duplicate_of is null and q.id<>r.id and q.end_date>=ystart and q.start_date<=yend
 ), totals as (
  select k.kind,k.name,
   coalesce(sum(q.duration_days*q.taken_fraction) filter(where q.status='Approved'),0) taken,
   coalesce(sum(q.duration_days*q.future_fraction) filter(where q.status='Approved'),0) booked,
   coalesce(sum(q.duration_days*q.year_fraction) filter(where q.status in ('Pending','PendingGM','PendingBOD')),0) pending
  from kinds k left join requests q on q.kind=k.kind group by k.kind,k.name
 ) select jsonb_agg(jsonb_build_object('kind',kind,'name',name,'taken',round(taken,3),'booked',round(booked,3),'pending',round(pending,3),
  'allowance',case when kind in ('sick','vacation') and h.date_hired is not null then private.confirmed_leave_earned(h.date_hired,today) end,
  'available',case when kind='lwop' then null else private.confirmed_leave_balance(r.employee_id,kind,today) end) order by case kind when 'sick' then 1 when 'vacation' then 2 when 'offset' then 3 else 4 end) into rows from totals;
 return jsonb_build_object('hireDate',h.date_hired,'employmentStatus',h.employment_status,'year',extract(year from today)::int,'asOf',today,'rows',rows,
  'requestKind',request_kind,'requestName',request_name,'requestDays',r.duration_days,'requestStatus',r.status,
  'available',case when request_kind='lwop' then null else private.confirmed_leave_balance(r.employee_id,request_kind,today) end,
  'outsideYear',r.start_date<ystart or r.end_date>yend,
  'prorated',h.date_hired is not null and today<(h.date_hired+interval '1 year')::date,
  'allocationNote',exists(select 1 from public.leave_requests q where q.employee_id=r.employee_id and q.duplicate_of is null and q.end_date>=ystart and q.start_date<=yend and q.duration_days<>q.end_date-q.start_date+1 and q.start_date<>q.end_date and (q.start_date<ystart or q.end_date>yend or (q.start_date<=today and q.end_date>today))));
end $$;
revoke all on function public.get_leave_approval_calendar_summary(uuid) from public,anon;
grant execute on function public.get_leave_approval_calendar_summary(uuid) to authenticated;
