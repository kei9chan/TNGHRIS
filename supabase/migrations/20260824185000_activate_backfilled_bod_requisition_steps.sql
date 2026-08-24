-- If an older pending requisition had already completed its HR-only route, make
-- the newly backfilled required BOD step current without changing prior steps.
do $$
declare request_row record; waiting_index integer;
begin
  perform set_config('app.job_requisition_rpc','on',true);
  for request_row in
    select id,routing_steps
    from public.job_requisitions
    where status::text in ('PendingApproval','Pending Approval')
      and not exists (
        select 1 from jsonb_array_elements(coalesce(routing_steps,'[]'::jsonb)) step
        where step->>'status'='Pending'
      )
      and exists (
        select 1 from jsonb_array_elements(coalesce(routing_steps,'[]'::jsonb)) step
        where (coalesce((step->>'isBod')::boolean,false) or step->>'roleSnapshot'='Board of Director')
          and step->>'status'='Waiting'
      )
  loop
    select ordinality::integer-1 into waiting_index
    from jsonb_array_elements(request_row.routing_steps) with ordinality route(value,ordinality)
    where (coalesce((value->>'isBod')::boolean,false) or value->>'roleSnapshot'='Board of Director')
      and value->>'status'='Waiting'
    order by ordinality limit 1;

    update public.job_requisitions
    set routing_steps=jsonb_set(routing_steps,array[waiting_index::text,'status'],'"Pending"'::jsonb,true),
        updated_at=updated_at
    where id=request_row.id;
  end loop;
end $$;
