import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../hooks/useAdditionalApprovals.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const states=[];let id='first',taskError=false,panError=false,delay;
const empty={data:[],error:null};
const deps={
 react:{useRef:v=>({current:v}),useState:v=>{const i=states.length;states.push(v);return [v,x=>{states[i]=x;}];},useCallback:f=>f,useEffect(){}},
 '../services/offerApprovalService':{fetchPendingOfferApprovalIds:async()=>[]},
 '../services/assetApprovalService':{fetchMyAssetApprovalQueue:async()=>[]},
 '../services/benefitApprovalService':{fetchMyPendingBenefitApprovals:async()=>[]},
 '../services/actionableApprovalService':{fetchActionableApprovalTasks:async()=>{
  const value=id;if(taskError)throw new Error('Task refresh failed');
  if(delay){const promise=delay;delay=null;await promise;}
  return [{request_type:'pan',request_id:value}];
 }},
 '../services/supabaseClient':{supabase:{rpc:async()=>empty,from:table=>({
  select(){return this;},eq(){return this;},in(){return this;},order:async()=>table==='pans'?{data:[{id,employee_name:'Test',routing_steps:[{userId:'viewer',status:'Pending'}]}],error:panError?{message:'PAN refresh failed'}:null}:empty,
 })}},
};
const exports={};vm.runInNewContext(code,{exports,require:name=>{assert.ok(name in deps);return deps[name];}});
const hook=exports.useAdditionalApprovals({id:'viewer'});
await hook.refreshAdditionalApprovals();assert.equal(states[1][0].id,'first');
taskError=true;await hook.refreshAdditionalApprovals();assert.equal(states[1][0].id,'first');assert.match(states[7],/Task refresh failed/);
taskError=false;panError=true;await hook.refreshAdditionalApprovals();assert.equal(states[1][0].id,'first');assert.match(states[7],/PAN refresh failed/);
panError=false;let release;delay=new Promise(resolve=>{release=resolve;});id='slow-old';
const old=hook.refreshAdditionalApprovals();id='newest';await hook.refreshAdditionalApprovals();release();await old;
assert.equal(states[1][0].id,'newest','Older response must not overwrite newer PAN queue');
assert.equal(states[7],null);
console.log('PASS: last successful PAN queue retained on task/PAN errors; out-of-order refresh ignored.');
