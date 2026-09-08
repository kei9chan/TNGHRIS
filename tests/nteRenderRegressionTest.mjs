// Exercise the real components at their post-fetch render state, without live HR mutations.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
const receipt={nte_id:'test-case',received_at:'2026-09-08T10:00:00Z',deadline_exclusive:'2026-09-13T16:00:00Z'};
const decision={id:'test-decision',status:'Pending Approval',resolution_type:'Written Warning',review_fields:null,approver_steps:null};
const scenarios=[
 ['unissued','NTEWorkflowPanel',{published:false,events:[]},/Pending issuance/],
 ['awaiting receipt','NTEWorkflowPanel',{published:true,isRecipient:true,receipt:{nte_id:null,received_at:null,deadline_exclusive:null},events:null},/Acknowledge receipt and reply/],
 ['reply window','NTEWorkflowPanel',{published:true,isRecipient:true,receipt,canRespond:true,events:[]},/Written explanation due/],
 ['non-submission','NTEWorkflowPanel',{published:true,receipt:{...receipt,closed_at:'2026-09-14',non_submission_notice:'No response received'},events:[]},/No Response/],
 ['null decision','NoticeDecision',{decision:null},/No issued decision/],
 ['SQL null composite','NoticeDecision',{decision:{id:null,status:null,review_fields:null,approver_steps:null}},/No issued decision/],
 ['legacy decision','NoticeDecision',{decision},/Not recorded/],
 ['review draft','NoticeDecision',{canReview:true,decision:{...decision,status:'Draft'}},/Send for approval/],
 ['approver','NoticeDecision',{canApprove:true,decision},/Approve decision/],
 ['employee acknowledgment','NoticeDecision',{isEmployee:true,decision:{...decision,status:'Pending Acknowledgement'}},/Acknowledge Notice of Decision/],
 ['suspension','NoticeDecision',{canReview:true,decision:{...decision,resolution_type:'Suspension'},implementation:{resolution_id:'test-decision',schedule_status:'TBA',status:'Decision Issued',scheduled_dates:[]}},/Confirm and send schedule/],
 ['ATD','NoticeDecision',{isEmployee:true,decision,implementation:{resolution_id:'test-decision',atd:{reference:'TEST-ATD',total:100,perCutoff:50,installments:2}}},/Sign Authority to Deduct/],
];
for(const [name,component,state,expected] of scenarios){
 const rpc=component==='NoticeDecision'?'get_nod_workflow':'get_nte_response_workflow';
 const result=await build({stdin:{contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {ThemeProvider} from './context/ThemeContext';import C from './modules/nte/${component}';export default renderToStaticMarkup(<ThemeProvider><C nte={{id:'test-case',employeeResponse:''}} nteId="test-case" refresh={0} onChanged={()=>{}}/></ThemeProvider>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'esm',packages:'external',plugins:[{name:'post-fetch-state',setup(b){
  b.onLoad({filter:new RegExp('modules/nte/'+component+'\\.tsx$')},async args=>({contents:`import {normalizeWorkflow} from './workflow';\n`+(await readFile(args.path,'utf8')).replace('useState<any>(null)',`useState<any>(normalizeWorkflow('${rpc}',${JSON.stringify(state)}))`),loader:'tsx'}));
  b.onLoad({filter:/services\/supabaseClient.ts$/},()=>({contents:'export const supabase={};',loader:'ts'}));
 }}]});
 // Resolve external React relative to this repository, not a data URL.
 const {createRequire}=await import('node:module');const require=createRequire(import.meta.url);
 const code=result.outputFiles[0].text.replace(/from "(react(?:-dom\/server|\/jsx-runtime)?)"/g,(_,pkg)=>`from ${JSON.stringify('file://'+require.resolve(pkg))}`);
 let html;try{html=(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;}catch(error){console.error(name,error.message);process.exit(1);}
 assert.match(html,expected,name);console.log('PASS render:',name);
}
