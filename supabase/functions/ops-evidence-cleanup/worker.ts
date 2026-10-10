interface Runtime {url:string;key:string;fetch:typeof fetch}
export function createCleanupHandler(runtime:Runtime){
 const {url,key}=runtime;const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
 const rpc=async(name:string,args:Record<string,unknown>)=>{const r=await runtime.fetch(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers,body:JSON.stringify(args),signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error(`Cleanup RPC ${name} returned ${r.status}`);const body=await r.text();return body.trim()?JSON.parse(body):null;};
 return async(request:Request):Promise<Response>=>{
  if(request.method!=='POST')return new Response('Method not allowed',{status:405});
  const token=request.headers.get('x-ops-cleanup-token');if(!token||!url||!key)return new Response('Unauthorized',{status:401});
  let authorized=false;
  try{
   authorized=await rpc('ops_cleanup_authorize',{p_token:token})===true;if(!authorized)return new Response('Unauthorized',{status:401});
   // Bucket setup uses the Storage API and is idempotent. Never modify Storage metadata with SQL.
   const bucket=await runtime.fetch(`${url}/storage/v1/bucket/ops-evidence`,{headers,signal:AbortSignal.timeout(10000)});
   const lookup= bucket.status===400 ? await bucket.clone().json().catch(()=>({})) : null;
   const missing=bucket.status===404||(bucket.status===400&&(String(lookup?.statusCode)==='404'||lookup?.message==='Bucket not found'));
   if(missing){const created=await runtime.fetch(`${url}/storage/v1/bucket`,{method:'POST',headers,body:JSON.stringify({id:'ops-evidence',name:'ops-evidence',public:false,file_size_limit:512000,allowed_mime_types:['image/jpeg']}),signal:AbortSignal.timeout(10000)});if(!created.ok&&created.status!==409)throw new Error(`Evidence bucket creation returned ${created.status}`);}
   else if(!bucket.ok)throw new Error(`Evidence bucket lookup returned ${bucket.status}`);
   else {const config=await bucket.json();if(config.public===true||Number(config.file_size_limit)!==512000||!Array.isArray(config.allowed_mime_types)||config.allowed_mime_types.length!==1||config.allowed_mime_types[0]!=='image/jpeg')throw new Error('Evidence bucket configuration is unsafe');}
   const rows=await rpc('ops_cleanup_batch',{}) as {id:string;path:string}[];
   let deleted=0,failed=0;
   // Bounded concurrency: no unbounded fan-out and no SQL-only object deletion.
   for(let i=0;i<rows.length;i+=20){const group=rows.slice(i,i+20);await Promise.all(group.map(async e=>{
    if(!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.jpg$/.test(e.path)){failed++;await rpc('ops_cleanup_record',{p_id:e.id,p_error:'Invalid evidence path'});return;}
    try {const r=await runtime.fetch(`${url}/storage/v1/object/ops-evidence`,{method:'DELETE',headers,body:JSON.stringify({prefixes:[e.path]}),signal:AbortSignal.timeout(10000)});if(!r.ok&&r.status!==404)throw new Error(`Storage deletion returned ${r.status}`);await rpc('ops_cleanup_record',{p_id:e.id,p_error:null});deleted++;}
    catch(error){failed++;await rpc('ops_cleanup_record',{p_id:e.id,p_error:error instanceof Error?error.message:'Storage deletion failed'});}
   }));}
   await rpc('ops_cleanup_finished',{p_error:failed?`${failed} deletions failed; retry scheduled`:null});
   return Response.json({ok:failed===0,deleted,failed},{status:failed?503:200});
  }catch(e){if(authorized)try{await rpc('ops_cleanup_finished',{p_error:e instanceof Error?e.message:'Cleanup failed'});}catch{}return Response.json({ok:false,error:'Evidence cleanup failed; retry scheduled'},{status:503});}
 };
}
