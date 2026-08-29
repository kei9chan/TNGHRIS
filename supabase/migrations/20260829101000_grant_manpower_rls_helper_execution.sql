-- RLS evaluates these private, SECURITY DEFINER helpers as the requesting
-- database role. Keep them unexposed while allowing authenticated policy
-- evaluation.
grant execute on function private.is_manpower_request_owner(uuid, uuid) to authenticated;
grant execute on function private.is_manpower_active_approver(uuid, uuid) to authenticated;
