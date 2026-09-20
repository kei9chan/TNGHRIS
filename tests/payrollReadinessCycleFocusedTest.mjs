import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';

async function loadTypeScriptModule(path){
 const source=await fs.readFile(new URL(path,import.meta.url),'utf8');
 const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

const {payrollCycleForRelease}=await loadTypeScriptModule('../modules/payroll/payrollCycle.ts');
const {attendanceFixCandidates,groupEmployeeReadiness,presetForIssue,setupDependencies,specificIssue}=await loadTypeScriptModule('../modules/payroll/readinessDashboardModel.ts');
const migration=await fs.readFile(new URL('../supabase/migrations/20260920121322_payroll_cycle_readiness_resolution.sql',import.meta.url),'utf8');
const selectorSource=await fs.readFile(new URL('../modules/payroll/PayrollCycleSelector.tsx',import.meta.url),'utf8');
const correctionSource=await fs.readFile(new URL('../modules/payroll/PresetAttendanceCorrection.tsx',import.meta.url),'utf8');
const payrollHomeScenarioSource=await fs.readFile(new URL('../modules/payroll/ScenarioRun.tsx',import.meta.url),'utf8');

const baseRow={employeeId:'employee-1',employeeName:'Leonard Reyes',date:'2026-08-20',restDay:false,holiday:false,approvedFullLeave:false,scheduledMinutes:480,actualMinutes:479,regularMinutes:479,breakMinutes:60,lateMinutes:1,undertimeMinutes:0,approvedOtMinutes:0,actualOtMinutes:0,workedLunch:false,issues:['1-minute late'],ready:false,shiftIds:['shift-1'],eventIds:['punch-1'],leaveIds:[],ot:[],segments:[],evidence:{scheduleStatus:'published',shifts:[{id:'shift-1',start:'09:00',end:'18:00',kind:'work'}],punches:[{id:'punch-1',type:'CLOCK_IN',timestamp:'2026-08-20T09:01:00+08:00'}],leave:[],ot:[]}};

// 1. September 5 release resolves to the August 11–25 cutoff.
assert.deepEqual(payrollCycleForRelease('2026-09-05'),{releaseDate:'2026-09-05',from:'2026-08-11',to:'2026-08-25',kind:'5th'});

// 2. September 20 release resolves to the August 26–September 10 cutoff.
assert.deepEqual(payrollCycleForRelease('2026-09-20'),{releaseDate:'2026-09-20',from:'2026-08-26',to:'2026-09-10',kind:'20th'});

// 3. The standard selector applies one persisted cutoff to all business units.
assert.match(selectorSource,/Same cutoff rules across all business units/);
assert.doesNotMatch(selectorSource,/usePayrollField\('scope'\)/);

// 4. Overrides are future-dated, audited, and cannot change an open period.
assert.match(migration,/must begin after the currently open payroll period ends/i);
assert.match(migration,/insert into public\.payroll_calendar_audit/i);
assert.match(migration,/p_effective_from<=open_end/i);

// 5. Multiple dates and concerns resolve to one employee card.
const grouped=groupEmployeeReadiness([baseRow,{...baseRow,date:'2026-08-21',issues:['Missing punch']}],'Bakebe · SM Aura','2026-08-11','2026-08-25');
assert.equal(grouped.length,1);assert.equal(grouped[0].total,2);
assert.match(payrollHomeScenarioSource,/Resolve by employee/);assert.match(payrollHomeScenarioSource,/issueGroups\.map/);

// 6. The same person in another business unit receives a distinct card identity.
const other=groupEmployeeReadiness([baseRow],'Gootopia · Metro Manila','2026-08-11','2026-08-25');
assert.notEqual(grouped[0].key,other[0].key);

// 7. The vague profile warning becomes a specific setup message.
assert.match(specificIssue('Employee profile information incomplete','2026-08-20').label,/Timekeeping setup needed.*Employment start date/i);

// 8. A salary-source blocker is deduplicated and retains all affected dates.
const setup=setupDependencies([{...baseRow,issues:['Approved salary source missing']},{...baseRow,date:'2026-08-21',issues:['Approved salary source missing']}]);
assert.equal(setup.length,1);assert.deepEqual(setup[0].dates,['2026-08-20','2026-08-21']);

// 9. A one-minute late arrival is eligible for grace.
const oneMinute=attendanceFixCandidates([baseRow],5)[0];
assert.equal(oneMinute.difference,1);assert.equal(oneMinute.eligible,true);

// 10. Applying grace preserves the punch and writes an automatic audit note.
assert.match(migration,/original_punch/);assert.match(migration,/Within approved grace period/);
assert.match(migration,/correct_attendance_day/);
assert.match(payrollHomeScenarioSource,/Apply grace to all eligible/);assert.match(payrollHomeScenarioSource,/Original punch retained/);

// 11. Multiple eligible records are accepted by one bulk action and failures are retained.
assert.match(migration,/apply_payroll_attendance_grace_bulk/);
assert.match(migration,/jsonb_build_object\('applied',applied,'skipped',skipped\)/);

// 12. Lateness beyond five minutes requires detailed review.
const sixMinutes=attendanceFixCandidates([{...baseRow,evidence:{...baseRow.evidence,punches:[{id:'punch-2',type:'CLOCK_IN',timestamp:'2026-08-20T09:06:00+08:00'}]}}],5)[0];
assert.equal(sixMinutes.eligible,false);assert.equal(sixMinutes.reason,'Needs detailed review');

// 13. A missing break exposes preset correction cards.
assert.deepEqual([...presetForIssue('Missing or extended break')],['use_scheduled_break','mark_break_compliant','keep_exception']);
assert.match(payrollHomeScenarioSource,/Use scheduled break/);assert.match(payrollHomeScenarioSource,/Advanced time fields/);

// 14. Saving can recalculate and open the next issue.
assert.match(correctionSource,/Save & recalculate/);assert.match(correctionSource,/Open next issue after saving/);assert.match(correctionSource,/onSaved\(continueToNext\)/);
assert.match(payrollHomeScenarioSource,/Open next issue after saving/);assert.match(payrollHomeScenarioSource,/Save & recalculate/);

// 15. Original punches remain in the immutable correction/audit evidence.
assert.match(migration,/original_snapshot/);assert.match(migration,/Original punch retained/);

// 16. A setup fix refreshes affected dates through a fresh readiness preview.
assert.match(correctionSource,/Payroll readiness and affected dates were recalculated/);
assert.match(migration,/create or replace function public\.preview_payroll_time/);

console.log('Passed 16 focused Payroll Readiness and Attendance Correction scenarios.');
