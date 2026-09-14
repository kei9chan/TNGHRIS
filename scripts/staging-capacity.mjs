// Synthetic-account API exercise for the existing staging project only.
// Usage: STAGING_ANON_KEY=... STAGING_ACCOUNTS_FILE=/private/accounts.json node scripts/staging-capacity.mjs
// Accounts file: [{"email":"...","password":"..."}]. Never commit this file.
import {readFile} from 'node:fs/promises';
const ref=process.env.STAGING_PROJECT_REF||'suxncpnerzfkjhkhjwbd';
if(ref!=='suxncpnerzfkjhkhjwbd')throw Error('Refusing target: only the verified payroll-staging project is allowed.');
if(process.argv.includes('--check-guard')){console.log('Staging-only guard passed; no requests sent.');process.exit(0);}
const key=process.env.STAGING_ANON_KEY,path=process.env.STAGING_ACCOUNTS_FILE;
if(!key||!path)throw Error('Provide a staging anon key and synthetic-account file.');
const accounts=JSON.parse(await readFile(path,'utf8'));
if(!Array.isArray(accounts)||accounts.length<150||accounts.some(a=>typeof a.email!=='string'||typeof a.password!=='string'))throw Error('150 distinct synthetic staging accounts are required.');
if(new Set(accounts.map(a=>a.email)).size!==accounts.length)throw Error('Synthetic accounts must be distinct.');
const results=[];
async function request(operation,path,body,token=key){
 const started=performance.now();
 try{
  const r=await fetch(`https://${ref}.supabase.co/${path}`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),headers:{apikey:key,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await r.json();results.push({operation,durationMs:performance.now()-started,status:r.status});
  if(!r.ok)throw Error(`${operation} failed (${r.status})`);
  return data;
 }catch(e){if(e.name==='TimeoutError')results.push({operation,durationMs:performance.now()-started,status:0});throw e;}
}
// Fail before a burst if one account cannot traverse the current access/attendance path.
async function actor(account){
 const auth=await request('login','auth/v1/token?grant_type=password',{email:account.email,password:account.password});
 const token=auth.access_token;if(!token)throw Error('Staging login returned no token.');
 const [profile,access]=await Promise.all([
  request('profile','rest/v1/rpc/get_my_hris_bootstrap',{},token),
  request('permissions','rest/v1/rpc/get_my_effective_rbac',{},token),
 ]);
 if(!profile||!access?.authorized)throw Error('Staging account is not authorized; stop before capacity testing.');
 await request('attendance','rest/v1/rpc/get_my_attendance',{},token);
 // No save endpoint: this runner measures login/read capacity, not write capacity.
}
try{
 await actor(accounts[0]);
 for(const size of [10,25,50,150]){
  let failed=0;
  await Promise.all(accounts.slice(0,size).map(async(a,i)=>{
   await new Promise(r=>setTimeout(r,i*200));
   try{await actor(a);}catch{failed++;}
  }));
  console.log(JSON.stringify({stage:size,failed}));
  if(failed)throw Error('Stopped ramp after staging failures.');
 }
}finally{
 for(const operation of ['login','profile','permissions','attendance']){
  const rows=results.filter(r=>r.operation===operation),times=rows.map(r=>r.durationMs).sort((a,b)=>a-b);
  if(times.length)console.log(JSON.stringify({operation,count:rows.length,errors:rows.filter(r=>r.status===0||r.status>=400).length,p50Ms:Math.round(times[Math.ceil(times.length*.5)-1]),p95Ms:Math.round(times[Math.ceil(times.length*.95)-1])}));
 }
}
