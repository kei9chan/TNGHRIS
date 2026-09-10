-- A unique active fingerprint is an additional race-condition backstop for new submissions.
alter table public.leave_requests add column submission_fingerprint text;
create unique index leave_one_active_submission on public.leave_requests(employee_id,submission_fingerprint) where duplicate_of is null and status in('Pending','PendingGM','PendingBOD','Approved') and submission_fingerprint is not null;
create function private.set_leave_fingerprint() returns trigger language plpgsql set search_path='' as $$begin new.submission_fingerprint:=private.leave_fingerprint(new);return new;end $$;
create trigger ab_leave_fingerprint before insert or update on public.leave_requests for each row execute function private.set_leave_fingerprint();
do $$declare s text;begin
 s:=pg_get_functiondef('public.process_time_request_approval(text,uuid,text,text)'::regprocedure);
 s:=replace(s,'if lower(p_decision)=''reject'' and', 'if lower(p_request_type)=''leave'' and lower(p_decision)=''reject'' and');execute s;
 s:=pg_get_functiondef('private.leave_credit_context(uuid)'::regprocedure);
 s:=replace(s,' select * into r from public.leave_requests where id=p_id;', $patch$
 select * into r from public.leave_requests where id=p_id;
 if r.status='Approved' and exists(select 1 from private.leave_credit_overrides where request_id=p_id) then return(select credit_snapshot from private.leave_credit_overrides where request_id=p_id order by created_at limit 1);end if;$patch$);
 s:=replace(s,' balance:=private.confirmed_leave_balance(r.employee_id,k,(now() at time zone ''Asia/Manila'')::date);', ' balance:=private.confirmed_leave_balance(r.employee_id,k,(now() at time zone ''Asia/Manila'')::date); if r.status=''Approved'' then balance:=balance+r.duration_days;end if;');execute s;
 -- Never prepare reminders for a cancelled duplicate, even if assignment data is stale.
 s:=pg_get_functiondef('public.get_time_approval_email_payload(text,uuid)'::regprocedure);
 s:=replace(s,'  return payload;', $patch$
 if lower(p_request_type)='leave' and exists(select 1 from public.leave_requests where id=p_request_id and (duplicate_of is not null or status in('Cancelled','Rejected','Approved'))) then payload:=payload||'{"recipients":[]}'::jsonb;end if;
 return payload;$patch$);execute s;
end $$;
