-- Active career pages and open postings are intentionally public. Candidate
-- records stay private; public submission is a narrow, insert-only transaction.
grant select on public.applicant_page_themes, public.job_posts to anon;
create policy careers_active_theme_read on public.applicant_page_themes for select to anon using (is_active=true);
create policy careers_open_post_read on public.job_posts for select to anon,authenticated using (
 lower(status)='published' and coalesce(is_active,true) and not coalesce(is_archived,false)
 and (application_open_at is null or application_open_at<=now())
 and (application_close_at is null or application_close_at>=now())
 and coalesce(channels->>'careerSite','true')='true'
 and exists(select 1 from public.applicant_page_themes t where t.business_unit_id=job_posts.business_unit_id and t.is_active=true));

create or replace function public.submit_public_career_application(p_slug text,p_job uuid,p_token uuid,p_candidate jsonb,p_application jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare theme public.applicant_page_themes;job public.job_posts;candidate_id uuid;ref text;prior public.job_applications;
begin
 if length(p_candidate::text)>20000 or length(p_application::text)>100000 or p_token is null then raise exception 'Application is too large or missing its submission token.';end if;
 if coalesce(p_application->>'consent','false')<>'true' or length(trim(coalesce(p_candidate->>'first_name','')))=0 or length(trim(coalesce(p_candidate->>'last_name','')))=0 or coalesce(p_candidate->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter your name, valid email address and privacy consent.';end if;
 select * into theme from public.applicant_page_themes where slug=p_slug and is_active=true;
 if theme.id is null then raise exception 'This career page is not accepting applications.';end if;
 perform pg_advisory_xact_lock(hashtextextended('career-submit:'||p_token::text,0));
 select * into prior from public.job_applications where submission_token=p_token::text;
 if prior.id is not null then
 if prior.job_post_id is distinct from p_job or prior.source_application_page is distinct from '/careers/'||p_slug||'/apply' or not exists(select 1 from public.job_candidates c where c.id=prior.candidate_id and lower(c.email)=lower(trim(p_candidate->>'email'))) then raise exception 'Submission token is already in use. Reload the application form.';end if;
 return jsonb_build_object('reference',prior.application_reference);end if;
 if p_job is not null then
 select * into job from public.job_posts where id=p_job and business_unit_id=theme.business_unit_id
 and lower(status)='published' and coalesce(is_active,true) and not coalesce(is_archived,false)
 and coalesce(channels->>'careerSite','true')='true'
 and (application_open_at is null or application_open_at<=now()) and (application_close_at is null or application_close_at>=now()) for share;
 if job.id is null then raise exception 'This role is no longer accepting applications. Choose another open role.';end if;
 end if;
 insert into public.job_candidates(first_name,last_name,email,phone,source,portfolio_url,consent_at,current_city,linkedin_url,current_employer,earliest_start_date)
 values(trim(p_candidate->>'first_name'),trim(p_candidate->>'last_name'),trim(p_candidate->>'email'),p_candidate->>'phone','Career Site',p_candidate->>'portfolio_url',now(),p_candidate->>'current_city',p_candidate->>'linkedin_url',p_candidate->>'current_employer',nullif(p_candidate->>'earliest_start_date','')::date) returning id into candidate_id;
 ref:='APP-'||upper(replace(p_token::text,'-',''));
 insert into public.job_applications(candidate_id,job_post_id,requisition_id,role_id,role_slug,role_title_snapshot,department_snapshot,location_snapshot,employment_type_snapshot,work_arrangement_snapshot,stage,resume_url,resume_link,resume_file_url,resume_file_path,role_answers,source_application_page,application_reference,submission_token)
 values(candidate_id,job.id,job.requisition_id,job.id::text,job.slug,coalesce(job.title,'General Application'),job.department_label,job.location_label,job.employment_type,job.role_details->>'workArrangement','New',p_application->>'resume_url',p_application->>'resume_link',p_application->>'resume_file_url',p_application->>'resume_file_path',coalesce(p_application->'role_answers','{}'::jsonb),'/careers/'||p_slug||'/apply',ref,p_token::text);
 return jsonb_build_object('reference',ref);
end $$;
revoke all on function public.submit_public_career_application(text,uuid,uuid,jsonb,jsonb) from public;
grant execute on function public.submit_public_career_application(text,uuid,uuid,jsonb,jsonb) to anon,authenticated;
