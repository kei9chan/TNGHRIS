-- Execute as database administrator. All temporary grants and review rows roll back.
begin;
set local lock_timeout='2s';set local statement_timeout='30s';
do $test$
#variable_conflict use_variable
declare actor uuid;other uuid;scope uuid;scope_b uuid;review jsonb;first_hash text;id uuid;id_again uuid;new_id uuid;rule_id uuid;denied boolean;begin
select a.id into strict actor from auth.users a where lower(a.email)='kay@thenextperience.com';
select h.auth_user_id into strict other from hris_users h where h.auth_user_id is not null and h.auth_user_id<>actor and lower(h.status)='active' and not coalesce(h.is_duplicate,false) limit 1;
select s.id into strict scope from payroll_access_scopes s where kind='business_unit' and exists(select 1 from hris_users h where h.business_unit_id=s.business_unit_id and h.date_hired::date<='2026-08-17') order by s.id limit 1;
select s.id into strict scope_b from payroll_access_scopes s where kind='business_unit' and s.id<>scope limit 1;
perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);set local role authenticated;
denied:=false;begin perform public.preview_payroll_time(scope,'2026-08-17','2026-08-17');exception when insufficient_privilege then denied:=true;end;
if not denied then raise exception 'Access management alone granted attendance work';end if;
reset role;
insert into payroll_access_grants(auth_user_id,scope_id,permission,granted_by,grant_reason) values(actor,scope,'finalize_timekeeping',other,'Rollback-only Phase 3 verification'),(actor,scope,'authorize_hr',other,'Rollback-only Phase 3 configuration verification');
set local role authenticated;
denied:=false;begin perform public.preview_payroll_time(scope_b,'2026-08-17','2026-08-17');exception when insufficient_privilege then denied:=true;end;
if not denied then raise exception 'Cross-BU access allowed';end if;
review:=public.preview_payroll_time(scope,'2026-08-17','2026-08-17');first_hash:=review->>'sourceHash';
if (review#>>'{result,totalDays}')::int=0 or (review#>>'{result,blockedDays}')::int=0 then raise exception 'Missing real source data was not blocked';end if;
id:=public.save_payroll_time_package(scope,'2026-08-17','2026-08-17',first_hash,'Rollback-only first review');
id_again:=public.save_payroll_time_package(scope,'2026-08-17','2026-08-17',first_hash,'Rollback-only retry');
if id_again<>id then raise exception 'Review retry created a duplicate';end if;
denied:=false;begin perform public.submit_payroll_time_package(id);exception when raise_exception then denied:=true;end;
if not denied then raise exception 'Unresolved attendance submitted to Finance';end if;
denied:=false;begin update public.payroll_time_packages set status='submitted' where payroll_time_packages.id=id;exception when insufficient_privilege then denied:=true;end;
if not denied then raise exception 'Direct client table mutation allowed';end if;
rule_id:=public.save_payroll_time_rules(scope,'2026-08-17','2026-08-17','{"holidayCoverageConfirmed":false,"restTemplates":[],"meals":{}}','Rollback-only policy version');
denied:=false;begin perform public.save_payroll_time_package(scope,'2026-08-17','2026-08-17',first_hash,'Rollback-only stale preview');exception when serialization_failure then denied:=true;end;
if not denied then raise exception 'Stale preview accepted';end if;
if (public.get_payroll_time_package(id)->>'current')::boolean then raise exception 'Old package not marked out of date';end if;
review:=public.preview_payroll_time(scope,'2026-08-17','2026-08-17');new_id:=public.save_payroll_time_package(scope,'2026-08-17','2026-08-17',review->>'sourceHash','Rollback-only linked revision');
if new_id=id then raise exception 'Source revision did not create a new version';end if;
reset role;
if (select previous_id from public.payroll_time_packages where payroll_time_packages.id=new_id)<>id then raise exception 'Correction lost original link';end if;
denied:=false;begin update public.payroll_time_packages set reason='changed history' where payroll_time_packages.id=id;exception when insufficient_privilege then denied:=true;end;
if not denied then raise exception 'Saved version was mutable';end if;
update payroll_access_grants set revoked_at=now(),revoked_by=other,revoke_reason='Rollback-only revocation' where auth_user_id=actor and scope_id=scope and permission in('finalize_timekeeping','authorize_hr') and revoked_at is null;
set local role authenticated;
denied:=false;begin perform public.get_payroll_time_package(id);exception when insufficient_privilege then denied:=true;end;
if not denied then raise exception 'Revoked access remained usable';end if;
reset role;
perform set_config('payroll_phase3.result','PASS: access-manager limitation, cross-BU denial, missing-source blocking, idempotent save, denied submission, direct-table denial, stale preview, immutable linked revisions and revocation',true);
end $test$;
select current_setting('payroll_phase3.result') as result;
rollback;
