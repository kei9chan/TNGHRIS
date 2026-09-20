import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
const scope = "00000000-0000-4000-8000-000000000001",
  employee = "00000000-0000-4000-8000-000000000003",
  other = "00000000-0000-4000-8000-000000000004";
await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;create schema payroll_scenario_private;
create function auth.uid() returns uuid language sql as $$select '${employee}'::uuid$$;
create function private.payroll_gross_permission(s uuid,a text) returns boolean language sql as $$select s::text=current_setting('test.scope',true) and (a='view' or current_setting('test.prepare',true)='yes')$$;
create function private.payroll_package_permission(e uuid,s uuid,a text) returns boolean language sql as $$select current_setting('test.denied',true)<>'yes'$$;
create function private.payroll_has_access(a text,s uuid) returns boolean language sql as $$select false$$;
create table payroll_scenario_private.runs(seed_run_id text primary key,scope_id uuid,date_from date,date_to date,pay_date date,is_test boolean,snapshot jsonb);
create table payroll_scenario_private.corrections(seed_run_id text,employee_id uuid,status text);
create table payroll_scenario_private.completion_audit(seed_run_id text,actor_id uuid,action text,detail jsonb);
create function private.calculate_payroll_net_v1(p jsonb) returns jsonb language plpgsql as $$begin
if jsonb_array_length(p#>'{gross,employees}')<>1 or p#>>'{gross,employees,0,gross}'<>'9521.25' or p#>>'{review,employees,0,taxLines,0,taxable}'<>'9521.25' then raise exception 'Must calculate corrected gross for one employee only';end if;
return jsonb_build_object('ready',true,'engineVersion','fixture','employees',jsonb_build_array(jsonb_build_object('gross','9521.25','deductions','812.50','net','8708.75')));end$$;`);
await db.exec(
  fs.readFileSync(
    "supabase/migrations/20260920142345_employee_test_payroll_outputs.sql",
    "utf8",
  ),
);
const snap = {
  employees: [
    { id: employee, name: "Ready person", code: "TEST-1" },
    { id: other, name: "Blocked person" },
  ],
  demo: {
    scenarioGross: {
      employees: [
        {
          employeeId: employee,
          gross: "9521.25",
          issues: [],
          lines: [{ amount: "9521.25", label: "Corrected earnings" }],
        },
      ],
    },
    timeResult: {
      rows: [
        { employeeId: employee, issues: [] },
        { employeeId: other, issues: ["Missing punch"] },
      ],
    },
    comparisonNetInput: {
      gross: { employees: [{ employeeId: employee, gross: "9500.00" }] },
      packages: [{ employee_id: employee }],
      review: {
        employees: [
          { employeeId: employee, taxLines: [{ taxable: "9500.00" }] },
        ],
      },
    },
  },
};
await db.query(
  "insert into payroll_scenario_private.runs values('fixture',$1,'2026-08-11','2026-08-25','2026-09-05',true,$2)",
  [scope, JSON.stringify(snap)],
);
await db.exec(
  `set role authenticated;set test.scope='${scope}';set test.prepare='yes';set test.denied='no';`,
);
const call = (save = false, e = employee, s = scope) =>
  db
    .query(
      "select public.employee_test_payroll_output($1,'2026-08-11','2026-08-25',$2,$3) r",
      [s, e, save],
    )
    .then((x) => x.rows[0].r);
const preview = await call();
assert.equal(preview.snapshotId, null);
assert.equal(preview.payload.net, "8708.75");
const generated = await call(true);
assert.ok(generated.snapshotId);
assert.equal((await call(true)).snapshotId, generated.snapshotId);
await assert.rejects(() => call(true, other), /Resolve and recalculate/);
await assert.rejects(() => call(false, employee, other), /scope access/);
await db.exec("set test.prepare='no'");
assert.equal((await call()).canGenerate, false);
await assert.rejects(() => call(true), /preparation access/);
await db.exec("set test.denied='yes'");
await assert.rejects(() => call(), /compensation/);
await assert.rejects(
  () =>
    db.exec("select * from payroll_scenario_private.employee_output_snapshots"),
  /permission denied/,
);
await db.exec("reset role");
assert.equal(
  (
    await db.query(
      "select count(*)::int n from payroll_scenario_private.employee_output_snapshots",
    )
  ).rows[0].n,
  1,
);
assert.equal(
  (
    await db.query(
      "select count(*)::int n from payroll_scenario_private.completion_audit",
    )
  ).rows[0].n,
  1,
);
await db.query(
  "insert into payroll_scenario_private.corrections values('fixture',$1,'Pending approval')",
  [employee],
);
await db.exec("set role authenticated;set test.denied='no'");
await assert.rejects(() => call(), /Resolve and recalculate/);
await db.exec("reset role;set role anon");
await assert.rejects(() => call(), /permission denied/);
await db.close();
const ui = fs.readFileSync("modules/payroll/EmployeeTestOutputs.tsx", "utf8");
for (const text of [
  "View payslip",
  "Download payslip PDF",
  "Government worksheets",
  "TEST / DRAFT PAYSLIP",
  "Not approved",
  "csvCell",
  "payslipPdf",
])
  assert.ok(ui.includes(text));
console.log(
  "PASS: single employee independent of blocked coworkers; corrected gross passed to net engine; immutable/idempotent draft audit; scope, employee, prepare and anonymous gates; pending approval blocks; preview/download controls.",
);
