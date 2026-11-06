import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { readFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const root = process.cwd();
// Exercise the real service's filters, ordering, count and page boundaries.
const calls = [], rows = [];
globalThis.personalNteTest = { calls, rows, owner: 'employee', hook: {}, queryError: null };
const serviceBuild = await build({entryPoints:['services/nteService.ts'],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'query-fixture',setup(b){
 b.onResolve({filter:/supabaseClient$/},()=>({path:'fixture',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`
 const f=globalThis.personalNteTest;
 export const supabase={from(table){const q={eqs:[],statuses:[],orders:[]};f.calls.push(q);q.table=table;
 const api={select(columns,options){q.columns=columns;q.options=options;return api;},eq(k,v){q.eqs.push([k,v]);return api;},in(k,v){q.statuses=v;return api;},order(k,v){q.orders.push([k,v]);return api;},range(start,end){q.range=[start,end];let rows=f.rows.filter(r=>q.eqs.every(([k,v])=>r[k]===v)&&q.statuses.includes(r.status));rows.sort((a,b)=>{for(const [k,v] of q.orders){if(a[k]!==b[k])return(a[k]>b[k]?1:-1)*(v.ascending?1:-1);}return 0;});return Promise.resolve({data:rows.slice(start,end+1),count:rows.length,error:f.queryError});}};return api;}};
 `,loader:'js'}));
}}]});
function cjs(code,name){const m=new Module(root+'/'+name+'.cjs');m.filename=root+'/'+name+'.cjs';m.paths=Module._nodeModulePaths(root);m.require=createRequire(m.filename);m._compile(code,m.filename);return m.exports;}
const {fetchPersonalNTEPage}=cjs(serviceBuild.outputFiles[0].text,'personal-nte-service');
const fixture=(id,status='Issued',owner='employee',stage=null)=>({id,recipient_employee_id:owner,recipient_name_snapshot:'Fixture Employee',nte_number:id,created_at:`2026-11-${id.padStart(2,'0')}T04:00:00Z`,status,response_stage:stage,receipt_recorded_at:status==='Issued'?null:'2026-11-01T00:00:00Z'});
rows.push(fixture('01'),fixture('02'),fixture('03'),fixture('04','Response Submitted','employee','For Management Review and Decision'),fixture('05','Hearing Scheduled'),fixture('06','Closed'),fixture('07','PendingApproval'),fixture('08','Issued','other'));
let page=await fetchPersonalNTEPage('employee',{pendingOnly:true,pageSize:3});
assert.deepEqual(page.items.map(n=>n.id),['05','04','03']);assert.equal(page.total,5);assert.equal(calls.at(-1).table,'ntes');assert.deepEqual(calls.at(-1).eqs,[['recipient_employee_id','employee']]);assert.deepEqual(calls.at(-1).range,[0,2]);assert.ok(!calls.at(-1).columns.includes('body'),'Dashboard does not download confidential documents');
assert.equal(page.items[1].responseStage,'For Management Review and Decision');
page=await fetchPersonalNTEPage('employee',{pageSize:3});assert.deepEqual(page.items.map(n=>n.id),['06','05','04']);assert.equal(page.total,6);
assert.deepEqual((await fetchPersonalNTEPage('employee',{page:1,pageSize:3})).items.map(n=>n.id),['03','02','01']);
const countBefore=calls.length;await assert.rejects(fetchPersonalNTEPage(''),/Sign in/);assert.equal(calls.length,countBefore);
globalThis.personalNteTest.queryError={message:'Temporary query failure'};await assert.rejects(fetchPersonalNTEPage('employee'),/Temporary query failure/);globalThis.personalNteTest.queryError=null;
// Render the actual shared dashboard and View all screen, isolating unrelated widgets.
async function render(entry,hook,role='manager'){
 globalThis.personalNteTest.hook={refresh(){},...hook};globalThis.personalNteTest.role=role;
 const result=await build({stdin:{contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {MemoryRouter} from 'react-router-dom';import View from './${entry}';export default renderToStaticMarkup(<MemoryRouter><View/></MemoryRouter>);`,resolveDir:root,loader:'tsx'},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'isolate-personal-ntes',setup(b){
 b.onResolve({filter:/usePersonalNTEs$|useAuth$/},a=>({path:a.path,namespace:'hook'}));
 b.onLoad({filter:/.*/,namespace:'hook'},a=>({contents:a.path.endsWith('useAuth')?`export const useAuth=()=>({user:{id:'employee',name:'Fixture Employee',dashboardType:globalThis.personalNteTest.role}});`:`export const usePersonalNTEs=()=>globalThis.personalNteTest.hook;`,loader:'js'}));
 b.onLoad({filter:/components\/(?:dashboard|attendance|notifications)\/.*\.tsx$|modules\/(?:caseQuestions|payroll\/PayrollApprovalNotice)/},a=>a.path.endsWith('/PersonalNTECard.tsx')?null:({contents:`export const CaseFollowups=()=>null;export default ()=>null;`,loader:'js'}));
 }}]});return cjs(result.outputFiles[0].text,'personal-nte-render').default;
}
const state={items:(await fetchPersonalNTEPage('employee',{pendingOnly:true,pageSize:3})).items,total:5,loading:false,error:''};
for(const role of ['employee','manager','hr','executive','admin','admin_it']){
 const html=await render('pages/Dashboard.tsx',state,role);assert.match(html,/My pending NTEs/,role);assert.equal((html.match(/View notice and case status/g)||[]).length,3,role);assert.match(html,/\/feedback\/my-ntes/);assert.match(html,/\/feedback\/nte\/04/);assert.match(html,/For Management Review and Decision/);assert.doesNotMatch(html,/\/feedback\/nte\/(06|07|08)/);assert.ok(html.indexOf('My pending NTEs')<html.indexOf('Latest three shown')||html.includes('Latest three shown'));
}
let html=await render('pages/Dashboard.tsx',{...state,items:[],total:0,error:'Network offline'});assert.match(html,/role="alert"/);assert.match(html,/Refresh NTEs/);assert.doesNotMatch(html,/No pending NTEs\./);
html=await render('pages/Dashboard.tsx',{...state,items:[],total:0,loading:true});assert.match(html,/Loading your NTEs/);assert.doesNotMatch(html,/No pending NTEs\./);
html=await render('pages/feedback/MyNTEs.tsx',{...state,items:(await fetchPersonalNTEPage('employee')).items,total:6});assert.match(html,/Case closed/);assert.match(html,/For Management Review and Decision/);assert.match(html,/Published — awaiting receipt/);assert.match(html,/Starts from documented receipt/);assert.match(html,/View notice and case details/);
console.log('PASS: own published records, latest three open cases, response/hearing visibility, history and pagination, safe errors, all six dashboard types, receipt-aware status and links.');
