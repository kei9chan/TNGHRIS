import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
let now=0,id=0;
const timers=new Map();
const setTimeout=(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id;};
const clearTimeout=id=>timers.delete(id);
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
const advance=async ms=>{now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn();}await flush();};
const common={setTimeout,clearTimeout,AbortController,window:{setTimeout},URL,Request,Response,performance:{now:()=>now}};
const compile=path=>ts.transpileModule(readFileSync(path,'utf8').replaceAll('import.meta.env','({})'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const deadline={exports:{}};
vm.runInNewContext(compile('services/authDeadline.ts'),{...common,exports:deadline.exports});
const client={exports:{}};
vm.runInNewContext(compile('services/supabaseClient.ts'),{...common,exports:client.exports,require:name=>name==='./authDeadline'?deadline.exports:name==='./performanceTelemetry'?{recordRequestTiming(){}}:{createClient:()=>({})}});
let signal,calls=0;
const hung=client.exports.boundedAuthRead(s=>{signal=s;calls++;return new Promise(()=>{});});
const rejected=assert.rejects(hung,e=>e.code==='authorization_timeout');
await advance(12000);await rejected;
assert.equal(signal.aborted,true);assert.equal(calls,1);
// Timeout during retry backoff must not launch another request.
calls=0;
const retry=client.exports.boundedAuthRead(s=>{signal=s;calls++;return new Promise(resolve=>setTimeout(()=>resolve({error:{status:503}}),11900));});
const retryRejected=assert.rejects(retry,e=>e.code==='authorization_timeout');
await flush();await advance(11900);await advance(100);await retryRejected;await advance(1000);
assert.equal(calls,1);assert.equal(signal.aborted,true);
const ok=await client.exports.boundedAuthRead(async()=>({data:'verified',error:null}));
assert.equal(ok.data,'verified');assert.equal(timers.size,0);
console.log('PASS: timeout aborts reads, retries stop after deadline, successful reads clear timers.');

// Receiving headers is not completion: an auth JSON body can stall while the
// SDK holds its session lock. Its deadline must abort the body, too.
let transport = async (_input, init) => new Response(new ReadableStream({
  start(controller) {
    init.signal.addEventListener('abort', () => controller.error(init.signal.reason), {once:true});
  }
}), {status:200,headers:{'Content-Type':'application/json'}});
const bodyDeadline={exports:{}};
vm.runInNewContext(compile('services/authDeadline.ts'),{...common,exports:bodyDeadline.exports,fetch:(...args)=>transport(...args)});
const stalledBody=bodyDeadline.exports.fetchWithAuthTimeout('https://example.invalid/auth/v1/token');
const bodyRejected=assert.rejects(stalledBody,e=>e.code==='authorization_timeout');
await flush();await advance(10000);await bodyRejected;
transport=async()=>new Response(JSON.stringify({error:'invalid_credentials'}),{status:400,headers:{'X-Test':'preserved'}});
const response=await bodyDeadline.exports.fetchWithAuthTimeout('https://example.invalid/auth/v1/token');
assert.equal(response.status,400);assert.equal(response.headers.get('X-Test'),'preserved');
assert.deepEqual(await response.json(),{error:'invalid_credentials'});
assert.equal(timers.size,0);
console.log('PASS: stalled auth response body aborts at 10 seconds; complete bodies preserve JSON, status and headers.');
