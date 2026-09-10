-- Closed HR reviews remain reported, but no longer count as open action items.
create or replace function attendance_pulse.read(p_actor uuid,p_date date) returns jsonb language plpgsql stable security definer set search_path='' as $$declare d jsonb;patterns jsonb;alerts jsonb;rows0 jsonb;attention integer;begin
 d:=attendance_pulse.read_before_patterns(p_actor,p_date);if not coalesce((d->>'allowed')::boolean,false) then return d;end if;
 select coalesce(jsonb_agg(x||jsonb_build_object('hrState',c.state,'needsAttention',coalesce((x->>'needsAttention')::boolean,false) and coalesce(c.state not like 'closed%',true)) order by x->>'submittedAt' desc),'[]') into rows0 from jsonb_array_elements(d->'rows') x left join attendance_issues.hr_cases c on c.request_id=(x->>'id')::uuid;
 select count(distinct x->>'employeeId') into attention from jsonb_array_elements(rows0) x where x->>'kind'='absence' and (x->>'needsAttention')::boolean and x->>'status' not in('withdrawn','cancelled');
 patterns:=attendance_pulse.patterns(p_actor,p_date);
 select coalesce(jsonb_agg(jsonb_build_object('code','repeated_shift','businessUnitId',x->>'businessUnitId','severity','attention','text',(x->>'businessUnit')||': repeated '||(x->>'shiftStart')||' shift reports across '||(x->>'days')||' dates')),'[]') into alerts from jsonb_array_elements(patterns) x;
 return d||jsonb_build_object('rows',rows0,'attention',attention,'patterns',patterns,'concerns',(d->'concerns')||alerts,'severity',case when jsonb_array_length(alerts)>0 and d->>'severity'='normal' then 'attention' else d->>'severity' end);
end $$;
