import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
try {
 const existing=fs.readFileSync('tests/actualAttendanceImportTest.mjs','utf8');
 const setup=existing.match(/await db\.exec\(`([\s\S]*?)`\);/)[1];
 await db.exec(setup);
 await db.exec(fs.readFileSync('supabase/real_attendance_import.sql','utf8'));
 await db.exec(`
 alter table public.attendance_clock_sessions add column id uuid default gen_random_uuid();
 create function private.payroll_time_sources(uuid,date,date) returns jsonb language sql stable as $$
 select jsonb_build_object('employees',jsonb_build_array(jsonb_build_object('id','00000000-0000-4000-8000-000000000004')),
 'events',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'employeeId',t.employee_id,'timestamp',t.timestamp,'type',t.type,'source',t.source) order by t.timestamp)
 from public.time_events t where t.timestamp >= ($2::timestamp at time zone 'Asia/Manila') and t.timestamp < (($3+2)::timestamp at time zone 'Asia/Manila')),'[]'::jsonb))$$;
 `);
 await db.exec(fs.readFileSync('supabase/migrations/20260928180000_attendance_import_final_payroll_source.sql','utf8'));
 const scope='00000000-0000-4000-8000-000000000002';
 const emp='00000000-0000-4000-8000-000000000004';
 const row=(workDate,events,dayStatus='Workday')=>({employeeId:'00001',businessUnit:'Fixture',workDate,dayStatus,events,sourceRow:2});
 const event=(type,timestamp)=>({type,timestamp});
 const first=row('2026-08-26',[event('ClockIn','2026-08-26T09:00:00+08:00'),event('ClockOut','2026-08-26T18:00:00+08:00')]);
 const second=row('2026-08-26',[event('ClockIn','2026-08-26T10:00:00+08:00'),event('ClockOut','2026-08-26T19:00:00+08:00')]);
 const call=async(rows,confirm=false)=> (await db.query('select public.import_actual_attendance($1,$2,$3,$4,$5,$6) r',[scope,'2026-08-26','2026-09-10','fixture.csv',JSON.stringify(rows),confirm])).rows[0].r;
 const source=async()=> (await db.query("select private.payroll_time_sources($1,'2026-08-26','2026-08-26') r",[scope])).rows[0].r;
 let result=await call([first],true);
 assert.equal(result.ready,1);
 assert.equal((await source()).events.length,2);
 const preview=await call([second]);
 assert.equal(preview.errors.length,0);
 assert.equal(preview.ready,1);
 assert.match(preview.rows[0].warnings.join(' '),/Earlier clock records remain/);
 assert.equal(Date.parse((await source()).events[0].timestamp),Date.parse('2026-08-26T09:00:00+08:00'));
 result=await call([second],true);
 assert.equal(result.ready,1);
 let effective=await source();
 assert.equal(effective.events.length,2);
 assert.equal(effective.events[0].importWorkDate,'2026-08-26');
 assert.equal(effective.events[0].type,'CLOCK_IN');
 assert.equal(Date.parse(effective.events[0].timestamp),Date.parse('2026-08-26T10:00:00+08:00'));
 assert.equal(effective.actualAttendanceDays[0].status,'Workday');
 const rulesFile=fs.readFileSync('supabase/migrations/20260907015502_confirmed_hr_payroll_rules.sql','utf8');
 const scheduleFile=fs.readFileSync('supabase/migrations/20260906112648_payroll_schedule_versions.sql','utf8');
 const scheduleStart=scheduleFile.indexOf('function private.payroll_schedule_validate(');
 const scheduleBodyStart=scheduleFile.indexOf('$$',scheduleStart);
 const scheduleBodyEnd=scheduleFile.indexOf('$$',scheduleBodyStart+2);
 await db.exec('create or replace '+scheduleFile.slice(scheduleStart,scheduleBodyEnd+2)+';');
 const start=rulesFile.indexOf('FUNCTION private.interpret_payroll_time(');
 const bodyStart=rulesFile.indexOf('$function$',start);
 const bodyEnd=rulesFile.indexOf('$function$',bodyStart+10);
 await db.exec('create or replace '+rulesFile.slice(start,bodyEnd+10)+';');
 const payrollSource={...effective,employees:[{id:emp,name:'Fixture',hireDate:'2020-01-01',status:'Active'}],
  rules:[{id:'fixture',revision:1,effective_from:'2026-01-01',effective_to:'2026-12-31',
    config:{holidayCoverageConfirmed:true,splitShiftConfirmed:true,restTemplates:[],meals:{fixture:'12:00'}}}],
  shifts:[{id:'shift',employeeId:emp,date:'2026-08-26',templateId:'fixture',start:'09:00',end:'18:00',
    breakMinutes:60,kind:'work',endDayOffset:0,paidMinutes:480,published:true}],
  scheduleDays:[{employeeId:emp,date:'2026-08-26',status:'published'}],
  leave:[],ot:[],holidays:[],wfh:[],leavePolicies:[]};
 const interpreted=(await db.query("select private.interpret_payroll_time($1,'2026-08-26','2026-08-26') r",[JSON.stringify(payrollSource)])).rows[0].r.rows[0];
 assert.ok(interpreted.actualMinutes>0,JSON.stringify(interpreted.issues));
 assert.equal((await db.query('select count(*)::int n from public.time_events')).rows[0].n,4);
 result=await call([first],true);
 assert.equal(result.ready,1);
 assert.equal(Date.parse((await source()).events[0].timestamp),Date.parse('2026-08-26T09:00:00+08:00'));
 await call([second],true);
 result=await call([{...second,notes:'metadata change'}]);
 assert.equal(result.duplicates,1);
 await db.exec("insert into public.shift_templates values('00000000-0000-4000-8000-000000000011','work');insert into public.shift_assignments values('00000000-0000-4000-8000-000000000004','2026-08-26','00000000-0000-4000-8000-000000000011')");
 result=await call([row('2026-08-26',[],'Absent (review)')],true);
 assert.equal(result.errors.length,0);
 effective=await source();
 assert.equal(effective.events.length,0);
 assert.equal(effective.actualAttendanceDays[0].status,'Absent (review)');
 assert.equal((await db.query('select count(*)::int n from public.time_events')).rows[0].n,8);
 await db.exec("insert into public.payroll_schedule_freezes values('00000000-0000-4000-8000-000000000004','2026-08-26','2026-08-26')");
 result=await call([{...first,notes:'attempt after lock'}]);assert.match(result.errors[0].message,/locked/);
 await db.exec('set role anon');
 await assert.rejects(()=>call([second]),/permission denied/);
 await db.exec('reset role');
 assert.equal(emp,effective.actualAttendanceDays[0].employeeId);
 console.log('PASS: confirmed replacement, preview, preserved raw evidence, payroll source, idempotency, locks and access.');
} finally {await db.close();}
