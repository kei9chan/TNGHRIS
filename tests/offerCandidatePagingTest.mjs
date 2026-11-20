import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import Module,{createRequire} from 'node:module';
const rows=Array.from({length:1203},(_,n)=>({id:String(n).padStart(6,'0')}));
globalThis.offerPaging={rows,calls:0,fail:false};
const bundle=await build({entryPoints:['services/recruitmentRows.ts'],bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'transport',setup(b){b.onResolve({filter:/supabaseClient$/},()=>({path:'db',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:`export const supabase={from(){let cursor='';let count=500;const q={select(){return q},order(){return q},limit(n){count=n;return q},gt(_,id){cursor=id;return q},then(resolve){const h=globalThis.offerPaging;h.calls++;return Promise.resolve(h.fail?{data:null,error:{message:'denied'}}:{data:h.rows.filter(r=>!cursor||r.id>cursor).slice(0,count),error:null}).then(resolve)}};return q}};`}));}}]});
const filename=process.cwd()+'/paging-fixture.cjs';const mod=new Module(filename);mod.filename=filename;mod.paths=Module._nodeModulePaths(process.cwd());mod.require=createRequire(filename);mod._compile(bundle.outputFiles[0].text,filename);
for(const table of ['job_candidates','job_applications','job_requisitions']) {globalThis.offerPaging.calls=0;const actual=await mod.exports.fetchRecruitmentRows(table);assert.equal(actual.length,1203);assert.equal(actual.at(-1).id,'001202');assert.equal(globalThis.offerPaging.calls,4);}
globalThis.offerPaging.fail=true;await assert.rejects(()=>mod.exports.fetchRecruitmentRows('job_candidates'),/denied/);
const page=await readFile('pages/recruitment/Offers.tsx','utf8');for(const table of ['job_candidates','job_applications','job_requisitions'])assert.ok(page.includes(`fetchRecruitmentRows<any>('${table}')`));
console.log('PASS: Offers loads all three lookup tables beyond 1,000 rows and surfaces access/load failures.');
