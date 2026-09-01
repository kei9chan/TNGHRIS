-- Complete the digital seed with the prompts printed on the existing paper form.
-- Only update the untouched seed; submitted ratings retain their snapshots.

update public.job_interview_templates t
set sections = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          t.sections,
          '{2,fields,0,description}',
          to_jsonb('What factors appear to be influencing the applicant''s consideration of a position with our company at this time? Why is the applicant leaving his/her present position?'::text),
          true
        ),
        '{2,fields,1,description}',
        to_jsonb('What reservations or concerns (if any) does the applicant have about the position? Consider work location, travel, compensation, advancement, opportunities, etc.'::text),
        true
      ),
      '{2,fields,2,description}',
      to_jsonb('Does the applicant seem to be more suitable for another position or location?'::text),
      true
    ),
    '{2,fields,3,description}',
    to_jsonb('What are the applicant''s apparent assets and limitations? What training and development (if any) is recommended?'::text),
    true
  ),
  '{2,fields,4,description}',
  to_jsonb('Add any additional comments from the interview.'::text),
  true
),
updated_at = now()
where t.name = 'Standard Interview Rating Form — Existing Company Template'
  and t.is_current
  and not exists (
    select 1
    from public.job_interview_rating_records r
    where r.template_version_id = t.id
  );
