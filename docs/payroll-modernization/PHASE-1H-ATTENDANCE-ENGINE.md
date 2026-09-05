# Phase 1H — Server-Side Attendance Interpretation Engine

Status: implemented on `payroll-staging` and the staging Supabase project only.

Phase 1H turns the Phase 1G roster, rule-set, and raw time-event foundation into a deterministic derived attendance result. It does not calculate statutory deductions, holiday premiums, overtime pay, or final payroll amounts.

## Implemented

- Added the guarded RPC `public.generate_payroll_attendance_interpretations(...)`.
- Added idempotent, date-range processing for approved or active employee schedules.
- Added scope-aware rule selection with effective dates and the most specific applicable rule.
- Preserved raw time events unchanged, including duplicate punches.
- Linked every event in the calculation window to `payroll_attendance_interpretation_inputs`.
- Classified duplicate punches as evidence-only inputs and created duplicate-event review flags.
- Calculated schedule start/end in the preset timezone, including overnight shifts.
- Applied the configured grace period to late minutes.
- Applied configured or explicit meal-break treatment without subtracting a split-shift break twice.
- Calculated actual work, late minutes, undertime, missing-punch state, and no-show state.
- Created review exceptions for missing punches, no-shows, late/undertime, early clock-ins, late clock-outs, duplicate events, and excess break time where applicable.
- Stored schedule, rule, raw-event, and calculation snapshots with every interpretation.
- Kept generated interpretations in `needs_review`; later workflow phases must resolve and approve them before payroll use.
- Connected Payroll Staging to the normalized interpretation and exception tables.

## Deliberate policy behavior

- A five-minute-or-less late arrival produces zero late minutes under the active staging rule. It does not invent work minutes; the actual elapsed work remains visible.
- For a single segment whose scheduled minutes include the meal span, scheduled paid minutes are scheduled minutes less the configured break.
- For split or broken shifts, scheduled minutes are the sum of paid segments; the gap/break is not subtracted again.
- An unapproved late clock-out is retained as a review exception. Phase 1H does not convert it into overtime or clip the raw punch.
- A no-show becomes a blocking exception only after the configured no-show buffer has elapsed.
- A contractor with no employee-payroll schedule is not included in employee attendance interpretation. Its professional-fee stream belongs to a later phase.

## Staging fixture verification

The Aug. 11–25, 2026 staging fixture was executed with the active test rule: Asia/Manila timezone, five-minute grace, 60-minute moveable break, and a 15-minute no-show buffer.

| Scenario | Result |
|---|---|
| Regular day | 480 scheduled / 480 actual minutes; present |
| Five-minute grace arrival | 480 scheduled / 475 actual; 0 late minutes; duplicate punch retained |
| Late arrival and early departure | 15 late minutes after grace; 30 undertime minutes |
| Part-time/WFH | 240 scheduled / 180 actual; 60 undertime minutes |
| Split shift with explicit break | 480 scheduled / 480 actual; break not double-counted |
| Rest-day work | 240 scheduled / 240 actual; premium calculation deferred |
| Late clock-out | Late arrival after grace plus late-clock-out review flag; OT deferred |
| Overnight shift | 22:00–07:00 correctly interpreted across midnight |
| No-show | 480 absence minutes and a blocking no-show exception |
| Contractor | No employee-payroll schedule or attendance interpretation |

The first run saw 9 scheduled records, created 9 interpretations, created 9 exceptions, and identified 1 no-show. A retry saw the same 9 schedules, created 0 additional interpretations or exceptions, and skipped all 9 existing current interpretations.

## Files

- Migration: `supabase/migrations/20260905150000_phase1h_attendance_interpretation_engine.sql`
- Service adapter: `services/payrollAttendanceService.ts`
- Staging UI: `pages/payroll/PayrollStaging.tsx`

## Gate to the next phase

Before time results are allowed into a payroll calculation engine, add the review workflows for missing punches, absence resolution, leave, change-of-shift, shift swaps, and overtime reconciliation. Do not treat the current staging preview or its legacy payslip action as an approved payroll run.
