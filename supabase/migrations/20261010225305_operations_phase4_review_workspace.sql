create function operations_private.review_json(rid uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(r)||jsonb_build_object('title',coalesce(o.title,v.content->>'title'),'unit_name',b.name,'location',v.content->>'location','asset',o.asset_context,'event',o.config->'event_window','assignment_status',a.status,
 'participants',(select coalesce(jsonb_agg(jsonb_build_object('id',x.assignee_id,'name',h.full_name)),'[]') from public.ops_assignments x join public.hris_users h on h.id=x.assignee_id where x.id=r.assignment_id or x.checklist_run_id=r.run_id),
 'can_review',operations_private.review_eligible(r.id,r.state='Awaiting BOD review') and (r.state='Awaiting BOD review' or r.reviewer_id is null or r.reviewer_id=public.current_hris_user_id()),
 'can_manage',operations_private.manager(r.business_unit_id),
 'reviewer_needed',not exists(select 1 from public.hris_users h where operations_private.review_eligible(r.id,r.state='Awaiting BOD review',h.id) and (r.state='Awaiting BOD review' or r.reviewer_id is null or r.reviewer_id=h.id)),
 'eligible_reviewers',(select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'name',h.full_name)),'[]') from public.hris_users h where operations_private.review_eligible(r.id,r.state='Awaiting BOD review',h.id)),
 'reviewer_name',(select full_name from public.hris_users where id=r.reviewer_id),'first_reviewer_name',(select full_name from public.hris_users where id=r.first_reviewer),
 'issues',(select coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object('responsible_name',(select full_name from public.hris_users where id=i.responsible_id),'can_recheck',i.status='Awaiting recheck' and i.responsible_id is distinct from public.current_hris_user_id() and r.state<>'Needs correction' and (operations_private.review_eligible(r.id,false) or operations_private.review_eligible(r.id,true)),
 'incident_id',case when operations_private.manager(r.business_unit_id) then (select incident_id from operations_private.hr_review_referrals where issue_id=i.id) else null end,
 'repeat_count',case when operations_private.review_manager(r.business_unit_id) then (select count(distinct q.review_id) from operations_private.review_issues q join operations_private.reviews qr on qr.id=q.review_id where qr.business_unit_id=r.business_unit_id and q.responsible_id=i.responsible_id and q.confirmed_quality and q.cause='Execution quality' and q.created_at>=now()-make_interval(days=>coalesce((select repeat_days from operations_private.review_settings where business_unit_id=r.business_unit_id),30))) else 0 end) order by i.created_at desc),'[]') from operations_private.review_issues i where i.review_id=r.id))
 from operations_private.reviews r join public.ops_assignments a on a.id=r.assignment_id join public.ops_template_versions v on v.id=a.template_version_id join public.business_units b on b.id=r.business_unit_id left join public.ops_occurrences o on o.id=a.occurrence_id where r.id=rid and operations_private.review_view(r.id)
$$;
create function operations_private.daily_scope(u uuid,d date) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('work',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'revision',revision,'submission',submission,'state',state) order by id),'[]') from operations_private.reviews where business_unit_id=u and operating_date=d),
 'issues',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'revision',i.revision,'status',i.status) order by i.id),'[]') from operations_private.review_issues i join operations_private.reviews r on r.id=i.review_id where r.business_unit_id=u and r.operating_date=d),
 'coverage',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'revision',revision,'coverage',coverage) order by id),'[]') from public.ops_occurrences where business_unit_id=u and operating_date=d))
