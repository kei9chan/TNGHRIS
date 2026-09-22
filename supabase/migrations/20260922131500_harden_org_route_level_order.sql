create or replace function private.resolve_org_approval_route(
 p_requester_id uuid,p_request_type text,p_business_unit_id uuid,p_department_id uuid,
 p_amount numeric default null,p_days numeric default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_current uuid:=p_requester_id;v_parent uuid;v_assignment public.org_chart_assignments;v_matrix public.approval_authority_matrix;
 v_delegate uuid;v_route jsonb:='[]'::jsonb;v_seen uuid[]:=array[p_requester_id];v_depth integer:=0;
 v_requester_level text;v_requester_rank integer:=0;v_candidate_rank integer;v_final uuid;
begin
 select a.organizational_level into v_requester_level from public.org_chart_assignments a
 where a.user_id=p_requester_id and a.is_approved and current_date between a.effective_from and coalesce(a.effective_until,'infinity'::date)
 order by (a.business_unit_id=p_business_unit_id) desc,a.effective_from desc limit 1;
 v_requester_rank:=case v_requester_level when 'RANK_AND_FILE' then 1 when 'TEAM_LEADER' then 2 when 'OIC' then 3 when 'SUPERVISOR' then 4 when 'UNIT_HEAD' then 5 when 'DEPARTMENT_HEAD' then 6 when 'BUSINESS_UNIT_HEAD' then 7 when 'GENERAL_MANAGER' then 8 when 'BOARD_OF_DIRECTORS' then 9 else 0 end;
 loop
   v_depth:=v_depth+1;exit when v_depth>20;
   select a.reports_to_user_id into v_parent from public.org_chart_assignments a
   where a.user_id=v_current and a.is_approved and current_date between a.effective_from and coalesce(a.effective_until,'infinity'::date)
   order by (a.business_unit_id=p_business_unit_id) desc,a.effective_from desc limit 1;
   exit when v_parent is null or v_parent=any(v_seen);v_seen:=array_append(v_seen,v_parent);
   select a.* into v_assignment from public.org_chart_assignments a
   where a.user_id=v_parent and a.is_approved and current_date between a.effective_from and coalesce(a.effective_until,'infinity'::date)
   order by (a.business_unit_id=p_business_unit_id) desc,a.effective_from desc limit 1;
   if not found then v_current:=v_parent;continue;end if;
   v_candidate_rank:=case v_assignment.organizational_level when 'RANK_AND_FILE' then 1 when 'TEAM_LEADER' then 2 when 'OIC' then 3 when 'SUPERVISOR' then 4 when 'UNIT_HEAD' then 5 when 'DEPARTMENT_HEAD' then 6 when 'BUSINESS_UNIT_HEAD' then 7 when 'GENERAL_MANAGER' then 8 when 'BOARD_OF_DIRECTORS' then 9 else 0 end;
   select m.* into v_matrix from public.approval_authority_matrix m where m.request_type=p_request_type and m.organizational_level=v_assignment.organizational_level and m.is_active and current_date between m.effective_from and coalesce(m.effective_until,'infinity'::date) and (m.max_amount is null or coalesce(p_amount,0)<=m.max_amount) and (m.max_days is null or coalesce(p_days,0)<=m.max_days) and (not m.same_branch_required or v_assignment.business_unit_id=p_business_unit_id) order by m.effective_from desc limit 1;
   if found and v_parent<>p_requester_id and v_candidate_rank>v_requester_rank then
     select t.delegate_user_id into v_delegate from public.temporary_approval_authorities t join public.hris_users d on d.id=t.delegate_user_id and lower(d.status::text)='active'
     where t.principal_user_id=v_parent and t.is_approved and now() between t.effective_from and t.effective_until and (t.request_type is null or t.request_type=p_request_type) and t.delegate_user_id<>p_requester_id
       and (not v_matrix.same_branch_required or exists(select 1 from public.org_chart_assignments da where da.user_id=t.delegate_user_id and da.is_approved and da.business_unit_id=p_business_unit_id and current_date between da.effective_from and coalesce(da.effective_until,'infinity'::date)))
     order by t.effective_from desc limit 1;
     v_route:=v_route||jsonb_build_array(jsonb_build_object('stepIndex',jsonb_array_length(v_route),'sequence',v_matrix.sequence,'approverUserId',coalesce(v_delegate,v_parent),'principalUserId',v_parent,'approverName',(select full_name from public.hris_users where id=coalesce(v_delegate,v_parent)),'organizationalLevel',v_assignment.organizational_level,'authorityKind',v_matrix.authority_kind,'delegated',v_delegate is not null,'businessUnitId',v_assignment.business_unit_id,'departmentId',v_assignment.department_id,'configurationFallback',false));
     if v_matrix.authority_kind='FINAL_APPROVAL' and not v_matrix.higher_approval_required then exit;end if;
   end if;
   v_current:=v_parent;
 end loop;
 if not exists(select 1 from jsonb_array_elements(v_route) s where s->>'authorityKind'='FINAL_APPROVAL') then
   select u.id into v_final from public.hris_users u where lower(u.status::text)='active' and u.auth_user_id is not null and u.id<>p_requester_id and (private.workflow_user_has_role(u.id,'GeneralManager') or private.workflow_user_has_role(u.id,'Board of Director')) order by private.workflow_user_has_role(u.id,'GeneralManager') desc,u.full_name limit 1;
   if v_final is not null and not exists(select 1 from jsonb_array_elements(v_route) s where s->>'approverUserId'=v_final::text) then
     v_route:=v_route||jsonb_build_array(jsonb_build_object('stepIndex',jsonb_array_length(v_route),'sequence',999,'approverUserId',v_final,'principalUserId',v_final,'approverName',(select full_name from public.hris_users where id=v_final),'organizationalLevel',case when private.workflow_user_has_role(v_final,'GeneralManager') then 'GENERAL_MANAGER' else 'BOARD_OF_DIRECTORS' end,'authorityKind','FINAL_APPROVAL','delegated',false,'businessUnitId',null,'departmentId',null,'configurationFallback',true));
   end if;
 end if;
 return v_route;
end $$;

