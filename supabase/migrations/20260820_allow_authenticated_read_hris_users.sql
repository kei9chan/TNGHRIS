-- ============================================================
-- Migration: allow_authenticated_read_hris_users
-- Created:   2026-08-20
-- Fix:       Allows all authenticated users to read HRIS employee
--            profiles. This ensures employees filing Incident
--            Reports, nominating co-workers, viewing org charts,
--            or collaborating on tickets can search and select
--            any active employee across business units.
-- ============================================================

DROP POLICY IF EXISTS "authenticated_select_hris_users" ON public.hris_users;
CREATE POLICY "authenticated_select_hris_users" ON public.hris_users
  FOR SELECT
  TO authenticated
  USING (true);
