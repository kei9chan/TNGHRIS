-- Existing manager/BOD decisions remain final. Only derived premium allocation changes.
CREATE OR REPLACE FUNCTION private.payroll_gross_intervals_before_original_decision(src jsonb, r jsonb, c jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare result jsonb;manual jsonb;parts jsonb;bounds timestamptz[];beg timestamptz;fin timestamptz;a timestamptz;b timestamptz;mid timestamptz;d date;cat text;night boolean;approved integer;elapsed integer;
begin
 result:=private.payroll_gross_intervals_before_manual_ot(src,r,c);
 for manual in select value from jsonb_array_elements(r->'ot') where value->>'evidenceMode'='manual' and value->>'type'='Paid' and value->>'status'='Approved' loop
 approved:=(manual->>'finalApprovedMinutes')::integer;
 if approved=0 then continue;end if;
 if approved is null or approved<0 then raise exception 'Manual OT % needs a final approved quantity.',manual->>'id';end if;
 if manual->>'start' is null or manual->>'end' is null then
 if manual->>'finalNightMinutes' is null or (manual->>'finalNightMinutes')::integer not between 0 and approved then raise exception 'Manual OT %: manager must verify night-work minutes for this work date.',manual->>'id';end if;
 d:=(r->>'date')::date;
 if (select count(*) from jsonb_array_elements(src->'holidays') where (value->>'date')::date=d)>1 then raise exception 'Overlapping holiday classification needs review.';end if;
 select value->>'kind' into cat from jsonb_array_elements(src->'holidays') where (value->>'date')::date=d limit 1;
 cat:=coalesce(cat,'ordinary')||case when (r->>'restDay')::boolean then '_rest' else '' end;
 result:=result||jsonb_build_array(jsonb_build_object('date',d,'kind','ot','category',cat,'night',false,'minutes',approved-(manual->>'finalNightMinutes')::integer,'otId',manual->>'id','evidenceMode','manual','quantityBasis','Verified duration on work date'),jsonb_build_object('date',d,'kind','ot','category',cat,'night',true,'minutes',(manual->>'finalNightMinutes')::integer,'otId',manual->>'id','evidenceMode','manual','quantityBasis','Manager-confirmed night minutes on work date'));
 continue;end if;
 beg:=((r->>'date')::date+(manual->>'start')::time) at time zone 'Asia/Manila';
 fin:=(coalesce((manual->>'endDate')::date,(r->>'date')::date+case when (manual->>'end')::time<(manual->>'start')::time then 1 else 0 end)+(manual->>'end')::time) at time zone 'Asia/Manila';
 elapsed:=round(extract(epoch from(fin-beg))/60)::integer;
 if elapsed<=0 or approved>elapsed then raise exception 'Manual OT % has inconsistent approved minutes and interval.',manual->>'id';end if;
 -- A reduced final approval preserves the submitted start and shortens its
 -- payable duration. It does not reopen approval or pay the requested remainder.
 -- Explicit break/night allocations still take precedence and are never invented.
 if approved<elapsed and coalesce((manual->>'unpaidBreakMinutes')::integer,0)=0 and manual->>'finalNightMinutes' is null then
  fin:=beg+make_interval(mins=>approved);
 end if;
 parts:='[]';bounds:=array[beg,fin];
 for d in select generate_series((r->>'date')::date,(r->>'date')::date+1,'1 day')::date loop bounds:=bounds||array[d::timestamp at time zone 'Asia/Manila',(d+(c->>'nightStart')::time) at time zone 'Asia/Manila',(d+(c->>'nightEnd')::time) at time zone 'Asia/Manila'];end loop;
 for a,b in select x,lead(x) over(order by x) from(select distinct unnest(bounds)x)q loop
 if a<beg or b>fin or b is null or b<=a then continue;end if;mid:=a+(b-a)/2;d:=(mid at time zone 'Asia/Manila')::date;
 if (select count(*) from jsonb_array_elements(src->'holidays') where (value->>'date')::date=d)>1 then raise exception 'Overlapping holiday classification needs review.';end if;
 select value->>'kind' into cat from jsonb_array_elements(src->'holidays') where (value->>'date')::date=d limit 1;
 cat:=coalesce(cat,'ordinary')||case when (r->>'restDay')::boolean then '_rest' else '' end;
 night:=case when (c->>'nightStart')::time>(c->>'nightEnd')::time then (mid at time zone 'Asia/Manila')::time>=(c->>'nightStart')::time or (mid at time zone 'Asia/Manila')::time<(c->>'nightEnd')::time else (mid at time zone 'Asia/Manila')::time>=(c->>'nightStart')::time and (mid at time zone 'Asia/Manila')::time<(c->>'nightEnd')::time end;
 parts:=parts||jsonb_build_array(jsonb_build_object('start',a,'end',b,'date',d,'kind','ot','category',cat,'night',night,'minutes',extract(epoch from(b-a))/60,'otId',manual->>'id','evidenceMode','manual','quantityBasis',case when approved<elapsed and coalesce((manual->>'unpaidBreakMinutes')::integer,0)=0 and manual->>'finalNightMinutes' is null then 'Final approved duration counted from recorded OT start' else 'Final approved interval' end));
 end loop;
 if approved<>elapsed and not(coalesce((manual->>'unpaidBreakMinutes')::integer,0)=0 and manual->>'finalNightMinutes' is null) then
  if (select count(distinct (x->>'category',x->>'night')) from jsonb_array_elements(parts)x)>1 then raise exception 'Manual OT %: reviewed minutes cross different holiday/night rates. Return for an exact approved interval or split the request; do not guess allocation.',manual->>'id';end if;
  parts:=jsonb_build_array((parts->0)||jsonb_build_object('minutes',approved,'quantityBasis','Manager-approved minutes within submitted interval'));
 end if;
 result:=result||parts;
 end loop;
 return result;
end $function$
;
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
 review:=private.payroll_time_review(t.scope_id,t.date_from,t.date_to);
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


revoke all on function private.payroll_gross_intervals_before_original_decision(jsonb,jsonb,jsonb),private.payroll_gross_snapshot_without_service_charge_phase3(uuid) from public,anon,authenticated;
