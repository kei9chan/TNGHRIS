-- Temporary records only, using the installed approval constraints. No real
-- employees, roles, grants, payroll, payments or released payslips are inserted.
begin;
create temporary table phase7_actions (like public.payroll_approval_actions including all) on commit drop;
do $$declare i integer;denied boolean;run uuid:='00000000-0000-0000-0000-000000000007';bod uuid:='00000000-0000-0000-0000-000000000004';begin
 for i in 0..5 loop perform private.payroll_validate_approval_action(i,i,true,'approve');end loop;
 if private.payroll_approval_stage(3)<>'Finance authorization' or private.payroll_approval_stage(4)<>'BOD approval 1 of 2' or private.payroll_approval_stage(6)<>'Approved / Locked' then raise exception 'Stage order mismatch';end if;
 denied:=false;begin perform private.payroll_validate_approval_action(4,2,true,'approve');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'BOD skipped HR/Finance';end if;
 denied:=false;begin perform private.payroll_validate_approval_action(4,5,true,'approve');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Stale double click accepted';end if;
 denied:=false;begin perform private.payroll_validate_approval_action(2,2,false,'approve');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Revoked/self/stale denial bypassed';end if;
 denied:=false;begin perform private.payroll_validate_approval_action(6,6,true,'approve');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Approved version accepts another stage';end if;
 insert into phase7_actions(run_id,step,action,actor_id,reason) values(run,4,'approve',bod,'Temporary constraint check');
 denied:=false;begin insert into phase7_actions(run_id,step,action,actor_id,reason) values(run,5,'approve',bod,'Same BOD again');exception when unique_violation then denied:=true;end;if not denied then raise exception 'Same BOD can count twice';end if;
 insert into phase7_actions(run_id,step,action,actor_id,reason) values(run,5,'approve','00000000-0000-0000-0000-000000000005','Distinct BOD');
 if (select count(*) from phase7_actions)<>2 then raise exception 'Distinct BOD count mismatch';end if;
 denied:=false;begin insert into phase7_actions(run_id,step,action,actor_id,reason) values(run,5,'approve','00000000-0000-0000-0000-000000000006','Duplicate stage');exception when unique_violation then denied:=true;end;if not denied then raise exception 'Duplicate stage accepted';end if;
end $$;
rollback;
