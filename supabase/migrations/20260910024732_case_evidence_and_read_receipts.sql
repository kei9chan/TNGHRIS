create table case_correspondence.message_reads(message_id uuid not null references case_correspondence.messages(id),reader uuid not null references public.hris_users(id),opened_at timestamptz not null default clock_timestamp(),primary key(message_id,reader));
alter table case_correspondence.message_reads enable row level security;
revoke all on case_correspondence.message_reads from public,anon,authenticated;
create trigger message_reads_immutable before update or delete on case_correspondence.message_reads for each row execute function case_correspondence.immutable();
create function case_correspondence.audit_message_read() returns trigger language plpgsql security definer set search_path='' as $$begin
 perform case_correspondence.log((select case_id from case_correspondence.messages where id=new.message_id),'message opened',null,to_jsonb(new));return new;end$$;
revoke all on function case_correspondence.audit_message_read() from public,anon,authenticated;
create trigger message_read_audit after insert on case_correspondence.message_reads for each row execute function case_correspondence.audit_message_read();
create or replace function case_correspondence.ensure_case(p_id uuid) returns void language plpgsql security definer set search_path='' as $$begin
 insert into case_correspondence.cases(id,original) select id,jsonb_build_object('caseNumber',coalesce('TNGIR-'||lpad(case_number::text,5,'0'),id::text),'submittedAt',created_at,'category',category,'description',description,'location',location,'date',date_time,'complainantId',reported_by,'attachment',attachment_url,'files',to_jsonb(attachment_urls)) from public.incident_reports where id=p_id on conflict do nothing;
end$$;
create or replace function public.get_case_questions(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id(); full_view boolean; r public.incident_reports; result jsonb; opened_question record;
begin
 if not case_correspondence.readable(p_id) then raise exception 'Case correspondence unavailable' using errcode='42501';end if;
 full_view:=case_correspondence.oversight(p_id);select * into r from public.incident_reports where id=p_id;
 for opened_question in select id from case_correspondence.questions where case_id=p_id and recipient=actor and opened_at is null for update loop update case_correspondence.questions set opened_at=clock_timestamp() where id=opened_question.id;end loop;
 insert into case_correspondence.message_reads(message_id,reader)
 select m.id,actor from case_correspondence.messages m where m.case_id=p_id and not m.draft and m.author<>actor and (full_view or (m.kind='reply' and exists(select 1 from case_correspondence.questions qr where qr.id=m.question_id and qr.recipient=actor))) on conflict do nothing;
 select jsonb_build_object('id',p_id,'reference',coalesce('TNGIR-'||lpad(r.case_number::text,5,'0'),p_id::text),'canManage',case_correspondence.manage(p_id),'canComment',full_view,'isComplainant',r.reported_by=actor,'actorId',actor,
 'status',coalesce((select status from case_correspondence.cases where id=p_id),'HR Reviewing Response'),
 'original',case when full_view or r.reported_by=actor then coalesce((select original from case_correspondence.cases where id=p_id),jsonb_build_object('description',r.description,'category',r.category,'submittedAt',r.created_at,'attachment',r.attachment_url,'files',to_jsonb(r.attachment_urls))) else null end,
 'recipient',case when full_view then (select jsonb_build_object('id',id,'name',full_name) from public.hris_users where id=r.reported_by) else null end,
 'managers',case when case_correspondence.manage(p_id) then coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.full_name)) from public.hris_users u where lower(u.status)='active' and u.id in (select private.resolve_direct_manager_id(e) from unnest(coalesce(r.involved_employee_ids,'{}'::uuid[])||array[r.reported_by]) e)),'[]') else '[]' end,
 'questions',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from (select q.*,s.full_name sender_name,u.full_name recipient_name from case_correspondence.questions q join public.hris_users s on s.id=q.sender join public.hris_users u on u.id=q.recipient where q.case_id=p_id and (full_view or q.recipient=actor)) t),'[]'),
 'messages',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from (select m.*,u.full_name author_name from case_correspondence.messages m join public.hris_users u on u.id=m.author where m.case_id=p_id and ((m.draft and m.author=actor) or (not m.draft and (full_view or (m.kind='reply' and exists(select 1 from case_correspondence.questions q where q.id=m.question_id and q.recipient=actor)))))) t),'[]'),
 'timeline',case when full_view then coalesce((select jsonb_agg(to_jsonb(t) order by created_at) from (select a.action,a.actor,a.actor_roles,a.created_at,a.previous_value,a.new_value from case_correspondence.audit a where a.case_id=p_id order by a.created_at desc limit 200) t),'[]') else '[]' end
 ) into result;return result;
end$$;

notify pgrst,'reload schema';
