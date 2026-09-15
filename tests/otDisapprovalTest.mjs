import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import vm from 'node:vm';
const source=await readFile(new URL('../services/bulkDisapproval.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {disapproveSelected}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const item=id=>({id,reference:'OT-'+id,employee:'Test Employee'});
let calls=[];const progress=[];
await assert.rejects(disapproveSelected([item('1')],' ',async()=>{throw Error('must not call')},()=>{}),/reason/);
const results=await disapproveSelected([item('1'),item('2'),item('1'),item('3')],' Schedule not authorized ',async(id,note)=>{
 calls.push({id,note});if(id==='2')throw new Error('This request is not assigned to you.');return {status:'Rejected',alreadyDecided:id==='3'};
},r=>progress.push(r));
assert.deepEqual(calls.map(c=>c.id),['1','2','3']);assert(calls.every(c=>c.note==='Schedule not authorized'));
assert.deepEqual(results.map(r=>r.outcome),['Disapproved','Not saved','Already recorded']);
assert.match(results[1].message,/not assigned/);assert.equal(progress.length,3);
const modal=await readFile(new URL('../components/payroll/OTRequestModal.tsx',import.meta.url),'utf8');
const fn=modal.slice(modal.indexOf('const calculatePlannedHours'),modal.indexOf('const isTimeOverlap'));
const calculate=vm.runInNewContext(ts.transpileModule(fn+'; calculatePlannedHours;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText);
assert.equal(calculate('00:00:00','05:19:00'),5.25);assert.equal(calculate('22:00','02:00'),4);assert.equal(calculate('bad','bad'),0);
console.log('PASS: required reason; selected-only processing; duplicate protection; per-item authorization/error outcomes; retry recognition; PostgreSQL time and overnight duration.');
// Execute the actual modal decision handlers with a rejected save, a retry and a double click.
const handlers=modal.slice(modal.indexOf('    const recordDecision'),modal.indexOf('    const plannedHours ='));
let rejectMode=false,note='',error='',busy=false,attempts=0;
let release;
const state={OTStatus:{Approved:'Approved',Rejected:'Rejected'},request:{id:'test'},approvedHours:'5.25',
 decisionInFlight:{current:false},setDeciding:v=>{busy=v},setError:v=>{error=v},setRejecting:v=>{rejectMode=v},
 onApproveOrReject:async()=>{attempts++;throw new Error('Save failed')},
};
Object.defineProperties(state,{rejecting:{get:()=>rejectMode},managerNote:{get:()=>note}});
const ctx=vm.createContext(state);
vm.runInContext(ts.transpileModule(handlers+';this.handlers={handleReject,recordDecision};',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);
ctx.handlers.handleReject();assert.equal(rejectMode,true);assert.equal(attempts,0);
ctx.handlers.handleReject();assert.match(error,/note is required/);assert.equal(attempts,0);
note='Not authorized for this date';
await ctx.handlers.recordDecision('Rejected',0);assert.equal(busy,false);assert.equal(note,'Not authorized for this date');assert(error);
state.onApproveOrReject=()=>{attempts++;return new Promise(resolve=>{release=resolve})};
const pending=ctx.handlers.recordDecision('Rejected',0);assert.equal(busy,true);
await ctx.handlers.recordDecision('Rejected',0);assert.equal(attempts,2);
release();await pending;assert.equal(busy,false);assert.equal(error,'');
console.log('PASS: Reject opens an inline reason; blank reason sends nothing; save failure is displayed; retry retains note; concurrent clicks send only one decision.');
