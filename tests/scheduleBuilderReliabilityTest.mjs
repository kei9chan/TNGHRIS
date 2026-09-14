import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync('pages/payroll/Timekeeping.tsx','utf8');
const ast=ts.createSourceFile('Timekeeping.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function fn(name){let text;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)===name)text=n.initializer.getText(ast);ts.forEachChild(n,visit);}visit(ast);assert.ok(text,name);return ts.transpileModule('('+text+')',{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;}
const date=new Date('2026-09-14T00:00:00');const key=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
let fail=true,successes=0,closed=0,calls=0;
const scope={user:{id:'builder'},canEditEmployee:id=>id==='report',savingShift:{current:false},scheduleMutation:{current:0},employeeScope:'direct',weekStart:date,retryShift:null,assignments:[],leaves:[],leaveForDay:()=>null,toDateOnly:key,
 setShiftSaveError:x=>scope.error=x,setRetryShift:x=>scope.retryShift=x,setShiftBusy:x=>scope.busy=x,
 setAssignments:x=>scope.assignments=x,setDayStatuses:()=>{},setScheduleStatus:()=>{},setPublicationRefresh:()=>{},handleCloseDrawer:()=>closed++,setToastInfo:()=>successes++,logActivity:async()=>{},mapBuilderAssignment:r=>({id:r.id,employeeId:r.employee_id,date:new Date(r.date+'T00:00:00'),shiftTemplateId:r.shift_template_id}),
 saveBuilderShift:async(s,w,e,d,t)=>{calls++;assert.equal(s,'direct');assert.equal(w,'2026-09-14');if(fail)throw Error('Network unavailable');return {assignments:[{id:'saved',employee_id:e,date:d,shift_template_id:t}],statuses:[]};}};
const save=vm.runInNewContext(fn('handleSaveShift'),scope);
await save('report',date,'shift');assert.equal(scope.error,'Network unavailable');assert.equal(scope.retryShift.templateId,'shift');assert.equal(closed,0);assert.equal(successes,0);assert.equal(scope.assignments.length,0);assert.equal(scope.busy,false);
fail=false;await save('report',date,'shift');assert.equal(scope.retryShift,null);assert.equal(scope.assignments[0].id,'saved');assert.equal(closed,1);assert.equal(successes,1);
scope.savingShift.current=true;await save('report',date,'shift');assert.equal(calls,2);scope.savingShift.current=false;
await save('other',date,'shift');assert.equal(calls,2);assert.match(scope.error,/cannot edit/);
// Permission predicate uses the actual direct-report relation plus the server's edit decision.
const permissionScope={builderIsCurrent:true,builderLoading:false,shiftBusy:false,user:{id:'builder'},employeeScope:'direct',builderPeople:[{id:'report',reportsTo:'builder',canEdit:true},{id:'peer',reportsTo:'someone-else',canEdit:true},{id:'readonly',reportsTo:'someone-else',canEdit:false}]};
const canEdit=vm.runInNewContext(fn('canEditEmployee'),permissionScope);
assert.equal(canEdit('report'),true);assert.equal(canEdit('peer'),false);permissionScope.employeeScope='business_unit';assert.equal(canEdit('peer'),true);assert.equal(canEdit('readonly'),false);permissionScope.builderIsCurrent=false;assert.equal(canEdit('report'),false);
// An old fetch must not replace the schedule after a save or after a week change.
let finish,applied=0;const pending=new Promise(r=>finish=r);
const query={select(){return this},eq(){return this},lte(){return this},gte(){return this},in(){return this},then(resolve){resolve({data:[],error:null});}};
const loadScope={active:true,sequence:0,savingShift:{current:false},scheduleMutation:{current:0},weekStart:date,toDateOnly:key,addDays:(d,n)=>new Date(d.getFullYear(),d.getMonth(),d.getDate()+n),accessibleBus:[],selectedBuId:'all',complianceManager:null,employees:[],employeeScope:'direct',user:{id:'builder'},LeaveRequestStatus:{Approved:'Approved'},supabase:{from:()=>query},loadBuilder:()=>pending,operationRetry:{current:null},setBuilderLoading:()=>{},setBuilderError:()=>{},setBuilderContext:()=>{},setBuilderPeople:()=>{},formatEmployeeName:x=>x,setAssignments:()=>applied++,mapBuilderAssignment:x=>x,setDayStatuses:()=>{},setLeaves:()=>{}};
const load=vm.runInNewContext(fn('loadScheduleData'),loadScope);const loading=load();loadScope.scheduleMutation.current++;finish({people:[],assignments:[{id:'stale'}],statuses:[]});await loading;assert.equal(applied,0);
// Exercise the production service: no success before a matching readback, retry preserves server ID.
let rpcCalls=0,mode='read-failure';const serviceSource=readFileSync('services/scheduleBuilderService.ts','utf8');const module={exports:{}};
const serviceContext={exports:module.exports,require:()=>({supabase:{rpc:async(name,args)=>{rpcCalls++;if(name==='save_schedule_builder_shift')return {data:{id:'persisted',employee_id:args.p_employee,date:args.p_date,shift_template_id:args.p_template},error:null};if(mode==='read-failure')return {error:{message:'Readback unavailable'}};return {data:{people:[],assignments:[{id:'persisted',employee_id:'report',date:'2026-09-14',shift_template_id:mode==='mismatch'?'old':'shift'}],statuses:[]},error:null};}}})};
vm.runInNewContext(ts.transpileModule(serviceSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,serviceContext);
const verify=()=>module.exports.saveBuilderShift('direct','2026-09-14','report','2026-09-14','shift');
await assert.rejects(verify,/Readback unavailable/);mode='mismatch';await assert.rejects(verify,/could not be read back/);mode='ok';assert.equal((await verify()).assignments[0].id,'persisted');assert.equal(rpcCalls,6);
console.log('PASS: direct/BU edit visibility, preserved draft/error/retry, no premature success, duplicate lock, stale fetch discarded, matching server readback required.');
const reviewFile=ts.createSourceFile('review.tsx',readFileSync('components/payroll/SchedulePublishReview.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let publishFn;function findPublish(n){if(ts.isVariableDeclaration(n)&&n.name.getText(reviewFile)==='publish')publishFn=n.initializer.getText(reviewFile);ts.forEachChild(n,findPublish);}findPublish(reviewFile);
let confirmed=false,publishSuccess='',publicationNotifications=0;
const reviewScope={lock:{current:false},note:'Week ready',checked:true,ready:[{employeeId:'report',draftHash:'hash'}],loading:false,scope:'direct',week:'2026-09-14',setNoteError:()=>{},setBusy:()=>{},setError:x=>reviewScope.error=x,setChecked:()=>{},setRows:()=>{},setSuccess:x=>publishSuccess=x,onPublished:()=>publicationNotifications++,publishBuilderWeek:async()=>[{employee_id:'report',approval_required:false}],reviewScheduleWeek:async()=>confirmed?[{employeeId:'report',draftHash:'hash',published:true}]:[],console:{error:()=>{}}};
const publish=vm.runInNewContext(ts.transpileModule('('+publishFn+')',{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,reviewScope);
await publish();assert.equal(publishSuccess,'');assert.equal(publicationNotifications,0);assert.match(reviewScope.error,/could not be read back/);
confirmed=true;await publish();assert.match(publishSuccess,/published successfully/);assert.equal(publicationNotifications,1);
console.log('PASS: publication waits for canonical saved status; failed verification cannot show success.');
