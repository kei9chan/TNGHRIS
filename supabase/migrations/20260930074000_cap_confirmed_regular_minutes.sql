-- An original-shift confirmation cannot pay more regular minutes than the
-- published paid duration. Keep all raw punches; trim only interpreted pay.
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$declare ddl text;begin
 ddl:=pg_get_functiondef('private.interpret_payroll_time(jsonb,date,date)'::regprocedure);
 if strpos(ddl,$old$i#>>'{}'<>'Worked time outside the reviewed schedule / OT needs reconciliation'$old$)=0 then raise exception 'Original-shift review interpreter changed.';end if;
 ddl:=replace(ddl,$old$i#>>'{}'<>'Worked time outside the reviewed schedule / OT needs reconciliation'$old$,
 $new$i#>>'{}' not in('Worked time outside the reviewed schedule / OT needs reconciliation','Worked and scheduled minutes need reconciliation')$new$);
 ddl:=replace(ddl,$old$'originalShiftReviewed',true$old$,
 $new$'originalShiftReviewed',true,'regularMinutes',least((r->>'regularMinutes')::numeric,(r->>'scheduledMinutes')::numeric),'unrequestedOutsideTimeUnpaid',true$new$);
 execute ddl;
end $$;

alter function private.payroll_gross_intervals(jsonb,jsonb,jsonb) rename to payroll_gross_intervals_before_original_decision;
create function private.payroll_gross_intervals(src jsonb,r jsonb,c jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare original jsonb;result jsonb:='[]';part jsonb;remaining numeric;quantity numeric;begin
 original:=private.payroll_gross_intervals_before_original_decision(src,r,c);
 if not coalesce((r->>'originalShiftReviewed')::boolean,false) then return original;end if;
 remaining:=(r->>'regularMinutes')::numeric;
 for part in select value from jsonb_array_elements(original) loop
  if part->>'kind'<>'regular' then result:=result||jsonb_build_array(part);continue;end if;
  quantity:=least(remaining,(part->>'minutes')::numeric);
  if quantity>0 then result:=result||jsonb_build_array(part||jsonb_build_object('minutes',quantity,'quantityBasis','Published shift duration after direct-manager confirmation'));end if;
  remaining:=remaining-quantity;
 end loop;
 if remaining<>0 then raise exception 'Reviewed regular minutes do not reconcile to verified intervals.';end if;
 return result;
end $$;
revoke all on function private.payroll_gross_intervals(jsonb,jsonb,jsonb),private.payroll_gross_intervals_before_original_decision(jsonb,jsonb,jsonb) from public,anon,authenticated;
