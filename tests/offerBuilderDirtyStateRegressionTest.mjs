// Exercise the actual drawer's hooks and event handlers with isolated transport.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import Module,{createRequire} from 'node:module';
const h=globalThis.offerHarness={state:[],deps:[],index:0,pending:[],changed:false,fetches:0};
const timers=new Map();let timerId=0;const storage=new Map();
globalThis.window={setTimeout:fn=>{timers.set(++timerId,fn);return timerId},clearTimeout:id=>timers.delete(id),addEventListener(){},removeEventListener(){},confirm:()=>true};
globalThis.document={body:{}};globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
const bundle=await build({entryPoints:['components/recruitment/OfferCreationDrawer.tsx'],bundle:true,jsx:'transform',tsconfigRaw:{compilerOptions:{jsx:'react'}},platform:'node',format:'cjs',write:false,plugins:[{name:'isolate',setup(b){
 b.onResolve({filter:/^react$|^react-dom$|^react-router-dom$|useAuth$|supabaseClient$|useGmailConnection$|jobOfferWorkspaceService$|offerPdf$|preEmploymentChecklistPdf$/},a=>({path:a.path,namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},a=>({loader:'js',contents:a.path==='react'?`
 const h=globalThis.offerHarness;
 export const useState=initial=>{const i=h.index++;if(!(i in h.state))h.state[i]=typeof initial==='function'?initial():initial;return[h.state[i],next=>{const value=typeof next==='function'?next(h.state[i]):next;if(!Object.is(value,h.state[i])){h.state[i]=value;h.changed=true}}]};
 export const useRef=value=>{const i=h.index++;return h.state[i]??={current:value}};
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 export const useMemo=(fn,deps)=>{const i=h.index++;if(!same(h.deps[i],deps)){h.state[i]=fn();h.deps[i]=deps}return h.state[i]};export const useCallback=(fn,deps)=>useMemo(()=>fn,deps);
 export const useEffect=(fn,deps)=>{const i=h.index++;if(!same(h.deps[i],deps)){h.deps[i]=deps;h.pending.push(fn)}};
 export default {forwardRef:fn=>fn,createElement:(type,props,...children)=>({type,props:{...props,children}})};
 `:a.path==='react-dom'?`export const createPortal=value=>value;`:a.path==='react-router-dom'?`export const Link='Link';`:a.path.endsWith('useAuth')?`export const useAuth=()=>({user:{id:'fixture-reviewer'}});`:a.path.endsWith('supabaseClient')?`export const supabase={};`:a.path.endsWith('useGmailConnection')?`export const useGmailConnection=()=>({connection:{connected:false},loading:false});`:a.path.endsWith('jobOfferWorkspaceService')?`export const getApprovedOfferForSend=async()=>{globalThis.offerHarness.fetches++;return globalThis.offerHarness.approved};export const isPublishedOffer=()=>false;`:a.path.endsWith('offerPdf')?`export const buildOfferPdf=()=>{throw new Error('No PDF send in fixture')};export const downloadOfferPdf=()=>{};`:`export const buildPreEmploymentChecklistPdf=()=>{};`}));
 }}]});
const filename=process.cwd()+'/offer-drawer-regression.cjs';const mod=new Module(filename);mod.filename=filename;mod.paths=Module._nodeModulePaths(process.cwd());mod.require=createRequire(filename);mod._compile(bundle.outputFiles[0].text,filename);const View=mod.exports.default;
const approved={id:'offer-fixture',applicationId:'application',basePay:25000,basePaySpecified:true,employmentType:'Regular',startDate:new Date('2026-11-01'),offerExpirationDate:new Date('2027-12-31'),probationMonths:6,status:'Draft',approvalStatus:'Approved',approvalRequestId:'approval',draftStep:6,offerDetails:{termsReviewed:false,jobTitle:'Fixture role',rolePurpose:'Fixture purpose',responsibilities:[{id:'task',label:'Support operations'}],grossMonthlySalary:25000,grossAnnualizedSalary:300000,compensationEntered:true,benefits:[{id:'benefit',name:'Government contributions',included:true}]}};h.approved=approved;
let saves=0;let props={isOpen:true,initialOffer:approved,onClose(){props={...props,isOpen:false}},onSave:async offer=>{saves++;return {...offer,approvalStatus:'Not Requested',approvalRequestId:undefined,revision:3,lastSavedAt:new Date()}},onSend:async()=>{throw new Error('No real send')},applications:[],candidates:[],requisitions:[]};
let tree;const render=()=>{for(let cycle=0;cycle<15;cycle++){h.index=0;h.pending=[];h.changed=false;tree=View(props);for(const effect of h.pending)effect();if(!h.changed)return tree;}throw new Error('Render did not settle')};
const nodes=t=>!t||typeof t!=='object'?[]:[t,...(t.props?.children||[]).flat(Infinity).flatMap(nodes)];
const text=t=>typeof t==='string'?t:!t||typeof t!=='object'?'':(t.props?.children||[]).flat(Infinity).map(text).join(' ');
const button=label=>nodes(tree).find(n=>typeof n.props?.onClick==='function'&&text(n).trim()===label);
const header=()=>nodes(tree).find(n=>n.type==='header');
const review=()=>nodes(tree).find(n=>n.type==='input'&&n.props.type==='checkbox');
render();assert.match(text(header()),/Approved · ready to send/);assert.equal(button('Save Draft').props.disabled,true);
review().props.onChange({target:{checked:true}});render();assert.match(text(header()),/Approved · ready to send/,'Review checkbox preserves approval');assert.equal(saves,0);
await button('Publish & Send Offer').props.onClick();render();assert.equal(h.fetches,1,'Unchanged offer reaches fresh approved-offer read');assert.doesNotMatch(text(tree),/unsaved changes to approved/);assert.equal(saves,0,'Preparing approved offer must not save draft');
// Navigate to compensation and edit actual input handlers.
const compensation=nodes(tree).find(n=>n.type==='button'&&text(n).includes('Compensation'));compensation.props.onClick();render();
const salary=()=>nodes(tree).find(n=>n.props?.label==='Basic / gross monthly salary *');
assert.equal(salary().props.value,25000,'Saved approved pay is retained');
salary().props.onChange({target:{value:'26000'}});render();assert.match(text(header()),/Changes require new approval/);
await button('Publish & Send Offer').props.onClick();render();assert.equal(h.fetches,1,'Material edits cannot reach send preparation');
salary().props.onChange({target:{value:'25000'}});render();assert.match(text(header()),/Approved · ready to send/,'Reverted edit is clean');
assert.doesNotMatch(text(tree),/unsaved changes to approved/,'Reverting clears the stale send warning');
await button('Publish & Send Offer').props.onClick();render();assert.equal(h.fetches,2);
// Close, then reopen a different approved offer with the same drawer instance.
button('← Back to Offers').props.onClick();render();props={...props,isOpen:true,initialOffer:{...approved,id:'second-offer'}};render();assert.match(text(header()),/Approved · ready to send/);assert.equal(button('Save Draft').props.disabled,true);
nodes(tree).find(n=>n.type==='button'&&text(n).includes('Compensation')).props.onClick();render();salary().props.onChange({target:{value:'27000'}});render();assert.equal(button('Save Draft').props.disabled,false);
await button('Save Draft').props.onClick();render();assert.equal(saves,1);assert.doesNotMatch(text(header()),/Changes require new approval/);assert.match(text(header()),/Request Offer Approval/,'Saving real edits returns to approval workflow');
console.log('PASS: actual drawer open, review checkbox, approved read, edit/revert, material-change block, close/reopen, and saved revision lifecycle. No real sends or approvals.');
