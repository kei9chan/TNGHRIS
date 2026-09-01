-- Expose only the authenticated workflow functions. Every function still
-- performs its own role and record authorization checks.

revoke all on function public.validate_job_interview_rating_record() from public, anon;
revoke all on function public.save_interview_template(uuid, text, text, text, uuid[], text[], text[], jsonb, jsonb) from public, anon;
revoke all on function public.duplicate_interview_template(uuid, text) from public, anon;
revoke all on function public.set_interview_template_status(uuid, text) from public, anon;
revoke all on function public.create_interview_rating_assignments(uuid, uuid, uuid, uuid[], date, text) from public, anon;
revoke all on function public.remove_interview_rating_assignment(uuid) from public, anon;
revoke all on function public.save_interview_rating(uuid, jsonb) from public, anon;
revoke all on function public.submit_interview_rating(uuid, jsonb) from public, anon;
revoke all on function public.reopen_interview_rating(uuid, text) from public, anon;
revoke all on function public.lock_interview_rating(uuid) from public, anon;
grant execute on function public.save_interview_template(uuid, text, text, text, uuid[], text[], text[], jsonb, jsonb) to authenticated;
grant execute on function public.duplicate_interview_template(uuid, text) to authenticated;
grant execute on function public.set_interview_template_status(uuid, text) to authenticated;
grant execute on function public.create_interview_rating_assignments(uuid, uuid, uuid, uuid[], date, text) to authenticated;
grant execute on function public.remove_interview_rating_assignment(uuid) to authenticated;
grant execute on function public.save_interview_rating(uuid, jsonb) to authenticated;
grant execute on function public.submit_interview_rating(uuid, jsonb) to authenticated;
grant execute on function public.reopen_interview_rating(uuid, text) to authenticated;
grant execute on function public.lock_interview_rating(uuid) to authenticated;
