import assert from 'node:assert/strict';
import {createCleanupHandler} from '../supabase/functions/ops-evidence-cleanup/worker.ts';
const rows=[{id:'1',path:'00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002.jpg'},{id:'2',path:'00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000003.jpg'}];
let fail=true;const records=[],deletions=[],finished=[];let calls=0,bucketCreated=false;
const worker=createCleanupHandler({url:'https://test.invalid',key:'server-only-key',fetch:async(url,opts)=>{calls++;const body=opts.body?JSON.parse(opts.body):{};
 if(url.endsWith('ops_cleanup_authorize'))return Response.json(body.p_token==='valid-worker-token');
 if(url.endsWith('/bucket/ops-evidence'))return bucketCreated?Response.json({public:false,file_size_limit:512000,allowed_mime_types:['image/jpeg']}):Response.json({statusCode:'404',error:'Bucket not found',message:'Bucket not found'},{status:400});
 if(url.endsWith('/bucket')){assert.equal(body.public,false);assert.equal(body.file_size_limit,512000);bucketCreated=true;return Response.json({});}
 if(url.endsWith('ops_cleanup_batch'))return Response.json(rows);
 if(url.endsWith('/object/ops-evidence')){assert.equal(opts.method,'DELETE');deletions.push(body.prefixes);return new Response('{}',{status:fail&&body.prefixes[0]===rows[1].path?503:200});}
 if(url.endsWith('ops_cleanup_record')){records.push(body);return new Response(null,{status:204});}
 if(url.endsWith('ops_cleanup_finished')){finished.push(body);return new Response(null,{status:204});}throw new Error('Unexpected request '+url);
}});
assert.equal((await worker(new Request('https://worker.invalid',{method:'GET'}))).status,405);
assert.equal((await worker(new Request('https://worker.invalid',{method:'POST'}))).status,401);assert.equal(calls,0);
assert.equal((await worker(new Request('https://worker.invalid',{method:'POST',headers:{'x-ops-cleanup-token':'invalid'}}))).status,401);assert.equal(calls,1);
let r=await worker(new Request('https://worker.invalid',{method:'POST',headers:{'x-ops-cleanup-token':'valid-worker-token'}}));assert.equal(r.status,503);assert.deepEqual(await r.json(),{ok:false,deleted:1,failed:1});assert.equal(records.find(x=>x.p_id==='1').p_error,null);assert.match(records.find(x=>x.p_id==='2').p_error,/503/);assert.ok(finished[0].p_error);assert.equal(deletions.length,2);
fail=false;r=await worker(new Request('https://worker.invalid',{method:'POST',headers:{'x-ops-cleanup-token':'valid-worker-token'}}));assert.equal(r.status,200);assert.equal(finished[1].p_error,null);assert.equal(records.filter(x=>x.p_error===null).length,3);
console.log('Cleanup worker passed: private bucket via API, custom authentication, actual object deletion, recorded failure/retry and success, no client credentials or SQL-only deletions.');
