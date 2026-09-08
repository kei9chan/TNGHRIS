-- Keep private schema inaccessible; public entrypoints invoke guarded narrow helpers.
alter function public.get_bod_employee_snapshot(uuid) security definer;
alter function public.get_bod_employee_directory(jsonb) security definer;
alter function public.get_bod_employee_filters() security definer;
create or replace function private.bod_snapshot_pay(p_employee uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare packs jsonb; h public.hris_users; total numeric; unit text; tax text; shares text; conflict boolean; modes integer;
begin
 perform private.bod_snapshot_assert();
 select * into h from public.hris_users where id=p_employee and not coalesce(is_duplicate,false);
 with latest as (
 select p.*, dense_rank() over(partition by engagement_key order by effective_from desc) rk
 from public.payroll_pay_packages p where employee_id=p_employee and status='approved'
 and effective_from<=(now() at time zone 'Asia/Manila')::date
 ), selected as (select * from latest where rk=1)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'stream',stream,'engagement',engagement_key,'effectiveFrom',effective_from,'unit',rate_type,
 'base',base_amount,'components',(select coalesce(jsonb_agg(jsonb_build_object('name',c->>'name','amount',c->'amount','recurrence',c->>'recurrence','payableDate',c->>'payableDate')),'[]') from jsonb_array_elements(components) c),'payBasis',treatment->>'payBasis','netTarget',treatment->>'netTarget') order by engagement_key,id),'[]'),
 count(*)<>count(distinct engagement_key) into packs,conflict from selected;
 if jsonb_array_length(packs)=0 then
 return jsonb_build_object('state','missing','amount',null,'unit',null,'tax','Not configured','shares','Not configured','packages',packs,
 'reason','No current approved pay package. HRIS reference rate is not an approved total package.',
 'referenceAmount',h.rate_amount,'referenceUnit',h.rate_type); end if;
 select count(distinct x->>'unit'),min(x->>'unit') into modes,unit from jsonb_array_elements(packs) x;
 if not conflict and modes=1 then
 select sum((x->>'base')::numeric+coalesce((select sum((c->>'amount')::numeric) from jsonb_array_elements(x->'components') c where c->>'recurrence'='recurring'),0)) into total from jsonb_array_elements(packs) x;
 end if;
 select case when bool_and(coalesce(x->>'payBasis','')='gross') then 'Gross'
 when bool_and(coalesce(x->>'payBasis','') in ('net_tax','net_all')) then 'Net of tax' else 'Not configured' end,
 case when bool_and(coalesce(x->>'payBasis','') in ('gross','net_tax')) then 'Employee share deducted from pay'
 when bool_and(coalesce(x->>'payBasis','')='net_all') then 'Company shoulders employee share'
 when bool_and(coalesce(x->>'payBasis','') in ('gross','net_tax','net_all')) then 'Split arrangement' else 'Not configured' end
 into tax,shares from jsonb_array_elements(packs) x;
 -- Do not present contractor withholding as employment income tax.
 if exists(select 1 from jsonb_array_elements(packs) x where x->>'stream'='professional_fee') then
 shares:='Split arrangement'; if jsonb_array_length(packs)=1 then shares:='Not applicable — consultant';end if;
 tax:='Not configured';end if;
 return jsonb_build_object('state',case when conflict then 'conflict' else 'available' end,'amount',case when conflict then null else total end,
 'unit',case when modes=1 then unit else 'Split arrangement' end,'tax',tax,'shares',shares,'packages',packs,
 'reason',case when conflict then 'Conflicting approved packages share an engagement and effective date. Review salary history.'
 when modes>1 then 'Different payment units: amounts are shown separately, not added together.'
 else 'Approved base plus recurring components, before variable pay. Agreed net targets are shown separately.' end);
end $$;
revoke all on function private.bod_snapshot_pay(uuid) from public,anon,authenticated;


notify pgrst,'reload schema';
