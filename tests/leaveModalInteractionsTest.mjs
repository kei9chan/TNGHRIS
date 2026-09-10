import assert from 'node:assert/strict';
import {build} from 'esbuild';
import Module,{createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
// Exercise event handlers with persistent hook state, including clicks before rerender.
globalThis.leaveHarness={state:[],index:0};
const bundle=await build({entryPoints:[root+'components/payroll/LeaveRequestModal.tsx'],bundle:true,jsx:'transform',tsconfigRaw:{compilerOptions:{jsx:'react'}},platform:'node',format:'cjs',write:false,plugins:[{name:'isolate-hooks',setup(b){
 b.onResolve({filter:/^react$|useAuth$|supabaseClient$|\/ui\//},a=>({path:a.path,namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},a=>({loader:'js',contents:a.path==='react'?`
 const h=globalThis.leaveHarness;
 export const useState=v=>{const i=h.index++;if(!(i in h.state))h.state[i]=v;return[h.state[i],v=>h.state[i]=typeof v==='function'?v(h.state[i]):v]};
 export const useRef=v=>{const i=h.index++;return h.state[i]??=( {current:v} )};export const useEffect=()=>{};
 export default {createElement:(type,props,...children)=>({type,props:{...props,children}})};
 `:a.path.endsWith('useAuth')?`export const useAuth=()=>({user:{id:'reviewer'}});`:a.path.endsWith('supabaseClient')?`export const supabase={};`:`export default '${a.path.split('/').pop()}';`}));
}}]});
const mod=new Module(root+'leave-modal.cjs');mod.filename=root+'leave-modal.cjs';mod.paths=Module._nodeModulePaths(root);mod.require=createRequire(mod.filename);mod._compile(bundle.outputFiles[0].text,mod.filename);
const View=mod.exports.default;const h=globalThis.leaveHarness;
const render=p=>{h.index=0;return View({isOpen:true,onClose(){},leaveTypes:[],...p});};
const nodes=t=>!t||typeof t!=='object'?[]:[t,...Object.values(t.props||{}).flatMap(v=>Array.isArray(v)?v.flatMap(nodes):nodes(v))];
const button=(t,label)=>nodes(t).find(n=>n.type==='Button'&&n.props.children.includes(label));
let calls=0,release;let props={request:null,onSave:()=>{calls++;return new Promise(r=>release=r);}};
let tree=render(props);const submit=button(tree,'Submit');submit.props.onClick();submit.props.onClick();assert.equal(calls,1,'Immediate double click must submit once');
tree=render(props);assert.equal(button(tree,'Submitting leave request…').props.disabled,true);release();await new Promise(r=>setImmediate(r));
props={...props,onSave:async()=>{throw new Error('Network retry needed');}};button(render(props),'Submit').props.onClick();await new Promise(r=>setImmediate(r));assert.ok(nodes(render(props)).some(n=>n.props?.children?.includes('Network retry needed')));
h.state=[];props={request:{id:'request',employeeId:'employee',status:'PendingBOD',startDate:new Date(),endDate:new Date()},onApprove:async(...args)=>{calls++;assert.equal(args[2],'','Approval note is optional');}};
render(props);h.state[3]={canAct:true,creditException:true,required:1,completed:0};
let confirmations=0;globalThis.window={confirm:()=>{confirmations++;return true;}};calls=0;tree=render(props);assert.equal(button(tree,'Approve').props.disabled,false);button(tree,'Approve').props.onClick();button(tree,'Approve').props.onClick();await new Promise(r=>setImmediate(r));assert.equal(calls,1);assert.equal(confirmations,1);assert.equal(button(render(props),'Reject').props.disabled,true);
h.state[3]={canAct:false,alreadyApproved:true};assert.equal(button(render(props),'Already approved by you').props.disabled,true);
console.log('PASS: immediate double-click locks, loading, retry error, BOD confirmation, blank approval note, rejection note, already-approved disabled');
