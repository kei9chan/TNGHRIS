-- ============================================================
-- Migration: admin_rls_bypass (v2 — public schema)
-- Created:   2026-05-12
-- Fix:       Moved is_admin() from auth schema → public schema
--            because the SQL Editor cannot write to auth schema.
-- ============================================================

-- Step 1: Helper function in public schema (SQL Editor has access)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.hris_users
    WHERE auth_user_id = auth.uid()
      AND role = 'Admin'
      AND status = 'Active'
  );
$$;

-- Step 2: Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ============================================================
-- Per-table Admin bypass policies
-- ============================================================

-- hris_users
DROP POLICY IF EXISTS "admin_all_hris_users" ON public.hris_users;
CREATE POLICY "admin_all_hris_users" ON public.hris_users
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- business_units
DROP POLICY IF EXISTS "admin_all_business_units" ON public.business_units;
CREATE POLICY "admin_all_business_units" ON public.business_units
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- departments
DROP POLICY IF EXISTS "admin_all_departments" ON public.departments;
CREATE POLICY "admin_all_departments" ON public.departments
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- leave_requests
DROP POLICY IF EXISTS "admin_all_leave_requests" ON public.leave_requests;
CREATE POLICY "admin_all_leave_requests" ON public.leave_requests
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ot_requests
DROP POLICY IF EXISTS "admin_all_ot_requests" ON public.ot_requests;
CREATE POLICY "admin_all_ot_requests" ON public.ot_requests
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- wfh_requests
DROP POLICY IF EXISTS "admin_all_wfh_requests" ON public.wfh_requests;
CREATE POLICY "admin_all_wfh_requests" ON public.wfh_requests
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- incident_reports
DROP POLICY IF EXISTS "admin_all_incident_reports" ON public.incident_reports;
CREATE POLICY "admin_all_incident_reports" ON public.incident_reports
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ntes
DROP POLICY IF EXISTS "admin_all_ntes" ON public.ntes;
CREATE POLICY "admin_all_ntes" ON public.ntes
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- disciplinary_cases
DROP POLICY IF EXISTS "admin_all_disciplinary_cases" ON public.disciplinary_cases;
CREATE POLICY "admin_all_disciplinary_cases" ON public.disciplinary_cases
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- coaching_logs
DROP POLICY IF EXISTS "admin_all_coaching_logs" ON public.coaching_logs;
CREATE POLICY "admin_all_coaching_logs" ON public.coaching_logs
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- pans
DROP POLICY IF EXISTS "admin_all_pans" ON public.pans;
CREATE POLICY "admin_all_pans" ON public.pans
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- coe_requests
DROP POLICY IF EXISTS "admin_all_coe_requests" ON public.coe_requests;
CREATE POLICY "admin_all_coe_requests" ON public.coe_requests
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- evaluations
DROP POLICY IF EXISTS "admin_all_evaluations" ON public.evaluations;
CREATE POLICY "admin_all_evaluations" ON public.evaluations
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- evaluation_responses
DROP POLICY IF EXISTS "admin_all_evaluation_responses" ON public.evaluation_responses;
CREATE POLICY "admin_all_evaluation_responses" ON public.evaluation_responses
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- manpower_requests
DROP POLICY IF EXISTS "admin_all_manpower_requests" ON public.manpower_requests;
CREATE POLICY "admin_all_manpower_requests" ON public.manpower_requests
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- assets
DROP POLICY IF EXISTS "admin_all_assets" ON public.assets;
CREATE POLICY "admin_all_assets" ON public.assets
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- asset_requests
DROP POLICY IF EXISTS "admin_all_asset_requests" ON public.asset_requests;
CREATE POLICY "admin_all_asset_requests" ON public.asset_requests
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- tickets
DROP POLICY IF EXISTS "admin_all_tickets" ON public.tickets;
CREATE POLICY "admin_all_tickets" ON public.tickets
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- announcements
DROP POLICY IF EXISTS "admin_all_announcements" ON public.announcements;
CREATE POLICY "admin_all_announcements" ON public.announcements
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- payroll_staging
DROP POLICY IF EXISTS "admin_all_payroll_staging" ON public.payroll_staging;
CREATE POLICY "admin_all_payroll_staging" ON public.payroll_staging
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- payslips
DROP POLICY IF EXISTS "admin_all_payslips" ON public.payslips;
CREATE POLICY "admin_all_payslips" ON public.payslips
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- loans
DROP POLICY IF EXISTS "admin_all_loans" ON public.loans;
CREATE POLICY "admin_all_loans" ON public.loans
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- notifications
DROP POLICY IF EXISTS "admin_all_notifications" ON public.notifications;
CREATE POLICY "admin_all_notifications" ON public.notifications
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- user_documents
DROP POLICY IF EXISTS "admin_all_user_documents" ON public.user_documents;
CREATE POLICY "admin_all_user_documents" ON public.user_documents
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- onboarding_checklists
DROP POLICY IF EXISTS "admin_all_onboarding_checklists" ON public.onboarding_checklists;
CREATE POLICY "admin_all_onboarding_checklists" ON public.onboarding_checklists
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- pulse_surveys
DROP POLICY IF EXISTS "admin_all_pulse_surveys" ON public.pulse_surveys;
CREATE POLICY "admin_all_pulse_surveys" ON public.pulse_surveys
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- audit_log (read-only for admin)
DROP POLICY IF EXISTS "admin_select_audit_log" ON public.audit_log;
CREATE POLICY "admin_select_audit_log" ON public.audit_log
  FOR SELECT USING (public.is_admin());

-- ============================================================
-- Verification (run after applying):
--
--   SELECT routine_name, routine_schema
--   FROM information_schema.routines
--   WHERE routine_name = 'is_admin';
--
--   SELECT tablename, policyname
--   FROM pg_policies
--   WHERE policyname LIKE 'admin_%'
--   ORDER BY tablename;
-- ============================================================
