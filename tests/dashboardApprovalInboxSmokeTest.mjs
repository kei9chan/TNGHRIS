import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import {fixture,fixturePlugin,attendanceFixture} from './approvalUiFixtures.mjs';
const require = createRequire(import.meta.url), Module=require('node:module');
globalThis.sessionStorage={getItem:()=>JSON.stringify({filters:{kind:'wfh',search:'stale'},expanded:'wfh',scroll:5000,savedAt:Date.now()})};
globalThis.inboxFixture=fixture; globalThis.attendanceFixture=[attendanceFixture];
const result=await build({stdin:{contents:"import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {MemoryRouter} from 'react-router-dom'; import Inbox from './components/dashboard/ApprovalWidget'; import Center from './pages/ApprovalCenter'; export const render=(center=false)=>renderToStaticMarkup(<MemoryRouter>{center?<Center/>:<Inbox/>}</MemoryRouter>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[fixturePlugin()]});
const mod=new Module(process.cwd()+'/inbox-test.cjs');mod.paths=Module._nodeModulePaths(process.cwd());mod._compile(result.outputFiles[0].text,'inbox-test.cjs');
const html=mod.exports.render(),center=mod.exports.render(true);
for(const [kind,title] of Object.entries({attendance:'Attendance',leave:'Leave',wfh:'WFH',overtime:'Overtime',manpower:'On-call',nte:'NTE',pan:'PAN',requisition:'Job Requisition',award:'Award',offer:'Offer',asset:'Asset Requests',benefit:'Benefit'})){
 assert.match(html,new RegExp('href="/approvals\\?type='+kind+'"'));
 assert.match(html,new RegExp('Review '+title+': '+(kind==='pan'?2:1)+' pending'));
 assert.match(center,new RegExp('aria-label="Toggle '+(kind==='manpower'?'Manpower':kind==='nte'?'NTE Approval':kind==='requisition'?'Job Requisitions':kind==='award'?'Awards':kind==='offer'?'Offer Approval':kind==='benefit'?'Benefit Requests':title)+'"'));
}
assert.match(center,/Showing 13 of 13 pending approvals/);
assert.doesNotMatch(html,/Test Employee|Test Candidate/,'Dashboard must summarize types, not show an employee list');
assert.equal((html.match(/aria-label="Review /g)||[]).length,12);
globalThis.inboxFixture=Object.fromEntries(Object.keys(fixture).map(key=>[key,[]]));globalThis.attendanceFixture=[];
assert.equal(mod.exports.render(),'');
globalThis.inboxFixture.approvalError='Failed';assert.match(mod.exports.render(),/Retry/);
console.log('PASS: all 12 categories in dashboard and center; matching 13-request totals, compact summaries, category links, empty/error queues.');
