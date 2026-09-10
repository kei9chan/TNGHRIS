create or replace function public.process_time_request_approval(p_request_type text,p_request_id uuid,p_decision text,p_note text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id(); v_stage text; result jsonb; previous private.time_approval_decisions;
begin
 if auth.uid() is null or not exists(select 1 from public.hris_users where id=actor and lower(status)='active') then raise exception 'Active authenticated account required' using errcode='42501';end if;
 case lower(p_request_type)
 when 'leave' then select status::text into v_stage from public.leave_requests where id=p_request_id for update;
 when 'wfh' then select status::text into v_stage from public.wfh_requests where id=p_request_id for update;
 when 'overtime' then select status::text into v_stage from public.ot_requests where id=p_request_id for update;
 else raise exception 'Unsupported request type' using errcode='22023';end case;
 if v_stage is null then raise exception 'Request unavailable' using errcode='42501';end if;
 select * into previous from private.time_approval_decisions d where d.request_type=lower(p_request_type) and d.request_id=p_request_id and d.approver_id=actor and (d.stage=v_stage or v_stage in ('Approved','WFH_FOR_TIMEKEEPING','Rejected','WFH_REJECTED')) order by decided_at desc limit 1;
 if previous.approver_id is not null then
 if previous.decision=lower(p_decision) then return previous.result||jsonb_build_object('alreadyDecided',true,'notifyEscalation',false,'message',case when previous.decision='approve' then 'Already approved by you' else 'Decision already recorded' end);end if;
 raise exception 'You have already recorded a decision for this request and approval stage.' using errcode='22023';end if;
 if lower(p_decision)='approve' and v_stage in ('PendingBOD','WFH_PENDING_BOD_APPROVAL','Approved','WFH_FOR_TIMEKEEPING') and exists(select 1 from public.time_request_approval_assignments where request_type=lower(p_request_type) and request_id=p_request_id and approver_user_id=actor and status='Approved') then
 return jsonb_build_object('alreadyDecided',true,'notifyEscalation',false,'message','Already approved by you','status',v_stage);end if;
 result:=private.process_time_request_approval_core(p_request_type,p_request_id,p_decision,p_note);
 insert into private.time_approval_decisions values(lower(p_request_type),p_request_id,v_stage,actor,lower(p_decision),clock_timestamp(),result);
 return result;
end$$;
