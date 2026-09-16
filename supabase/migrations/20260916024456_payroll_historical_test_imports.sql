-- Historical test data is held in a separate, non-exposed schema. No live engine reads it.
create schema payroll_history_private;
revoke all on schema payroll_history_private from public,anon,authenticated;
grant usage on schema payroll_history_private to authenticated;
create table payroll_history_private.batches (
 id uuid primary key default gen_random_uuid(), scope_id uuid not null references public.payroll_access_scopes(id),
 date_from date not null,date_to date not null,kind text not null check(kind in ('punches','dtr')),
 mode text not null default 'test' check(mode='test'),
 filename text not null,source_bytes bytea not null,source_hash text not null,reference text not null,
 preview jsonb not null,status text not null default 'preview' check(status in ('preview','imported')),
 created_by uuid not null,created_at timestamptz not null default now(),imported_at timestamptz,
 unique(scope_id,date_from,date_to,kind,source_hash),check(date_to>=date_from and date_to-date_from<=30)
);
create table payroll_history_private.records (
 id uuid primary key default gen_random_uuid(),batch_id uuid not null references payroll_history_private.batches(id),
 scope_id uuid not null,kind text not null check(kind in ('punches','dtr')),record_key text not null,
 employee_id uuid not null,work_date date not null,source_row integer not null,payload jsonb not null,
 mode text not null default 'test' check(mode='test'),unique(scope_id,record_key)
);
create table payroll_history_private.audit (
 id uuid primary key default gen_random_uuid(),batch_id uuid not null references payroll_history_private.batches(id),
 actor uuid not null,action text not null,details jsonb not null default '{}',created_at timestamptz not null default now()
);
create index historical_batches_cutoff on payroll_history_private.batches(scope_id,date_from,date_to,created_at desc);
create index historical_records_batch on payroll_history_private.records(batch_id);
create index historical_audit_batch on payroll_history_private.audit(batch_id,created_at);
alter table payroll_history_private.batches enable row level security;
alter table payroll_history_private.records enable row level security;
alter table payroll_history_private.audit enable row level security;
revoke all on all tables in schema payroll_history_private from public,anon,authenticated;
create function payroll_history_private.immutable() returns trigger language plpgsql set search_path='' as $$begin
 raise exception 'Historical source files, imported records and audit events are immutable.';end $$;
create trigger immutable before update or delete on payroll_history_private.records for each row execute function payroll_history_private.immutable();
create trigger immutable before update or delete on payroll_history_private.audit for each row execute function payroll_history_private.immutable();
create function payroll_history_private.protect_batch() returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='DELETE' or (to_jsonb(new)-'status'-'imported_at') is distinct from (to_jsonb(old)-'status'-'imported_at') or old.status<>'preview' or new.status<>'imported' then
 raise exception 'Source and preview are immutable; only a preview can become an imported test batch.';end if;return new;end $$;
create trigger immutable_source before update or delete on payroll_history_private.batches for each row execute function payroll_history_private.protect_batch();
create function payroll_history_private.norm(p text) returns text language sql immutable set search_path='' as $$
 select upper(regexp_replace(btrim(translate(coalesce(p,''),U&'\FEFF\200B\200C\200D','')), '\s+',' ','g'))
$$;
create function payroll_history_private.allowed(p_scope uuid,p_write boolean default false) returns boolean language sql stable set search_path='' as $$
 select auth.uid() is not null and private.payroll_time_permission(p_scope,'view') and (not p_write or private.payroll_time_permission(p_scope,'finalize') or private.payroll_has_access('prepare_pr',p_scope))
