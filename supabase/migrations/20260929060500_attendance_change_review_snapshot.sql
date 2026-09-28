-- Show the exact payroll-effective attendance being replaced and reject a stale
-- final approval. The original imported file and raw clock evidence stay intact.
set local lock_timeout = '5s';
set local statement_timeout = '30s';
alter table private.payroll_attendance_import_reviews add column source_bytes bytea, add column source_md5 text;

create function private.payroll_attendance_import_changes(p_scope uuid,p_rows jsonb)
returns jsonb language sql stable security definer set search_path='' as $function$
 with incoming as (
  select x.value item,x.ordinality ordinal,
    h.id employee_id,h.full_name employee_name,(x.value->>'workDate')::date work_date
  from jsonb_array_elements(p_rows) with ordinality x(value,ordinality)
  left join public.payroll_access_scopes s on s.id=p_scope
  left join public.hris_users h on h.employee_id=x.value->>'employeeId' and h.business_unit_id=s.business_unit_id
 ), prior as (
  select i.*,a.day_status prior_status,a.events prior_events,a.batch_id prior_batch,
    coalesce((select jsonb_agg(jsonb_build_object('type',t.type,'timestamp',t.timestamp) order by t.timestamp,t.id)
      from public.time_events t where t.employee_id=i.employee_id
        and (t.timestamp at time zone 'Asia/Manila')::date=i.work_date),'[]'::jsonb) raw_events,
    private.schedule_day_status(i.employee_id,i.work_date)->>'tag' roster_tag,
    private.attendance_schedule(i.employee_id,i.work_date) published_roster,
    (select string_agg(hd.type,', ' order by hd.type) from public.holidays hd where hd.date=i.work_date) holiday_kind
  from incoming i left join private.payroll_actual_days a
    on a.scope_id=p_scope and a.employee_id=i.employee_id and a.work_date=i.work_date
 )
 select coalesce(jsonb_agg(jsonb_build_object(
  'row',coalesce((p.item->>'sourceRow')::integer,p.ordinal::integer+1),
  'employeeId',p.item->>'employeeId','employee',p.employee_name,'workDate',p.work_date,
  'beforeStatus',coalesce(p.prior_status,case when p.raw_events<>'[]'::jsonb then 'Recorded punches' else 'No selected attendance' end),
  'beforeEvents',coalesce(p.prior_events,p.raw_events),
  'beforeSource',case when p.prior_batch is not null then 'Previous approved import' when p.raw_events<>'[]'::jsonb then 'Raw clock evidence' else 'No prior punches' end,
  'afterStatus',coalesce(p.item->>'classification',p.item->>'dayStatus'),'afterEvents',p.item->'events',
  'reference',coalesce(p.item->>'reference',''),
  'reviewRequest',coalesce(p.item->>'reviewRequest','None'),
  'reviewExplanation',coalesce(nullif(p.item->>'reviewExplanation',''),p.item->>'notes',''),
  'rosterTag',p.roster_tag,'rosterPublished',p.published_roster->'published',
  'rosterPublicationId',p.published_roster->'publicationId','rosterVersion',p.published_roster->'version',
  'holidayKind',p.holiday_kind
 ) order by p.ordinal),'[]'::jsonb) from prior p;
$function$;
revoke all on function private.payroll_attendance_import_changes(uuid,jsonb) from public,anon,authenticated;

