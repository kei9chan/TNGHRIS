// Local-only integration: actual Supabase SDK and Chromium Web Locks, with fake
// auth responses. No production credentials or employee sessions are used.
import assert from 'node:assert/strict';
import http from 'node:http';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const sources={baseline:"import {createClient} from '@supabase/supabase-js';window.client=createClient('https://example.invalid','test-key');",fixed:"import {supabase} from './services/supabaseClient';window.client=supabase;"};
const bundles={};
for(const [key,contents] of Object.entries(sources)){
  const result=await build({stdin:{contents,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'iife',platform:'browser',define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('https://example.invalid'),'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('test-key')}});
  bundles[key]=result.outputFiles[0].text;
}
const server=http.createServer((req,res)=>{
  const key=req.url?.slice(1);
  res.setHeader('Content-Type',key?.endsWith('.js')?'text/javascript':'text/html');
  res.end(key?.endsWith('.js')?bundles[key.slice(0,-3)]:`<!doctype html><script src="/${key}.js"></script>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({executablePath:process.env.TNG_TEST_CHROMIUM||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const holder=await context.newPage();await holder.goto(`http://127.0.0.1:${server.address().port}/blank`);
  await holder.evaluate(()=>{window.held=false;void navigator.locks.request('lock:sb-example-auth-token',async()=>{window.held=true;await new Promise(()=>{});}).catch(()=>{});});
  await holder.waitForFunction(()=>window.held);
  const old=await context.newPage();await old.goto(`http://127.0.0.1:${server.address().port}/baseline`);
  assert.equal(await old.evaluate(()=>Promise.race([window.client.auth.getSession().then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),300))])),false,'Old SDK startup remains blocked behind another tab');
  await old.close();
  const page=await context.newPage();let passwordRequests=0,refreshRequests=0;
  await page.route('https://example.invalid/auth/v1/**',async route=>{
    const body=route.request().postDataJSON();
    if(route.request().url().includes('grant_type=refresh_token'))refreshRequests++;else passwordRequests++;
    if(body.password!=='fixture-password'&&body.refresh_token!=='fixture-refresh-token')return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'invalid_grant',error_code:'invalid_credentials',msg:'Invalid login credentials'})});
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({access_token:'fixture-access-token',refresh_token:'fixture-refresh-token',token_type:'bearer',expires_in:3600,user:{id:'fixture-user',email:'fixture@example.invalid'}})});
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/fixed`);
  const session=await page.evaluate(async()=>{const result=await window.client.auth.getSession();return {error:!!result.error,session:result.data.session};});
  assert.deepEqual(session,{error:false,session:null});
  const locked=await holder.evaluate(()=>navigator.locks.query());assert.equal(locked.held.some(lock=>lock.name==='lock:sb-example-auth-token'),false);
  const denied=await page.evaluate(async()=>{const result=await window.client.auth.signInWithPassword({email:'fixture@example.invalid',password:'wrong'});return {user:result.data.user,error:!!result.error};});
  assert.deepEqual(denied,{user:null,error:true});
  const signedIn=await page.evaluate(async()=>{const result=await window.client.auth.signInWithPassword({email:'fixture@example.invalid',password:'fixture-password'});const reads=await Promise.all([window.client.auth.getSession(),window.client.auth.getSession()]);return {error:!!result.error,users:reads.map(r=>r.data.session?.user.id)};});
  assert.deepEqual(signedIn,{error:false,users:['fixture-user','fixture-user']});assert.equal(passwordRequests,2);
  await page.evaluate(async()=>{await window.client.auth.stopAutoRefresh();const {data}=await window.client.auth.getSession();localStorage.setItem('sb-example-auth-token',JSON.stringify({...data.session,expires_at:Math.floor(Date.now()/1000)-60}));});
  await page.reload();
  assert.equal(await page.evaluate(async()=>(await window.client.auth.getSession()).data.session?.user.id),'fixture-user');
  assert.equal(refreshRequests,1,'An expired saved session is refreshed once on reopening');
  await context.close();
  console.log('PASS: actual SDK reproduces old startup hang; fixed client recovers cross-tab lock, reaches sign-in, rejects bad credentials, serves concurrent reads, and restores an expired saved session.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
