import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

let timerId=0, calls=[], timer, held=true, executions=0;
const locks={request:async(name,options,operation)=>{
  calls.push({name,...options});
  if(options.ifAvailable) return operation(held?null:{name});
  if(options.steal){held=false;return operation({name});}
  if(held) return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Waiting cancelled','AbortError')),{once:true}));
  return operation({name});
}};
const code=ts.transpileModule(readFileSync('services/authSessionLock.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
vm.runInNewContext(code,{exports:mod.exports,navigator:{locks},AbortController,setTimeout:(fn,ms)=>{assert.ok(ms<=5000);timer=fn;return ++timerId;},clearTimeout:()=>{timer=null;}});
const run=()=>{executions++;return Promise.resolve('ready');};
const pending=mod.exports.authSessionLock('session',-1,run);
assert.equal(executions,0);timer();assert.equal(await pending,'ready');
assert.equal(executions,1);assert.equal(calls.filter(c=>c.steal).length,1);assert.equal(timer,null);

// Healthy acquisition clears its timer before running the operation.
calls=[];await mod.exports.authSessionLock('session',-1,()=>{assert.equal(timer,null);return run();});
assert.equal(calls.length,1);assert.equal(calls[0].steal,undefined);

// A busy background refresh cannot steal or run without owning the lock.
held=true;calls=[];const before=executions;
await assert.rejects(mod.exports.authSessionLock('session',0,run),e=>e.isAcquireTimeout===true);
assert.equal(executions,before);assert.equal(calls.length,1);assert.equal(calls[0].ifAvailable,true);

// Abort after acquisition never re-executes the auth operation or steals back.
held=false;calls=[];
await assert.rejects(mod.exports.authSessionLock('session',-1,async()=>{executions++;throw new DOMException('Lock stolen','AbortError');}),e=>e.isAcquireTimeout===true);
assert.equal(executions,before+1);assert.equal(calls.length,1);assert.equal(timer,null);
const denied=new Error('Access denied');
await assert.rejects(mod.exports.authSessionLock('session',-1,async()=>{throw denied;}),e=>e===denied);
console.log('PASS: abandoned session lock recovery, ordinary exclusion, background skip, cleared timers, no steal-back/replayed work, and preserved errors.');