$$;
-- A bounded RFC-style CSV reader: quoted commas, escaped quotes, CRLF and multiline fields.
-- Parse on the server from the preserved source, not client-provided row mappings.
create function payroll_history_private.csv(p_text text) returns jsonb language plpgsql immutable set search_path='' as $$
declare chars text[]:=regexp_split_to_array(ltrim(p_text,chr(65279)),'');i integer:=1;c text;cell text:='';fields jsonb:='[]';result jsonb:='[]';quoted boolean:=false;closed boolean:=false;line integer:=1;start_line integer:=1;
begin
 while i<=coalesce(array_length(chars,1),0)+1 loop
 c:=case when i<=array_length(chars,1) then chars[i] else E'\n' end;
 if quoted then
  if c='"' then if chars[i+1]='"' then cell:=cell||'"';i:=i+1;else quoted:=false;closed:=true;end if;
  else cell:=cell||c;end if;
 elsif c='"' then if cell<>'' or closed then raise exception 'CSV row %: unexpected quote. Save as CSV UTF-8.',start_line;end if;quoted:=true;
 elsif c=',' or c=E'\n' or c=E'\r' then
  fields:=fields||jsonb_build_array(cell);cell:='';closed:=false;
  if jsonb_array_length(fields)>20 then raise exception 'CSV row % has too many columns.',start_line;end if;
  if c<>',' then
   if exists(select 1 from jsonb_array_elements_text(fields) x where btrim(x)<>'') then result:=result||jsonb_build_array(jsonb_build_object('line',start_line,'fields',fields));end if;
   fields:='[]';if c=E'\r' and chars[i+1]=E'\n' then i:=i+1;end if;line:=line+1;start_line:=line;
   if jsonb_array_length(result)>5001 then raise exception 'Maximum 5,000 data rows per file.';end if;
  end if;
 else if closed then raise exception 'CSV row %: unexpected text after a closing quote.',start_line;end if;cell:=cell||c;end if;
 i:=i+1;
 end loop;
 if quoted then raise exception 'CSV row %: unclosed quoted field.',start_line;end if;
 return result;
end $$;
create function payroll_history_private.validate(p_scope uuid,p_from date,p_to date,p_kind text,p_source text) returns jsonb
language plpgsql stable set search_path='' as $$
declare parsed jsonb;header text[];expected text[];item jsonb;r jsonb;errors jsonb;out_rows jsonb:='[]';payload jsonb;roster jsonb;matches jsonb;emp jsonb;bu public.payroll_access_scopes;
 d date;stamp timestamptz;code text;k text;v text;key text;seen jsonb:='{}';prior jsonb;duplicate boolean;minutes jsonb;invalid integer:=0;ready integer:=0;duplicates integer:=0;line integer;
