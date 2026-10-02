-- Reuse the submitted, immutable attendance result. Rebuild its entire source
-- fingerprint, including offset approvals, without interpreting every day again.
create or replace function private.payroll_time_source_with_offsets(p_scope uuid,p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare src jsonb;cases jsonb;
begin
 if auth.uid() is null then raise exception 'Authenticated payroll access required.' using errcode='42501';end if;
 src:=private.payroll_time_sources(p_scope,p_from,p_to);
 if exists(select 1 from jsonb_array_elements(src->'employees') e where not public.can_access_hris_user((e->>'id')::uuid)) then raise exception 'Existing HRIS scope does not cover this whole business unit.' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'requestId',c.ot_request_id,'employeeId',c.employee_id,'minutes',c.eligible_minutes,'sourceHash',c.source_hash,'complete',private.payroll_offset_complete(c.id),'actions',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at,a.id) from public.payroll_offset_actions a where a.case_id=c.id),'[]')) order by c.created_at,c.id),'[]') into cases
 from public.payroll_offset_cases c join public.ot_requests o on o.id=c.ot_request_id where c.scope_id=p_scope and o.date between p_from and p_to;
 return src||jsonb_build_object('offsetCases',cases);
end $$;
revoke all on function private.payroll_time_source_with_offsets(uuid,date,date) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION private.payroll_gross_snapshot_without_service_charge_phase3(p_time_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.payroll_time_packages;review jsonb;pkgs jsonb;rules jsonb;calendar_row jsonb;emp jsonb;current_pay jsonb;latest jsonb;fingerprints jsonb:='[]';cutoff jsonb;start_expected date;end_expected date;
begin
 select * into t from public.payroll_time_packages where id=p_time_id;
 if t.id is null or not private.payroll_gross_permission(t.scope_id,'view') then raise exception 'Scoped payroll and existing compensation/timekeeping access required.' using errcode='42501';end if;
 if t.status<>'submitted' then raise exception 'HR must submit this timekeeping version first.';end if;
 review:=jsonb_build_object('source',private.payroll_time_source_with_offsets(t.scope_id,t.date_from,t.date_to));
 review:=review||jsonb_build_object('sourceHash',md5((review->'source')::text));
 if review->>'sourceHash'<>t.source_hash then raise exception 'Attendance sources changed. HR must submit a new version.' using errcode='40001';end if;
 if exists(select 1 from public.payroll_time_packages x where x.scope_id=t.scope_id and x.date_from=t.date_from and x.date_to=t.date_to and x.status='submitted' and x.version>t.version) then raise exception 'Use the latest HR-submitted timekeeping version.' using errcode='40001';end if;
 select to_jsonb(s) into calendar_row from public.payroll_pay_settings s where s.scope_id=t.scope_id and s.effective_from<=t.date_from order by s.effective_from desc limit 1;
 if calendar_row is null then
 select to_jsonb(c) into calendar_row from public.payroll_calendar_rules c
 where (c.scope_id is null or c.scope_id=t.scope_id) and c.effective_from<=t.date_from
 order by c.scope_id nulls last,c.effective_from desc,c.created_at desc limit 1;
 if exists(select 1 from public.payroll_calendar_rules c where (c.scope_id is null or c.scope_id=t.scope_id)
 and c.effective_from>t.date_from and c.effective_from<=t.date_to) then
 raise exception 'Calendar changes inside the cutoff require reconciliation.';end if;
 end if;
 if calendar_row is null then raise exception 'Record the approved payday calendar before calculating.';end if;
 if exists(select 1 from public.payroll_pay_settings s where s.scope_id=t.scope_id and s.effective_from>t.date_from and s.effective_from<=t.date_to) then raise exception 'Calendar changes inside the cutoff require reconciliation.';end if;
 start_expected:=null;
 for cutoff in select value from jsonb_array_elements(calendar_row->'calendar') loop
 if extract(day from t.date_from)::int=(cutoff->>'startDay')::int then
 start_expected:=t.date_from;end_expected:=(date_trunc('month',t.date_from)::date+case when (cutoff->>'startDay')::int>(cutoff->>'endDay')::int then interval '1 month' else interval '0 month' end)::date+(cutoff->>'endDay')::int-1;end if;
 end loop;
 if start_expected is null or t.date_to<>end_expected then raise exception 'Select one complete approved cutoff; partial/overlapping runs are not permitted.';end if;
 select coalesce(jsonb_agg(to_jsonb(p) order by p.employee_id,p.effective_from,p.id),'[]') into pkgs from public.payroll_pay_packages p
 where p.status='approved' and p.stream='employee_payroll' and p.effective_from<=t.date_to
 and exists(select 1 from jsonb_array_elements(review#>'{source,employees}') e where e->>'id'=p.employee_id::text);
 for emp in select value from jsonb_array_elements(review#>'{source,employees}') loop
 if not public.can_access_hris_user((emp->>'id')::uuid) or not private.payroll_package_permission((emp->>'id')::uuid,t.scope_id,'view') then raise exception 'The BU contains employees outside your existing salary scope.' using errcode='42501';end if;
 if exists(select 1 from jsonb_array_elements(pkgs) p where p->>'employee_id'=emp->>'id' and not private.payroll_package_permission((emp->>'id')::uuid,(p->>'scope_id')::uuid,'view')) then raise exception 'Pay-package group access is required.' using errcode='42501';end if;
 -- Packages themselves are snapshotted and hashed below. Profile salary edits
 -- must not invalidate an approved historical package or block calculation.
 end loop;
 -- A completed PAN later revised/withdrawn must invalidate dependent pay reviews.
 for latest in select value from jsonb_array_elements(pkgs) where value->>'source_pan_id' is not null loop
 current_pay:=private.payroll_source_pay_data((latest->>'employee_id')::uuid,(latest->>'source_pan_id')::uuid);
 if current_pay->>'hash' is distinct from latest->>'source_pan_hash' then raise exception 'Approved salary PAN changed; review its pay-package version.' using errcode='40001';end if;end loop;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.revision),'[]') into rules from public.payroll_gross_rules r where r.scope_id=t.scope_id and r.effective_from<=t.date_to and r.effective_to>=t.date_from;
 return jsonb_build_object('engineVersion','gross-v1','scopeId',t.scope_id,'timePackageId',t.id,'timeVersion',t.version,'dateFrom',t.date_from,'dateTo',t.date_to,'time',jsonb_build_object('source',t.source_snapshot,'result',t.result),'packages',pkgs,'approvedPackageDefaults',true,'approvedOtAllocation','duration_from_start_v1','rules',jsonb_build_array(jsonb_build_object('id','ph-statutory-v1','revision',0,'effective_from','2000-01-01','effective_to','9999-12-31','source_ref','PH Labor Code statutory rates; monthly-paid calendar salary','config',private.payroll_statutory_gross_config()))||rules,'calendar',calendar_row,'sourceFingerprints',fingerprints,'confirmedPolicy',(select to_jsonb(z) from public.payroll_confirmed_policy z),'employeeRules',(select coalesce(jsonb_agg(to_jsonb(z) order by created_at,id),'[]') from public.payroll_employee_rule_versions z where z.employee_id::text in(select x->>'id' from jsonb_array_elements(t.source_snapshot->'employees') x) and z.effective_from<=t.date_to and z.effective_to>=t.date_from));
end $function$
;



revoke all on function private.payroll_gross_snapshot_without_service_charge_phase3(uuid) from public,anon,authenticated;
