import assert from 'node:assert/strict';
import {build} from 'esbuild';
import Module,{createRequire} from 'node:module';
const h={owner:'first',state:[],index:0,effects:[],pendingEffects:[],requests:[],listeners:new Map(),timers:new Set()};
globalThis.personalNteRefresh=h;
const events={addEventListener:(name,fn)=>h.listeners.set(name,fn),removeEventListener:(name,fn)=>{if(h.listeners.get(name)===fn)h.listeners.delete(name);}};
globalThis.window={...events,setInterval:fn=>{h.timers.add(fn);return fn;},clearInterval:fn=>h.timers.delete(fn)};
globalThis.document={...events,visibilityState:'visible'};
const result=await build({entryPoints:['hooks/usePersonalNTEs.ts'],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'isolated-hooks',setup(b){
 b.onResolve({filter:/^react$|useAuth$|nteService$/},a=>({path:a.path,namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},a=>({loader:'js',contents:a.path==='react'?`
 const h=globalThis.personalNteRefresh;
 export const useState=value=>{const i=h.index++;if(!(i in h.state))h.state[i]=typeof value==='function'?value():value;return[h.state[i],next=>h.state[i]=typeof next==='function'?next(h.state[i]):next];};
 export const useEffect=(fn,deps)=>{const i=h.index++;const previous=h.effects[i];if(!previous||deps.some((d,j)=>d!==previous.deps[j])){h.pendingEffects.push(()=>{previous?.cleanup?.();h.effects[i]={deps,cleanup:fn()};});}};
 `:a.path.endsWith('useAuth')?`export const useAuth=()=>({user:globalThis.personalNteRefresh.owner?{id:globalThis.personalNteRefresh.owner}:null});`:`export const fetchPersonalNTEPage=(owner,options)=>new Promise((resolve,reject)=>globalThis.personalNteRefresh.requests.push({owner,options,resolve,reject}));`}));
}}]});
const mod=new Module(process.cwd()+'/personal-nte-hook.cjs');mod.filename=process.cwd()+'/personal-nte-hook.cjs';mod.paths=Module._nodeModulePaths(process.cwd());mod.require=createRequire(mod.filename);mod._compile(result.outputFiles[0].text,mod.filename);
const render=()=>{h.index=0;return mod.exports.usePersonalNTEs({pendingOnly:true,pageSize:3});};
const effects=()=>{h.pendingEffects.splice(0).forEach(fn=>fn());};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
let state=render();assert.equal(state.loading,true);effects();assert.equal(h.requests[0].owner,'first');
h.owner='second';state=render();assert.deepEqual(state.items,[],'Previous account cannot be shown even before effects run');effects();assert.equal(h.requests[1].owner,'second');
h.requests[1].resolve({items:[{id:'second-notice'}],total:1});await flush();h.requests[0].resolve({items:[{id:'first-notice'}],total:1});await flush();state=render();assert.deepEqual(state.items,[{id:'second-notice'}],'Late response from a former account must be ignored');
assert.equal(h.timers.size,1);const count=h.requests.length;document.visibilityState='hidden';[...h.timers][0]();assert.equal(h.requests.length,count,'Hidden tabs do not poll');
document.visibilityState='visible';h.listeners.get('focus')();assert.equal(h.requests.length,count+1);h.requests.at(-1).reject(new Error('Connection lost'));await flush();state=render();assert.equal(state.error,'Connection lost');assert.equal(state.total,1,'Refresh failure must not pretend there are no cases');
state.refresh();render();effects();h.requests.at(-1).resolve({items:[{id:'new-notice'}],total:2});await flush();state=render();assert.equal(state.error,'');assert.equal(state.total,2);
h.owner=null;state=render();assert.deepEqual(state.items,[]);effects();assert.equal(h.timers.size,0);assert.equal(h.listeners.size,0,'Sign-out removes refresh listeners and timers');
console.log('PASS: account-switch privacy, stale-response cancellation, visible-tab refresh, hidden-tab pause, retry and sign-out cleanup.');
