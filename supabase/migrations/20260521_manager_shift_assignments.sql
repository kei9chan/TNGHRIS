CREATE POLICY "shift_assign_manager_all" ON "public"."shift_assignments"
FOR ALL
TO authenticated
USING (
  (SELECT role FROM public.hris_users WHERE auth_user_id = auth.uid()) = 'Manager'
  AND (
    employee_id IN (
      SELECT id FROM public.hris_users 
      WHERE department = (SELECT department FROM public.hris_users WHERE auth_user_id = auth.uid())
    )
  )
)
WITH CHECK (
  (SELECT role FROM public.hris_users WHERE auth_user_id = auth.uid()) = 'Manager'
  AND (
    employee_id IN (
      SELECT id FROM public.hris_users 
      WHERE department = (SELECT department FROM public.hris_users WHERE auth_user_id = auth.uid())
    )
  )
);
