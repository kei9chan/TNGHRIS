# Migration Drift Appendix

**Observed:** 2026-09-04

**Production migration-history entries:** 142
**Committed `supabase/migrations/*.sql` files:** 112

The comparison removes the leading numeric prefix and `.sql` suffix from repository filenames, then compares the result to the production migration `name`. It is a name-level triage, not proof that two differently named migrations have different SQL. Each item must be content/object mapped during reconciliation.

## Production names with no normalized repository-name match (50)

1. `create_resolutions_table`
2. `create_resignations_table`
3. `create_notifications_table`
4. `create_notifications_table_v2`
5. `add_notifications_rls`
6. `fix_notifications_rls_text_userid`
7. `fix_audit_feed_remove_auth_users_exposure`
8. `enable_rls_phase1_authenticated_full_access`
9. `rls_phase2_helper_functions`
10. `rls_phase2_batch1_reference_tables`
11. `rls_phase2_batch2_hris_users_and_requests`
12. `rls_phase2_batch3_hr_sensitive_tables`
13. `rls_phase2_batch4_remaining_tables`
14. `fix_audit_feed_security_invoker`
15. `update_wfh_request_statuses`
16. `allow_anon_select_business_units_departments`
17. `allow_self_registration_insert_hris_users`
18. `create_register_user_profile_function`
19. `fix_register_user_profile_remove_auth_check`
20. `drop_hris_users_auth_user_id_fkey`
21. `add_end_date_to_wfh_requests`
22. `add_acknowledged_flag_to_employee_awards`
23. `create_audit_logs_table`
24. `fix_notifications_insert_policy`
25. `create_user_documents_table`
26. `allow_read_own_manager`
27. `add_read_own_manager_safe`
28. `create_timekeeping_tables`
29. `timekeeping_tables_rls`
30. `create_missing_settings_and_view_aliases`
31. `extend_time_events_columns`
32. `fix_missing_columns_ot_shift`
33. `fix_shift_template_columns`
34. `fix_security_issues`
35. `fix_manager_rls_reports_to_id_not_name`
36. `fix_bod_wfh_rls_org_wide_access`
37. `fix_all_rls_role_strings_to_match_db_values`
38. `create_approver_configs`
39. `fix_approver_configs_rls_allow_admin_and_bod`
40. `fix_approver_configs_rls_correct_role_names`
41. `fix_approver_configs_rls_use_email`
42. `fix_approver_configs_rls_jwt_email`
43. `update_ot_status_enum`
44. `20260822120000_interview_scheduling_workflow`
45. `index_fixed_workflow_foreign_keys`
46. `incident_report_revision_statuses`
47. `repair_record_level_authorization`
48. `preserve_assigned_hiring_manager_routes`
49. `close_remaining_recruitment_exposure`
50. `time_assignment_notifications_and_ir_audit`

## Repository names with no production-name match (20)

1. `admin_rls_bypass`
2. `add_coaching_fields`
3. `manager_shift_assignments`
4. `add_employee_id`
5. `add_onboarding_checklists_rls`
6. `fix_is_hr_or_admin`
7. `approver_rls_fix`
8. `fix_discipline_rls`
9. `add_body_to_ntes`
10. `alter_nte_number_to_text`
11. `allow_authenticated_read_hris_users`
12. `application_page_assets`
13. `recruitment_open_roles`
14. `recruitment_role_details`
15. `recruitment_application_flow`
16. `recruitment_resume_link`
17. `job_post_template_starters`
18. `interview_scheduling_workflow`
19. `pan_template_redesign`
20. `modern_awards_studio`

## High-priority mapping targets

The first reconciliation pass must focus on the live-only foundational timekeeping/RLS objects because payroll design depends on their true definitions:

- `create_timekeeping_tables`
- `timekeeping_tables_rls`
- `extend_time_events_columns`
- `fix_missing_columns_ot_shift`
- `fix_shift_template_columns`
- the RLS phase 1/2 migrations
- all subsequent role-string/reporting-line RLS repairs

Do not mark an item reconciled based on a similar name. Compare normalized object definitions, grants, policies, triggers and function bodies.
