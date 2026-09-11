const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('supabase/functions/password-management/index.ts','utf8').replace(/^import .*;$/gm,'');
const compiled = ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
async function scenario(options={}) {
 let handler, sends=0, generated=0; const updates=[];
 const profile={id:'employee',auth_user_id:'auth-employee',status:'Active',email:'employee@example.com'};
 const client={from(table){let operation='select',filter={};const q={select(){return q},eq(k,v){filter[k]=v;return q},in(){return q},order(){return q},limit(){return q},single(){return q},update(v){operation='update';updates.push(v);return q},insert(){operation='insert';return q},then(resolve){let data=[];if(operation==='select'){
 if(table==='user_roles')data=[{user_id:'hr',role_id:'HR Manager'}];
 if(table==='gmail_connections')data=[{user_id:'auth-hr',google_email:'hr@example.com',granted_scopes:['gmail.send']}];
 if(table==='hris_users') data=filter.email?(options.unknown?[]:[{...profile,status:options.inactive?'Inactive':'Active'}]):[{id:'hr',auth_user_id:'auth-hr'}];
 }return Promise.resolve({data,error:null}).then(resolve)}};return q;},rpc(){return Promise.resolve({data:options.throttled?null:'request-1',error:null})},auth:{admin:{async getUserById(){return {data:{user:{id:options.mismatch?'other':'auth-employee',email:options.mismatch?'other@example.com':'employee@example.com'}},error:null}},async generateLink(){generated++;return {data:{user:{id:'auth-employee'},properties:{action_link:'https://auth.example.test/recovery?token=SECRET'}},error:null}}}}};
 const env = key => ({
   SUPABASE_URL:'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY:'service', SUPABASE_ANON_KEY:'anon',
   RESEND_API_KEY: options.noResend ? '' : 'resend-secret', APPROVAL_EMAIL_FROM: options.noResend ? '' : 'TNG HRIS <hr@example.com>',
   RESEND_FROM_EMAIL: '',
 }[key]);
 const fetchMock = async () => { sends++; if (options.sendFailure) return new Response(JSON.stringify({error:'provider'}), {status:500}); return new Response(JSON.stringify({id:'resend-id'}), {status:200}); };
 const sandbox={Request,Response,TextEncoder,Uint8Array,Date,Set,Error,crypto:require('node:crypto').webcrypto,console:{error(){}},fetch:fetchMock,Deno:{env:{get:env},serve(fn){handler=fn}},createClient:()=>client,hasExactGmailSendScope:()=>true,decryptRefreshToken:async()=> 'private',refreshAccessToken:async()=>{if(options.senderFailure)throw Error('secret error');return {accessToken:'private'}},sendGmailMessage:async()=>{sends++;if(options.sendFailure)throw Error('private response');return {messageId:'mail-id'}}};
 vm.runInNewContext(compiled,sandbox);
 const response=await handler(new Request('https://example.test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'request_reset',email:options.invalid?'invalid':' Employee@Example.com '})}));
 const body=await response.text(); assert(!body.includes('SECRET'));assert(!body.includes('private'));return {status:response.status,body,sends,generated,updates};
}
(async()=>{
 const ok=await scenario();assert.equal(ok.status,200);assert.equal(ok.sends,1);assert(ok.updates.some(x=>x.outcome==='provider_accepted'));
 const unknown=await scenario({unknown:true});assert.equal(unknown.body,ok.body);assert.equal(unknown.generated,0);
 const inactive=await scenario({inactive:true});assert.equal(inactive.body,ok.body);assert.equal(inactive.generated,0);
 const mismatch=await scenario({mismatch:true});assert.equal(mismatch.body,ok.body);assert.equal(mismatch.generated,0);
 const failed=await scenario({sendFailure:true});assert.equal(failed.body,ok.body);assert(failed.updates.some(x=>x.failure_code==='resend_send_failed'));
 const gmail=await scenario({noResend:true});assert.equal(gmail.status,200);assert.equal(gmail.sends,1);
 const gmailOutage=await scenario({noResend:true,senderFailure:true});assert.equal(gmailOutage.status,200);assert(gmailOutage.body,ok.body);assert(gmailOutage.updates.some(x=>x.failure_code==='gmail_provider_unavailable'));
 const outage=await scenario({noResend:true,senderFailure:true});assert.equal(outage.status,200);assert.equal(outage.generated,1);
 assert.equal((await scenario({throttled:true})).status,429);
 assert.equal((await scenario({invalid:true})).status,400);
 console.log('PASS: normalized email, recovery delivery, unknown/disabled/mismatch non-enumeration, delivery failure audit, sender outage, throttling, invalid input, no token exposure');
})().catch(e=>{console.error(e);process.exit(1)});
