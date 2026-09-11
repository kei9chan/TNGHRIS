-- Attendance pulse summaries are operational alerts, not daily zero-count reports.
-- Send the current-day summary at the configured 11:00 AM Philippine-time window
-- only when it contains an actionable concern. Reports submitted after that
-- window are summarized once at the next day's 11:00 AM run.
set local lock_timeout='5s';

update attendance_pulse.settings
set summary_hour=11
where id=true and summary_hour=9;

create or replace function attendance_pulse.late_summary(p_actor uuid,p_date date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 data jsonb:=attendance_pulse.read(p_actor,p_date);
 cfg attendance_pulse.settings;
 cutoff timestamptz;
 late_rows jsonb:='[]';
 late_count integer:=0;
 late_approved integer:=0;
 late_pending integer:=0;
 late_attention integer:=0;
 late_units jsonb:='[]';
begin
 if not coalesce((data->>'allowed')::boolean,false) then return data;end if;
 select * into cfg from attendance_pulse.settings;
 cutoff:=(p_date::timestamp+make_interval(hours=>cfg.summary_hour)) at time zone 'Asia/Manila';
 select coalesce(jsonb_agg(x order by x->>'submittedAt' desc),'[]') into late_rows
 from jsonb_array_elements(data->'rows') x
 where x->>'kind'='absence'
   and x->>'status' not in('withdrawn','cancelled')
   and (x->>'submittedAt')::timestamptz>=cutoff;
 with latest as (
   select distinct on(x->>'employeeId') x
   from jsonb_array_elements(late_rows) x
   order by x->>'employeeId',case when x->>'status'='approved' then 0 else 1 end,x->>'submittedAt' desc
 )
 select count(*),count(*) filter(where x->>'status'='approved'),count(*) filter(where x->>'status'='pending'),count(*) filter(where coalesce((x->>'needsAttention')::boolean,false)) into late_count,late_approved,late_pending,late_attention
 from latest;
 select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'name',q.name,'count',q.count) order by q.count desc,q.name),'[]') into late_units
 from (
   select x->>'businessUnitId' id,coalesce(x->>'businessUnit','Unassigned') name,count(distinct x->>'employeeId') count
   from jsonb_array_elements(late_rows) x
   group by 1,2
 ) q;
 return data||jsonb_build_object('summaryType','late','summaryCutoff',cutoff,'date',p_date,'reported',late_count,'approved',late_approved,'pending',late_pending,'attention',late_attention,'units',late_units,'concerns','[]'::jsonb,'rows','[]'::jsonb);
end $$;

create or replace function attendance_pulse.refresh_alerts() returns void
language plpgsql security definer set search_path='' as $$
declare
 slot timestamptz:=date_bin('15 minutes',now(),'2020-01-01'::timestamptz);
 inserted integer;
 d date:=(now() at time zone 'Asia/Manila')::date;
 h record;
 p jsonb;
 data jsonb;
 late jsonb;
 finger text;
 old attendance_pulse.alert_state;
 cfg attendance_pulse.settings;
 current_concern boolean;
begin
 insert into attendance_pulse.runs(slot) values(slot) on conflict do nothing;
 get diagnostics inserted=row_count;
 if inserted=0 then return;end if;
 select * into cfg from attendance_pulse.settings;
 for h in
   select distinct u.id
   from public.hris_users u
   join lateral private.effective_role_ids(u.id) e on true
   join public.roles r on r.id=e.role_id and r.is_active
   where lower(u.status)='active' and u.auth_user_id is not null
     and r.id in('HR Staff','HR Manager','Admin','Business Unit Manager','Board of Director')
 loop
   p:=attendance_pulse.profile(h.id);
   data:=attendance_pulse.read(h.id,d);
   if not coalesce((data->>'allowed')::boolean,false) then continue;end if;
   -- Board receives only company-wide or critical summaries, never each request.
   if (p->>'bod')::boolean and not (p->>'hr')::boolean
      and not (data->>'severity'='critical' or ((p->>'global')::boolean and (data->>'reported')::integer>=cfg.company_count)) then
     update attendance_pulse.alert_state set fingerprint='normal' where recipient=h.id and work_date=d;
     continue;
   end if;

   current_concern:=coalesce((data->>'reported')::integer,0)>0
     and ((data->>'severity')<>'normal' or coalesce((data->>'pending')::integer,0)>0 or coalesce((data->>'attention')::integer,0)>0);
   -- The daily summary is emitted once after the 11:00 AM Philippine-time window.
   -- Normal zero-count days do not create a delivery or an in-app notification.
   if extract(hour from now() at time zone 'Asia/Manila')>=cfg.summary_hour then
     if current_concern then
       perform attendance_pulse.queue(h.id,d,'Daily attendance pulse',h.id||':'||d||':daily',data);
     end if;
     -- Include only reports submitted after yesterday's summary cutoff. This
     -- catches late-opening units without repeating yesterday's full summary.
     late:=attendance_pulse.late_summary(h.id,d-1);
     if coalesce((late->>'reported')::integer,0)>0 then
       perform attendance_pulse.queue(h.id,d-1,'Late attendance pulse',h.id||':'||(d-1)||':late',late);
     end if;
   end if;

   select coalesce(string_agg(concat(x->>'businessUnitId',':',x->>'code',':',x->>'severity'),'|' order by x->>'businessUnitId',x->>'code'),'normal') into finger
   from jsonb_array_elements(data->'concerns') x;
   insert into attendance_pulse.alert_state(recipient,work_date) values(h.id,d) on conflict do nothing;
   select * into old from attendance_pulse.alert_state where recipient=h.id and work_date=d for update;
   if finger is distinct from old.fingerprint then
     update attendance_pulse.alert_state set fingerprint=finger,transitions=transitions+case when data->>'severity'<>'normal' then 1 else 0 end where recipient=h.id and work_date=d;
     insert into attendance_pulse.audit(action,work_date,previous,new_value) values('staffing condition changed',d,jsonb_build_object('fingerprint',old.fingerprint),jsonb_build_object('recipient',h.id,'fingerprint',finger,'severity',data->>'severity'));
   end if;
 end loop;
end $$;

revoke all on function attendance_pulse.late_summary(uuid,date),attendance_pulse.refresh_alerts() from public,anon,authenticated;
