import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the actual Login component with a controlled auth provider. There is
// intentionally no Supabase mock: navigation must not make another SDK call.
let auth={user:null,loading:false,authError:null},retried=0,hook=0;
const slots=[],effects=[],navigations=[];
const react={
  createElement:(type,props,...children)=>({type,props:props||{},children:children.flat()}),
  useState:initial=>{const i=hook++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>slots[i]=v];},
  useEffect:(fn,deps)=>{const i=hook++,prev=slots[i];if(!prev||deps.some((v,n)=>v!==prev[n])){slots[i]=deps;effects.push(fn);}},
};
const navigate=(...args)=>navigations.push(args);
class SupabaseAuthError extends Error {}
const mod={exports:{}};
const source=ts.transpileModule(readFileSync('pages/Login.tsx','utf8'),{fileName:'Login.tsx',compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2020}}).outputText;
vm.runInNewContext(source,{exports:mod.exports,console,localStorage:{getItem:()=>null},require:name=>{
  if(name==='react')return {...react,default:react};
  if(name==='react-router-dom')return {useNavigate:()=>navigate,useLocation:()=>({}),Link:'link'};
  if(name.endsWith('/useAuth'))return {useAuth:()=>({...auth,retryAuth:()=>retried++})};
  if(name.endsWith('/AuthContext'))return {SupabaseAuthError,DeviceConflictError:class extends Error{}};
  if(name.endsWith('/GoogleIcon'))return {default:()=>null};
  throw Error(`Unexpected dependency in login view: ${name}`);
}});
const render=()=>{hook=0;const tree=mod.exports.default();effects.splice(0).forEach(fn=>fn());return tree;};
const all=(node,predicate)=>!node||typeof node!=='object'?[]:[...(predicate(node)?[node]:[]),...node.children.flatMap(child=>all(child,predicate))];
const text=node=>typeof node==='string'?node:node?.children?.map(text).join('')||'';
auth.authError='HRIS could not verify your profile in time. Retry the access check. ACCESS_PROFILE_TIMEOUT';
let tree=render();assert.equal(navigations.length,0);
let retry=all(tree,n=>n.type==='button'&&text(n)==='Retry access check')[0];
assert.ok(retry);retry.props.onClick();assert.equal(retried,1);
auth.loading=true;tree=render();
retry=all(tree,n=>n.type==='button'&&text(n)==='Verifying access…')[0];
assert.equal(retry.props.disabled,true);
assert.equal(all(tree,n=>n.type==='button'&&n.props.type==='submit')[0].props.disabled,true);
for(const reset of [false,true]) {
  auth={user:{id:'test',status:'Active',mustChangePassword:reset},loading:false,authError:null};
  render();assert.equal(navigations.at(-1)[0],reset?'/reset-password':'/dashboard');
}
console.log('PASS: Login displays access-only recovery, blocks concurrent submission, and routes verified users without an extra session read.');
