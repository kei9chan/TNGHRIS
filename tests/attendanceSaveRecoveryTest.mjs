import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const transpile=path=>ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const day={serverTime:'2026-09-14T01:00:00Z',workDate:'2026-09-14',revision:0,elapsedSeconds:0,state:'not_started',events:[]};
function fixture(){
 let index=0,effects=[],id=0;const slots=[];
 const f={user:{id:'a'},read:async()=>day,write:async()=>({...day,revision:1,state:'working'})};
 const react={useState:v=>{const i=index++;if(!(i in slots))slots[i]=v;return[slots[i],v=>{slots[i]=v;}];},useRef:v=>{const i=index++;return slots[i]??(slots[i]={current:v});},useCallback:(fn,deps)=>{const i=index++,prev=slots[i];if(!prev||deps.some((d,j)=>d!==prev.deps[j]))slots[i]={deps,fn};return slots[i].fn;},useEffect:(fn,deps)=>{const i=index++,prev=slots[i];if(!prev||deps.some((d,j)=>d!==prev.deps[j]))effects.push(()=>{prev?.cleanup?.();slots[i]={deps,cleanup:fn()};});}};
 const mod={exports:{}};
 vm.runInNewContext(transpile('hooks/useAttendanceClock.ts'),{exports:mod.exports,require:n=>n==='react'?react:n==='./useAuth'?{useAuth:()=>({user:f.user})}:{getMyAttendance:()=>f.read(),recordMyAttendance:(...args)=>f.write(...args)},performance:{now:()=>0},crypto:{randomUUID:()=>`test-${++id}`},setInterval:()=>1,clearInterval(){},Event:class{},window:{addEventListener(){},removeEventListener(){},dispatchEvent(){}},document:{visibilityState:'visible',addEventListener(){},removeEventListener(){}}});
 f.render=()=>{index=0;const value=mod.exports.useAttendanceClock();const pending=effects;effects=[];pending.forEach(fn=>fn());return value;};return f;
}
let f=fixture();f.render();await flush();let c=f.render();
let writes=0;const pending=deferred();f.write=()=>{writes++;return pending.promise;};
const save=c.act('CLOCK_IN');assert.equal(await c.act('CLOCK_IN'),false);await c.refresh();
pending.resolve({...day,revision:1,state:'working'});assert.equal((await save).state,'working');assert.equal(writes,1);assert.equal(f.render().day.revision,1);
// Model a committed save with a lost response: the one retry must use the same ID.
f=fixture();f.render();await flush();c=f.render();const ids=[];let stored;
f.write=async(action,id)=>{ids.push(id);if(!stored){stored={...day,revision:1,state:'working'};throw Error('Failed to fetch');}return stored;};
assert.equal((await c.act('CLOCK_IN')).revision,1);assert.equal(ids.length,2);assert.equal(ids[0],ids[1]);
f.read=async()=>stored;await f.render().refresh();assert.equal(f.render().day.revision,1);
// A failed old-account save must neither retry under the new session nor set its error.
f=fixture();f.render();await flush();c=f.render();const old=deferred();writes=0;f.write=()=>{writes++;return old.promise;};const stale=c.act('CLOCK_IN');
f.user={id:'b'};f.render();await flush();old.reject(Error('Failed to fetch'));await stale;
assert.equal(writes,1);assert.equal(f.render().error,'');assert.equal(f.render().busy,false);
// A hung request is bounded, aborted and reported as unknown, never as saved.
let clock=0;const timers=new Map();let timerId=0;
const deadline={exports:{}};
vm.runInNewContext(transpile('services/attendanceDeadline.ts'),{exports:deadline.exports,AbortController,setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,at:clock+ms});return timerId;},clearTimeout:id=>timers.delete(id)});
let signal;const hung=deadline.exports.attendanceRequest(s=>{signal=s;return new Promise(()=>{});},true);
const rejected=assert.rejects(hung,e=>e.code==='attendance_timeout'&&/confirmation timed out/.test(e.message));await flush();clock=12000;for(const t of [...timers.values()])if(t.at<=clock)t.fn();await rejected;
assert.equal(signal.aborted,true);assert.equal(timers.size,0);
console.log('PASS: double-click guard, refresh/save ordering, same-ID retry, refresh persistence, account-switch isolation, bounded unknown save outcome.');
// Server permission denials are not retried or treated as a successful save.
f=fixture();f.render();await flush();c=f.render();writes=0;
f.write=async()=>{writes++;throw Error('Active sign-in required');};
assert.equal(await c.act('CLOCK_IN'),false);assert.equal(writes,1);assert.equal(f.render().error,'Active sign-in required');
