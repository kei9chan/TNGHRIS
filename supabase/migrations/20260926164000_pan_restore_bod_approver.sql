-- PANs require the normal reporting-line approvals plus the BOD stage.
-- Restore the shared BOD approval pool for all PANs.

create or replace function private.pan_employee_requires_bod(p_employee_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select true; $$;

create or replace function private.pan_parallel_bod_steps_for_employee(p_steps jsonb,p_employee_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $$ select private.pan_parallel_bod_steps(p_steps); $$;

update public.pans p
set routing_steps=private.pan_parallel_bod_steps_for_employee(p.routing_steps,p.employee_id),
    updated_at=clock_timestamp()
where p.status::text='Pending Approval';

notify pgrst,'reload schema';
