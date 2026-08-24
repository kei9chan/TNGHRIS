-- System Admin is an existing RBAC authority in TNG HRIS. Align the batch
-- import endpoints and attachment policies with that authority while keeping
-- feature-level permissions available for delegated HR users.

do $$
declare
  definition text;
begin
  select pg_get_functiondef('public.import_assets_batch(jsonb)'::regprocedure) into definition;
  definition := replace(
    definition,
    'if actor_id is null or not public.has_feature_permission(''Assets'', ''manage'') then',
    'if actor_id is null or not (public.is_system_admin() or public.has_feature_permission(''Assets'', ''manage'')) then'
  );
  execute definition;

  select pg_get_functiondef('public.import_memos_batch(jsonb,boolean)'::regprocedure) into definition;
  definition := replace(
    definition,
    'if actor_id is null or not public.has_feature_permission(''Feedback'', ''edit'') then',
    'if actor_id is null or not (public.is_system_admin() or public.has_feature_permission(''Feedback'', ''edit'')) then'
  );
  execute definition;
end;
$$;

drop policy if exists memo_attachments_authorized_read on storage.objects;
create policy memo_attachments_authorized_read
on storage.objects for select to authenticated
using (
  bucket_id = 'memo_attachments'
  and (
    public.is_system_admin()
    or public.has_feature_permission('Feedback', 'edit')
    or public.has_feature_permission('Feedback', 'manage')
    or exists (
      select 1
      from public.memos m
      join public.hris_users viewer on viewer.id = public.current_hris_user_id()
      where (m.memo_number = (storage.foldername(name))[2] or name = any(m.attachments))
        and lower(m.status::text) = 'published'
        and (
          coalesce(array_length(m.target_employee_ids, 1), 0) = 0
          and coalesce(array_length(m.target_business_units, 1), 0) = 0
          and coalesce(array_length(m.target_departments, 1), 0) = 0
          or viewer.id = any(m.target_employee_ids)
          or 'All' = any(m.target_business_units)
          or 'All' = any(m.target_departments)
          or viewer.business_unit = any(m.target_business_units)
          or viewer.business_unit_id::text = any(m.target_business_units)
          or viewer.department = any(m.target_departments)
          or viewer.department_id::text = any(m.target_departments)
        )
    )
  )
);

drop policy if exists memo_attachments_authorized_insert on storage.objects;
create policy memo_attachments_authorized_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'memo_attachments'
  and (
    public.is_system_admin()
    or public.has_feature_permission('Feedback', 'edit')
    or public.has_feature_permission('Feedback', 'manage')
  )
);

drop policy if exists memo_attachments_authorized_update on storage.objects;
create policy memo_attachments_authorized_update
on storage.objects for update to authenticated
using (
  bucket_id = 'memo_attachments'
  and (
    public.is_system_admin()
    or public.has_feature_permission('Feedback', 'edit')
    or public.has_feature_permission('Feedback', 'manage')
  )
)
with check (
  bucket_id = 'memo_attachments'
  and (
    public.is_system_admin()
    or public.has_feature_permission('Feedback', 'edit')
    or public.has_feature_permission('Feedback', 'manage')
  )
);

drop policy if exists memo_attachments_authorized_delete on storage.objects;
create policy memo_attachments_authorized_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'memo_attachments'
  and (
    public.is_system_admin()
    or public.has_feature_permission('Feedback', 'edit')
    or public.has_feature_permission('Feedback', 'manage')
  )
);

revoke all on function public.import_assets_batch(jsonb) from public, anon;
grant execute on function public.import_assets_batch(jsonb) to authenticated;
revoke all on function public.import_memos_batch(jsonb, boolean) from public, anon;
grant execute on function public.import_memos_batch(jsonb, boolean) to authenticated;
