import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
const t = { slots: [], cursor: 0, effects: [], pending: [], filters: [] };
globalThis.__panAccessTest = t;
const react = `const t=globalThis.__panAccessTest;export const useState=v=>{const i=t.cursor++;if(!(i in t.slots))t.slots[i]=v;return [t.slots[i],v=>t.slots[i]=typeof v==='function'?v(t.slots[i]):v];};export const useEffect=f=>t.effects.push(f);export default {createElement:(type,props,...children)=>({type,props,children})};`;
const client = `const t=globalThis.__panAccessTest;export const supabase={from:table=>{t.filters.push(['table',table]);const q={select:v=>(t.filters.push(['select',v]),q),contains:(k,v)=>(t.filters.push([k,v]),q),limit:v=>q,eq:(k,v)=>(t.filters.push([k,v]),q),then:(resolve,reject)=>new Promise(r=>t.pending.push(r)).then(resolve,reject)};return q;}};`;
const {outputFiles}=await build({entryPoints:['components/auth/AssignedPanAccess.tsx'],bundle:true,write:false,platform:'node',format:'esm',tsconfigRaw:{compilerOptions:{jsx:'react'}},plugins:[{name:'mocks',setup(b){b.onResolve({filter:/^react$|services\/supabaseClient$/},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='react'?react:client}));}}]});
const {default:Guard}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const child={page:'PAN'};
const render=(userId='manager',requestId='assigned')=>{t.cursor=0;t.effects=[];return Guard({userId,requestId,children:child});};
const flush=()=>new Promise(r=>setImmediate(r));
async function check(result,expected) {
 t.slots=[];t.filters=[];render();const cleanup=t.effects[0]();await flush();t.pending.shift()(result);await flush();assert.equal(render()===child,expected);cleanup();
 assert.deepEqual(t.filters,[['table','pans'],['select','id'],['routing_steps',[{userId:'manager'}]],['id','assigned']]);
}
await check({data:[{id:'assigned'}],error:null},true);
await check({data:[],error:null},false);
await check({data:null,error:{message:'offline'}},false);
t.slots=[];render();const cleanup=t.effects[0]();await flush();cleanup();t.pending.shift()({data:[{id:'assigned'}],error:null});await flush();assert.notEqual(render(),child,'Discard results after unmount/account change');
const app=readFileSync('App.tsx','utf8');assert.ok(app.includes("location.pathname === '/employees/pan'"));assert.ok(app.includes('key={`${user.id}:${legacyRequestId'));
assert.ok(app.indexOf('if (authorizationError || !effectiveRbac?.authorized)')<app.indexOf('return <AssignedPanAccess'));
console.log('PASS assigned PAN access, unassigned denial, fail-closed errors, stale results, authenticated route guard.');
