revoke all on function private.can_view_nte(uuid),private.nte_is_published(uuid),private.nte_attachment_allowed(text,boolean) from public,anon;
grant execute on function private.can_view_nte(uuid),private.nte_is_published(uuid),private.nte_attachment_allowed(text,boolean) to authenticated;
notify pgrst,'reload schema';
