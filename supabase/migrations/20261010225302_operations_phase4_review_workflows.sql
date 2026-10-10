-- All review mutations authenticate, lock execution before review, and reject stale revisions.
create function operations_private.lock_review(rid uuid) returns operations_private.reviews language plpgsql security definer set search_path='' as $$
declare r operations_private.reviews;o uuid;begin
 select * into r from operations_private.reviews where id=rid;if r.id is null then raise exception 'Review unavailable' using errcode='42501';end if;
 select occurrence_id into o from public.ops_assignments where id=r.assignment_id;
 if o is not null then perform 1 from public.ops_occurrences where id=o for update;end if;
 if r.run_id is not null then perform 1 from public.ops_checklist_runs where id=r.run_id for update;end if;
 perform 1 from public.ops_assignments where id=r.assignment_id or checklist_run_id=r.run_id order by id for update;
 select * into r from operations_private.reviews where id=rid for update;return r;
end$$;
create function operations_private.new_review_issue(rid uuid,descr text,sev text,cause_value text,who uuid,due timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
declare r operations_private.reviews;i uuid;begin select * into r from operations_private.reviews where id=rid;
 if length(trim(coalesce(descr,''))) not between 3 and 4000 or sev not in('Routine','Important','Critical') or cause_value not in('Execution quality','Missing supplies or tools','Equipment defect','Staffing or coverage','Training or instructions','Other') or due is null or not isfinite(due) then raise exception 'Describe the issue, severity, cause and deadline';end if;
 if who is not null and not (operations_private.member(who,r.business_unit_id) or operations_private.role_unit(who,r.business_unit_id,array['Admin','Board of Director','Business Unit Manager','GeneralManager'])) then raise exception 'Issue owner is outside the unit' using errcode='42501';end if;
 insert into operations_private.review_issues(review_id,submission,description,severity,cause,responsible_id,reporter_id,due_at) values(rid,r.submission,descr,case when r.critical then 'Critical' else sev end,cause_value,who,operations_private.actor(),due)
 on conflict(review_id,submission) where status<>'Resolved' do update set description=review_issues.description||E'\n'||excluded.description,severity=case when review_issues.severity='Critical' or excluded.severity='Critical' then 'Critical' when excluded.severity='Important' then 'Important' else review_issues.severity end,revision=review_issues.revision+1 returning id into i;
 insert into operations_private.review_issue_events(issue_id,actor_id,action,detail) values(i,operations_private.actor(),'Issue recorded',jsonb_build_object('description',descr,'severity',sev,'cause',cause_value,'due',due,'owner',who));return i;
end$$;
create function public.ops_review_decide(p_id uuid,p_revision int,p_action text,p_note text,p_details jsonb default '{}') returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=operations_private.actor();r operations_private.reviews;bod bool;p text:=trim(coalesce(p_note,''));due timestamptz;method text:=p_details->>'method';condition_value text:=p_details->>'condition';i uuid;o uuid;begin
 if not operations_private.review_view(p_id) then raise exception 'Review unavailable' using errcode='42501';end if;r:=operations_private.lock_review(p_id);
 if r.revision is distinct from p_revision then raise exception 'Review changed. Refresh before deciding.' using errcode='40001';end if;
 if r.state in('Executing','Needs correction','Cancelled','Historical') or r.submission=0 then raise exception 'An active confirmed submission is required';end if;
 bod:=r.state='Awaiting BOD review';
 if not operations_private.review_eligible(r.id,bod) then raise exception 'An authorized independent reviewer is required' using errcode='42501';end if;
 if not bod and r.reviewer_id is not null and r.reviewer_id<>actor then raise exception 'This review is assigned to another reviewer' using errcode='42501';end if;
 if p_action='Verify' then
 if r.mode='Daily Summary' or r.state not in('Awaiting verification','Awaiting BOD review') then raise exception 'Use the daily spot-check workflow for routine work';end if;
 if method not in('Evidence review','Physical inspection','Evidence and physical inspection') or not coalesce((p_details->>'requirements_checked')::bool,false) then raise exception 'Confirm requirements checked and choose the inspection method';end if;
 if condition_value not in('Satisfactory','Defect remains','Not applicable') then raise exception 'Choose the equipment/readiness result';end if;
 if exists(select 1 from public.ops_run_items x where x.run_id=r.run_id and (x.response_type='photo' or coalesce((x.snapshot->>'photo_required')::bool,false)) and exists(select 1 from public.ops_evidence e where e.item_id=x.id and e.state in('Ready','Expired')) and not exists(select 1 from public.ops_evidence e where e.item_id=x.id and e.state='Ready' and e.deleted_at is null and e.expires_at>now())) then raise exception 'Required evidence expired. Return for a fresh dated inspection.';end if;
 if exists(select 1 from operations_private.review_issues where review_id=r.id and status<>'Resolved') and (condition_value<>'Defect remains' or length(p)<3) then raise exception 'Open issues need correction or an explicit remaining-defect record';end if;
 if condition_value='Defect remains' then
 if exists(select 1 from operations_private.review_issues where review_id=r.id and status<>'Resolved' and cause<>'Equipment defect') then raise exception 'Classify remaining equipment defects. Other open issues require correction or recheck.';end if;
 if length(p)<3 then raise exception 'Describe the remaining defect';end if;
 if not exists(select 1 from operations_private.review_issues where review_id=r.id and status<>'Resolved') then i:=operations_private.new_review_issue(r.id,p,'Important','Equipment defect',null,now()+interval '24 hours');end if;
 end if;
 update operations_private.reviews set state=case when not bod and mode='Individual Verification + BOD' then 'Awaiting BOD review' else 'Verified' end,first_reviewer=case when bod then first_reviewer else actor end,equipment_condition=condition_value,revision=revision+1,updated_at=now() where id=r.id;
 elsif p_action='Return' then
 due:=(p_details->>'due')::timestamptz;
 if length(p)<3 or due is null or not isfinite(due) or due<=now() or due>now()+interval '366 days' then raise exception 'Return reason and a future correction deadline are required';end if;
 i:=operations_private.new_review_issue(r.id,p,coalesce(p_details->>'severity','Important'),coalesce(p_details->>'cause','Other'),nullif(p_details->>'responsible_id','')::uuid,due);
 if r.run_id is not null then update public.ops_checklist_runs set submitted_at=null,submitted_by=null,outcome='Pending',revision=revision+1 where id=r.run_id;end if;
 update public.ops_assignments set status='In Progress',completed_at=null,revision=revision+1,updated_at=now() where (id=r.assignment_id or checklist_run_id=r.run_id) and status<>'Cancelled';
 update operations_private.reviews set state='Needs correction',first_reviewer=null,correction_due=due,review_due=due+make_interval(hours=>coalesce((select review_hours from operations_private.review_settings where business_unit_id=r.business_unit_id),24)),revision=revision+1,updated_at=now() where id=r.id;
 select occurrence_id into o from public.ops_assignments where id=r.assignment_id;if o is not null then update public.ops_occurrences set status='Open',coverage='At risk',coverage_reason='Returned work needs correction',override=true,revision=revision+1 where id=o and status='Completed';end if;
 else raise exception 'Invalid review action';end if;
 insert into operations_private.review_decisions(review_id,submission,actor_id,action,method,condition,note,detail) values(r.id,r.submission,actor,case when bod then 'BOD '||p_action else p_action end,method,condition_value,p,p_details);
 perform operations_private.review_audit(r.id,case when bod then 'BOD '||p_action else 'Review '||p_action end,jsonb_build_object('note',p,'submission',r.submission,'method',method,'condition',condition_value,'due',due));
end$$;
-- Submitted responses stay locked. Manager correction goes through Return, with its immutable decision.
alter function operations_private.reopen_run(uuid,integer,text) rename to reopen_run_before_review;
create function operations_private.reopen_run(p_run uuid,p_revision int,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare r operations_private.reviews;begin perform operations_private.actor();select * into r from operations_private.reviews where run_id=p_run;
 if r.id is not null and r.state<>'Historical' then raise exception 'Use Return for correction in the Review workspace';end if;
 if r.id is not null then insert into operations_private.review_submissions(review_id,number,actor_id,snapshot) values(r.id,0,operations_private.actor(),operations_private.review_snapshot(r.id)) on conflict do nothing;end if;
 perform operations_private.reopen_run_before_review(p_run,p_revision,p_note);
 update operations_private.reviews set state='Executing',revision=revision+1,updated_at=now() where id=r.id;
end$$;
alter function operations_private.check_item(uuid,uuid,integer,boolean,text) rename to check_item_before_review;
create function operations_private.check_item(p_run uuid,p_item uuid,p_revision int,p_checked bool,p_note text) returns void language plpgsql security definer set search_path='' as $$declare r operations_private.reviews;begin
 perform operations_private.actor();select * into r from operations_private.reviews where run_id=p_run;
 if r.state in('Confirmed','Awaiting verification','Awaiting BOD review','Verified') then raise exception 'Confirmed work is locked. Request a manager correction review.';end if;
 if r.state='Historical' then
 insert into operations_private.review_submissions(review_id,number,actor_id,snapshot) values(r.id,0,operations_private.actor(),operations_private.review_snapshot(r.id)) on conflict do nothing;
 update operations_private.reviews set state='Executing',revision=revision+1,updated_at=now() where id=r.id;
 end if;
 perform operations_private.check_item_before_review(p_run,p_item,p_revision,p_checked,p_note);
end$$;

create function public.ops_review_issue(p_id uuid,p_revision int,p_action text,p_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=operations_private.actor();r operations_private.reviews;i operations_private.review_issues;rid uuid;result uuid;due timestamptz;descr text;who uuid;begin
 if p_action='Create' then rid:=p_id;
 else select review_id into rid from operations_private.review_issues where id=p_id;end if;
 if not operations_private.review_view(rid) then raise exception 'Issue unavailable' using errcode='42501';end if;r:=operations_private.lock_review(rid);
 if not operations_private.review_eligible(r.id,false) and not operations_private.review_eligible(r.id,true) then raise exception 'Independent manager review is required' using errcode='42501';end if;
 if p_action='Create' then
 if r.revision is distinct from p_revision then raise exception 'Review changed. Refresh before reporting.' using errcode='40001';end if;
 if r.state in('Cancelled','Historical') then raise exception 'This execution is closed';end if;
 result:=operations_private.new_review_issue(r.id,p_payload->>'description',p_payload->>'severity',p_payload->>'cause',nullif(p_payload->>'responsible_id','')::uuid,(p_payload->>'due')::timestamptz);
 else
 select * into i from operations_private.review_issues where id=p_id for update;
 if i.revision is distinct from p_revision then raise exception 'Issue changed. Refresh before updating.' using errcode='40001';end if;
 if length(trim(coalesce(p_payload->>'note','')))<3 then raise exception 'A specific action or finding is required';end if;
 if p_action='Update' then
 if p_payload->>'status' not in('Open','Action in progress','Awaiting recheck') then raise exception 'Use independent Recheck to resolve';end if;
 due:=coalesce((p_payload->>'due')::timestamptz,i.due_at);who:=nullif(p_payload->>'responsible_id','')::uuid;
 if not isfinite(due) or due>now()+interval '366 days' then raise exception 'Invalid correction deadline';end if;
 if who is not null and not(operations_private.member(who,r.business_unit_id) or operations_private.role_unit(who,r.business_unit_id,array['Admin','Board of Director','Business Unit Manager','GeneralManager'])) then raise exception 'Issue owner outside unit';end if;
 if p_payload->>'cause' not in('Execution quality','Missing supplies or tools','Equipment defect','Staffing or coverage','Training or instructions','Other') then raise exception 'Choose a valid cause';end if;
 update operations_private.review_issues set status=p_payload->>'status',cause=p_payload->>'cause',responsible_id=who,due_at=due,action_plan=p_payload->>'note',confirmed_quality=coalesce((p_payload->>'confirmed_quality')::bool,false) and p_payload->>'cause'='Execution quality' and who is not null,revision=revision+1 where id=i.id;
 elsif p_action='Recheck' then
 if i.status<>'Awaiting recheck' or i.responsible_id=actor then raise exception 'An independent recheck after corrective action is required';end if;
 if r.state='Needs correction' then raise exception 'Staff must submit the corrected execution before resolving';end if;
 update operations_private.review_issues set status='Resolved',resolution=p_payload->>'note',resolved_at=now(),revision=revision+1 where id=i.id;
 elsif p_action='Acknowledge' then null;
 else raise exception 'Unsupported issue action';end if;
 insert into operations_private.review_issue_events(issue_id,actor_id,action,detail) values(i.id,actor,p_action,p_payload);result:=i.id;
 end if;
 perform operations_private.review_audit(r.id,'Issue '||p_action,jsonb_build_object('issue_id',result,'note',coalesce(p_payload->>'note',p_payload->>'description')));return result;
end$$;
create function public.ops_review_referral(p_issue uuid,p_revision int,p_note text) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=operations_private.actor();i operations_private.review_issues;r operations_private.reviews;ir uuid;descr text;begin
 select * into i from operations_private.review_issues where id=p_issue;select * into r from operations_private.reviews where id=i.review_id;
 if not operations_private.manager(r.business_unit_id) then raise exception 'Only authorized management can refer to HR' using errcode='42501';end if;
 r:=operations_private.lock_review(r.id);select * into i from operations_private.review_issues where id=p_issue for update;
 if i.revision is distinct from p_revision then raise exception 'Issue changed. Refresh before referral.' using errcode='40001';end if;
 if length(trim(coalesce(p_note,'')))<10 then raise exception 'Explain why HR review is requested';end if;
 select incident_id into ir from operations_private.hr_review_referrals where issue_id=i.id;if found then return ir;end if;
 descr:='Operations review referral — HR investigation requested. No disciplinary finding or NTE issued.'||E'\n'||p_note||E'\nIssue: '||i.description||E'\nCause: '||i.cause||E'\nCorrection plan: '||i.action_plan||E'\nExecution: '||r.assignment_id||E'\nReview: '||r.id||E'\nIssue: '||i.id||E'\nHistory: '||(select coalesce(jsonb_agg(jsonb_build_object('action',d.action,'note',d.note,'actor_id',d.actor_id,'time',d.created_at)),'[]')::text from operations_private.review_decisions d where d.review_id=r.id);
 insert into public.incident_reports(category,description,location,date_time,reported_by,involved_employee_ids,involved_employee_names,witness_ids,witness_names,status,pipeline_stage,nte_ids,business_unit_id,business_unit_name,chat_thread)
 values('Operations review',descr,(select name from public.business_units where id=r.business_unit_id),now(),actor,case when i.responsible_id is null then '{}'::uuid[] else array[i.responsible_id] end,case when i.responsible_id is null then '{}'::text[] else array[(select full_name from public.hris_users where id=i.responsible_id)] end,'{}','{}','Submitted','ir-review','{}',r.business_unit_id,(select name from public.business_units where id=r.business_unit_id),'[]') returning id into ir;
 insert into operations_private.hr_review_referrals(issue_id,incident_id,actor_id) values(i.id,ir,actor);perform operations_private.review_audit(r.id,'Referred to HR',jsonb_build_object('issue_id',i.id,'incident_id',ir));return ir;
end$$;
create function public.ops_review_delegate(p_unit uuid,p_user uuid,p_review bool) returns void language plpgsql security definer set search_path='' as $$begin
 perform operations_private.actor();if not operations_private.manager(p_unit) or not operations_private.member(p_user,p_unit) then raise exception 'Only unit management can grant review access' using errcode='42501';end if;
 insert into public.ops_permissions(user_id,business_unit_id,can_review,granted_by) values(p_user,p_unit,p_review,operations_private.actor()) on conflict(user_id,business_unit_id) do update set can_review=p_review,granted_by=excluded.granted_by,updated_at=now();
 insert into public.ops_audit_log(business_unit_id,actor_id,action,detail) values(p_unit,operations_private.actor(),'Review delegation',jsonb_build_object('user',p_user,'can_review',p_review));
end$$;
create function public.ops_review_reassign(p_id uuid,p_revision int,p_user uuid,p_note text) returns void language plpgsql security definer set search_path='' as $$declare r operations_private.reviews;begin
 perform operations_private.actor();select * into r from operations_private.reviews where id=p_id;if not operations_private.manager(r.business_unit_id) then raise exception 'Only unit management can reassign review' using errcode='42501';end if;r:=operations_private.lock_review(p_id);
 if r.revision is distinct from p_revision then raise exception 'Review changed. Refresh before reassignment.' using errcode='40001';end if;
 if length(trim(coalesce(p_note,'')))<3 or (p_user is not null and not operations_private.review_eligible(r.id,false,p_user)) then raise exception 'Choose an eligible independent reviewer and give a reason';end if;
 update operations_private.reviews set reviewer_id=p_user,revision=revision+1,updated_at=now() where id=p_id;perform operations_private.review_audit(p_id,'Reviewer reassigned',jsonb_build_object('note',p_note,'from',r.reviewer_id,'to',p_user));
end$$;
create function public.ops_review_settings(p_unit uuid,p_settings jsonb) returns void language plpgsql security definer set search_path='' as $$begin
 perform operations_private.actor();if not operations_private.manager(p_unit) then raise exception 'Only unit management can change review settings' using errcode='42501';end if;
 insert into operations_private.review_settings(business_unit_id,review_hours,daily_time,repeat_count,repeat_days,updated_by) values(p_unit,(p_settings->>'review_hours')::int,(p_settings->>'daily_time')::time,(p_settings->>'repeat_count')::int,(p_settings->>'repeat_days')::int,operations_private.actor()) on conflict(business_unit_id) do update set review_hours=excluded.review_hours,daily_time=excluded.daily_time,repeat_count=excluded.repeat_count,repeat_days=excluded.repeat_days,updated_by=excluded.updated_by,updated_at=now();
 insert into public.ops_audit_log(business_unit_id,actor_id,action,detail) values(p_unit,operations_private.actor(),'Review settings updated',p_settings);
end$$;

create or replace function operations_private.capture_review() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.ops_assignments;r operations_private.reviews;rid uuid;by_user uuid;begin
 select * into a from public.ops_assignments where id=new.id;rid:=operations_private.ensure_review(a.id);select * into r from operations_private.reviews where id=rid for update;
 if not exists(select 1 from public.ops_assignments x where (x.id=r.assignment_id or x.checklist_run_id=r.run_id) and x.status<>'Cancelled') then update operations_private.reviews set state='Cancelled',revision=revision+1,updated_at=now() where id=rid and state<>'Cancelled';return null;end if;
 if a.status='Completed' and r.state in('Executing','Needs correction') and not exists(select 1 from public.ops_assignments x where (x.id=r.assignment_id or x.checklist_run_id=r.run_id) and x.status not in('Completed','Cancelled')) then
 select submitted_by into by_user from public.ops_checklist_runs where id=r.run_id;by_user:=coalesce(by_user,public.current_hris_user_id(),a.assignee_id);
 insert into operations_private.review_submissions(review_id,number,actor_id,snapshot) values(rid,r.submission+1,by_user,operations_private.review_snapshot(rid));
 update operations_private.reviews set submission=submission+1,state=case when mode='Daily Summary' then 'Confirmed' else 'Awaiting verification' end,first_reviewer=null,equipment_condition=null,revision=revision+1,updated_at=now() where id=rid returning * into r;
 if exists(select 1 from public.ops_responses x join public.ops_run_items y on y.id=x.item_id where y.run_id=r.run_id and x.issue) then
 perform operations_private.new_review_issue(rid,(select string_agg((y.snapshot->>'title')||': '||coalesce(nullif(x.remarks,''),'Issue flagged by employee'),E'\n') from public.ops_responses x join public.ops_run_items y on y.id=x.item_id where y.run_id=r.run_id and x.issue),case when r.critical then 'Critical' else 'Important' end,'Other',null,now()+interval '24 hours');
 end if;
 end if;return null;
end$$;
