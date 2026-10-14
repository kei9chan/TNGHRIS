import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path,deps={}){
 const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};vm.runInNewContext(code,{exports,console,require:name=>{assert.ok(name in deps,`Unexpected import ${name}`);return deps[name];}});return exports;
}
function hooks(){let cursor=0;const slots=[];return{reset:()=>{cursor=0;},react:{useState:initial=>{const n=cursor++;if(!(n in slots))slots[n]=typeof initial==='function'?initial():initial;return[slots[n],v=>{slots[n]=typeof v==='function'?v(slots[n]):v;}];},useRef:initial=>{const n=cursor++;return slots[n]??(slots[n]={current:initial});},useCallback:fn=>fn,useEffect:()=>{}}};}
const types=load('types.ts'),empty={data:[],error:null};
const tasks=['leave','wfh','overtime','manpower','nte','pan','requisition','award','offer','asset'].map(kind=>({request_type:kind,request_id:kind+'-one'}));
function fixture(){const calls=[];let blocker=null;return{calls,setBlocker:v=>{blocker=v;},deps:{
 '../types':types,
 '../utils/calendarDate':{parseLocalCalendarDate:v=>new Date(v)},
 '../utils/approvalPresentation':{getTimeApprovalReason:()=>''},
 '../services/notificationService':{createNotification:async()=>{}},
 '../services/approverConfigService':{},'../services/manpowerService':{mapManpowerRequestRow:row=>row},
 '../services/actionableApprovalService':{fetchActionableApprovalTasks:async()=>{calls.push('tasks');return tasks;}},
 '../services/offerApprovalService':{fetchPendingOfferApprovalIds:async()=>{calls.push('offer');return[];}},
 '../services/assetApprovalService':{fetchMyAssetApprovalQueue:async()=>{calls.push('asset');if(blocker)await blocker;return[];}},
 '../services/benefitApprovalService':{fetchMyPendingBenefitApprovals:async()=>{calls.push('benefit');return[];}},
 '../services/payPackageApprovalService':{fetchPendingPayPackageApprovals:async()=>{calls.push('pay_package');return[];}},
 '../services/emailAccountDeletionService':{fetchEmailAccountDeletionWorkspace:async()=>{calls.push('account_deletion');return{requests:[]};}},
 '../services/supabaseClient':{supabase:{rpc:async name=>{calls.push(name);return name==='get_my_pending_nte_approvals'?{data:[{id:'nte-one',recipient_name:'Authorized NTE',created_at:'2026-10-15'},{id:'nte-other',recipient_name:'Not assigned',created_at:'2026-10-15'}],error:null}:empty;},from:table=>{const query={select(){return this;},is(){return this;},eq(){return this;},in(){return this;},order(){return this;},then(resolve,reject){calls.push(table);const data=table==='leave_requests'?[{id:'leave-one',employee_id:'employee',employee_name:'Leave',start_date:'2026-10-15',end_date:'2026-10-15',duration_days:1,status:'Pending'}]:[];return Promise.resolve({data,error:null}).then(resolve,reject);}};return query;}}},
 }};}
async function additional(kind,f=fixture()) {const h=hooks();const mod=load('hooks/useAdditionalApprovals.ts',{...f.deps,react:h.react});const render=(scope=kind)=>{h.reset();return mod.useAdditionalApprovals({id:'viewer'},scope);};await render().refreshAdditionalApprovals();return{hook:render(),f,render};}
async function time(kind,f=fixture()) {const h=hooks();const mod=load('hooks/useApprovals.ts',{...f.deps,react:h.react});const render=(scope=kind)=>{h.reset();return mod.useApprovals({user:{id:'viewer'},kind:scope});};await render().refreshApprovals();return{hook:render(),f,render};}

// NTE doesn't wait for assets, offers or any other workflow. The existing task
// projection still excludes a returned row which is not assigned to this viewer.
const blocked=fixture();let release;blocked.setBlocker(new Promise(resolve=>{release=resolve;}));
const nte=await additional('nte',blocked);
assert.deepEqual(blocked.calls.sort(),['get_my_pending_nte_approvals','tasks']);
assert.equal(nte.hook.pendingNTEApprovals.length,1);assert.equal(nte.hook.pendingNTEApprovals[0].id,'nte-one');
assert.equal(nte.hook.additionalApprovalsLoading,false);
const full=additional(null,blocked);await new Promise(setImmediate);
assert.ok(blocked.calls.includes('asset'));release();await full;

const leave=await time('leave');assert.deepEqual(leave.f.calls.sort(),['leave_requests','tasks']);
assert.equal(leave.hook.pendingLeaveApprovals.length,1);assert.equal(leave.hook.approvalsLoading,false);
const ot=await time('overtime');assert.deepEqual(ot.f.calls.sort(),['ot_requests','tasks']);
const wfh=await time('wfh');assert.deepEqual(wfh.f.calls.sort(),['tasks','wfh_requests']);
for(const kind of ['leave','wfh','overtime','attendance'])assert.equal((await additional(kind)).f.calls.length,0);
assert.equal((await time('nte')).f.calls.length,0);
for(const [kind,call] of [['pan','pans'],['requisition','get_my_pending_job_requisition_approvals'],['offer','offer'],['asset','asset'],['benefit','benefit'],['pay_package','pay_package'],['account_deletion','account_deletion']]){
 const result=await additional(kind);assert.deepEqual(result.f.calls.sort(),[call,'tasks'].sort(),kind);
}

// Switching the mounted hook back to All pending reloads all workflows.
await nte.render(null).refreshAdditionalApprovals();assert.ok(nte.f.calls.includes('benefit'));
await leave.render(null).refreshApprovals();assert.ok(leave.f.calls.includes('ot_requests'));

// Attendance is enabled only in its own queue or the complete inbox.
const attendanceHooks=hooks();let attendanceReads=0;
const attendance=load('services/attendanceIssues.ts',{
 react:attendanceHooks.react,'../hooks/useAuth':{useAuth:()=>({user:{id:'viewer'}})},
 './supabaseClient':{supabase:{rpc:async()=>{attendanceReads++;return{data:{rows:[],canManage:false},error:null};}}},
});
const attendanceRender=enabled=>{attendanceHooks.reset();return attendance.useAttendanceIssues({enabled});};
await attendanceRender(false).load();assert.equal(attendanceReads,0);assert.equal(attendanceRender(false).loading,false);
await attendanceRender(true).load();assert.equal(attendanceReads,1);assert.equal(attendanceRender(true).loading,false);

// A slow response from a previous category must not repopulate the new queue.
const staleFixture=fixture(),staleHooks=hooks();let releaseOld;
const oldGate=new Promise(resolve=>{releaseOld=resolve;});
staleFixture.deps['../services/actionableApprovalService']={fetchActionableApprovalTasks:async()=>{await oldGate;return tasks;}};
const staleModule=load('hooks/useApprovals.ts',{...staleFixture.deps,react:staleHooks.react});
const staleRender=kind=>{staleHooks.reset();return staleModule.useApprovals({user:{id:'viewer'},kind});};
const oldLoad=staleRender('leave').refreshApprovals();
await staleRender('nte').refreshApprovals();releaseOld();await oldLoad;
assert.equal(staleRender('nte').pendingLeaveApprovals.length,0);
assert.equal(staleRender('nte').approvalsLoading,false);
console.log('PASS: focused queues skip unrelated reads, NTE resolves while another workflow is blocked, assignment filtering retained, and All pending reloads every workflow.');
