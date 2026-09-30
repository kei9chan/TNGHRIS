-- A spreadsheet may request a duration of extra work without asserting an
-- exact interval. Existing OT decisions remain separate from attendance.
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$
declare ddl text;
begin
 ddl:=pg_get_functiondef('private.attendance_pay_requests(uuid,jsonb,uuid)'::regprocedure);
 if strpos(ddl,$old$if qty is null or qty<=0 or qty>24 or qty='NaN'::numeric or beg is null or fin is null or fin<=beg or qty*3600>extract(epoch from(fin-beg)) or length(btrim(coalesce(r->>'otReason','')))<1 then raise exception 'OT requires hours, start/end and a reason; hours must fit the interval.';end if;$old$)=0 then raise exception 'Attendance OT validator changed; review this migration.';end if;
 ddl:=replace(ddl,$old$if qty is null or qty<=0 or qty>24 or qty='NaN'::numeric or beg is null or fin is null or fin<=beg or qty*3600>extract(epoch from(fin-beg)) or length(btrim(coalesce(r->>'otReason','')))<1 then raise exception 'OT requires hours, start/end and a reason; hours must fit the interval.';end if;$old$,
 $new$if qty is null or qty<=0 or qty>24 or qty='NaN'::numeric or round(qty*60)<>qty*60 or length(btrim(coalesce(r->>'otReason','')))<1 then raise exception 'OT requires requested extra-work hours in whole minutes and a reason.';end if;
     if (beg is null)<>(fin is null) then raise exception 'Enter both OT times or leave both blank for duration-only manual OT.';end if;
     if beg is not null and (fin<=beg or qty*3600>extract(epoch from(fin-beg))) then raise exception 'Requested hours exceed the optional OT interval.';end if;$new$);
 ddl:=replace(ddl,$old$if (beg at time zone 'Asia/Manila')::date<>d or (fin at time zone 'Asia/Manila')::date not in(d,d+1) or fin-beg>=interval '24 hours' then raise exception 'OT must start on the work date and end within the next 24 hours.';end if;$old$,
 $new$if beg is not null and ((beg at time zone 'Asia/Manila')::date<>d or (fin at time zone 'Asia/Manila')::date not in(d,d+1) or fin-beg>=interval '24 hours') then raise exception 'OT must start on the work date and end within the next 24 hours.';end if;$new$);
 ddl:=replace(ddl,$old$and start_time=(beg at time zone 'Asia/Manila')::time and end_time=(fin at time zone 'Asia/Manila')::time;$old$,
 $new$and ((beg is null and start_time is null and end_time is null and private.ot_requested_minutes(ot_requests)=round(qty*60)::integer and lower(btrim(reason))=lower(btrim(r->>'otReason'))) or (beg is not null and start_time=(beg at time zone 'Asia/Manila')::time and end_time=(fin at time zone 'Asia/Manila')::time));$new$);
 ddl:=replace(ddl,$old$if source is null and exists(select 1 from public.ot_requests where employee_id=e.id and date=d and status::text not in('Rejected','Cancelled')) then raise exception 'Existing OT on this date has different times. Review that request instead of creating a duplicate.';end if;$old$,
 $new$if source is null and exists(select 1 from public.ot_requests where employee_id=e.id and date=d and status::text not in('Rejected','Cancelled')) then raise exception 'An OT request already exists on this date with different evidence or hours. Review that request; no duplicate will be created.';end if;$new$);
 ddl:=replace(ddl,$old$values(e.id,e.full_name,d,(beg at time zone 'Asia/Manila')::time,(fin at time zone 'Asia/Manila')::time,qty,r->>'otReason','Submitted',now(),bu,e.department_id,'Paid',$old$,
 $new$values(e.id,e.full_name,d,(beg at time zone 'Asia/Manila')::time,(fin at time zone 'Asia/Manila')::time,qty,r->>'otReason','Submitted',now(),bu,e.department_id,'Paid',$new$);
 if strpos(ddl,$old$case r->>'classification' when 'Rest day'$old$)=0 then raise exception 'Attendance OT insert changed.';end if;
 -- The manual OT guard fills requested_minutes from hours and keeps the
 -- original uploaded row in history_log; no punch-derived OT is authorized.
 execute ddl;
end $$;
