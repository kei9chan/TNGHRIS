do $$declare ddl text;begin
 ddl:=pg_get_functiondef('attendance_issues.apply_punch(uuid)'::regprocedure);
 ddl:=replace(ddl,'for ev in select value from jsonb_array_elements(clean) loop','if (select count(*) from jsonb_array_elements(clean))<>(select count(distinct (x->>''timestamp'')::timestamptz) from jsonb_array_elements(clean) x) then raise exception ''Punch times must be distinct and in chronological order'';end if;
 for ev in select value from jsonb_array_elements(clean) loop');
 ddl:=replace(ddl,'''Approved attendance request ''||p_id||'': ''||r.explanation','left(''Approved attendance request ''||p_id||'': ''||r.explanation,1000)');execute ddl;
 ddl:=pg_get_functiondef('public.submit_attendance_issue(jsonb,uuid,uuid,integer)'::regprocedure);
 ddl:=replace(ddl,'if rid is not null then return rid;end if;','if rid is not null then
 if not exists(select 1 from attendance_issues.requests x where x.id=rid and x.kind=p_data->>''kind'' and x.work_date=(p_data->>''date'')::date and x.explanation=trim(p_data->>''explanation'') and x.category=p_data->>''category'' and x.requested_time is not distinct from nullif(p_data->>''time'','''')::timestamptz and x.attachment is not distinct from nullif(p_data->>''attachment'','''')) then raise exception ''This request was already submitted. Open My Attendance Requests to review the saved report.'';end if;
 return rid;end if;');execute ddl;
end $$;
notify pgrst,'reload schema';
