-- Pure JSON review-attribution fixtures; no identities, grants or payroll rows change.
begin read only;
do $t$
declare p jsonb;one jsonb;two jsonb;changed jsonb;
begin
 p:='{"payDate":"2026-09-15","employees":[{"employeeId":"finance-one","taxable":"1"},{"employeeId":"finance-two","taxable":"2"}]}';
 one:=private.payroll_net_review_for_actor(p,null,'finance-one');
 if jsonb_array_length(one->'employees')<>1 or one#>>'{employees,0,employeeId}'<>'finance-two' then raise exception 'Own row accepted';end if;
 two:=private.payroll_net_review_for_actor(p,one,'finance-two');
 if jsonb_array_length(two->'employees')<>2 or two#>>'{employeeApprovals,finance-one}'<>'finance-two' or two#>>'{employeeApprovals,finance-two}'<>'finance-one' then raise exception 'Independent review carry failed';end if;
 changed:=private.payroll_net_review_for_actor(jsonb_set(p,'{employees,1,taxable}','"99"'),two,'finance-two');
 if jsonb_array_length(changed->'employees')<>1 then raise exception 'Own changed amount preserved';end if;
 changed:=private.payroll_net_review_for_actor(jsonb_set(p,'{payDate}','"2026-09-16"'),two,'finance-two');
 if jsonb_array_length(changed->'employees')<>1 then raise exception 'Own changed policy preserved';end if;
 perform set_config('phase5.review_test','PASS: batch excludes own pay; second independent reviewer completes it; own amount or policy changes remove carried approval.',true);
end $t$;
select current_setting('phase5.review_test') result;
rollback;
