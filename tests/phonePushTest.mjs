import assert from 'node:assert/strict';import {createHmac,randomUUID,randomBytes} from 'node:crypto';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createPhoneFixture,id,signingSecret} from './phonePushFixture.mjs';import {PGlite} from '@electric-sql/pglite';
const dir=mkdtempSync(join(tmpdir(),'tng-push-'));let db=await createPhoneFixture(dir);
const actor=async n=>db.exec(`reset role;set request.jwt.claim.sub='';set test.actor='${id(n)}';set test.session='${id(n+100)}';set role authenticated`);
const rpc=async(name,args=[])=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) r`,args)).rows[0].r;
const sub={endpoint:'https://fcm.googleapis.com/wp/fixture-one',keys:{p256dh:randomBytes(65).toString('base64url'),auth:randomBytes(16).toString('base64url')}};
const signed=async(action,args={},extra={})=>{await db.exec('reset role');const timestamp=extra.timestamp??Math.floor(Date.now()/1000),nonce=extra.nonce??randomUUID(),payload=JSON.stringify(args),input=`${timestamp}\n${nonce}\n${action}\n${payload}`;const signature=createHmac('sha256',signingSecret).update(input).digest('hex');await db.query('insert into private.test_hmac values($1,$2,$3) on conflict do nothing',[Buffer.from(input),Buffer.from(signingSecret),Buffer.from(signature,'hex')]);await db.exec('set role anon');return rpc('phone_push_worker',[timestamp,nonce,action,payload,extra.signature??signature]);};
const count=async(query)=>{await db.exec('reset role');return (await db.query(query)).rows[0];};
try{
 await actor(13);assert.equal((await rpc('phone_push_configuration')).enabled,true);
 const device=await rpc('phone_push_save',[sub,null,'Test Android']);assert.equal(device.active,true);assert.equal((await rpc('phone_push_status',[sub.endpoint])).id,device.id);
 await assert.rejects(()=>rpc('phone_push_save',[{...sub,endpoint:'https://localhost/private'},null,'Bad']),/unsupported/);
 await assert.rejects(()=>rpc('phone_push_save',[{...sub,endpoint:'https://fcm.googleapis.com:443/wp/bad'},null,'Bad']),/unsupported/);
 await actor(14);assert.equal(await rpc('phone_push_status',[sub.endpoint]),null);await assert.rejects(()=>rpc('phone_push_test',[device.id]),/Enable/);await assert.rejects(()=>db.query('select * from phone_push_private.devices'),/permission/);
 await actor(13);const test=await rpc('phone_push_test',[device.id]);await assert.rejects(()=>rpc('phone_push_test',[device.id]),/30 seconds/);
 let claimed=await signed('claim',{job_id:test.job_id});assert.equal(claimed.length,1);assert.equal(claimed[0].payload.owner,id(13));assert.equal(claimed[0].payload.url,'/notifications');assert.ok(!JSON.stringify(claimed[0].payload).includes('Employee A'));
 assert.equal((await signed('claim',{job_id:test.job_id})).length,0);
 await signed('finish',{results:[{id:test.job_id,lease:randomUUID(),status:'sent'}]});assert.equal((await count(`select state from phone_push_private.jobs where id='${test.job_id}'`)).state,'sending');
 await signed('finish',{results:[{id:test.job_id,lease:claimed[0].lease,status:'sent'}]});
 await db.exec('set role anon');await rpc('phone_push_receipt',[test.job_id,randomUUID()]);assert.equal((await count(`select displayed_at from phone_push_private.jobs where id='${test.job_id}'`)).displayed_at,null);
 await db.exec('set role anon');await rpc('phone_push_receipt',[test.job_id,claimed[0].payload.receipt]);await actor(13);assert.ok((await rpc('phone_push_status',[sub.endpoint])).last_test.displayed_at);
 await signed('dispatch',{}, {nonce:id(800)});await assert.rejects(()=>signed('dispatch',{}, {nonce:id(800)}),/already processed/);
 await assert.rejects(()=>signed('claim',{}, {signature:'0'.repeat(64)}),/Unauthorized/);await assert.rejects(()=>signed('claim',{}, {timestamp:Math.floor(Date.now()/1000)-300}),/Unauthorized/);
 await db.exec('set role anon');await assert.rejects(()=>rpc('phone_push_worker',[null,randomUUID(),'claim','{}','0'.repeat(64)]),/Unauthorized/);await assert.rejects(()=>rpc('phone_push_configuration'),/permission/);
 // New assignments and existing reminders enter the same per-device queue.
 await actor(11);const template=await rpc('ops_save_template',[null,id(1),'task',{title:'Push task'},null,true]);const version=(await rpc('ops_workspace',[id(1)])).templates.find(t=>t.id===template).versions[0].id;
 const assignments=await rpc('ops_assign',[id(1),version,{mode:'individual',ids:[id(13)]},new Date(Date.now()+86400000).toISOString(),'Normal','',[],false]);
 const assignment=(await rpc('ops_workspace',[id(1)])).assignments.find(a=>a.template_version_id===version).id;
 claimed=await signed('claim');assert.equal(claimed.length,1);assert.equal(claimed[0].payload.url,`/operations?view=Tasks&assignment=${assignment}`);await signed('finish',{results:[{id:claimed[0].id,lease:claimed[0].lease,status:'sent'}]});
 await db.exec('reset role');await db.query("insert into notifications(user_id,link,title,dedupe_key) values($1,$2,'Reminder','ops:test')",[id(13),`/operations?view=Tasks&assignment=${assignment}`]);
 await actor(13);await rpc('ops_snooze_assignment',[assignment,0,new Date(Date.now()+3600000).toISOString()]);assert.equal((await signed('claim')).length,0);assert.ok((await count("select next_at>now() delayed from phone_push_private.jobs where kind='reminders' order by created_at desc limit 1")).delayed);
 await actor(13);await rpc('phone_push_save',[sub,{assignments:true,reminders:false,coverage:true},'Test']);await db.exec('reset role');await db.query("insert into notifications(user_id,link,title,dedupe_key) values($1,'/operations?view=Tasks','Reminder','ops:muted')",[id(13)]);assert.equal((await count("select count(*)::int n from phone_push_private.jobs j join notifications n on n.id=j.notification_id where n.dedupe_key='ops:muted'")).n,0);
 await db.query("insert into notifications(user_id,link,title,dedupe_key) values($1,'/operations?view=Coverage','Coverage','ops:coverage')",[id(13)]);claimed=await signed('claim');assert.equal(claimed.length,1);assert.match(claimed[0].payload.title,/coverage/);
 await signed('finish',{results:[{id:claimed[0].id,lease:claimed[0].lease,status:'retry'}]});assert.equal((await count(`select state,attempts from phone_push_private.jobs where id='${claimed[0].id}'`)).state,'pending');
 // Cancelled work and employees transferred out of the unit do not receive stale alerts.
 await actor(11);await rpc('ops_assign',[id(1),version,{mode:'individual',ids:[id(13)]},new Date(Date.now()+86400000).toISOString(),'Normal','',[],false]);const cancelled=(await rpc('ops_workspace',[id(1)])).assignments.find(a=>a.template_version_id===version&&a.id!==assignment);await rpc('ops_change_assignment',[cancelled.id,cancelled.revision,'Cancelled','QA cancellation']);assert.equal((await signed('claim')).length,0);
 await actor(11);await rpc('ops_assign',[id(1),version,{mode:'individual',ids:[id(13)]},new Date(Date.now()+86400000).toISOString(),'Normal','',[],false]);await db.exec('reset role');await db.query('update hris_users set business_unit_id=$1,department_id=$2 where id=$3',[id(2),id(4),id(13)]);assert.equal((await signed('claim')).length,0);await db.exec('reset role');await db.query('update hris_users set business_unit_id=$1,department_id=$2 where id=$3',[id(1),id(3),id(13)]);
 // Shared device changes cancel queued work for its previous account.
 await actor(14);await rpc('phone_push_save',[sub,null,'Shared phone']);await db.exec('reset role');await db.exec('update phone_push_private.jobs set next_at=now()');assert.equal((await signed('claim')).length,0);assert.equal((await count(`select state from phone_push_private.jobs where id='${claimed[0].id}'`)).state,'cancelled');
 const second=await actor(14).then(()=>rpc('phone_push_status',[sub.endpoint]));const t2=await rpc('phone_push_test',[second.id]).catch(async()=>{await db.exec('reset role');await db.exec("update phone_push_private.jobs set created_at=now()-interval '1 minute' where kind='test'");await actor(14);return rpc('phone_push_test',[second.id]);});
 claimed=await signed('claim',{job_id:t2.job_id});await signed('finish',{results:[{id:t2.job_id,lease:claimed[0].lease,status:'expired'}]});await actor(14);assert.equal((await rpc('phone_push_status',[sub.endpoint])).active,false);
 await rpc('phone_push_save',[sub,null,'Shared phone']);await rpc('phone_push_disable',[sub.endpoint]);assert.equal((await rpc('phone_push_status',[sub.endpoint])).active,false);
 // Revoked auth sessions cannot receive background alerts.
 await rpc('phone_push_save',[sub,null,'Shared phone']);await db.exec('reset role');await db.exec("update phone_push_private.jobs set created_at=now()-interval '1 minute' where kind='test'");await actor(14);const t3=await rpc('phone_push_test',[second.id]);await db.exec('reset role');await db.query('delete from auth.sessions where id=$1',[id(114)]);assert.equal((await signed('claim',{job_id:t3.job_id})).length,0);
 // Status and saved preferences survive reopening the database.
 await db.exec('reset role');await db.close();db=new PGlite(dir);await actor(13);assert.equal(await rpc('phone_push_status',[sub.endpoint]),null);
 console.log('Phone push database passed: authenticated devices, isolation, endpoint validation, replay/expiry/null-signature denial, assignment queue, preferences, snooze suppression, lease/idempotency, retries/expired subscriptions, shared-account changes, logout, revoked sessions, display receipts and persistence.');
}finally{await db.close();rmSync(dir,{recursive:true,force:true});}
