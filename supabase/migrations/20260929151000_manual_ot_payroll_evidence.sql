-- Keep source IDs stable. Manual OT replaces punch-derived OT for that request,
-- so later attendance imports cannot pay it a second time.
alter function private.payroll_time_sources(uuid,date,date) rename to payroll_time_sources_before_manual_ot;
create function private.payroll_time_sources(p_scope uuid,p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare src jsonb;ots jsonb;begin
 src:=private.payroll_time_sources_before_manual_ot(p_scope,p_from,p_to);
 select coalesce(jsonb_agg(x||jsonb_build_object('evidenceMode',o.evidence_mode,'requestedMinutes',private.ot_requested_minutes(o),'managerConfirmedMinutes',coalesce(o.manager_confirmed_minutes,round(o.approved_hours*60)::integer),'finalApprovedMinutes',case when o.status::text='Approved' then coalesce(o.final_approved_minutes,round(o.approved_hours*60)::integer) end,'finalNightMinutes',o.final_night_minutes,'endDate',o.end_date,'unpaidBreakMinutes',o.unpaid_break_minutes,'manualEvidenceVersion',o.updated_at) order by x->>'id'),'[]') into ots from jsonb_array_elements(src->'ot') x join public.ot_requests o on o.id::text=x->>'id';
 return src||jsonb_build_object('ot',ots);
end $$;

do $$declare ddl text;needle text;begin
 ddl:=pg_get_functiondef('private.interpret_payroll_time_before_ob(jsonb,date,date)'::regprocedure);
 needle:=$old$if o->>'start' is null or o->>'end' is null or o->>'approvedHours' is null then$old$;
 if strpos(ddl,needle)=0 then raise exception 'Time interpreter changed. Review manual OT integration.';end if;
 ddl:=replace(ddl,needle,$new$if o->>'evidenceMode'='manual' and o->>'type'='Paid' then
 if o->>'finalApprovedMinutes' is null or (o->>'finalApprovedMinutes')::integer<0 then issues:=issues||'"Manual OT needs a final approved quantity"'::jsonb;continue;end if;
 approved_ot:=approved_ot+(o->>'finalApprovedMinutes')::integer;actual_ot:=actual_ot+(o->>'finalApprovedMinutes')::integer;continue;
 end if;
 if o->>'start' is null or o->>'end' is null or o->>'approvedHours' is null then$new$);
 ddl:=replace(ddl,$old$'approvedOtMinutes',approved_ot,'actualOtMinutes',actual_ot$old$,$new$'approvedOtMinutes',approved_ot,'actualOtMinutes',actual_ot,'payableOtMinutes',actual_ot,'otEvidenceBasis',case when exists(select 1 from jsonb_array_elements(ots) x where x->>'evidenceMode'='manual' and x->>'type'='Paid' and x->>'status'='Approved') then 'Manager-verified manual extra work' else 'Matched attendance' end$new$);
 execute ddl;
 -- Existing regular work and offset interpretation remain unchanged.
 ddl:=pg_get_functiondef('private.payroll_gross_intervals(jsonb,jsonb,jsonb)'::regprocedure);
 ddl:=replace(ddl,'FUNCTION private.payroll_gross_intervals(','FUNCTION private.payroll_gross_intervals_before_manual_ot(');
 needle:=$old$ots:=ots||jsonb_build_array(jsonb_build_object('start',ts,'end',te,'id',o->>'id','type',o->>'type'));$old$;
 if strpos(ddl,needle)=0 then raise exception 'Gross interval interpreter changed.';end if;
 ddl:=replace(ddl,needle,$new$if not coalesce(o->>'evidenceMode'='manual' and o->>'type'='Paid',false) then ots:=ots||jsonb_build_array(jsonb_build_object('start',ts,'end',te,'id',o->>'id','type',o->>'type'));end if;$new$);
 needle:=$old$then kind:='regular';else raise exception 'Worked interval has no reviewed schedule or OT.';end if;$old$;
 if strpos(ddl,needle)=0 then raise exception 'Gross interval coverage changed.';end if;
 ddl:=replace(ddl,needle,$new$then kind:='regular';
 elsif exists(select 1 from jsonb_array_elements(r->'ot') m where m->>'evidenceMode'='manual' and m->>'type'='Paid' and m->>'status'='Approved' and (((r->>'date')::date+(m->>'start')::time) at time zone 'Asia/Manila')<=mid and ((coalesce((m->>'endDate')::date,(r->>'date')::date+case when (m->>'end')::time<(m->>'start')::time then 1 else 0 end)+(m->>'end')::time) at time zone 'Asia/Manila')>mid) then continue;
 else raise exception 'Worked interval has no reviewed schedule or OT.';end if;$new$);
 execute ddl;
end $$;

create or replace function private.payroll_gross_intervals(src jsonb,r jsonb,c jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
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
 parts:='[]';bounds:=array[beg,fin];
 for d in select generate_series((r->>'date')::date,(r->>'date')::date+1,'1 day')::date loop bounds:=bounds||array[d::timestamp at time zone 'Asia/Manila',(d+(c->>'nightStart')::time) at time zone 'Asia/Manila',(d+(c->>'nightEnd')::time) at time zone 'Asia/Manila'];end loop;
 for a,b in select x,lead(x) over(order by x) from(select distinct unnest(bounds)x)q loop
 if a<beg or b>fin or b is null or b<=a then continue;end if;mid:=a+(b-a)/2;d:=(mid at time zone 'Asia/Manila')::date;
 if (select count(*) from jsonb_array_elements(src->'holidays') where (value->>'date')::date=d)>1 then raise exception 'Overlapping holiday classification needs review.';end if;
 select value->>'kind' into cat from jsonb_array_elements(src->'holidays') where (value->>'date')::date=d limit 1;
 cat:=coalesce(cat,'ordinary')||case when (r->>'restDay')::boolean then '_rest' else '' end;
 night:=case when (c->>'nightStart')::time>(c->>'nightEnd')::time then (mid at time zone 'Asia/Manila')::time>=(c->>'nightStart')::time or (mid at time zone 'Asia/Manila')::time<(c->>'nightEnd')::time else (mid at time zone 'Asia/Manila')::time>=(c->>'nightStart')::time and (mid at time zone 'Asia/Manila')::time<(c->>'nightEnd')::time end;
 parts:=parts||jsonb_build_array(jsonb_build_object('start',a,'end',b,'date',d,'kind','ot','category',cat,'night',night,'minutes',extract(epoch from(b-a))/60,'otId',manual->>'id','evidenceMode','manual'));
 end loop;
 if approved<>elapsed then
  if (select count(distinct (x->>'category',x->>'night')) from jsonb_array_elements(parts)x)>1 then raise exception 'Manual OT %: reviewed minutes cross different holiday/night rates. Return for an exact approved interval or split the request; do not guess allocation.',manual->>'id';end if;
  parts:=jsonb_build_array((parts->0)||jsonb_build_object('minutes',approved,'quantityBasis','Manager-approved minutes within submitted interval'));
 end if;
 result:=result||parts;
 end loop;
 return result;
end $$;
revoke all on function private.payroll_time_sources(uuid,date,date),private.payroll_time_sources_before_manual_ot(uuid,date,date),private.payroll_gross_intervals(jsonb,jsonb,jsonb),private.payroll_gross_intervals_before_manual_ot(jsonb,jsonb,jsonb) from public,anon,authenticated;
