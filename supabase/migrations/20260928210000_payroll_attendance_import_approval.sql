-- Stage attendance evidence for HR Manager (unless submitted by HR Manager),
-- then one distinct BOD. The payroll source is selected only at final approval.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table private.payroll_attendance_import_reviews (
 id uuid primary key default gen_random_uuid(),
 scope_id uuid not null references public.payroll_access_scopes(id),
 date_from date not null, date_to date not null,
 filename text not null, rows jsonb not null, fingerprint text not null,
 proposed_rules jsonb, rule_reference text,
 preview jsonb not null,
 status text not null check(status in('pending_hr_manager','pending_bod','approved','rejected','returned')),
 submitted_by uuid not null references auth.users(id), submitted_at timestamptz not null default now(),
 hr_approved_by uuid references auth.users(id), hr_approved_at timestamptz,
 bod_approved_by uuid references auth.users(id), bod_approved_at timestamptz,
 decided_by uuid references auth.users(id), decided_at timestamptz, decision_note text,
 committed_batch_id uuid references private.payroll_actual_imports(id)
);
create index payroll_attendance_import_reviews_scope on private.payroll_attendance_import_reviews(scope_id,date_from,date_to,submitted_at desc);
create unique index payroll_attendance_import_reviews_pending on private.payroll_attendance_import_reviews(scope_id,date_from,date_to,fingerprint) where status in('pending_hr_manager','pending_bod');
alter table private.payroll_attendance_import_reviews enable row level security;
revoke all on private.payroll_attendance_import_reviews from public,anon,authenticated;

create table private.payroll_attendance_import_review_audit (
 id uuid primary key default gen_random_uuid(), review_id uuid not null references private.payroll_attendance_import_reviews(id),
 actor_id uuid not null references auth.users(id), action text not null,
 note text, recorded_at timestamptz not null default clock_timestamp()
);
alter table private.payroll_attendance_import_review_audit enable row level security;
revoke all on private.payroll_attendance_import_review_audit from public,anon,authenticated;

-- Preserve the previously validated importer as a private, non-callable core.
do $migration$
declare ddl text;
begin
 ddl:=pg_get_functiondef('public.import_actual_attendance(uuid,date,date,text,jsonb,boolean)'::regprocedure);
 if strpos(ddl,'private.payroll_actual_days')=0 or strpos(ddl,'if p_confirm then')=0 then
  raise exception 'Attendance importer changed; review approval routing before migration.';
 end if;
 execute replace(ddl,'FUNCTION public.import_actual_attendance(','FUNCTION private.import_actual_attendance_core(');
end $migration$;
revoke all on function private.import_actual_attendance_core(uuid,date,date,text,jsonb,boolean) from public,anon,authenticated;

