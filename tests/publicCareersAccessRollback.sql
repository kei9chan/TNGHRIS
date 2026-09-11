-- Run as the database test administrator. All test applications are rolled back.
begin;
set local statement_timeout='30s';
do $$
declare token uuid:=gen_random_uuid();page_slug text;job uuid;r jsonb;again jsonb;denied boolean;
begin
 set local role anon;
 select t.slug,j.id into page_slug,job from public.applicant_page_themes t join public.job_posts j on j.business_unit_id=t.business_unit_id where t.is_active limit 1;
 if page_slug is null then raise exception 'Fixture required: active career page with an open job';end if;
 if exists(select 1 from public.applicant_page_themes where not is_active) then raise exception 'Inactive theme exposed';end if;
 if exists(select 1 from public.job_posts where lower(status)<>'published' or is_archived or not is_active) then raise exception 'Private job exposed';end if;
 if exists(select 1 from public.job_candidates) or exists(select 1 from public.job_applications) then raise exception 'Candidate data exposed';end if;
 r:=public.submit_public_career_application(page_slug,job,token,'{"first_name":"Rollback","last_name":"Applicant","email":"careers-test@example.invalid"}','{"consent":true}');
 again:=public.submit_public_career_application(page_slug,job,token,'{"first_name":"Rollback","last_name":"Applicant","email":"careers-test@example.invalid"}','{"consent":true}');
 if r<>again then raise exception 'Retry reference changed';end if;
 denied:=false;begin perform public.submit_public_career_application(page_slug,gen_random_uuid(),gen_random_uuid(),'{"first_name":"Rollback","last_name":"Applicant","email":"careers-test@example.invalid"}','{"consent":true}');exception when raise_exception then denied:=true;end;if not denied then raise exception 'Invalid job accepted';end if;
 reset role;
 if (select count(*) from public.job_applications where submission_token=token::text)<>1 then raise exception 'Duplicate application';end if;
end $$;
select 'PASS: public career reads, private candidate records, anonymous submission, retry idempotency and invalid-job rejection.' result;
rollback;
