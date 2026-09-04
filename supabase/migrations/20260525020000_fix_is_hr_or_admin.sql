-- Fix is_hr_or_admin() to include STABLE and search_path settings
-- This ensures the function works correctly within RLS policy evaluation
CREATE OR REPLACE FUNCTION public.is_hr_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE(
    (SELECT role IN ('HR Manager', 'HR Staff', 'Admin')
     FROM public.hris_users
     WHERE auth_user_id = auth.uid() LIMIT 1),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_hr_or_admin() TO authenticated;