$$;
create function operations_private.daily_start(u uuid,d date) returns operations_private.daily_reviews language plpgsql security definer set search_path='' as $$
declare s operations_private.daily_reviews;sample_ids uuid[];begin
 if not operations_private.manager(u) then raise exception 'Daily unit review requires unit management' using errcode='42501';end if;
 if d is null or d>(now() at time zone 'Asia/Manila')::date or d<(now() at time zone 'Asia/Manila')::date-366 then raise exception 'Choose an operating day within the past year';end if;
 insert into operations_private.daily_reviews(business_unit_id,operating_date,actor_id) values(u,d,operations_private.actor()) on conflict do nothing;
 select * into s from operations_private.daily_reviews where business_unit_id=u and operating_date=d for update;
 if s.completed_at is not null then return s;end if;
 -- Deterministic, persisted sample set. Previously problematic templates receive priority.
 if cardinality(s.samples)=0 then
 select coalesce(array_agg(id),'{}') into sample_ids from (select r.id from operations_private.reviews r join public.ops_assignments a on a.id=r.assignment_id join public.ops_template_versions v on v.id=a.template_version_id join public.ops_templates t on t.id=v.template_id
 where r.business_unit_id=u and r.operating_date=d and r.mode='Daily Summary' and r.state='Confirmed' and operations_private.review_eligible(r.id,false)
 order by exists(select 1 from operations_private.review_issues i join operations_private.reviews prior on prior.id=i.review_id join public.ops_assignments pa on pa.id=prior.assignment_id join public.ops_template_versions pv on pv.id=pa.template_version_id where pv.template_id=v.template_id) desc,(t.kind='checklist') desc,r.id limit 2) chosen;
 update operations_private.daily_reviews set samples=sample_ids,revision=revision+1 where id=s.id returning * into s;
 end if;return s;
end$$;
create function public.ops_daily_review(p_unit uuid,p_date date,p_revision int,p_action text,p_payload jsonb default '{}') returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=operations_private.actor();s operations_private.daily_reviews;r operations_private.reviews;rid uuid;rid2 uuid;check_data jsonb;begin
 if not operations_private.manager(p_unit) then raise exception 'Unit management review required' using errcode='42501';end if;
 -- Lock sample executions before the daily row, matching all review decision lock ordering.
 select * into s from operations_private.daily_reviews where business_unit_id=p_unit and operating_date=p_date;
 for rid2 in select unnest(s.samples) order by 1 loop perform operations_private.lock_review(rid2);end loop;
 select * into s from operations_private.daily_reviews where business_unit_id=p_unit and operating_date=p_date for update;
 if s.id is null or s.revision is distinct from p_revision then raise exception 'Daily review changed. Refresh before continuing.' using errcode='40001';end if;
 if p_action='Restart' then
 if (s.completed_at is not null and s.scope=operations_private.daily_scope(p_unit,p_date)) or (s.completed_at is null and not exists(select 1 from operations_private.reviews where id=any(s.samples) and (state<>'Confirmed' or not operations_private.review_eligible(id,false)))) then raise exception 'No changed daily scope to review';end if;
 update operations_private.daily_reviews set completed_at=null,samples='{}',checks='{}',revision=revision+1 where id=s.id;perform operations_private.daily_start(p_unit,p_date);return;
 end if;
 if s.completed_at is not null then raise exception 'Daily review is complete. Reopen changed scope first.';end if;
 if p_action='Check' then
 rid:=(p_payload->>'review_id')::uuid;
 if not rid=any(s.samples) then raise exception 'Only a selected routine sample may be checked';end if;
 select * into r from operations_private.reviews where id=rid;
 if r.revision is distinct from (p_payload->>'review_revision')::int or r.state<>'Confirmed' or r.mode<>'Daily Summary' or not operations_private.review_eligible(r.id,false) then raise exception 'Sample changed or independent review unavailable. Refresh.' using errcode='40001';end if;
 if p_payload->>'result' not in('Satisfactory','Issue found') or p_payload->>'method' not in('Evidence review','Physical inspection','Evidence and physical inspection') then raise exception 'Choose a finding and inspection method';end if;
 if p_payload->>'method' in('Evidence review','Evidence and physical inspection') and exists(select 1 from public.ops_evidence e join public.ops_run_items x on x.id=e.item_id where x.run_id=r.run_id and (e.expires_at<=now() or e.state='Expired') and not exists(select 1 from public.ops_evidence fresh where fresh.item_id=e.item_id and fresh.state='Ready' and fresh.expires_at>now() and fresh.deleted_at is null)) then raise exception 'Expired evidence cannot be reviewed. Use a fresh physical inspection or request new evidence.';end if;
 if p_payload->>'result'='Issue found' then perform operations_private.new_review_issue(r.id,p_payload->>'note','Routine',coalesce(p_payload->>'cause','Other'),null,now()+interval '24 hours');end if;
 check_data:=p_payload||jsonb_build_object('actor_id',actor,'checked_at',now(),'submission',r.submission);
 update operations_private.daily_reviews set checks=checks||jsonb_build_object(rid::text,check_data),revision=revision+1 where id=s.id;
 insert into operations_private.review_decisions(review_id,submission,actor_id,action,method,note,detail) values(r.id,r.submission,actor,'Daily spot check',p_payload->>'method',coalesce(p_payload->>'note',''),check_data);
 perform operations_private.review_audit(r.id,'Daily spot check',check_data);
 elsif p_action='Complete' then
 for rid in select unnest(s.samples) loop
 select * into r from operations_private.reviews where id=rid;
 if not s.checks ? rid::text or (s.checks->rid::text->>'review_revision')::int is distinct from r.revision or (s.checks->rid::text->>'submission')::int is distinct from r.submission or r.state<>'Confirmed' or not operations_private.review_eligible(r.id,false) then raise exception 'Complete each independent routine sample before finishing';end if;end loop;
 if cardinality(s.samples)=0 and length(trim(coalesce(p_payload->>'note','')))<3 then raise exception 'Explain the missing work or lack of eligible independent samples';end if;
 update operations_private.daily_reviews set completed_at=now(),actor_id=actor,scope=operations_private.daily_scope(p_unit,p_date),note=coalesce(p_payload->>'note',''),revision=revision+1 where id=s.id;
 insert into public.ops_audit_log(business_unit_id,actor_id,action,detail) values(p_unit,actor,'Daily review completed',jsonb_build_object('operating_date',p_date,'samples',s.samples,'checks',s.checks,'scope',operations_private.daily_scope(p_unit,p_date),'note',p_payload->>'note','meaning','Daily summary reviewed; unsampled work is not individually verified'));
 else raise exception 'Invalid daily review action';end if;
