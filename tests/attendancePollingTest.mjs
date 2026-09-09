import assert from 'node:assert/strict';
import {build} from 'esbuild';
const effects=[],timers=[],listeners={};let reads=0,resolveRead;
globalThis.__clockTest={effects,read:()=>{reads++;return new Promise(resolve=>{resolveRead=resolve;});}};
globalThis.document={visibilityState:'visible',addEventListener:(n,f)=>{listeners[n]=f;},removeEventListener:()=>{}};
globalThis.window={addEventListener:(n,f)=>{listeners[n]=f;},removeEventListener:()=>{}};
const originalInterval=globalThis.setInterval,originalClear=globalThis.clearInterval;
globalThis.setInterval=(f,ms)=>{timers.push({f,ms});return timers.length;};globalThis.clearInterval=()=>{};
try{
 const {outputFiles}=await build({entryPoints:['hooks/useAttendanceClock.ts'],bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'mock-hook-dependencies',setup(b){b.onResolve({filter:/^(react)$|\/useAuth$|services\/employeeAttendance$/},args=>({path:args.path,namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},args=>({contents:args.path==='react'?`export const useState=v=>[v,()=>{}];export const useRef=v=>({current:v});export const useCallback=f=>f;export const useEffect=f=>globalThis.__clockTest.effects.push(f);`:args.path.endsWith('useAuth')?`export const useAuth=()=>({user:{id:'test'}});`:`export const getMyAttendance=()=>globalThis.__clockTest.read();export const recordMyAttendance=()=>{throw Error('Unexpected write');};`,loader:'js'}));}}]});
 const {useAttendanceClock}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
 useAttendanceClock();const cleanup=effects.map(f=>f());assert.equal(reads,1);
 const poll=timers.find(t=>t.ms===30000);assert.ok(poll);assert.ok(timers.find(t=>t.ms===1000));
 poll.f();listeners.focus();assert.equal(reads,1,'Background refreshes must not overlap');
 resolveRead({serverTime:new Date().toISOString(),elapsedSeconds:0,state:'working'});await new Promise(r=>setImmediate(r));
 document.visibilityState='hidden';poll.f();listeners.visibilitychange();listeners.focus();assert.equal(reads,1,'Hidden tabs must not query');
 document.visibilityState='visible';listeners.visibilitychange();assert.equal(reads,2,'Returning to visible refreshes immediately');
 poll.f();listeners.focus();assert.equal(reads,2);
 resolveRead({serverTime:new Date().toISOString(),elapsedSeconds:0,state:'working'});await new Promise(r=>setImmediate(r));cleanup.forEach(f=>f?.());
 console.log('PASS: 30-second polling, one-second display timer, hidden-tab pause, visible-tab refresh and overlapping-read prevention.');
}finally{globalThis.setInterval=originalInterval;globalThis.clearInterval=originalClear;delete globalThis.__clockTest;}
