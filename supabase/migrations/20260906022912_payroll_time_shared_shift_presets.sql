-- Existing global shift presets are reusable within a BU rule; no preset is edited.
create or replace function public.save_payroll_time_rules(p_scope_id uuid,p_date_from date,p_date_to date,p_config jsonb,p_source_ref text) returns uuid
language plpgsql security definer set search_path='' as $$
declare id uuid;entry record;bu uuid;begin
 if not private.payroll_time_permission(p_scope_id,'rules') then raise exception 'Scoped HR authorization is required.' using errcode='42501';end if;
 if p_date_from is null or p_date_to is null or p_date_to<p_date_from or p_date_to-p_date_from>366 then raise exception 'Choose a policy coverage range of at most one year.';end if;
 if jsonb_typeof(p_config)<>'object' or jsonb_typeof(coalesce(p_config->'restTemplates','[]'))<>'array' or jsonb_typeof(coalesce(p_config->'meals','{}'))<>'object' then raise exception 'Invalid time-rule configuration.';end if;
 select business_unit_id into bu from public.payroll_access_scopes s where s.id=p_scope_id;
 for entry in select value#>>'{}' key from jsonb_array_elements(coalesce(p_config->'restTemplates','[]')) loop
 if not exists(select 1 from public.shift_templates t where t.id=entry.key::uuid and (t.business_unit_id=bu or t.business_unit_id is null)) then raise exception 'Rest-day template belongs to another BU.';end if;end loop;
 for entry in select * from jsonb_each_text(coalesce(p_config->'meals','{}')) loop
 if not exists(select 1 from public.shift_templates t where t.id=entry.key::uuid and (t.business_unit_id=bu or t.business_unit_id is null)) or entry.value!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Choose a BU template and valid prescribed meal start time.';end if;end loop;
 insert into public.payroll_time_rules(scope_id,effective_from,effective_to,config,source_ref,approved_by) values(p_scope_id,p_date_from,p_date_to,
 jsonb_build_object('graceMinutes',5,'unpaidLunchMinutes',60,'minimumOtMinutes',60,'timezone','Asia/Manila','holidayCoverageConfirmed',coalesce((p_config->>'holidayCoverageConfirmed')::boolean,false),'splitShiftConfirmed',coalesce((p_config->>'splitShiftConfirmed')::boolean,false),'restTemplates',coalesce(p_config->'restTemplates','[]'),'meals',coalesce(p_config->'meals','{}'),'leavePolicyRef',p_config->>'leavePolicyRef','offsetPolicyRef',p_config->>'offsetPolicyRef'),p_source_ref,private.payroll_actor_id()) returning payroll_time_rules.id into id;
 insert into public.payroll_time_audit(scope_id,actor_id,action,record_id,reason) values(p_scope_id,private.payroll_actor_id(),'rules_recorded',id,p_source_ref);return id;
end $$;

create or replace function public.preview_payroll_time(p_scope_id uuid,p_date_from date,p_date_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare review jsonb;begin
 if not private.payroll_time_permission(p_scope_id,'view') then raise exception 'A scoped timekeeping/payroll duty and existing Timekeeping access are required.' using errcode='42501';end if;
 review:=private.payroll_time_review(p_scope_id,p_date_from,p_date_to);
 return (review-'source')||jsonb_build_object('holidays',review#>'{source,holidays}','rules',review#>'{source,rules}','templates',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'start',t.start_time,'end',t.end_time) order by t.name) from public.shift_templates t join public.payroll_access_scopes s on (s.business_unit_id=t.business_unit_id or t.business_unit_id is null) where s.id=p_scope_id),'[]'),
 'packages',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'version',p.version,'status',p.status,'createdAt',p.created_at,'submittedAt',p.submitted_at,'reason',p.reason,'previousId',p.previous_id,'current',p.source_hash=review->>'sourceHash','blockedDays',p.result->'blockedDays') order by p.version desc) from public.payroll_time_packages p where p.scope_id=p_scope_id and p.date_from=p_date_from and p.date_to=p_date_to),'[]'));
end $$;
notify pgrst,'reload schema';
