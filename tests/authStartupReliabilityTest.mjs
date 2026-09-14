import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const transpile = path => ts.transpileModule(readFileSync(path, 'utf8'), {fileName:path,compilerOptions:{module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2020, jsx:ts.JsxEmit.React}}).outputText;
const deferred = () => {let resolve; const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const flush = async () => {for(let i=0;i<40;i++) await Promise.resolve();};
function fixture() {
  let now=0, nextTimer=0, hook=0, listener, effects=[];
  const timers=new Map(), slots=[];
  const clock={setTimeout:(fn,ms)=>{const id=++nextTimer;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id)};
  const react={createContext:()=>({Provider:'provider'}),createElement:(_type,props)=>props.value,
    useState:initial=>{const i=hook++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
    useRef:initial=>{const i=hook++;return slots[i]??(slots[i]={current:initial});},useCallback:fn=>fn,
    useEffect:(fn,deps)=>{const i=hook++,prev=slots[i];if(!prev||deps.some((v,n)=>v!==prev.deps[n])){effects.push(()=>{prev?.cleanup?.();slots[i]={deps,cleanup:fn()};});}}
  };
  let bootstrapCalls=0, rbacCalls=0, getUserCalls=0;
  const f={session:{user:{id:'auth-a',email:'a@example.invalid'}},profile:{id:'employee-a',full_name:'Employee A',role:'Employee',status:'Active'},rbac:{authorized:true,roles:['Employee'],primaryRole:'Employee'},bootstrap:null};
  const supabase={auth:{getSession:async()=>f.sessionRead?await f.sessionRead.promise:({data:{session:f.session},error:null}),getUser:async()=>{getUserCalls++;throw Error('Startup should verify through server RPCs');},onAuthStateChange:cb=>{listener=cb;return {data:{subscription:{unsubscribe(){}}}};},signOut:async()=>({error:null}),signInWithPassword:async()=>{listener('SIGNED_IN',f.session);return {data:{user:f.session.user,session:f.session},error:null};}},
    rpc:async()=>{bootstrapCalls++;return f.bootstrap?await f.bootstrap.promise:{data:f.profile,error:null};}};
  const common={...clock,console:{log(){},warn(){},error(){}},URL,Request,AbortController,localStorage:{setItem(){}},window:{...clock,setInterval:()=>0,clearInterval(){},addEventListener(){},removeEventListener(){}},document:{addEventListener(){},removeEventListener(){}}};
  const deadline={exports:{}};vm.runInNewContext(transpile('services/authDeadline.ts'),{...common,exports:deadline.exports});
  const module={exports:{}};
  vm.runInNewContext(transpile('context/AuthContext.tsx'),{...common,exports:module.exports,require:name=>{
    if(name==='react')return {...react,default:react};
    if(name.endsWith('/types'))return {Role:{Employee:'Employee',Admin:'Admin'}};
    if(name.endsWith('/authDeadline'))return deadline.exports;
    if(name.endsWith('/rbacService'))return {fetchEffectiveRbacSnapshot:async()=>{rbacCalls++;return {data:f.rbac,error:null};}};
    if(name.endsWith('/supabaseClient'))return {supabase,retryTransientSupabaseRead:fn=>fn(),isTransientNetworkError:e=>e?.code==='authorization_timeout'};
    throw Error(name);
  }});
  f.render=()=>{hook=0;const value=module.exports.AuthProvider({children:null});const pending=effects;effects=[];pending.forEach(fn=>fn());return value;};
  f.advance=async ms=>{now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn();}await flush();};
  f.event=(event,session=f.session)=>listener(event,session);
  f.counts=()=>({bootstrapCalls,rbacCalls,getUserCalls});
  f.deadline=deadline.exports;
  return f;
}

// A cached session is not sufficient: wait for server authorization.
let f=fixture();f.bootstrap=deferred();f.render();await flush();
assert.equal(f.render().user,null);assert.equal(f.render().loading,true);
f.bootstrap.resolve({data:f.profile,error:null});await flush();
assert.equal(f.render().user.id,'employee-a');assert.equal(f.render().loading,false);
assert.deepEqual(f.counts(),{bootstrapCalls:1,rbacCalls:1,getUserCalls:0});
f.event('TOKEN_REFRESHED');f.event('SIGNED_IN');await f.advance(0);
assert.equal(f.counts().bootstrapCalls,1,'Ordinary session events must not reload authorization');

// A hung profile is bounded and retry succeeds; late data cannot sign anyone in.
f=fixture();const stale=deferred();f.bootstrap=stale;f.render();await flush();await f.advance(12000);
assert.equal(f.render().loading,false);assert.equal(f.render().user,null);assert.match(f.render().authError,/Retry/);
f.bootstrap=null;f.render().retryAuth();f.render();await flush();
assert.equal(f.render().user.id,'employee-a');assert.equal(f.render().authError,null);
stale.resolve({data:{...f.profile,id:'stale-user'},error:null});await flush();
assert.equal(f.render().user.id,'employee-a');

// Logout invalidates a pending hydration and cannot be undone by its response.
f=fixture();f.bootstrap=deferred();f.render();await flush();f.render().logout();
f.bootstrap.resolve({data:f.profile,error:null});await flush();
assert.equal(f.render().user,null);assert.equal(f.render().loading,false);

// Inactive and denied accounts never receive an application user.
for(const denied of ['inactive','no-role']) {
  f=fixture();if(denied==='inactive')f.profile.status='Inactive';else f.rbac.authorized=false;
  f.render();await flush();assert.equal(f.render().user,null);assert.equal(f.render().loading,false);
}
f=fixture();f.session=null;f.render();await flush();
assert.equal(f.render().user,null);assert.equal(f.render().loading,false);assert.equal(f.counts().bootstrapCalls,0);

// Session lock/refresh hangs also release the initial spinner.
f=fixture();f.sessionRead=deferred();f.render();await flush();await f.advance(12000);
assert.equal(f.render().loading,false);assert.equal(f.render().user,null);assert.match(f.render().authError,/Retry/);

// Explicit sign-in and its SIGNED_IN event share one authorized hydration.
f=fixture();f.session=null;f.render();await flush();
f.session={user:{id:'auth-a',email:'a@example.invalid'}};f.bootstrap=deferred();
const signingIn=f.render().login('a@example.invalid','test-only-password');await flush();
await assert.rejects(f.render().login('a@example.invalid','test-only-password'),/already in progress/);
f.bootstrap.resolve({data:f.profile,error:null});await signingIn;await flush();
assert.equal(f.render().user.id,'employee-a');assert.equal(f.counts().bootstrapCalls,1);

// Switching accounts cannot retain the old user's access on a network failure.
f.render();f.bootstrap=deferred();f.event('SIGNED_IN',{user:{id:'auth-b'}});await f.advance(0);
assert.equal(f.render().user,null);await f.advance(12000);assert.equal(f.render().user,null);assert.equal(f.render().loading,false);

// Ordinary concurrent reads share a request; explicit access changes force a fresh read.
const cache={exports:{}};vm.runInNewContext(transpile('services/readCache.ts'),{exports:cache.exports});
let calls=0;const pending=deferred(), loader=()=>{calls++;return pending.promise;};
const a=cache.exports.dedupeRead('user-a',loader,10000), b=cache.exports.dedupeRead('user-a',loader,10000);
assert.equal(calls,1);pending.resolve('verified');assert.equal(await a,'verified');assert.equal(await b,'verified');
await cache.exports.dedupeRead('user-a',async()=>{calls++;return 'fresh';},10000,true);assert.equal(calls,2);
await cache.exports.dedupeRead('user-b',async()=>{calls++;return 'other';},10000);assert.equal(calls,3);
console.log('PASS: verified startup, session deduplication, deadline, retry, stale response/logout, inactive/unauthorized denial, signed-out startup, per-user refresh deduplication.');
