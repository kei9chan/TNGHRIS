import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = await mkdtemp(join(tmpdir(), 'approval-followup-'));
try {
  await build({entryPoints:['server/approvalFollowup.ts','api/approval-followup.ts','services/approvalNavigation.ts'],outdir:dir,bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'}});
  const { followupOwner, FOLLOWUP_ACCESS, summarizeTasks, loadFollowup } = await import(pathToFileURL(join(dir,'server/approvalFollowup.mjs')));
  const { createFollowupHandler } = await import(pathToFileURL(join(dir,'api/approval-followup.mjs')));
  const viewer = Object.keys(FOLLOWUP_ACCESS)[0], owner = FOLLOWUP_ACCESS[viewer];
  const profile = {id:viewer,status:'Active',is_duplicate:false,auth_user_id:'fixture-auth'};
  assert.equal(followupOwner(profile),owner);
  for (const override of [{id:'other'}, {status:'Inactive'}, {is_duplicate:true}, {auth_user_id:null}]) assert.equal(followupOwner({...profile,...override}),null);
  let tasks = [{request_type:'offer',request_id:'one',type_label:'Job offers'},{request_type:'offer',request_id:'one',type_label:'Job offers'},{request_type:'nte',request_id:'two',type_label:'NTE issuance'}];
  const result = summarizeTasks(tasks, {'offer:one':'2026-09-06T00:00:00Z','nte:two':'2026-09-05T00:00:00Z'});
  assert.equal(result.total,2); assert.equal(result.oldest,'2026-09-05T00:00:00Z');
  assert.ok(!JSON.stringify(result).includes('request_id'));
  let queried = 0;
  function client(p = profile, fail = false) { return {
    auth:{getUser:async()=>({data:{user:{id:'fixture-auth'}}})},
    from(table) { return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:p}),single:async()=>({data:{...profile,id:owner}}),in:async()=>({data:[],error:null})}; },
    rpc(name,args){ queried++; assert.equal(name,'get_actionable_approval_tasks_for_actor');assert.equal(args.p_actor,owner);return {order(){return this;},range:async()=>({data:tasks,error:fail ? {message:'failed'}:null})};},
  }; }
  const response = () => ({setHeader(){},status(n){this.code=n;return this;},json(data){this.data=data;return this;}});
  const req = {method:'GET',headers:{authorization:'Bearer fixture'},query:{owner:'attacker'}};
  for (const p of [{...profile,id:'other'}, {...profile,status:'Inactive'}]) { const r=response(); await createFollowupHandler(()=>client(p))(req,r); assert.equal(r.code,403); }
  assert.equal(queried,0);
  let r=response();await createFollowupHandler(()=>client())({...req,headers:{}},r);assert.equal(r.code,401);
  r=response();await createFollowupHandler(()=>client())({...req,method:'POST'},r);assert.equal(r.code,405);
  r=response();await createFollowupHandler(()=>client())(req,r);assert.equal(r.code,200);assert.equal(r.data.total,2);
  // Simulate shared query after this approver's decision: the other BOD's task is not returned.
  tasks=tasks.filter(t=>t.request_type!=='offer');r=response();await createFollowupHandler(()=>client())(req,r);assert.equal(r.data.total,1);
  tasks=[];r=response();await createFollowupHandler(()=>client())(req,r);assert.equal(r.data.total,0);
  r=response();await createFollowupHandler(()=>client(profile,true))(req,r);assert.equal(r.code,503);assert.equal(r.data.allowed,true);assert.equal(r.data.total,undefined);
  const nav=await import(pathToFileURL(join(dir,'services/approvalNavigation.mjs')));
  globalThis.sessionStorage={getItem:()=>'{broken'};assert.equal(nav.readApprovalView(viewer),null);assert.equal(nav.APPROVAL_CENTER,'/approvals');
  globalThis.sessionStorage={getItem:()=>JSON.stringify({savedAt:Date.now()-86400001})};assert.equal(nav.readApprovalView(viewer),null);
  const nte=await readFile('pages/feedback/NTEDetail.tsx','utf8');
  const reject=nte.slice(nte.indexOf('const handleConfirmReject'),nte.indexOf('const handleConfirmReject')+1300);
  assert.ok(reject.indexOf('await processNTEApproval')<reject.indexOf('decisionSaved('));assert.ok(!reject.includes('navigate('));
  const offer=await readFile('components/recruitment/OfferApprovalReviewModal.tsx','utf8');assert.ok(!offer.includes('window.setTimeout(onClose'));
  console.log('PASS: server identity restriction, no caller-selected owner, summary-only payload, deduplication, current-query changes, empty/error states, canonical fallback, and saved-result navigation.');
} finally { await rm(dir,{recursive:true,force:true}); }
