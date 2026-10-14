const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const compiled=ts.transpileModule(fs.readFileSync('supabase/functions/email-account-deletion/index.ts','utf8').replace(/^import .*;$/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const requestId='00000000-0000-4000-8000-000000000100';
async function scenario(options={}){
 let handler,deletes=[],finishes=[],decisions=0,adminClients=0;
 const ticket={status:'Approved',requestId,authUserId:'00000000-0000-4000-8000-000000000013',email:'old@example.invalid',executionToken:'lease',authDeleted:!!options.alreadyDeleted};
 const scoped={auth:{getUser:async()=>({data:{user:options.expired?null:{id:'kay-auth'}},error:null})},rpc:async()=>{decisions++;return {data:options.reject?{status:'Rejected'}:ticket,error:options.forbidden?{code:'42501',message:'Only the assigned BOD can decide'}:null};}};
 const admin={auth:{admin:{getUserById:async()=>({data:{user:{id:ticket.authUserId,email:options.mismatch?'changed@example.invalid':ticket.email}},error:null}),deleteUser:async(...args)=>{deletes.push(args);return {error:options.providerFailure?{message:'SECRET provider details'}:null};}}},rpc:async(_name,args)=>{finishes.push(args);return {error:options.finalizationFailure&&args.p_success?{message:'SECRET database details'}:null};}};
 const env={SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'private-service'};
 vm.runInNewContext(compiled,{Request,Response,Error,String,Boolean,console:{error(){}},Deno:{env:{get:key=>env[key]},serve:fn=>handler=fn},createClient:(_url,key)=>{if(key==='private-service'){adminClients++;return admin;}return scoped;}});
 const response=await handler(new Request('https://fixture.invalid/email-account-deletion',{method:'POST',headers:{'Content-Type':'application/json',...(options.noAuth?{}:{Authorization:'Bearer fixture-jwt'})},body:JSON.stringify({requestId:options.malformed?'bad':requestId,decision:options.reject?'reject':'approve',authUserId:'attacker-selected-id',email:'attacker@example.invalid'})}));
 const body=await response.json();assert.ok(!JSON.stringify(body).includes('SECRET'));assert.ok(!JSON.stringify(body).includes('private-service'));
 return {status:response.status,body,deletes,finishes,decisions,adminClients,ticket};
}
(async()=>{
 const ok=await scenario();assert.equal(ok.status,200);assert.equal(ok.body.status,'Completed');assert.deepEqual(ok.deletes,[[ok.ticket.authUserId,true]]);assert.equal(ok.finishes[0].p_token,'lease');assert.equal(ok.finishes[0].p_success,true);
 for(const option of ['noAuth','expired','forbidden','malformed']){const r=await scenario({[option]:true});assert.ok(r.status>=400);assert.equal(r.deletes.length,0);assert.equal(r.adminClients,0);}
 const rejected=await scenario({reject:true});assert.equal(rejected.body.status,'Rejected');assert.equal(rejected.deletes.length,0);assert.equal(rejected.adminClients,0);
 const changed=await scenario({mismatch:true});assert.equal(changed.status,502);assert.equal(changed.deletes.length,0);assert.equal(changed.finishes[0].p_success,false);
 const failed=await scenario({providerFailure:true});assert.equal(failed.status,502);assert.equal(failed.finishes[0].p_success,false);
 const finalization=await scenario({finalizationFailure:true});assert.equal(finalization.status,502);assert.deepEqual(finalization.finishes.map(f=>f.p_success),[true,false]);
 const retry=await scenario({alreadyDeleted:true,mismatch:true});assert.equal(retry.status,200);assert.equal(retry.deletes.length,0);assert.equal(retry.finishes[0].p_success,true);
 console.log('PASS: authenticated named-approver gate before managed Auth, server-selected identity only, soft deletion, rejection without side effects, identity mismatch, provider/finalization failure, safe retry, and no secret exposure.');
})().catch(error=>{console.error(error);process.exit(1);});
