begin;

select plan(8);

select is(
  (select count(*)::integer from public.dual_role_allowlist),
  2,
  'Only two users are approved for dual roles'
);

select set_eq(
  $$
    select ur.role_id
    from public.user_roles ur
    join public.hris_users u on u.id = ur.user_id
    where lower(trim(u.email)) = 'kay@thenextperience.com'
  $$,
  $$ values ('Admin'::text), ('Board of Director'::text) $$,
  'Owner has exactly Admin and Board of Director'
);

select is(
  (select ur.role_id
   from public.user_roles ur
   join public.hris_users u on u.id = ur.user_id
   where lower(trim(u.email)) = 'kay@thenextperience.com' and ur.is_primary),
  'Board of Director',
  'Owner primary role remains Board of Director'
);

select is(
  (select u.data_access_scope->>'type'
   from public.hris_users u
   where lower(trim(u.email)) = 'kay@thenextperience.com'),
  'GLOBAL',
  'Owner data scope is global'
);

select set_eq(
  $$
    select ur.role_id
    from public.user_roles ur
    join public.hris_users u on u.id = ur.user_id
    where lower(trim(u.email)) = 'it@thenextperience.com'
  $$,
  $$ values ('Admin'::text), ('IT'::text) $$,
  'IT administrator has exactly Admin and IT'
);

select is(
  (select ur.role_id
   from public.user_roles ur
   join public.hris_users u on u.id = ur.user_id
   where lower(trim(u.email)) = 'it@thenextperience.com' and ur.is_primary),
  'IT',
  'IT administrator primary role remains IT'
);

select is(
  (select u.data_access_scope->>'type'
   from public.hris_users u
   where lower(trim(u.email)) = 'it@thenextperience.com'),
  'GLOBAL',
  'IT administrator data scope is global'
);

select is(
  (select count(*)::integer
   from public.user_roles ur
   join public.hris_users u on u.id = ur.user_id
   where lower(trim(u.email)) not in ('kay@thenextperience.com', 'it@thenextperience.com')
   group by ur.user_id
   having count(*) > 1
   limit 1),
  null::integer,
  'No unapproved user has multiple roles'
);

select * from finish();
rollback;