begin
 select * into bu from public.payroll_access_scopes where id=p_scope;
 expected:=case when p_kind='punches' then array['EMPLOYEECODE','BUSINESSUNIT','WORKDATE','PUNCHTIME','EVENTTYPE','SOURCEREFERENCE'] else array['EMPLOYEECODE','BUSINESSUNIT','WORKDATE','REGULARMINUTES','OVERTIMEMINUTES','NIGHTMINUTES','LATEMINUTES','UNDERTIMEMINUTES','UNPAIDBREAKMINUTES','REVIEWREFERENCE'] end;
 begin
 parsed:=payroll_history_private.csv(p_source);
 select array_agg(regexp_replace(payroll_history_private.norm(x),'[ _]','','g') order by ord) into header from jsonb_array_elements_text(parsed#>'{0,fields}') with ordinality a(x,ord);
 if coalesce(array_length(header,1),0)<>array_length(expected,1) or not header@>expected or (select count(distinct x) from unnest(header) x)<>array_length(expected,1) then raise exception 'Missing, duplicate or unsupported headers. Use the % template; header order and capitalization may vary.',p_kind;end if;
 if jsonb_array_length(parsed)<2 then raise exception 'The source contains no attendance rows.';end if;
 exception when others then return jsonb_build_object('rows',jsonb_build_array(jsonb_build_object('line',1,'errors',jsonb_build_array(sqlerrm),'duplicate',false,'code','','payload','{}'::jsonb)),'ready',0,'invalid',1,'duplicates',0);end;
 select coalesce(jsonb_object_agg(e.code,e.employees),'{}') into roster from (
 select payroll_history_private.norm(h.employee_id) code,jsonb_agg(jsonb_build_object('id',h.id,'name',h.full_name,'hired',h.date_hired,'ended',h.end_date)) employees
 from public.hris_users h where h.business_unit_id=bu.business_unit_id and not coalesce(h.is_duplicate,false) and nullif(btrim(h.employee_id),'') is not null group by 1) e;
 for item in select value from jsonb_array_elements(parsed) with ordinality a(value,ord) where ord>1 loop
 line:=(item->>'line')::integer;errors:='[]';payload:='{}';duplicate:=false;key:=null;emp:=null;d:=null;stamp:=null;
 select coalesce(jsonb_object_agg(header[ord],value),'{}') into r from jsonb_array_elements_text(item->'fields') with ordinality f(value,ord) where ord<=array_length(header,1);
 if jsonb_array_length(item->'fields')<>array_length(header,1) then errors:=errors||jsonb_build_array('Column count does not match the header.');end if;
 code:=payroll_history_private.norm(r->>'EMPLOYEECODE');matches:=roster->code;
 if coalesce(jsonb_array_length(matches),0)<>1 then errors:=errors||jsonb_build_array('Employee code is missing, ambiguous or outside the selected Business Unit.');else emp:=matches->0;end if;
 if payroll_history_private.norm(r->>'BUSINESSUNIT') not in(payroll_history_private.norm(bu.name),upper(bu.business_unit_id::text)) then errors:=errors||jsonb_build_array('Business Unit does not match the selected payroll workspace.');end if;
 begin
 v:=btrim(r->>'WORKDATE');if v is null or v!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Use YYYY-MM-DD for Work Date.';end if;d:=v::date;
 if d<p_from or d>p_to then errors:=errors||jsonb_build_array('Work Date is outside the selected cutoff.');end if;
 if d<(emp->>'hired')::date or d>(emp->>'ended')::date then errors:=errors||jsonb_build_array('Work Date is outside the employee employment dates.');end if;
 exception when others then errors:=errors||jsonb_build_array('Invalid Work Date. Use a real YYYY-MM-DD date.');end;
 if p_kind='punches' then
 begin
  v:=btrim(r->>'PUNCHTIME');if v is null or v!~'^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$' then raise exception 'Punch Time needs a full timestamp with timezone, for example 2026-09-10T22:00:00+08:00.';end if;
  stamp:=v::timestamptz;
  if stamp>now() then errors:=errors||jsonb_build_array('Future punches cannot be imported as historical attendance.');end if;
  if (stamp at time zone 'Asia/Manila')::date not between d and d+1 then errors:=errors||jsonb_build_array('Punch Time must be on Work Date or the following day for an overnight shift.');end if;
 exception when others then errors:=errors||jsonb_build_array('Invalid Punch Time. Use an ISO timestamp with +08:00 or Z; do not supply a total.');end;
 k:=payroll_history_private.norm(r->>'EVENTTYPE');
 if k not in('CLOCK_IN','START_BREAK','END_BREAK','CLOCK_OUT') then errors:=errors||jsonb_build_array('Event Type must be CLOCK_IN, START_BREAK, END_BREAK or CLOCK_OUT.');end if;
 if nullif(btrim(r->>'SOURCEREFERENCE'),'') is null then errors:=errors||jsonb_build_array('Source Reference is required for actual punch evidence.');end if;
 payload:=jsonb_build_object('kind','punches','employeeId',emp->>'id','workDate',d,'timestamp',to_char(stamp at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'action',k,'sourceReference',btrim(r->>'SOURCEREFERENCE'));
 key:='punch:'||(emp->>'id')||':'||coalesce(extract(epoch from stamp)::text,'')||':'||k;
 else
 minutes:='{}';foreach k in array array['REGULARMINUTES','OVERTIMEMINUTES','NIGHTMINUTES','LATEMINUTES','UNDERTIMEMINUTES','UNPAIDBREAKMINUTES'] loop
 v:=btrim(r->>k);if v is null or v!~'^\d{1,4}$' or (case when v~'^\d{1,4}$' then v::int>1440 else true end) then errors:=errors||jsonb_build_array(k||' must be whole minutes from 0 to 1440 (enter 0, not blank).');else minutes:=minutes||jsonb_build_object(k,v::int);end if;end loop;
 if (minutes->>'REGULARMINUTES')::int+(minutes->>'OVERTIMEMINUTES')::int+(minutes->>'UNPAIDBREAKMINUTES')::int>1440 then errors:=errors||jsonb_build_array('Regular, overtime and unpaid break minutes exceed 24 hours.');end if;
 if (minutes->>'NIGHTMINUTES')::int>(minutes->>'REGULARMINUTES')::int+(minutes->>'OVERTIMEMINUTES')::int then errors:=errors||jsonb_build_array('Night minutes cannot exceed regular plus overtime minutes.');end if;
 if length(btrim(coalesce(r->>'REVIEWREFERENCE','')))<3 then errors:=errors||jsonb_build_array('Review Reference is required: identify the reviewer and reviewed DTR evidence.');end if;
 payload:=jsonb_build_object('kind','dtr','employeeId',emp->>'id','workDate',d,'minutes',minutes,'reviewReference',btrim(r->>'REVIEWREFERENCE'));
 key:='dtr:'||(emp->>'id')||':'||d::text;
 end if;
 if jsonb_array_length(errors)=0 then
  prior:=seen->key;
  if prior is null then select x.payload into prior from payroll_history_private.records x where x.scope_id=p_scope and x.record_key=key;end if;
  if prior is not null then
   if (prior-'sourceReference'-'reviewReference')=(payload-'sourceReference'-'reviewReference') then duplicate:=true;else errors:=errors||jsonb_build_array('Conflicting existing test record for this employee/date or punch. The previous test record is retained; review its source.');end if;
  else seen:=seen||jsonb_build_object(key,payload);end if;
 end if;
 if jsonb_array_length(errors)>0 then invalid:=invalid+1;elsif duplicate then duplicates:=duplicates+1;else ready:=ready+1;end if;
 out_rows:=out_rows||jsonb_build_array(jsonb_build_object('line',line,'code',code,'employeeName',emp->>'name','workDate',d,'payload',payload,'key',key,'errors',errors,'duplicate',duplicate));
 end loop;
 return jsonb_build_object('rows',out_rows,'ready',ready,'invalid',invalid,'duplicates',duplicates);
end $$;
create function payroll_history_private.stage(p_scope uuid,p_from date,p_to date,p_kind text,p_filename text,p_source_base64 text,p_reference text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare bytes bytea;source text;hash text;b payroll_history_private.batches;v jsonb;
begin
 if not coalesce(payroll_history_private.allowed(p_scope,true),false) then raise exception 'Scoped HR timekeeping-finalizer or Finance payroll-preparer access is required.' using errcode='42501';end if;
 if p_kind is null or p_kind not in('punches','dtr') then raise exception 'Choose actual punches or reviewed DTR summaries.';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>30 or p_to>=(now() at time zone 'Asia/Manila')::date then raise exception 'Choose a completed historical cutoff of 1–31 days.';end if;
 if length(btrim(coalesce(p_reference,''))) not between 3 and 1000 then raise exception 'A source/reviewer reference is required.';end if;
 if length(coalesce(p_source_base64,''))>710000 or length(coalesce(p_filename,'')) not between 1 and 200 or p_filename!~*'\.csv$' then raise exception 'Upload a CSV UTF-8 file no larger than 512 KB.';end if;
 bytes:=decode(p_source_base64,'base64');if octet_length(bytes) not between 1 and 524288 then raise exception 'Upload a CSV UTF-8 file no larger than 512 KB.';end if;source:=convert_from(bytes,'UTF8');hash:=encode(sha256(bytes),'hex');
 perform pg_advisory_xact_lock(hashtextextended('historical-test:'||p_scope::text,0));
 select * into b from payroll_history_private.batches where scope_id=p_scope and date_from=p_from and date_to=p_to and kind=p_kind and source_hash=hash;
 if b.id is not null then insert into payroll_history_private.audit(batch_id,actor,action,details) values(b.id,auth.uid(),'duplicate_upload',jsonb_build_object('filename',p_filename,'reference',p_reference));
 return jsonb_build_object('id',b.id,'status',b.status,'filename',b.filename,'preview',case when b.status='preview' then payroll_history_private.validate(b.scope_id,b.date_from,b.date_to,b.kind,convert_from(b.source_bytes,'UTF8')) else b.preview end,'duplicateFile',true,'sourceHash',b.source_hash);end if;
 v:=payroll_history_private.validate(p_scope,p_from,p_to,p_kind,source);
 insert into payroll_history_private.batches(scope_id,date_from,date_to,kind,filename,source_bytes,source_hash,reference,preview,created_by) values(p_scope,p_from,p_to,p_kind,p_filename,bytes,hash,btrim(p_reference),v,auth.uid()) returning * into b;
 insert into payroll_history_private.audit(batch_id,actor,action,details) values(b.id,auth.uid(),'preview_created',jsonb_build_object('mode','test','sourceHash',hash,'ready',v->'ready','invalid',v->'invalid','duplicates',v->'duplicates'));
 return jsonb_build_object('id',b.id,'status',b.status,'filename',b.filename,'preview',v,'duplicateFile',false,'sourceHash',hash);
end $$;
create function payroll_history_private.commit_batch(p_batch uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare b payroll_history_private.batches;v jsonb;cnt integer;
begin
 select * into b from payroll_history_private.batches where id=p_batch;
 if b.id is null or not coalesce(payroll_history_private.allowed(b.scope_id,true),false) then raise exception 'Test import outside authorized payroll scope.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('historical-test:'||b.scope_id::text,0));
 select * into b from payroll_history_private.batches where id=p_batch for update;
 if b.status='imported' then return jsonb_build_object('id',b.id,'status','imported','alreadyImported',true);end if;
 v:=payroll_history_private.validate(b.scope_id,b.date_from,b.date_to,b.kind,convert_from(b.source_bytes,'UTF8'));
 if (v->>'invalid')::int>0 then insert into payroll_history_private.audit(batch_id,actor,action,details) values(b.id,auth.uid(),'validation_failed',v);return jsonb_build_object('id',b.id,'status','preview','preview',v,'error','Correct the invalid rows and upload a revised file. No test rows were imported.');end if;
 insert into payroll_history_private.records(batch_id,scope_id,kind,record_key,employee_id,work_date,source_row,payload)
 select b.id,b.scope_id,b.kind,r->>'key',(r#>>'{payload,employeeId}')::uuid,(r->>'workDate')::date,(r->>'line')::int,r->'payload' from jsonb_array_elements(v->'rows') r where not (r->>'duplicate')::boolean;
 get diagnostics cnt=row_count;
 update payroll_history_private.batches set status='imported',imported_at=now() where id=b.id;
 insert into payroll_history_private.audit(batch_id,actor,action,details) values(b.id,auth.uid(),'test_imported',jsonb_build_object('records',cnt,'duplicates',v->'duplicates','mode','test'));
 return jsonb_build_object('id',b.id,'status','imported','imported',cnt,'duplicates',v->'duplicates');
end $$;
create function payroll_history_private.context(p_scope uuid,p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.payroll_access_scopes;begin
 if not coalesce(payroll_history_private.allowed(p_scope),false) then raise exception 'Scoped payroll timekeeping access required.' using errcode='42501';end if;
 select * into s from public.payroll_access_scopes where id=p_scope;
 return jsonb_build_object('scopeName',s.name,'businessUnitId',s.business_unit_id,'canImport',payroll_history_private.allowed(p_scope,true),'canCorrect',private.attendance_admin() and private.payroll_time_permission(p_scope,'finalize'),
 'employees',(select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'code',h.employee_id,'name',h.full_name) order by h.full_name),'[]') from public.hris_users h where h.business_unit_id=s.business_unit_id and not coalesce(h.is_duplicate,false) and nullif(btrim(h.employee_id),'') is not null),
 'batches',(select coalesce(jsonb_agg(to_jsonb(b) order by b.created_at desc),'[]') from (select id,kind,filename,status,source_hash,reference,created_at,created_by,imported_at,(preview->>'ready')::int as preview_ready,(preview->>'invalid')::int as preview_invalid,(select count(*) from payroll_history_private.records r where r.batch_id=x.id) as imported_records from payroll_history_private.batches x where scope_id=p_scope and date_from=p_from and date_to=p_to order by created_at desc limit 100) b));
 end $$;
create function payroll_history_private.detail(p_batch uuid,p_download boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare b payroll_history_private.batches;v jsonb;begin
 select * into b from payroll_history_private.batches where id=p_batch;
 if b.id is null or not coalesce(payroll_history_private.allowed(b.scope_id),false) then raise exception 'Test import outside authorized payroll scope.' using errcode='42501';end if;
 if p_download then insert into payroll_history_private.audit(batch_id,actor,action) values(b.id,auth.uid(),'source_downloaded');end if;
 v:=jsonb_build_object('id',b.id,'status',b.status,'filename',b.filename,'sourceHash',b.source_hash,'preview',case when b.status='preview' then payroll_history_private.validate(b.scope_id,b.date_from,b.date_to,b.kind,convert_from(b.source_bytes,'UTF8')) else b.preview end,'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at),'[]') from payroll_history_private.audit a where batch_id=b.id));
 if p_download then v:=v||jsonb_build_object('sourceBase64',encode(b.source_bytes,'base64'));end if;
 return v;
end $$;
-- Genuine corrections never take a test-batch ID or test totals. Delegate only explicitly
-- authorized actual times to the existing versioned HR correction workflow and its checks.
create function payroll_history_private.correct_actual(p_scope uuid,p_employee uuid,p_date date,p_revision integer,p_events jsonb,p_reason text,p_authorized boolean) returns jsonb
language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null or p_authorized is distinct from true or not private.attendance_admin() or not private.payroll_time_permission(p_scope,'finalize') or not public.can_access_hris_user(p_employee)
 or not exists(select 1 from public.hris_users h join public.payroll_access_scopes s on s.business_unit_id=h.business_unit_id where h.id=p_employee and s.id=p_scope) then raise exception 'Explicit authorization and scoped HR correction authority are required.' using errcode='42501';end if;
 if p_date is null or p_date>=(now() at time zone 'Asia/Manila')::date then raise exception 'Select a completed historical work date.';end if;
 if length(btrim(coalesce(p_reason,'')))<10 then raise exception 'Document the correction reason and verified supporting evidence.';end if;
 return public.correct_attendance_day(p_employee,p_date,p_revision,p_events,'Historical correction (explicitly authorized): '||p_reason);
end $$;
create function public.stage_historical_attendance_test(p_scope uuid,p_from date,p_to date,p_kind text,p_filename text,p_source_base64 text,p_reference text) returns jsonb language sql security invoker set search_path='' as $$select payroll_history_private.stage(p_scope,p_from,p_to,p_kind,p_filename,p_source_base64,p_reference)$$;
create function public.commit_historical_attendance_test(p_batch uuid) returns jsonb language sql security invoker set search_path='' as $$select payroll_history_private.commit_batch(p_batch)$$;
create function public.get_historical_attendance_context(p_scope uuid,p_from date,p_to date) returns jsonb language sql security invoker set search_path='' as $$select payroll_history_private.context(p_scope,p_from,p_to)$$;
create function public.get_historical_attendance_test(p_batch uuid,p_download boolean default false) returns jsonb language sql security invoker set search_path='' as $$select payroll_history_private.detail(p_batch,p_download)$$;
create function public.correct_genuine_historical_attendance(p_scope uuid,p_employee uuid,p_date date,p_revision integer,p_events jsonb,p_reason text,p_authorized boolean) returns jsonb language sql security invoker set search_path='' as $$select payroll_history_private.correct_actual(p_scope,p_employee,p_date,p_revision,p_events,p_reason,p_authorized)$$;
revoke all on all functions in schema payroll_history_private from public,anon,authenticated;
grant execute on function payroll_history_private.stage(uuid,date,date,text,text,text,text),payroll_history_private.commit_batch(uuid),payroll_history_private.context(uuid,date,date),payroll_history_private.detail(uuid,boolean),payroll_history_private.correct_actual(uuid,uuid,date,integer,jsonb,text,boolean) to authenticated;
revoke all on function public.stage_historical_attendance_test(uuid,date,date,text,text,text,text),public.commit_historical_attendance_test(uuid),public.get_historical_attendance_context(uuid,date,date),public.get_historical_attendance_test(uuid,boolean),public.correct_genuine_historical_attendance(uuid,uuid,date,integer,jsonb,text,boolean) from public,anon;
grant execute on function public.stage_historical_attendance_test(uuid,date,date,text,text,text,text),public.commit_historical_attendance_test(uuid),public.get_historical_attendance_context(uuid,date,date),public.get_historical_attendance_test(uuid,boolean),public.correct_genuine_historical_attendance(uuid,uuid,date,integer,jsonb,text,boolean) to authenticated;
