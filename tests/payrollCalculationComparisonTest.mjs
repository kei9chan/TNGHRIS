process.on('uncaughtException',e=>{console.error(e.message,e.code,e.position,e.where);process.exit(1);});
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {difference,previewDifferences,employeeDifferences,selectGross,parseCalculationSelection,calculationKey,consecutiveCutoffs} from '../modules/payroll/calculationModel.ts';
const db=new PGlite();const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const actor=id(9),scope=id(10),employee=id(1);
const read=p=>fs.readFileSync(p,'utf8');
// Load the real checked-in engine implementations, including later replacements.
const wanted=new Set(['private.payroll_time_rate_issue','private.payroll_statutory_gross_config','private.calculate_payroll_gross_without_service_charge_phase3','private.payroll_audit_immutable','private.validate_payroll_gross_config','private.payroll_gross_intervals','private.payroll_gross_line','private.calculate_payroll_gross_v1','private.payroll_net_money','private.payroll_withholding_2023','private.payroll_contributions_2026','private.validate_payroll_net_arrangement','private.calculate_payroll_net_v1','private.payroll_comparison_rows','private.payroll_compare_values']);
const definitions=new Map();
let serviceChargeBase,inputAdditionsBase,intervalBase,manualIntervalBase;
for(const file of fs.readdirSync('supabase/migrations').sort()){
 const sql=read(`supabase/migrations/${file}`);
 if(file==='20260929151000_manual_ot_payroll_evidence.sql')manualIntervalBase=definitions.get('private.payroll_gross_intervals').replace('private.payroll_gross_intervals','private.payroll_gross_intervals_before_manual_ot');
 if(sql.includes('alter function private.payroll_gross_intervals(jsonb,jsonb,jsonb) rename to payroll_gross_intervals_before_original_decision'))intervalBase=definitions.get('private.payroll_gross_intervals').replace('private.payroll_gross_intervals','private.payroll_gross_intervals_before_original_decision');
 if(sql.includes('alter function private.calculate_payroll_gross_v1(jsonb) rename to calculate_payroll_gross_without_service_charge_phase3'))serviceChargeBase=definitions.get('private.calculate_payroll_gross_v1').replace('private.calculate_payroll_gross_v1','private.calculate_payroll_gross_without_service_charge_phase3');
 if(sql.includes('alter function private.calculate_payroll_gross_v1(jsonb) rename to calculate_payroll_gross_before_input_additions'))inputAdditionsBase=definitions.get('private.calculate_payroll_gross_v1').replace('private.calculate_payroll_gross_v1','private.calculate_payroll_gross_before_input_additions');
 const re=/create\s+(?:or\s+replace\s+)?function\s+([a-z_0-9]+\.[a-z_0-9]+)\s*\(/gi;let m;
 while((m=re.exec(sql))){if(!wanted.has(m[1].toLowerCase()))continue;const tail=sql.slice(m.index),delim=tail.match(/\bas\s+(\$[a-z_0-9]*\$)/i);if(!delim)continue;const start=delim.index+delim[0].length,end=tail.indexOf(delim[1],start)+delim[1].length;definitions.set(m[1].toLowerCase(),tail.slice(0,end)+';');}
}
assert.equal(definitions.size,wanted.size);
await db.exec(`create schema private;create schema auth;create role authenticated;create role anon;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
create function public.current_hris_user_id() returns uuid language sql as $$select auth.uid()$$;
create table hris_users(id uuid primary key);insert into hris_users values('${actor}');
create table payroll_access_scopes(id uuid primary key,processing_mode text);insert into payroll_access_scopes values('${scope}','off');
create function private.payroll_gross_permission(uuid,text) returns boolean language sql as $$select $1='${scope}'::uuid and auth.uid()='${actor}'::uuid$$;
create function private.payroll_package_permission(uuid,uuid,text) returns boolean language sql as $$select $1='${employee}'::uuid and $2='${scope}'::uuid and auth.uid()='${actor}'::uuid$$;
create function public.can_access_hris_user(uuid) returns boolean language sql as $$select $1='${employee}'::uuid and auth.uid()='${actor}'::uuid$$;
create function private.workflow_user_has_role(uuid,text) returns boolean language sql as $$select $1='${actor}'::uuid$$;
create table payroll_time_packages(id uuid primary key,scope_id uuid,date_from date,date_to date,version int,status text,source_snapshot jsonb,result jsonb);
create table payroll_gross_runs(id uuid primary key,scope_id uuid,date_from date,date_to date,version int,time_package_id uuid,source_snapshot jsonb,result jsonb);
create table payroll_net_reviews(id uuid primary key,gross_run_id uuid,revision bigint,inputs jsonb);
create table payroll_net_runs(id uuid primary key,scope_id uuid,gross_run_id uuid,review_id uuid,date_from date,date_to date,version int,source_hash text,source_snapshot jsonb,result jsonb);
create table payroll_pay_packages(id uuid primary key,scope_id uuid,employee_id uuid,status text,stream text,engagement_key text,effective_from date,source_ref text,treatment jsonb);
create function public.get_payroll_gross_run(uuid) returns jsonb language plpgsql as $$declare s uuid;begin select scope_id into s from public.payroll_gross_runs where id=$1;if not coalesce(private.payroll_gross_permission(s,'view'),false) then raise exception 'access denied';end if;return jsonb_build_object('current',coalesce(current_setting('test.stale',true),'')<>'yes');end$$;
create function public.get_payroll_net_run(uuid) returns jsonb language plpgsql as $$declare s uuid;begin select scope_id into s from public.payroll_net_runs where id=$1;if not coalesce(private.payroll_gross_permission(s,'view'),false) then raise exception 'access denied';end if;return jsonb_build_object('current',coalesce(current_setting('test.stale',true),'')<>'yes');end$$;`);
if(manualIntervalBase)await db.exec(manualIntervalBase);
if(intervalBase)await db.exec(intervalBase);
if(serviceChargeBase)await db.exec(serviceChargeBase);
if(inputAdditionsBase)await db.exec(inputAdditionsBase);
for(const name of wanted)await db.exec(definitions.get(name));
await db.exec(read('supabase/migrations/20260916034858_payroll_calculation_comparison_workspace.sql'));
const call=async(name,args)=>(await db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;
const config={monthlyMethod:'calendar_prorated',rounding:'employee_total_half_up',recurringMethod:'calendar_prorated',annualDivisor:'313',hoursPerDay:'8',nightStart:'22:00',nightEnd:'06:00',offsetCash:'excluded',gracePay:'base_only',rateBoundary:'shift_date',premiums:{ordinary:{regular:'1',ot:'1.25',nightRegular:'0.1',nightOt:'0.125'}}};
const rules=[{id:id(71),revision:1,effective_from:'2026-01-01',effective_to:'2026-12-31',source_ref:'Synthetic approved historical policy',config}];
const packages=[{id:id(70),employee_id:employee,scope_id:scope,engagement_key:'employee',effective_from:'2026-01-01',rate_type:'Monthly',base_amount:'30000',treatment:{proration:'rule_defined'},source_ref:'Synthetic historical salary evidence',components:[]}];
const fixtures=[];
for(let cutoff=1;cutoff<=2;cutoff++){
 const from=cutoff===1?'2026-06-01':'2026-06-16',to=cutoff===1?'2026-06-15':'2026-06-30',rows=[];
 for(let day=cutoff===1?1:16;day<=(cutoff===1?15:30);day++)rows.push({employeeId:employee,employeeName:'Synthetic Employee',date:`2026-06-${String(day).padStart(2,'0')}`,ready:true,restDay:true,holiday:false,approvedFullLeave:false,regularMinutes:0,actualOtMinutes:0,actualMinutes:0,scheduledMinutes:0,lateMinutes:0,undertimeMinutes:0,eventIds:[],shiftIds:[],leaveIds:[],ot:[],segments:[]});
 const source={employees:[{id:employee,name:'Synthetic Employee'}],events:[],leave:[],holidays:[]};
 const snap={timePackageId:id(20+cutoff),dateFrom:from,dateTo:to,time:{source,result:{rows}},packages:[...packages,{...packages[0],id:id(72),effective_from:'2026-09-01',base_amount:'90000'}],rules};
 const gross=await call('private.calculate_payroll_gross_v1',[snap]);assert.equal(gross.ready,true,JSON.stringify(gross.issues));assert.equal(Number(gross.gross),15000,'Historical salary used, not future/current salary');
 const absent=await call('private.calculate_payroll_gross_v1',[{...snap,packages:snap.packages.slice(1)}]);assert.equal(absent.ready,false);assert.equal(absent.gross,null);
 const inputs={ruleset:'PH-2026-09-06',payDate:to,contributionMonth:'2026-06-01',cutoff:String(cutoff),allocation:{sss:'0.5',philhealth:'0.5',pagibig:'0.5'},insufficientNet:'block',previousRunId:cutoff===2?id(31):'',employees:[{employeeId:employee,sssBase:'30000',philhealthBase:'30000',pagibigBase:'30000',sssCovered:true,philhealthCovered:true,pagibigCovered:true,openingTaxable:'0',openingWithheld:'0',openingPeriods:'0',previousEmployer:false,cumulativeAlready:false,sourceRef:'Synthetic reviewed historical deductions',openingRef:'Synthetic reviewed openings including no other loans',taxLines:gross.employees[0].lines.map(l=>({taxable:l.amount,kind:'regular'})),deductions:[{label:'Authorized deduction',amount:'100',sourceRef:'Synthetic authorization'}]}]};
 const netSnapshot={review:inputs,gross,packages:snap.packages,loans:[{id:id(80),employee_id:employee,account_ref:'Loan A',available:cutoff===1?'500':'100',installment:'400',source_ref:'Synthetic historical opening'}],...(cutoff===2?{prior:{id:id(31),contributionMonth:'2026-06-01',result:fixtures[0].net}}:{})};
 const net=await call('private.calculate_payroll_net_v1',[netSnapshot]);assert.equal(net.ready,true,JSON.stringify(net.issues));assert.equal(Number(net.net),cutoff===1?12771.30:13071.30);assert.equal(net.employees[0].ytd.periods,cutoff);
 if(cutoff===1){const blank=structuredClone(netSnapshot);blank.review.employees[0].openingTaxable='';assert.equal((await call('private.calculate_payroll_net_v1',[blank])).ready,false);}
 else assert.equal(Number(net.employees[0].loans[0].projectedBalance),0,'Second cutoff consumes remaining projected balance only');
 await db.query('insert into payroll_time_packages values($1,$2,$3,$4,1,\'submitted\',$5,$6)',[id(20+cutoff),scope,from,to,source,{rows}]);
 await db.query('insert into payroll_gross_runs values($1,$2,$3,$4,1,$5,$6,$7)',[id(40+cutoff),scope,from,to,id(20+cutoff),snap,gross]);
 await db.query('insert into payroll_net_reviews values($1,$2,1,$3)',[id(50+cutoff),id(40+cutoff),inputs]);
 await db.query('insert into payroll_net_runs values($1,$2,$3,$4,$5,$6,1,$7,$8,$9)',[id(30+cutoff),scope,id(40+cutoff),id(50+cutoff),from,to,'hash-'+cutoff,netSnapshot,net]);
 fixtures.push({from,to,gross,net,netSnapshot});
}
await db.exec(`select set_config('test.actor','${actor}',false);set role authenticated;`);
const workspace=(from,to,gross=null,net=null)=>call('public.get_payroll_calculation_workspace',[scope,from,to,gross,net]);
let w=await workspace(fixtures[0].from,fixtures[0].to);assert.deepEqual(w.blockers,[]);assert.deepEqual(w.employees[0].issues,[]);assert.equal(w.adjacentCutoffs[0].from,fixtures[1].from);
let second=await workspace(fixtures[1].from,fixtures[1].to);assert.equal(second.previousCutoff.id,id(31));assert.equal(second.linkedPreviousNet,id(31));
await assert.rejects(()=>workspace(fixtures[0].from,fixtures[0].to,id(42)),/does not belong/);
await assert.rejects(()=>workspace(fixtures[0].from,fixtures[0].to,id(41),id(32)),/does not belong/);
await assert.rejects(()=>call('public.get_payroll_calculation_workspace',[id(99),fixtures[0].from,fixtures[0].to,null,null]),/Scoped/);
// A missing Finance review and historical salary are surfaced separately, not defaulted.
await db.exec('reset role');await db.query('update payroll_gross_runs set source_snapshot=jsonb_set(source_snapshot,\'{packages}\',\'[]\') where id=$1',[id(41)]);await db.query('update payroll_net_reviews set inputs=\'{"employees":[]}\' where id=$1',[id(51)]);await db.exec('set role authenticated');
w=await workspace(fixtures[0].from,fixtures[0].to);assert.equal(w.employees[0].missingSalaryDates.length,15);assert.match(w.employees[0].issues.join(' '),/Missing approved historical salary/);assert.match(w.employees[0].issues.join(' '),/historical deduction/);assert.match(w.employees[0].issues.join(' '),/opening balances/);
// Comparison storage is immutable and remains separate from formal approval and payment.
for(let i=0;i<2;i++){
 const comparison=await call('public.get_payroll_calculation_comparison',[id(31+i)]);const t=comparison.template;
 const input={sourceRef:`Synthetic legacy cutoff ${i+1}`,coverageRef:'Full employee and component coverage checked',legacyEmployees:[employee],rows:t.rows.map(r=>({employeeId:r.employeeId,key:r.key,legacyAmount:r.amount,explanation:'',policyRef:''}))};
 const component=input.rows.find(r=>r.key==='otherDeductions:1');assert.ok(component);component.legacyAmount='90';
 let preview=previewDifferences(t,input);assert.equal(preview.find(r=>r.key===component.key).difference,'10.00');assert.equal(preview.find(r=>r.key===component.key).resolved,false);
 const save=()=>call('public.save_payroll_calculation_comparison',[t.runId,t.sourceHash,input]);
 const firstId=await save();assert.equal(await save(),firstId,'Retry is idempotent');
 component.explanation='Legacy omitted PHP 10 of the authorized deduction';component.policyRef='Synthetic signed deduction authorization';const revisedId=await save();assert.notEqual(firstId,revisedId);
 const refreshed=await call('public.get_payroll_calculation_comparison',[t.runId]);assert.equal(refreshed.revisions.length,2);assert.equal(refreshed.revisions[0].rows.find(r=>r.key===component.key).resolved,true);assert.equal(refreshed.revisions[1].rows.find(r=>r.key===component.key).resolved,false);
 await assert.rejects(()=>call('public.save_payroll_calculation_comparison',[t.runId,'wrong-hash',input]),/another calculation/);
 const missing=structuredClone(input);missing.rows[0].legacyAmount='';await assert.rejects(()=>call('public.save_payroll_calculation_comparison',[t.runId,t.sourceHash,missing]),/literal|Missing|amount/i);
 await db.exec("select set_config('test.stale','yes',false)");await assert.rejects(save,/sources changed/);await db.exec("select set_config('test.stale','no',false)");
 await assert.rejects(()=>db.query('select * from payroll_calculation_private.comparisons'),/permission denied/);
 await db.exec('reset role');await assert.rejects(()=>db.query('delete from payroll_calculation_private.comparisons where id=$1',[firstId]),/immutable|Keep|preserv|append-only/i);await db.exec('set role authenticated');
}
await db.exec(`select set_config('test.actor','${id(8)}',false)`);await assert.rejects(()=>call('public.get_payroll_calculation_comparison',[id(31)]),/access denied/);
await db.exec('reset role;set role anon');await assert.rejects(()=>call('public.get_payroll_calculation_comparison',[id(31)]),/permission denied/);
await db.exec('reset role');assert.equal((await db.query('select processing_mode from payroll_access_scopes')).rows[0].processing_mode,'off');
assert.equal((await db.query('select count(*)::int n from payroll_calculation_private.comparisons')).rows[0].n,4);
assert.equal(difference('900000000000.01','900000000000.00'),'0.01');assert.throws(()=>difference('1',''),/missing/);
assert.deepEqual(selectGross({grossId:'a',netId:'b'},'c'),{grossId:'c',netId:''});assert.deepEqual(parseCalculationSelection(JSON.stringify({grossId:'a',netId:'b'})),{grossId:'a',netId:'b'});
assert.notEqual(calculationKey('u','bu','2026-06-01','2026-06-15'),calculationKey('u','bu','2026-06-16','2026-06-30'));
assert.equal(consecutiveCutoffs('2026-06-15','2026-06-16'),true);assert.equal(consecutiveCutoffs('2026-06-15','2026-07-01'),false);assert.equal(consecutiveCutoffs('2028-02-29','2028-03-01'),true);
assert.equal(employeeDifferences([{employeeId:'a',employeeName:'A',key:'gross'}]).length,1);
// Current approved packages need no second profile salary, dated employee setup,
// or manual statutory matrix. Exercise the actual replacement engine.
const statutory=await call('private.payroll_statutory_gross_config',[]);
await call('private.validate_payroll_gross_config',[statutory]);
assert.equal(statutory.annualDivisor,'365');
const auto={dateFrom:'2026-09-01',dateTo:'2026-09-15',approvedPackageDefaults:true,confirmedPolicy:{effective_from:'2026-09-07'},employeeRules:[],packages:[{...packages[0],base_amount:'20000',treatment:{proration:'unreviewed'},components:[{name:'Approved monthly benefit',amount:'5000',recurrence:'recurring',proration:'unreviewed'}]}],rules:[{id:'ph-statutory-v1',revision:0,effective_from:'2000-01-01',effective_to:'9999-12-31',config:statutory}],time:{source:{employees:[{id:employee,name:'Synthetic Employee'}],events:[],holidays:[],leave:[]},result:{rows:Array.from({length:15},(_,i)=>({employeeId:employee,date:`2026-09-${String(i+1).padStart(2,'0')}`,ready:true,restDay:true,holiday:i===0,approvedFullLeave:false,regularMinutes:0,actualOtMinutes:0,actualMinutes:0,scheduledMinutes:0,lateMinutes:0,undertimeMinutes:0,eventIds:[],shiftIds:[],leaveIds:[],ot:[],segments:[]}))}}};
const automatic=await call('private.calculate_payroll_gross_v1',[auto]);
assert.equal(automatic.ready,true,JSON.stringify(automatic.issues));
assert.equal(Number(automatic.gross),12500,'20k base + 5k recurring benefit, half-month; paid rest/holiday included once');
const missing=structuredClone(auto);missing.packages=[];
assert.equal((await call('private.calculate_payroll_gross_v1',[missing])).ready,false,'Actual missing approved package still blocks');
// Manual approved work: the real interval parser partitions 21:00–23:00 at 22:00.
const ot=structuredClone(auto);const row=ot.time.result.rows[0];row.restDay=false;row.holiday=false;row.actualOtMinutes=120;
row.ot=[{id:'manual-ot',evidenceMode:'manual',type:'Paid',status:'Approved',start:'21:00',end:'23:00',finalApprovedMinutes:120}];
const otResult=await call('private.calculate_payroll_gross_v1',[ot]);
assert.equal(otResult.ready,true,JSON.stringify(otResult.issues));
assert.equal(Number(otResult.gross),12715.75,'Ordinary 2h OT at 1.25 plus one hour night differential at 0.125');
const holiday=structuredClone(ot);holiday.time.source.holidays=[{date:'2026-09-01',kind:'regular'}];
assert.equal(Number((await call('private.calculate_payroll_gross_v1',[holiday])).gross),12948.77,'Regular holiday OT 2.6 and night differential 0.26');
const partial=structuredClone(ot);partial.time.result.rows[0].employeeName='Synthetic Employee';partial.time.result.rows[0].ot[0].finalApprovedMinutes=60;partial.time.result.rows[0].actualOtMinutes=60;
const partialResult=await call('private.calculate_payroll_gross_v1',[partial]);assert.equal(partialResult.ready,false);assert.match(JSON.stringify(partialResult.issues),/Synthetic Employee.*2026-09-01.*approved OT duration/);
const explicit=structuredClone(auto);explicit.time.result.rows[0].holiday=false;explicit.rules.push({...auto.rules[0],revision:1,config:{...statutory,monthlyMethod:'earned_minutes'}});
assert.equal(Number((await call('private.calculate_payroll_gross_v1',[explicit])).gross),2500,'Existing explicit company policy remains authoritative');
console.log('PASS: automatic package defaults include approved benefits; monthly holidays paid once; ordinary/holiday OT and night rates calculated; genuine package gaps still block; explicit company overrides retained.');
await db.close();console.log('PASS: two consecutive cutoffs reuse the actual dated gross/net engines (12771.30 / 13071.30); future salary never substituted; blank openings blocked; explicit historical blockers; exact scope/version lineage; component differences and explanations; immutable idempotent revisions survive refresh; unauthorized reads/writes blocked; processing mode untouched. Synthetic data only.');
