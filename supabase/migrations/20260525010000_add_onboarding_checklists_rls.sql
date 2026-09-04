-- Allow users to view and update their own onboarding checklists

DROP POLICY IF EXISTS "users_can_view_own_onboarding_checklists" ON public.onboarding_checklists;
CREATE POLICY "users_can_view_own_onboarding_checklists"
ON public.onboarding_checklists
FOR SELECT
USING (
  employee_id IN (
    SELECT id FROM public.hris_users WHERE auth_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "users_can_update_own_onboarding_checklists" ON public.onboarding_checklists;
CREATE POLICY "users_can_update_own_onboarding_checklists"
ON public.onboarding_checklists
FOR UPDATE
USING (
  employee_id IN (
    SELECT id FROM public.hris_users WHERE auth_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "users_can_insert_own_onboarding_checklists" ON public.onboarding_checklists;
CREATE POLICY "users_can_insert_own_onboarding_checklists"
ON public.onboarding_checklists
FOR INSERT
WITH CHECK (
  employee_id IN (
    SELECT id FROM public.hris_users WHERE auth_user_id = auth.uid()
  )
);
