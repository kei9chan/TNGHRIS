-- RLS policies execute these private, fixed-search-path helpers as the
-- authenticated caller. They remain unavailable to anon and PUBLIC.
revoke all on function private.is_current_user_evaluation_target(uuid) from public, anon, authenticated;
revoke all on function private.can_current_user_access_evaluation(uuid) from public, anon, authenticated;
grant execute on function private.is_current_user_evaluation_target(uuid) to authenticated;
grant execute on function private.can_current_user_access_evaluation(uuid) to authenticated;