create or replace function public.import_actual_attendance(p_scope uuid,p_from date,p_to date,p_filename text,p_rows jsonb,p_confirm boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_preview jsonb;
begin
 if p_confirm then return public.submit_actual_attendance_import(p_scope,p_from,p_to,p_filename,p_rows,null,null);end if;
 v_preview:=private.import_actual_attendance_core(p_scope,p_from,p_to,p_filename,p_rows,false);
 if jsonb_array_length(coalesce(v_preview->'errors','[]'::jsonb))=0 and coalesce((v_preview->>'ready')::integer,0)>0 then
  v_preview:=v_preview||jsonb_build_object('changes',private.payroll_attendance_import_changes(p_scope,p_rows));
 end if;
 return v_preview;
end $function$;

do $migration$
declare ddl text; old_fragment text; new_fragment text;
begin
 ddl:=pg_get_functiondef('private.import_actual_attendance_core(uuid,date,date,text,jsonb,boolean)'::regprocedure);
 old_fragment:='  if day_status=''Rest day'' and not (';
 new_fragment:='  if day_status=''Rest day'' and not coalesce((private.attendance_schedule(e.id,d)->>''published'')::boolean,false) then raise exception ''Published rest-day roster missing for this employee and date. Check business unit, publication version and approval state in Schedule Builder.'';end if;'||chr(10)||old_fragment;
 if strpos(ddl,old_fragment)=0 then raise exception 'Rest-day validation changed; review published roster migration.';end if;
 ddl:=replace(ddl,old_fragment,new_fragment);
 old_fragment:='  if day_status=''Legal holiday'' and not exists(';
 new_fragment:='  if r->>''classification''=''Regular holiday'' and not exists(select 1 from public.holidays h where h.date=d and lower(h.type) in(''regular'',''regular holiday'',''legal'',''legal holiday'')) then raise exception ''Regular holiday does not match the approved calendar for this date.'';end if;'||chr(10)||
  '  if r->>''classification''=''Special nonworking day'' and not exists(select 1 from public.holidays h where h.date=d and lower(h.type) in(''special non-working'',''special non-working day'',''special_nonworking'')) then raise exception ''Special nonworking day does not match the approved calendar for this date.'';end if;'||chr(10)||old_fragment;
 if strpos(ddl,old_fragment)=0 then raise exception 'Attendance validation changed; review holiday classification migration.';end if;
 execute replace(ddl,old_fragment,new_fragment);

 ddl:=pg_get_functiondef('public.submit_actual_attendance_import(uuid,date,date,text,jsonb,jsonb,text)'::regprocedure);
 old_fragment:=' v_fingerprint:=md5(p_rows::text||coalesce(p_rules::text,'''')||coalesce(p_rule_reference,''''));';
 new_fragment:=' v_preview:=v_preview||jsonb_build_object(''changes'',private.payroll_attendance_import_changes(p_scope,p_rows));'||chr(10)||old_fragment;
 if strpos(ddl,old_fragment)=0 then raise exception 'Attendance submission changed; review snapshot migration.';end if;
 execute replace(ddl,old_fragment,new_fragment);

 ddl:=pg_get_functiondef('public.get_actual_attendance_import_reviews(uuid,date,date)'::regprocedure);
 old_fragment:='to_jsonb(r)-''rows''-''fingerprint''';
 new_fragment:='to_jsonb(r)-''rows''-''fingerprint''-''source_bytes''';
 if strpos(ddl,old_fragment)=0 then raise exception 'Attendance review exposure changed; review source-file migration.';end if;
 ddl:=replace(ddl,old_fragment,new_fragment);
 old_fragment:='  ''submitted_by_name'',(select h.full_name from public.hris_users h where h.auth_user_id=r.submitted_by),';
 new_fragment:='  ''preview'',r.preview||jsonb_build_object(''changes'',coalesce(r.preview->''changes'',private.payroll_attendance_import_changes(r.scope_id,r.rows))),'||chr(10)||old_fragment;
 if strpos(ddl,old_fragment)=0 then raise exception 'Attendance review listing changed; review snapshot migration.';end if;
 execute replace(ddl,old_fragment,new_fragment);

 ddl:=pg_get_functiondef('public.review_actual_attendance_import(uuid,text,text)'::regprocedure);
 ddl:=replace(ddl,'to_jsonb(x)-''rows''-''fingerprint''','to_jsonb(x)-''rows''-''fingerprint''-''source_bytes''');
 old_fragment:='  v_result:=private.import_actual_attendance_core(r.scope_id,r.date_from,r.date_to,r.filename,r.rows,true);';
 new_fragment:='  if r.preview ? ''changes'' and r.preview->''changes'' is distinct from private.payroll_attendance_import_changes(r.scope_id,r.rows) then'||chr(10)||
  '   raise exception ''Attendance or schedule evidence changed after submission. Return the batch and upload a fresh review.'';'||chr(10)||
  '  end if;'||chr(10)||old_fragment;
 if strpos(ddl,old_fragment)=0 then raise exception 'Attendance final approval changed; review snapshot migration.';end if;
 execute replace(ddl,old_fragment,new_fragment);
end $migration$;

-- Eight named arguments identify this endpoint. Old seven-argument clients
-- continue to use the same approval route, while new uploads retain the exact
-- original file without rewriting raw clock data or a prior import.
create function public.submit_actual_attendance_import(
 p_scope uuid,p_from date,p_to date,p_filename text,p_rows jsonb,
 p_rules jsonb,p_rule_reference text,p_source_base64 text
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare result jsonb;original bytea;
begin
 if p_source_base64 is null or length(p_source_base64)>7000000 then raise exception 'Attach the original attendance file (maximum 5 MB).';end if;
 original:=decode(p_source_base64,'base64');
 if octet_length(original)=0 or octet_length(original)>5*1024*1024 then raise exception 'Attach the original attendance file (maximum 5 MB).';end if;
 result:=public.submit_actual_attendance_import(p_scope,p_from,p_to,p_filename,p_rows,p_rules,p_rule_reference);
 if result->>'submitted'='true' then
  update private.payroll_attendance_import_reviews set source_bytes=original,source_md5=md5(original)
   where id=(result->>'reviewId')::uuid and submitted_by=auth.uid()
   and (source_bytes is null or source_md5=md5(original));
  if not found then raise exception 'This attendance batch was submitted with a different source file.';end if;
 end if;
 return result;
end $function$;

create function public.get_actual_attendance_import_source(p_review uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare r private.payroll_attendance_import_reviews;
begin
 select * into r from private.payroll_attendance_import_reviews where id=p_review;
 if r.id is null or auth.uid() is null or not private.actual_attendance_access(r.scope_id) then
  raise exception 'Scoped attendance review access required.' using errcode='42501';end if;
 if r.source_bytes is null then raise exception 'Original file is not available for this earlier submission.';end if;
 return jsonb_build_object('filename',r.filename,'base64',encode(r.source_bytes,'base64'),'md5',r.source_md5);
end $function$;
revoke all on function public.submit_actual_attendance_import(uuid,date,date,text,jsonb,jsonb,text,text),
 public.get_actual_attendance_import_source(uuid) from public,anon;
grant execute on function public.submit_actual_attendance_import(uuid,date,date,text,jsonb,jsonb,text,text),
 public.get_actual_attendance_import_source(uuid) to authenticated;
notify pgrst,'reload schema';
