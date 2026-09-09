-- STAGING ONLY. Synthetic documents and settings, all writes rolled back.
-- Authenticated RPC checks use existing policies. Temporary staging fixture role/workflow
-- assignments below roll back; no production identities or grants are changed.
begin;
do $$
declare admin_id uuid;admin_auth uuid;emp uuid;emp_auth uuid;other_emp uuid;other_auth uuid;candidate record;
 doc uuid:=gen_random_uuid();v1 uuid;v2 uuid;v3 uuid;assignment uuid;delivery jsonb;receipt jsonb;g jsonb;cfg jsonb;bad boolean;before_time timestamptz;after_time timestamptz;rid uuid;report jsonb;protected text;before_rows bigint;after_rows bigint;detail text;
begin
 for candidate in select id,auth_user_id from public.hris_users where auth_user_id is not null and lower(status)='active' loop
  perform set_config('request.jwt.claim.sub',candidate.auth_user_id::text,true);
  if acknowledgment_private.can_manage('announcements') and acknowledgment_private.can_manage() and public.current_data_scope()->>'type'='GLOBAL' then admin_id:=candidate.id;admin_auth:=candidate.auth_user_id;exit;end if;
 end loop;
 if admin_id is null then raise exception 'No staging publisher fixture';end if;
 select id,auth_user_id into strict emp,emp_auth from public.hris_users where auth_user_id is not null and lower(status)='active' and id<>admin_id limit 1;
 select id,auth_user_id into strict other_emp,other_auth from public.hris_users where auth_user_id is not null and lower(status)='active' and id not in(admin_id,emp) limit 1;
 -- Temporary normalized role assignment for the staging employee fixture.
 insert into public.user_roles(user_id,role_id,scope_type,is_active)
 select h.id,h.role,'SELF',true from public.hris_users h join public.roles r on r.id=h.role where h.id=emp
 on conflict(user_id,role_id) do update set is_active=true;
 -- Temporary staging-only workflow fixture grants, rolled back with this test.
 insert into public.role_workflow_permissions(role_id,workflow_key,actions)
 select role_id,'Overtime',array['submit','approve'] from (select role_id from private.effective_role_ids(emp) union select role_id from private.effective_role_ids(admin_id)) fixture_roles
 on conflict(role_id,workflow_key) do update set actions=(select array_agg(distinct x) from unnest(public.role_workflow_permissions.actions||array['submit','approve']) x);
 select count(*) into before_rows from public.ot_requests;
 insert into public.announcements(id,title,message,created_by_user_id,created_by_name) values(doc,'Synthetic mandatory acknowledgment','<p>Immutable test version</p>',admin_id,'Synthetic publisher');
 cfg:=jsonb_build_object('title','Synthetic mandatory acknowledgment','documentType','Policy','effectiveDate',current_date-1,'mandatory',true,'material',true,'reason','Synthetic rollback verification','requestTypes',jsonb_build_array('Overtime','AttendanceCorrection'),'audience',jsonb_build_object('employees',jsonb_build_array(emp,admin_id)));
 perform set_config('role','authenticated',true);
 perform public.acknowledgment_settings(jsonb_build_object('enabled',true,'requestTypes',jsonb_build_array('Overtime','AttendanceCorrection'),'reason','Synthetic rollback verification'));
 -- No pending document, no gate.
 perform set_config('request.jwt.claim.sub',emp_auth::text,true);
 if (public.acknowledgment_gate('Overtime')->>'blocked')::boolean then raise exception 'No-pending test failed';end if;
 perform set_config('request.jwt.claim.sub',admin_auth::text,true);
 v1:=public.publish_acknowledgment_version(doc,'announcements',cfg,'[]');
 report:=public.acknowledgment_report();
 if not exists(select 1 from jsonb_array_elements(report) r where r->>'documentId'=doc::text and r#>>'{employee,id}'=emp::text) then raise exception 'Publisher report missing assignment';end if;
 foreach protected in array array['IncidentReports','Helpdesk','Grievance','Payslips','ApprovalTasks','SalaryLoan'] loop
  bad:=false;begin perform public.acknowledgment_settings(jsonb_build_object('enabled',true,'requestTypes',jsonb_build_array(protected),'reason','Invalid protected test'));exception when raise_exception then if sqlerrm not like '%cannot be gated%' then raise;end if;bad:=true;end;
  if not bad then raise exception 'Protected or unsupported type accepted: %',protected;end if;
  if (public.acknowledgment_gate(protected)->>'blocked')::boolean then raise exception 'Protected gate check blocked';end if;
 end loop;
 perform set_config('request.jwt.claim.sub',emp_auth::text,true);
 g:=public.acknowledgment_gate('Overtime');if not (g->>'blocked')::boolean then raise exception 'Pending did not block';end if;
 bad:=false;begin insert into public.ot_requests(employee_id,employee_name,date,start_time,end_time,reason,status) values(emp,'Synthetic employee',current_date,'18:00','19:00','Synthetic direct API attempt','Submitted');exception when raise_exception then if sqlerrm<>'ACKNOWLEDGMENT_REQUIRED' then raise;end if;bad:=true;end;if not bad then raise exception 'Authenticated direct API bypass';end if;
 assignment:=(g#>>'{documents,0,assignment_id}')::uuid;
 delivery:=public.open_acknowledgment_document(assignment);
 if not (public.acknowledgment_gate('Overtime')->>'blocked')::boolean then raise exception 'Opening removed gate';end if;
 bad:=false;begin perform public.acknowledge_document((delivery->>'deliveryId')::uuid,true);exception when raise_exception then if sqlerrm<>'Load the document before acknowledging' then raise;end if;bad:=true;end;
 if not bad then raise exception 'Acknowledgment before load accepted';end if;
 perform set_config('request.jwt.claim.sub',other_auth::text,true);
 bad:=false;begin perform public.open_acknowledgment_document(assignment);exception when insufficient_privilege then bad:=true;end;if not bad then raise exception 'Other employee opened document';end if;
 bad:=false;begin perform public.acknowledge_document((delivery->>'deliveryId')::uuid,true);exception when insufficient_privilege then bad:=true;end;if not bad then raise exception 'Other employee acknowledged';end if;
 perform set_config('request.jwt.claim.sub',admin_auth::text,true);
 bad:=false;begin perform public.acknowledge_document((delivery->>'deliveryId')::uuid,true);exception when insufficient_privilege then bad:=true;end;if not bad then raise exception 'Publisher impersonated employee';end if;
 perform set_config('request.jwt.claim.sub',emp_auth::text,true);
 before_time:=clock_timestamp();perform public.record_acknowledgment_view((delivery->>'deliveryId')::uuid);
 bad:=false;begin perform public.acknowledge_document((delivery->>'deliveryId')::uuid,false);exception when raise_exception then if sqlerrm<>'Select the acknowledgment statement first' then raise;end if;bad:=true;end;if not bad then raise exception 'Unchecked accepted';end if;
 -- Direct-table attempt under database owner retains JWT: trigger must still reject,
 -- demonstrating it also enforces inside security-definer request RPCs.
 perform set_config('role','postgres',true);
 bad:=false;begin
 insert into public.attendance_punch_requests(employee_id,manager_id,work_date,action,actual_time,reason,request_key) values(emp,admin_id,current_date-1,'CLOCK_IN',clock_timestamp()-interval '1 day','Synthetic gate attempt',gen_random_uuid());
 exception when raise_exception then if sqlerrm<>'ACKNOWLEDGMENT_REQUIRED' then raise;end if;get stacked diagnostics detail=pg_exception_detail;if detail::jsonb->>'link'<>'/acknowledgments' then raise exception 'Missing structured gate link';end if;bad:=true;end;
 if not bad then raise exception 'Direct submission bypass';end if;
 -- Draft insert/save is allowed; transition to submitted is gated.
 insert into public.ot_requests(employee_id,employee_name,date,start_time,end_time,reason,status) values(emp,'Synthetic employee',current_date,'18:00','19:00','Synthetic preserved draft','Draft') returning id into rid;
 update public.ot_requests set reason='Synthetic saved draft' where id=rid;
 bad:=false;begin update public.ot_requests set status='Submitted' where id=rid;exception when raise_exception then if sqlerrm<>'ACKNOWLEDGMENT_REQUIRED' then raise;end if;bad:=true;end;if not bad then raise exception 'Draft submission bypass';end if;
 if (select reason from public.ot_requests where id=rid)<>'Synthetic saved draft' then raise exception 'Draft data changed';end if;
 perform set_config('role','authenticated',true);
 receipt:=public.acknowledge_document((delivery->>'deliveryId')::uuid,true);after_time:=clock_timestamp();
 if receipt->>'employee_id'<>emp::text or receipt->>'auth_user_id'<>emp_auth::text or receipt->>'version_id'<>v1::text or (receipt->>'acknowledged_at')::timestamptz not between before_time and after_time or (receipt->>'first_viewed_at')::timestamptz not between before_time and after_time then raise exception 'Receipt identity/version/server time mismatch';end if;
 if receipt->>'id'<>(public.acknowledge_document((delivery->>'deliveryId')::uuid,true)->>'id') then raise exception 'Retry not idempotent';end if;
 if (public.acknowledgment_gate('Overtime')->>'blocked')::boolean then raise exception 'Gate not restored immediately';end if;
 perform set_config('role','postgres',true);
 insert into public.attendance_punch_requests(employee_id,manager_id,work_date,action,actual_time,reason,request_key) values(emp,admin_id,current_date-1,'CLOCK_IN',clock_timestamp()-interval '1 day','Synthetic allowed submission',gen_random_uuid());
 update public.ot_requests set status='Submitted' where id=rid;
 bad:=false;begin update acknowledgment_private.receipts set statement='tampered' where id=(receipt->>'id')::uuid;exception when insufficient_privilege then bad:=true;end;if not bad then raise exception 'Mutable receipt';end if;
 bad:=false;begin delete from acknowledgment_private.versions where id=v1;exception when insufficient_privilege then bad:=true;end;if not bad then raise exception 'Mutable version';end if;
 perform set_config('role','authenticated',true);perform set_config('request.jwt.claim.sub',admin_auth::text,true);
 cfg:=jsonb_set(cfg,'{material}','false');v2:=public.publish_acknowledgment_version(doc,'announcements',cfg,'[]');
 perform set_config('request.jwt.claim.sub',emp_auth::text,true);
 if (public.acknowledgment_gate('Overtime')->>'blocked')::boolean then raise exception 'Nonmaterial revision broke acknowledgment';end if;
 perform set_config('request.jwt.claim.sub',admin_auth::text,true);
 cfg:=jsonb_set(cfg,'{material}','true');v3:=public.publish_acknowledgment_version(doc,'announcements',cfg,'[]');
 perform set_config('request.jwt.claim.sub',emp_auth::text,true);
 if not (public.acknowledgment_gate('Overtime')->>'blocked')::boolean then raise exception 'Material revision did not require acknowledgment';end if;
 -- Approver has pending personal docs but may process another employee's already-submitted request.
 perform set_config('role','postgres',true);perform set_config('request.jwt.claim.sub',admin_auth::text,true);
 if not (public.acknowledgment_gate('Overtime')->>'blocked')::boolean then raise exception 'Approver personal fixture not pending';end if;
 update public.ot_requests set status='Approved' where id=rid;
 if (select status::text from public.ot_requests where id=rid)<>'Approved' then raise exception 'Approval blocked';end if;
 select count(*) into after_rows from public.ot_requests;if after_rows<>before_rows+1 then raise exception 'Existing request count changed';end if;
 perform set_config('role','authenticated',true);perform set_config('request.jwt.claim.sub',emp_auth::text,true);
 bad:=false;begin perform public.acknowledgment_report();exception when insufficient_privilege then bad:=true;end;if not bad then raise exception 'Employee report exposure';end if;
 bad:=false;begin execute 'select count(*) from acknowledgment_private.receipts';exception when insufficient_privilege then bad:=true;end;if not bad then raise exception 'Private evidence exposed';end if;
 if exists(select 1 from jsonb_array_elements(public.my_acknowledgments()->'receipts') r where r->>'employee_id'<>emp::text) then raise exception 'Other receipts exposed';end if;
 perform set_config('role','postgres',true);
 -- Explicitly authorized document editor restricted to SELF must not see other histories.
 update public.role_permissions set permissions=array_append(permissions,'edit') where resource_id='Announcements' and role_id in(select role_id from private.effective_role_ids(emp)) and not 'edit'=any(permissions);
 perform set_config('role','authenticated',true);
 report:=public.acknowledgment_report();
 if jsonb_array_length(report)=0 or exists(select 1 from jsonb_array_elements(report) x where x#>>'{employee,id}'<>emp::text) then raise exception 'Scoped report failure';end if;
 perform set_config('role','postgres',true);
 if exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid where t.tgname='z_mandatory_acknowledgment' and c.relname in('incident_reports','tickets','payroll_offset_actions','attendance_punch_request_audit')) then raise exception 'Protected or approval table intercepted';end if;
end $$;
rollback;
