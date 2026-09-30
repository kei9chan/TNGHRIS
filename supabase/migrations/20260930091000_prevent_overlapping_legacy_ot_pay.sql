-- Old duplicate approvals may overlap. Keep both historical records, but never
-- permit two positive payable quantities for the same overlapping interval.
do $$declare ddl text;needle text;begin
 ddl:=pg_get_functiondef('public.verify_legacy_ot_hours(jsonb,text)'::regprocedure);
 needle:='if r.final_approved_minutes is not null or r.approved_hours is not null then';
 if strpos(ddl,needle)=0 then raise exception 'Legacy OT verification changed; review overlap guard.';end if;
 ddl:=replace(ddl,needle,$new$
  if n>0 and exists (
   select 1 from public.ot_requests other
   where other.id<>r.id and other.employee_id=r.employee_id and other.status::text='Approved'
    and coalesce(other.final_approved_minutes,round(other.approved_hours*60)::integer,0)>0
    and other.start_time is not null and other.end_time is not null
    and r.start_time is not null and r.end_time is not null
    and (other.date+other.start_time)<(coalesce(r.end_date,r.date+case when r.end_time<r.start_time then 1 else 0 end)+r.end_time)
    and (coalesce(other.end_date,other.date+case when other.end_time<other.start_time then 1 else 0 end)+other.end_time)>(r.date+r.start_time)
  ) then raise exception 'OT interval on % overlaps another verified payable OT request. Verify only one positive amount; mark the duplicate zero or use an authorized correction.',r.date;end if;
  $new$||needle);
 execute ddl;
end $$;
