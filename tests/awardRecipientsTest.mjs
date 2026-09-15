import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import vm from 'node:vm';

const compile = source => ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText;
const helper = compile(await readFile(new URL('../services/awardRecipients.ts', import.meta.url), 'utf8'));
const {awardRecipients, awardConfirmation, isActiveAwardRecipient} = await import(`data:text/javascript;base64,${Buffer.from(helper).toString('base64')}`);
const people = Array.from({length: 50}, (_, i) => ({id: String(i), name: `Employee ${i}`, status: 'Active', employmentStatus: 'Regular', businessUnitId: 'bu', departmentId: i < 25 ? 'sales' : 'ops', department: i < 25 ? 'Sales' : 'Operations'}));
const others = ['Resigned', ' terminated ', 'Separated', 'INACTIVE'].map((employmentStatus, i) => ({...people[0], id: `excluded-${i}`, employmentStatus}));
const all = [...people, ...others, {...people[0], id:'other-bu', businessUnitId:'other'}, {...people[0], id:'inactive', status:'Inactive'}, {...people[0], id:'unknown', status:null}];
assert.equal(awardRecipients(all, 'bu', '').length, 50);
assert.equal(awardRecipients(all, 'bu', 'sales').length, 25);
assert.equal(awardRecipients(all, '', '').length, 0);
assert.match(awardConfirmation(48, 50, 'Example BU'), /48 active employees under Example BU\. 2 employees have been excluded/);

const modal = await readFile(new URL('../components/evaluation/AssignAwardModal.tsx', import.meta.url), 'utf8');
// Execute the modal's actual selection expressions; search must not alter recipients.
const selection = modal.slice(modal.indexOf('    const filteredEmployees ='), modal.indexOf('\n    useEffect(() => {', modal.indexOf('    const filteredEmployees =')));
const selected = search => vm.runInNewContext(compile(selection + '; ({selectedEmployees, visibleEmployees, employeeId});'), {
  useMemo: f=>f(), awardRecipients, people: all, businessUnitId:'bu', departmentId:'', excludedIds:new Set(['0','1']), employeeSearch:search,previewEmployeeId:'',letterTemplates:[],awardId:'award',selectLetterTemplate:()=>({})
});
assert.equal(selected('').selectedEmployees.length, 48);
assert.equal(selected('Sales').selectedEmployees.length, 48);
assert.equal(selected('Sales').visibleEmployees.length, 25);
assert.equal(selected('Employee 49').visibleEmployees.length, 1);

const handlers = modal.slice(modal.indexOf('    const handleNext ='), modal.indexOf('    const renderDetailsStep ='));
function harness({recipients=people.slice(0,3), bod=true, stale=false, fail=false}={}) {
  const calls=[], alerts=[], outcomes=[];
  let preview=false;
  const context={console:{error(){}}, selectedEmployees:recipients, selectedEmployee:recipients[0], employeeId:recipients[0]?.id || '', selectedAward:{id:'award'}, awardId:'award', notes:'Thank you', businessUnitId:'bu', departmentId:'', selectedApprovers:[{id:'bod'}], hasBodApprover:bod, hasAvailableBod:true, loadingPeople:false, peopleError:'', templateError:'', submissionStarted:{current:false}, inFlight:{current:false}, isActiveAwardRecipient,letterTemplate:{},letterError:'',awardDate:'2026-09-15',
    alert:m=>alerts.push(m), setStep:()=>{preview=true}, setIsGenerating(){}, setResults:r=>outcomes.push([...r]),
    supabase:{from:()=>({select:()=>({in:async()=>({data:recipients.map(e=>({id:e.id,status:stale?'Inactive':'Active',employment_status:'Regular',business_unit_id:'bu',department_id:e.departmentId})),error:null})})})},
    onAssign:async(id,...args)=>{calls.push([id,...args]);if(fail&&id==='1')throw Error('Permission denied');}
  };
  vm.runInNewContext(compile(handlers+';this.handlers={handleNext,handleGrant};'),context);
  return {context,calls,alerts,outcomes,get preview(){return preview}};
}
const empty=harness({recipients:[]}); empty.context.handlers.handleNext(); await empty.context.handlers.handleGrant(); assert(!empty.preview);assert.equal(empty.calls.length,0);
const noBod=harness({bod:false});await noBod.context.handlers.handleGrant();assert.equal(noBod.calls.length,0);
const stale=harness({stale:true});await stale.context.handlers.handleGrant();assert.equal(stale.calls.length,0);assert.match(stale.outcomes.at(-1)[0],/status or assignment changed/);
const batch=harness({fail:true});await Promise.all([batch.context.handlers.handleGrant(),batch.context.handlers.handleGrant()]);
assert.deepEqual(batch.calls.map(c=>c[0]),['0','1','2']);assert.equal(batch.outcomes.at(-1).length,3);assert.match(batch.outcomes.at(-1)[1],/Permission denied/);
assert(batch.calls.every(c=>c[3]==='bu' && c[5][0].id==='bod'));
await batch.context.handlers.handleGrant();assert.equal(batch.calls.length,3);
console.log('PASS: active-only BU/department scope; 50 default recipients; 48 after exclusions; name/department search preserves selections; count confirmation; empty selection and missing BOD blocked; fresh eligibility check; selected-only submissions; per-recipient failures; double-click and repeat-submit protection.');

const service = await readFile(new URL('../services/awardService.ts', import.meta.url), 'utf8');
const mapper = service.slice(service.indexOf('const mapEmployeeAward'), service.indexOf('const TEMPLATE_BUCKET'));
const create = service.slice(service.indexOf('export const createEmployeeAward'), service.indexOf('export const uploadTemplateAsset')).replace('export const', 'const');
const row={id:'saved',employee_id:'employee',award_template_id:'award',status:'PendingApproval',business_unit_id:'bu',department_id:'sales',award_date:'2026-08-15',issued_at:'2026-09-15T08:00:00Z',approver_steps:[{userId:'bod',status:'Pending'}]};
for (const throws of [false,true]) {
  const context={BadgeLevel:{Bronze:'Bronze'},ResolutionStatus:{PendingApproval:'PendingApproval',Draft:'Draft'},supabase:{rpc:async()=>({data:row,error:null}),from:()=>({select:()=>({eq:()=>({single:async()=>{if(throws)throw Error('Connection interrupted');return {data:null,error:{message:'Read failed'}};}})})})}};
  vm.runInNewContext(compile(mapper+create+';this.create=createEmployeeAward;'),context);
  const saved=await context.create({employeeId:'employee',awardTemplateId:'award',approverIds:['bod']});
  assert.equal(saved.id,'saved');assert.equal(saved.departmentId,'sales');assert.equal(saved.status,'PendingApproval');
  assert.equal(saved.dateAwarded.getMonth(),7);assert.equal(saved.dateAwarded.getDate(),15);
}
console.log('PASS: committed nominations retain their server ID, scope and pending status when the enrichment read fails; no duplicate-producing failure.');