create or replace function public.submit_actual_attendance_import(
 p_scope uuid,p_from date,p_to date,p_filename text,p_rows jsonb,
 p_rules jsonb default null,p_rule_reference text default null
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_preview jsonb;v_review private.payroll_attendance_import_reviews;v_fingerprint text;v_row jsonb;
begin
 if auth.uid() is null or not private.actual_attendance_access(p_scope) then
  raise exception 'Scoped HR or BOD attendance import access is required.' using errcode='42501';end if;
 v_preview:=private.import_actual_attendance_core(p_scope,p_from,p_to,p_filename,p_rows,false);
 if coalesce((v_preview->>'alreadyImported')::boolean,false) then
  return jsonb_build_object('submitted',false,'alreadyImported',true,'preview',v_preview);
 end if;
 if jsonb_array_length(v_preview->'errors')>0 then
  raise exception 'Correct the preview errors before submitting the attendance import.';
 end if;
 if coalesce((v_preview->>'ready')::integer,0)=0 then
  raise exception 'No new attendance rows are ready. Remove duplicates or correct the file.';
 end if;
 for v_row in select value from jsonb_array_elements(p_rows) loop
  if coalesce(v_row->>'reviewRequest','None') not in
    ('None','Missing punch','Absence','Rest-day work','Holiday work','Suspension','Worked lunch','Overtime','Other') then
   raise exception 'Choose a supported Needs review value in the attendance template.';
  end if;
  if coalesce(v_row->>'reviewRequest','None')<>'None'
    and length(btrim(coalesce(nullif(v_row->>'reviewExplanation',''),v_row->>'notes','')))=0 then
   raise exception 'Explain each Needs review choice in Review explanation or Notes.';
  end if;
 end loop;
 if p_rules is not null then
  if jsonb_typeof(p_rules)<>'object'
    or p_rules->>'holidayCoverageConfirmed'<>'true'
    or coalesce(p_rules->>'splitShiftConfirmed','false') not in('true','false')
    or length(btrim(coalesce(p_rule_reference,''))) not between 3 and 1000 then
   raise exception 'Provide a reviewed rule reference and valid cutoff choices.';
  end if;
 end if;
 v_fingerprint:=md5(p_rows::text||coalesce(p_rules::text,'')||coalesce(p_rule_reference,''));
 select * into v_review from private.payroll_attendance_import_reviews
 where scope_id=p_scope and date_from=p_from and date_to=p_to and fingerprint=v_fingerprint
   and status in('pending_hr_manager','pending_bod') order by submitted_at desc limit 1;
 if v_review.id is not null then
  return jsonb_build_object('submitted',true,'reviewId',v_review.id,'status',v_review.status,'alreadySubmitted',true,'preview',v_review.preview);
 end if;
 insert into private.payroll_attendance_import_reviews(scope_id,date_from,date_to,filename,rows,fingerprint,proposed_rules,rule_reference,preview,status,submitted_by)
 values(p_scope,p_from,p_to,p_filename,p_rows,v_fingerprint,p_rules,p_rule_reference,v_preview,
   case when public.has_active_role('HR Manager') then 'pending_bod' else 'pending_hr_manager' end,auth.uid())
 returning * into v_review;
 insert into private.payroll_attendance_import_review_audit(review_id,actor_id,action)
 values(v_review.id,auth.uid(),'submitted');
 return jsonb_build_object('submitted',true,'reviewId',v_review.id,'status',v_review.status,'preview',v_preview);
end $function$;

-- Older clients must not bypass the approval route through Confirm import.
create or replace function public.import_actual_attendance(p_scope uuid,p_from date,p_to date,p_filename text,p_rows jsonb,p_confirm boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $function$
begin
 if not p_confirm then return private.import_actual_attendance_core(p_scope,p_from,p_to,p_filename,p_rows,false);end if;
 return public.submit_actual_attendance_import(p_scope,p_from,p_to,p_filename,p_rows,null,null);
end $function$;

create or replace function public.get_actual_attendance_import_reviews(p_scope uuid,p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
begin
 if auth.uid() is null or not private.actual_attendance_access(p_scope) then raise exception 'Scoped attendance access is required.' using errcode='42501';end if;
 return coalesce((select jsonb_agg(to_jsonb(r)-'rows'-'fingerprint'||jsonb_build_object(
  'submitted_by_name',(select h.full_name from public.hris_users h where h.auth_user_id=r.submitted_by),
  'hr_approved_by_name',(select h.full_name from public.hris_users h where h.auth_user_id=r.hr_approved_by),
  'bod_approved_by_name',(select h.full_name from public.hris_users h where h.auth_user_id=r.bod_approved_by),
  'canAct',r.submitted_by<>auth.uid() and private.actual_attendance_access(r.scope_id) and
    ((r.status='pending_hr_manager' and public.has_active_role('HR Manager')) or
     (r.status='pending_bod' and public.has_active_role('Board of Director') and r.hr_approved_by is distinct from auth.uid())),
  'reviewRequests',(select coalesce(jsonb_agg(jsonb_build_object('employeeId',x->>'employeeId','date',x->>'workDate',
    'choice',x->>'reviewRequest','explanation',coalesce(nullif(x->>'reviewExplanation',''),x->>'notes'))),'[]'::jsonb)
    from jsonb_array_elements(r.rows)x where coalesce(x->>'reviewRequest','None')<>'None')
 ) order by r.submitted_at desc)
 from private.payroll_attendance_import_reviews r
 where r.scope_id=p_scope and r.date_from=p_from and r.date_to=p_to),'[]'::jsonb);
end $function$;

create or replace function public.review_actual_attendance_import(p_review uuid,p_action text,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare r private.payroll_attendance_import_reviews;v_result jsonb;v_rules uuid;
begin
 if auth.uid() is null then raise exception 'Sign in to review attendance.' using errcode='42501';end if;
 select * into r from private.payroll_attendance_import_reviews where id=p_review for update;
 if r.id is null then raise exception 'Attendance import review not found.';end if;
 if not private.actual_attendance_access(r.scope_id) then raise exception 'Scoped attendance review access required.' using errcode='42501';end if;
 if r.status not in('pending_hr_manager','pending_bod') then raise exception 'This import was already decided.';end if;
 if p_action not in('approve','reject','return') then raise exception 'Choose approve, reject or return.';end if;
 if p_action in('reject','return') and length(btrim(coalesce(p_note,'')))<3 then raise exception 'Give a reason when rejecting or returning.';end if;
 if r.submitted_by=auth.uid() then raise exception 'A separate reviewer must approve the import.' using errcode='42501';end if;
 if r.status='pending_hr_manager' and not public.has_active_role('HR Manager') then raise exception 'HR Manager approval is required first.' using errcode='42501';end if;
 if r.status='pending_bod' and not public.has_active_role('Board of Director') then raise exception 'One BOD approval is required.' using errcode='42501';end if;
 if p_action in('reject','return') then
  update private.payroll_attendance_import_reviews set status=case when p_action='reject' then 'rejected' else 'returned' end,
    decided_by=auth.uid(),decided_at=clock_timestamp(),decision_note=p_note where id=r.id;
 elsif r.status='pending_hr_manager' then
  update private.payroll_attendance_import_reviews set status='pending_bod',hr_approved_by=auth.uid(),hr_approved_at=clock_timestamp()
    where id=r.id;
 else
  if r.hr_approved_by=auth.uid() then raise exception 'The HR reviewer and BOD approver must be different people.' using errcode='42501';end if;
  -- Revalidate against current employment, locks and attendance evidence.
  v_result:=private.import_actual_attendance_core(r.scope_id,r.date_from,r.date_to,r.filename,r.rows,true);
  if r.proposed_rules is not null then
   if not coalesce((r.proposed_rules->>'holidayCoverageConfirmed')::boolean,false) then
    raise exception 'Holiday coverage was not confirmed. Return the import for correction or record reviewed rules separately.';
   end if;
   if exists(select 1 from public.payroll_time_rules t where t.scope_id=r.scope_id
     and t.effective_from<=r.date_from and t.effective_to>=r.date_to) then
    raise exception 'Cutoff rules changed while this import awaited approval. Return it and preview current rules.';
   end if;
   -- Rule values are the existing policy constants. Spreadsheet rows cannot
   -- set grace, lunch minutes, OT eligibility or monetary amounts.
   insert into public.payroll_time_rules(scope_id,effective_from,effective_to,config,source_ref,approved_by)
   values(r.scope_id,r.date_from,r.date_to,jsonb_build_object(
     'graceMinutes',5,'unpaidLunchMinutes',60,'minimumOtMinutes',60,'timezone','Asia/Manila',
     'holidayCoverageConfirmed',true,'splitShiftConfirmed',coalesce((r.proposed_rules->>'splitShiftConfirmed')::boolean,false),
     'restTemplates','[]'::jsonb,'meals','{}'::jsonb,'leavePolicyRef','', 'offsetPolicyRef',''),r.rule_reference,auth.uid()) returning id into v_rules;
   insert into public.payroll_time_audit(scope_id,actor_id,action,record_id,reason)
   values(r.scope_id,auth.uid(),'rules_recorded',v_rules,r.rule_reference);
  end if;
  update private.payroll_attendance_import_reviews set status='approved',bod_approved_by=auth.uid(),bod_approved_at=clock_timestamp(),
    decided_by=auth.uid(),decided_at=clock_timestamp(),decision_note=p_note,committed_batch_id=(v_result->>'batchId')::uuid where id=r.id;
 end if;
 insert into private.payroll_attendance_import_review_audit(review_id,actor_id,action,note)
 values(r.id,auth.uid(),p_action||':'||r.status,nullif(btrim(p_note),''));
 return (select to_jsonb(x)-'rows'-'fingerprint' from private.payroll_attendance_import_reviews x where x.id=r.id);
end $function$;

revoke all on function public.import_actual_attendance(uuid,date,date,text,jsonb,boolean),
 public.submit_actual_attendance_import(uuid,date,date,text,jsonb,jsonb,text),
 public.get_actual_attendance_import_reviews(uuid,date,date),
 public.review_actual_attendance_import(uuid,text,text) from public,anon;
grant execute on function public.import_actual_attendance(uuid,date,date,text,jsonb,boolean),
 public.submit_actual_attendance_import(uuid,date,date,text,jsonb,jsonb,text),
 public.get_actual_attendance_import_reviews(uuid,date,date),
 public.review_actual_attendance_import(uuid,text,text) to authenticated;
notify pgrst,'reload schema';
