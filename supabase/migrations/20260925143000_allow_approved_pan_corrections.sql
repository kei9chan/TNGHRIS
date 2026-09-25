-- A correction is the supported way to change an approved PAN package.
-- Approving the correction supersedes the prior locked PAN package so the
-- employee/effective-date uniqueness rule remains true. The prior package is
-- still immutable history; it is not edited or downgraded to draft.
create or replace function private.validate_payroll_package()
returns trigger
language plpgsql
set search_path=''
as $function$
declare c jsonb; key_name text;
begin
 if tg_op='DELETE' then
   raise exception 'Pay history cannot be deleted.' using errcode='42501';
 end if;

 if tg_op='UPDATE' then
   if old.status='approved' then
     if (to_jsonb(new)-array['status','approved_by','approved_at','approval_steps','approval_state'])
        is distinct from
        (to_jsonb(old)-array['status','approved_by','approved_at','approval_steps','approval_state']) then
       raise exception 'Create a new pay-package version; approved history is immutable.' using errcode='42501';
     end if;
     if new.status not in ('approved','superseded') then
       raise exception 'Invalid approved pay-package status transition.' using errcode='42501';
     end if;
     if (new.approved_by,new.approved_at) is distinct from (old.approved_by,old.approved_at) then
       raise exception 'Approved compensation history is immutable.' using errcode='42501';
     end if;
   elsif old.status='draft' then
     if new.status not in ('draft','approved','rejected') then
       raise exception 'Invalid draft pay-package status transition.' using errcode='42501';
     end if;
     if new.status='draft' and new.approval_state not in ('draft','returned','pending','approved') then
       raise exception 'Invalid draft approval state.' using errcode='42501';
     end if;
     if new.status='approved' and new.approval_state<>'approved' then
       raise exception 'Approved package requires completed approval.' using errcode='42501';
     end if;
     if new.status='rejected' and new.approval_state<>'rejected' then
       raise exception 'Rejected package requires a rejected approval state.' using errcode='42501';
     end if;
   else
     if to_jsonb(new) is distinct from to_jsonb(old) then
       raise exception 'Completed pay-package history is immutable.' using errcode='42501';
     end if;
   end if;
 end if;

 -- An approved PAN package is locked while active. It may only move to
 -- superseded when a separately-created correction is approved; the guarded
 -- approval function verifies the correction reference and same-date match.
 if new.source_kind='approved_pan' and
    (new.source_pan_id is null
     or (new.status='approved' and new.approval_state<>'approved')
     or new.status not in ('approved','superseded')) then
   raise exception 'A PAN-generated package must be an approved, locked compensation record.';
 end if;
 if new.source_kind='correction' and new.correction_of_id is null then
   raise exception 'A correction must reference its locked source package.';
 end if;
 if jsonb_typeof(new.approval_steps)<>'array' or jsonb_typeof(new.source_metadata)<>'object' then
   raise exception 'Invalid package provenance.';
 end if;
 if jsonb_typeof(new.components)<>'array' or jsonb_array_length(new.components)>30 then
   raise exception 'Use at most 30 pay components.';
 end if;
 if jsonb_typeof(new.treatment)<>'object' then
   raise exception 'Invalid basic-pay treatment.';
 end if;
 foreach key_name in array array['tax','sss','philhealth','pagibig','thirteenthMonth','proration'] loop
   if coalesce(new.treatment->>key_name,'unreviewed') not in ('unreviewed','included','excluded','rule_defined') then
     raise exception 'Invalid treatment.';
   end if;
 end loop;
 for c in select * from jsonb_array_elements(new.components) loop
   if jsonb_typeof(c)<>'object'
     or coalesce(length(btrim(c->>'name')),0) not between 1 and 100
     or coalesce(c->>'recurrence','') not in ('recurring','one_time')
     or coalesce(c->>'amount','') !~ '^[0-9]+(\\.[0-9]{1,6})?$'
     or (c->>'amount')::numeric>99999999999999
     or coalesce(c->>'tax','unreviewed') not in ('unreviewed','included','excluded','rule_defined')
     or coalesce(c->>'sss','unreviewed') not in ('unreviewed','included','excluded','rule_defined')
     or coalesce(c->>'philhealth','unreviewed') not in ('unreviewed','included','excluded','rule_defined')
     or coalesce(c->>'pagibig','unreviewed') not in ('unreviewed','included','excluded','rule_defined')
     or coalesce(c->>'thirteenthMonth','unreviewed') not in ('unreviewed','included','excluded','rule_defined')
     or coalesce(c->>'proration','unreviewed') not in ('unreviewed','included','excluded','rule_defined')
     or coalesce(c->>'legacyField','') not in ('','deminimis','reimbursable') then
     raise exception 'Invalid pay component.';
   end if;
   if c->>'recurrence'='one_time' and
      (nullif(c->>'payableDate','') is null or (c->>'payableDate')::date<new.effective_from) then
     raise exception 'A one-time component needs a payable date on/after the package start.';
   end if;
 end loop;
 return new;
end
$function$;

notify pgrst,'reload schema';