end$$;
create function public.ops_review_detail(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 perform operations_private.actor();if not operations_private.review_view(p_id) then raise exception 'Review unavailable' using errcode='42501';end if;
 return operations_private.review_json(p_id)||jsonb_build_object('decisions',(select coalesce(jsonb_agg(to_jsonb(d)||jsonb_build_object('actor_name',(select full_name from public.hris_users where id=d.actor_id)) order by d.created_at desc),'[]') from operations_private.review_decisions d where review_id=p_id),
 'submissions',(select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('actor_name',(select full_name from public.hris_users where id=s.actor_id)) order by number desc),'[]') from operations_private.review_submissions s where review_id=p_id),
 'issue_history',(select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('actor_name',(select full_name from public.hris_users where id=e.actor_id)) order by e.created_at desc),'[]') from operations_private.review_issue_events e join operations_private.review_issues i on i.id=e.issue_id where i.review_id=p_id));
end$$;
create function public.ops_review_workspace(p_unit uuid,p_date date,p_offset int default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=operations_private.actor();daily operations_private.daily_reviews;rows jsonb;begin
 if p_date is null or p_offset not between 0 and 100000 then raise exception 'Invalid review date or page';end if;
 if p_unit is not null and not operations_private.review_manager(p_unit) then raise exception 'Review workspace is outside your scope' using errcode='42501';end if;
 if p_unit is null and not exists(select 1 from public.business_units b where operations_private.review_manager(b.id)) then raise exception 'Review permission required' using errcode='42501';end if;
 if p_unit is not null and operations_private.manager(p_unit) then daily:=operations_private.daily_start(p_unit,p_date);end if;
 select coalesce(jsonb_agg(operations_private.review_json(x.id) order by critical desc,review_due,id),'[]') into rows from (select r.* from operations_private.reviews r where (p_unit is null or r.business_unit_id=p_unit) and operations_private.review_manager(r.business_unit_id) and operations_private.review_view(r.id) and ((r.operating_date=p_date) or r.state in('Awaiting verification','Awaiting BOD review','Needs correction') or exists(select 1 from operations_private.review_issues where review_id=r.id and status<>'Resolved')) order by critical desc,review_due,id limit 100 offset p_offset) x;
 return jsonb_build_object('actor',actor,'records',rows,'has_more',jsonb_array_length(rows)=100,'can_manage',p_unit is not null and operations_private.manager(p_unit),'bod',exists(select 1 from public.business_units b where (p_unit is null or b.id=p_unit) and operations_private.admin(b.id)),
 'daily',case when daily.id is null then null else to_jsonb(daily)||jsonb_build_object('changed',daily.completed_at is not null and daily.scope is distinct from operations_private.daily_scope(p_unit,p_date),'samples',(select coalesce(jsonb_agg(operations_private.review_json(x)),'[]') from unnest(daily.samples) x),
 'counts',(select jsonb_build_object('expected',count(*),'confirmed',count(*) filter(where state in('Confirmed','Awaiting verification','Awaiting BOD review','Verified','Historical')),'missing',count(*) filter(where state in('Executing','Needs correction') and coalesce(correction_due,original_due)<now()),'awaiting',count(*) filter(where state in('Awaiting verification','Awaiting BOD review')),'issues',(select count(*) from operations_private.review_issues i join operations_private.reviews r on r.id=i.review_id where r.business_unit_id=p_unit and r.operating_date=p_date and i.status<>'Resolved'),'uncovered',(select count(*) from public.ops_occurrences where business_unit_id=p_unit and operating_date=p_date and status='Open' and coverage in('Uncovered','No owner','At risk','Schedule missing'))) from operations_private.reviews where business_unit_id=p_unit and operating_date=p_date and state<>'Cancelled')) end,
 'settings',coalesce((select to_jsonb(s) from operations_private.review_settings s where business_unit_id=p_unit),'{"review_hours":24,"daily_time":"23:00","repeat_count":3,"repeat_days":30}'),
 'summary',(select coalesce(jsonb_agg(x),'[]') from(select r.business_unit_id,b.name unit_name,count(*) filter(where r.state<>'Cancelled') total,count(*) filter(where r.state in('Confirmed','Awaiting verification','Awaiting BOD review','Verified','Historical')) confirmed,count(*) filter(where r.state='Verified') individually_verified,count(*) filter(where r.state in('Awaiting verification','Awaiting BOD review')) pending,count(*) filter(where r.state in('Awaiting verification','Awaiting BOD review','Needs correction') and r.review_due<now()) overdue,(select count(*) from operations_private.review_issues i join operations_private.reviews rr on rr.id=i.review_id where rr.business_unit_id=r.business_unit_id and i.status<>'Resolved') open_issues,(select count(*) from operations_private.daily_reviews d where d.business_unit_id=r.business_unit_id and d.operating_date>=p_date-6 and d.completed_at is not null) daily_reviews from operations_private.reviews r join public.business_units b on b.id=r.business_unit_id where (p_unit is null or r.business_unit_id=p_unit) and operations_private.review_manager(r.business_unit_id) and r.operating_date between p_date-6 and p_date group by r.business_unit_id,b.name) x));
end$$;
alter function operations_private.workspace(uuid) rename to workspace_before_review;
create function operations_private.workspace(p_unit uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare w jsonb:=operations_private.workspace_before_review(p_unit);begin
 return w||jsonb_build_object('units',(select coalesce(jsonb_agg(u||jsonb_build_object('review',operations_private.review_manager((u->>'id')::uuid),'bod',operations_private.admin((u->>'id')::uuid))),'[]') from jsonb_array_elements(w->'units') u),
 'assignments',(select coalesce(jsonb_agg(a||jsonb_build_object('review',operations_private.review_json(r.id),'execution',case when a->'execution' is null or a->'execution'='null'::jsonb then a->'execution' else a->'execution'||jsonb_build_object('can_reopen',r.state='Historical' and (a->'execution'->>'can_reopen')::bool) end)),'[]') from jsonb_array_elements(w->'assignments') a left join operations_private.reviews r on r.assignment_id=(a->>'id')::uuid or (r.run_id is not null and r.run_id=(a->>'checklist_run_id')::uuid)));
end$$;
-- Existing maintenance/event histories show execution, verification and equipment readiness separately.
alter function operations_private.maintenance_work_json(uuid) rename to maintenance_work_before_review;
create function operations_private.maintenance_work_json(p_occ uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(x||jsonb_build_object('review',operations_private.review_json(r.id))),'[]') from jsonb_array_elements(operations_private.maintenance_work_before_review(p_occ)) x left join operations_private.reviews r on r.assignment_id=(x->>'id')::uuid or (r.run_id is not null and r.run_id=(x->>'checklist_run_id')::uuid)
$$;
create function operations_private.occurrence_reviews(oid uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(operations_private.review_json(r.id)),'[]') from operations_private.reviews r join public.ops_assignments a on a.id=r.assignment_id where a.occurrence_id=oid and operations_private.review_view(r.id)
$$;
alter function operations_private.event_workspace(uuid) rename to event_workspace_before_review;
create function operations_private.event_workspace(p_unit uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare w jsonb:=operations_private.event_workspace_before_review(p_unit);begin
 return w||jsonb_build_object('events',(select coalesce(jsonb_agg(e||jsonb_build_object('work',(select coalesce(jsonb_agg(x||jsonb_build_object('reviews',operations_private.occurrence_reviews((x->>'id')::uuid))),'[]') from jsonb_array_elements(e->'work') x))),'[]') from jsonb_array_elements(w->'events') e));
end$$;
-- Bounded, deduplicated notification tick. The existing push trigger picks up Operations links.
create function operations_private.review_notice(who uuid,k text,msg text,link text) returns void language plpgsql security definer set search_path='' as $$begin
 insert into operations_private.review_notices(recipient,event_key) values(who,k) on conflict do nothing;if not found then return;end if;
 insert into public.notifications(user_id,type,title,message,link,dedupe_key) values(who::text,'info','Operations review',msg,link,'ops-review:'||k) on conflict(user_id,dedupe_key) do nothing;
end$$;
create function operations_private.review_tick() returns void language plpgsql security definer set search_path='' as $$
declare r operations_private.reviews;h record;i record;u record;d date;review_end timestamptz;begin
 if not pg_try_advisory_xact_lock(746320044) then return;end if;
 for r in select * from operations_private.reviews where state in('Awaiting verification','Awaiting BOD review','Needs correction') order by updated_at limit 500 loop
 if r.state='Needs correction' then
 for h in select assignee_id id,id assignment_id from public.ops_assignments where (id=r.assignment_id or checklist_run_id=r.run_id) and status<>'Cancelled' and operations_private.member(assignee_id,business_unit_id) loop perform operations_private.review_notice(h.id,'correction:'||r.id||':'||r.submission,'Your work needs correction. Open your task for the recorded instructions.','/operations?view=Tasks&assignment='||h.assignment_id);end loop;
 else
 for h in select id from public.hris_users where operations_private.review_eligible(r.id,r.state='Awaiting BOD review',id) and (r.state='Awaiting BOD review' or r.reviewer_id is null or r.reviewer_id=id) loop perform operations_private.review_notice(h.id,case when r.critical then 'critical-pending:' else 'pending:' end||r.id||':'||r.submission||':'||r.state,'Work is ready for an independent review.','/operations?view=Review&review='||r.id);end loop;
 end if;
 if (case when r.state='Needs correction' then r.correction_due else r.review_due end)<now() then for h in select id from public.hris_users where operations_private.role_unit(id,r.business_unit_id,array['Admin','Board of Director','Business Unit Manager','GeneralManager']) loop perform operations_private.review_notice(h.id,'review-overdue:'||r.id||':'||r.submission||':'||r.state,'An important correction or review deadline has been missed.','/operations?view=Review&review='||r.id);end loop;end if;
 if r.state<>'Needs correction' and not exists(select 1 from public.hris_users where operations_private.review_eligible(r.id,r.state='Awaiting BOD review',id) and (r.state='Awaiting BOD review' or r.reviewer_id is null or r.reviewer_id=id)) then for h in select id from public.hris_users where operations_private.role_unit(id,r.business_unit_id,array['Admin','Board of Director']) loop perform operations_private.review_notice(h.id,'reviewer-needed:'||r.id||':'||r.submission,'An independent reviewer is needed.','/operations?view=Review&review='||r.id);end loop;end if;
 end loop;
 for i in select x.*,q.business_unit_id from operations_private.review_issues x join operations_private.reviews q on q.id=x.review_id where x.status<>'Resolved' and (x.severity='Critical' or x.due_at<now()) order by x.due_at limit 500 loop
 for h in select id from public.hris_users where operations_private.role_unit(id,i.business_unit_id,array['Admin','Board of Director','Business Unit Manager','GeneralManager']) loop perform operations_private.review_notice(h.id,'issue:'||i.id||':'||case when i.severity='Critical' then 'critical' else 'overdue' end,'An operational issue needs urgent management attention.','/operations?view=Review&review='||i.review_id);end loop;end loop;
 for i in select q.business_unit_id,x.responsible_id,count(distinct x.review_id) n,coalesce(s.repeat_count,3) threshold,coalesce(s.repeat_days,30) days from operations_private.review_issues x join operations_private.reviews q on q.id=x.review_id left join operations_private.review_settings s on s.business_unit_id=q.business_unit_id where x.confirmed_quality and x.cause='Execution quality' and x.responsible_id is not null and x.created_at>=now()-make_interval(days=>coalesce(s.repeat_days,30)) group by q.business_unit_id,x.responsible_id,s.repeat_count,s.repeat_days having count(distinct x.review_id)>=coalesce(s.repeat_count,3) limit 500 loop
 for h in select id from public.hris_users where operations_private.role_unit(id,i.business_unit_id,array['Admin','Board of Director','Business Unit Manager','GeneralManager']) loop perform operations_private.review_notice(h.id,'repeat:'||i.business_unit_id||':'||i.responsible_id||':'||to_char(now() at time zone 'Asia/Manila','IYYY-IW'),'Repeated confirmed quality incidents need management review.','/operations?view=Review&unit='||i.business_unit_id);end loop;end loop;
 for r in select * from operations_private.reviews where state='Executing' and original_due<now() order by original_due limit 500 loop
 for h in select id from public.hris_users where operations_private.role_unit(id,r.business_unit_id,array['Admin','Board of Director','Business Unit Manager','GeneralManager']) loop perform operations_private.review_notice(h.id,'work-overdue:'||r.id,'Assigned work is overdue and needs coverage or corrective action.','/operations?view=Review&review='||r.id);end loop;end loop;
 for u in select distinct q.business_unit_id from operations_private.reviews q where q.operating_date between (now() at time zone 'Asia/Manila')::date-7 and (now() at time zone 'Asia/Manila')::date loop
 for d in select distinct operating_date from operations_private.reviews where business_unit_id=u.business_unit_id and operating_date between (now() at time zone 'Asia/Manila')::date-7 and (now() at time zone 'Asia/Manila')::date loop
 select greatest((d+coalesce((select daily_time from operations_private.review_settings where business_unit_id=u.business_unit_id),time '23:00')) at time zone 'Asia/Manila',coalesce((select max(window_end) from public.ops_occurrences where business_unit_id=u.business_unit_id and operating_date=d),'-infinity'::timestamptz)) into review_end;
 if d>=(now() at time zone 'Asia/Manila')::date-1 and now()>=review_end and not exists(select 1 from operations_private.daily_reviews where business_unit_id=u.business_unit_id and operating_date=d and completed_at is not null and scope=operations_private.daily_scope(u.business_unit_id,d)) then for h in select id from public.hris_users where operations_private.role_unit(id,u.business_unit_id,array['Business Unit Manager','GeneralManager']) loop perform operations_private.review_notice(h.id,'daily:'||u.business_unit_id||':'||d,'Your daily Operations summary is ready for review.','/operations?view=Review&date='||d||'&unit='||u.business_unit_id);end loop;end if;
 if now()>=review_end+interval '24 hours' and not exists(select 1 from operations_private.daily_reviews where business_unit_id=u.business_unit_id and operating_date=d and completed_at is not null) then for h in select id from public.hris_users where operations_private.role_unit(id,u.business_unit_id,array['Admin','Board of Director']) loop perform operations_private.review_notice(h.id,'daily-missed:'||u.business_unit_id||':'||d,'A business unit has not completed its daily review.','/operations?view=Review&date='||d||'&unit='||u.business_unit_id);end loop;end if;
 end loop;end loop;
 if extract(isodow from now() at time zone 'Asia/Manila')=1 and (now() at time zone 'Asia/Manila')::time>=time '09:00' then
 for h in select distinct hh.id from public.hris_users hh join operations_private.reviews rr on rr.operating_date>=(now() at time zone 'Asia/Manila')::date-7 and operations_private.role_unit(hh.id,rr.business_unit_id,array['Admin','Board of Director']) loop perform operations_private.review_notice(h.id,'weekly:'||to_char(now() at time zone 'Asia/Manila','IYYY-IW'),'Your weekly Operations review summary is available.','/operations?view=Review');end loop;end if;
end$$;
do $$begin if exists(select 1 from pg_extension where extname='pg_cron') then perform cron.schedule('ops-review-escalation','* * * * *','select operations_private.review_tick()');end if;end$$;
-- Optional additional independent inspection; records a finding without rewriting prior approval.
create function public.ops_review_spot_check(p_id uuid,p_revision int,p_details jsonb) returns void language plpgsql security definer set search_path='' as $$declare r operations_private.reviews;begin
 perform operations_private.actor();if not operations_private.review_view(p_id) then raise exception 'Review unavailable' using errcode='42501';end if;r:=operations_private.lock_review(p_id);
 if r.revision is distinct from p_revision then raise exception 'Review changed. Refresh.' using errcode='40001';end if;
 if r.state not in('Confirmed','Verified') or not operations_private.review_eligible(r.id,false) then raise exception 'Independent confirmed-work inspection required' using errcode='42501';end if;
 if p_details->>'result' not in('Satisfactory','Issue found') or p_details->>'method' not in('Evidence review','Physical inspection','Evidence and physical inspection') then raise exception 'Choose finding and inspection method';end if;
 if p_details->>'method' in('Evidence review','Evidence and physical inspection') and exists(select 1 from public.ops_evidence e join public.ops_run_items x on x.id=e.item_id where x.run_id=r.run_id and (e.expires_at<=now() or e.state='Expired') and not exists(select 1 from public.ops_evidence fresh where fresh.item_id=e.item_id and fresh.state='Ready' and fresh.expires_at>now() and fresh.deleted_at is null)) then raise exception 'Expired evidence cannot be reviewed. Inspect physically or obtain fresh evidence.';end if;
 if p_details->>'result'='Issue found' then perform operations_private.new_review_issue(r.id,p_details->>'note','Important',coalesce(p_details->>'cause','Other'),null,now()+interval '24 hours');end if;
 insert into operations_private.review_decisions(review_id,submission,actor_id,action,method,note,detail) values(r.id,r.submission,operations_private.actor(),'Additional spot check',p_details->>'method',coalesce(p_details->>'note',''),p_details);
 perform operations_private.review_audit(r.id,'Additional spot check',p_details);
end$$;

create or replace function phone_push_private.queue_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare k text;begin
 if new.link !~ '^/operations([?]|$)' then return new;end if;
 k:=case when new.link like '%view=Coverage%' or new.link like '%view=Maintenance%' or new.dedupe_key like 'ops-review:issue:%' or new.dedupe_key like 'ops-review:critical-pending:%' or new.dedupe_key like 'ops-review:reviewer-needed:%' or new.dedupe_key like 'ops-review:work-overdue:%' or new.dedupe_key like 'ops-review:review-overdue:%' then 'coverage' when new.dedupe_key like 'ops-phone-assignment:%' then 'assignments' else 'reminders' end;
 insert into phone_push_private.jobs(device_id,user_id,generation,notification_id,kind,link)
 select id,user_id,generation,new.id,k,new.link from phone_push_private.devices where user_id::text=new.user_id and active and coalesce((preferences->>k)::boolean,true);
 return new;
end$$;

-- Public RPC wrappers are deliberately authenticated-only; all private helpers remain inaccessible.
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('ops_review_decide','ops_review_issue','ops_review_referral','ops_review_delegate','ops_review_reassign','ops_review_settings','ops_daily_review','ops_review_detail','ops_review_workspace','ops_review_spot_check') loop execute format('revoke all on function %s from public,anon,authenticated',f);execute format('grant execute on function %s to authenticated',f);end loop;
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='operations_private' and (p.proname like 'review_%' or p.proname in('ensure_review','capture_review','lock_review','new_review_issue','daily_scope','daily_start','workspace','validate_content','reopen_run','check_item','workspace_before_review','validate_content_before_review','reopen_run_before_review','check_item_before_review','maintenance_work_before_review','maintenance_work_json','occurrence_reviews','event_workspace_before_review','event_workspace')) loop execute format('revoke all on function %s from public,anon,authenticated',f);end loop;end$$;
