-- Read only the parent report of an NTE the current user is authorized to review.
-- Existing incident-report RLS is unchanged; no general disciplinary access is granted.
create or replace function public.get_nte_incident_context(p_nte_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 if private.payroll_actor_id() is null or not private.can_view_nte(p_nte_id) then raise exception 'NTE unavailable for this account' using errcode='42501';end if;
 select to_jsonb(ir) into result from public.ntes n join public.incident_reports ir on ir.id=n.incident_report_id where n.id=p_nte_id;
 if result is null then raise exception 'The linked incident report is unavailable; contact HR' using errcode='P0002';end if;
 return result;end $$;
revoke all on function public.get_nte_incident_context(uuid) from public,anon;
grant execute on function public.get_nte_incident_context(uuid) to authenticated;
-- An assigned BOD's final exception decision must not be rejected by the
-- ordinary balance guard. Retain the actual debit, including the approved excess.
do $$declare s text;old text;replacement text;begin
 s:=pg_get_functiondef('private.confirmed_leave_request_accounting()'::regprocedure);
 old:='if new.duration_days<=0 or private.confirmed_leave_balance(new.employee_id,k,(now() at time zone ''Asia/Manila'')::date)<new.duration_days then raise exception ''Insufficient available leave credits'';end if;';
 replacement:='if new.duration_days<=0 then raise exception ''Positive leave duration required'';end if;
 if private.confirmed_leave_balance(new.employee_id,k,(now() at time zone ''Asia/Manila'')::date)<new.duration_days and not (
 k in (''vacation'',''sick'') and tg_op=''UPDATE'' and old.status=''PendingBOD''
 and current_setting(''app.time_request_approval_context'',true)=format(''leave:%s:%s'',new.id,public.current_hris_user_id())
 and exists(select 1 from public.time_request_approval_assignments a where a.request_type=''leave'' and a.request_id=new.id and a.approver_user_id=public.current_hris_user_id() and a.is_bod and a.is_required and a.status=''Approved'')
 and public.has_active_role(''Board of Director'')
 ) then raise exception ''Insufficient available leave credits; a routed BOD exception approval is required'';end if;';
 if position(old in s)=0 then raise exception 'Leave accounting guard changed; review migration';end if;
 execute replace(s,old,replacement);
end $$;
notify pgrst,'reload schema';
