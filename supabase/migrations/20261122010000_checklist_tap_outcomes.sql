CREATE OR REPLACE FUNCTION operations_private.response_error(p_item uuid, p_value jsonb, p_remarks text, p_submit boolean)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare i public.ops_run_items;v jsonb:=nullif(p_value,'null'::jsonb);begin
 select * into i from public.ops_run_items where id=p_item;
 if i.id is null then return 'Item unavailable';end if;
 if length(coalesce(p_remarks,''))>2000 then return 'Remarks must be at most 2,000 characters';end if;
 if v is null then if p_submit and i.required then return 'A required answer is missing';else return null;end if;end if;
 -- Routine checklist items accept the three staff outcomes. Evidence-bearing and
 -- safety-critical items continue through their configured validation below.
 if i.response_type in ('none','yes_no') and v in ('"na"'::jsonb,'"no"'::jsonb)
    and not coalesce((i.snapshot->>'safety_critical')::boolean,false)
    and not coalesce((i.snapshot->>'photo_required')::boolean,false)
    and exists(select 1 from public.ops_checklist_runs r
      join public.ops_template_versions tv on tv.id=r.template_version_id
      join public.ops_templates t on t.id=tv.template_id
      where r.id=i.run_id and t.kind='checklist') then
   return null;
 end if;
 if v='"na"'::jsonb then
 if not coalesce((i.snapshot->>'allow_na')::boolean,false) then return 'Not Applicable is not permitted';end if;
 if length(trim(coalesce(p_remarks,'')))<3 then return 'Explain why the item is Not Applicable';end if;return null;
 end if;
 if i.response_type in ('none','photo') then
 if jsonb_typeof(v)<>'boolean' then return 'Expected a checkbox confirmation';end if;
 if p_submit and v<>'true' then return 'Confirm the work is complete';end if;
 elsif i.response_type='yes_no' then
 if v not in ('"yes"'::jsonb,'"no"'::jsonb) then return 'Choose Yes or No';end if;
 if v='"no"'::jsonb and length(trim(coalesce(p_remarks,'')))<3 then return 'Explain the failed inspection';end if;
 elsif i.response_type='numeric' then
 if jsonb_typeof(v)<>'number' or abs((v#>>'{}')::numeric)>1e12 then return 'Enter a numeric reading between -1 trillion and 1 trillion';end if;
 elsif i.response_type='text' then
 if jsonb_typeof(v)<>'string' or length(trim(v#>>'{}')) not between 1 and 4000 then return 'Enter a text response (1–4,000 characters)';end if;
 end if;
 if p_submit and (i.response_type='photo' or coalesce((i.snapshot->>'photo_required')::boolean,false)) and not exists(select 1 from public.ops_evidence e where e.item_id=p_item and e.state='Ready' and e.expires_at>now() and e.deleted_at is null) then return 'A photo is required';end if;
 return null;
end $function$
;
