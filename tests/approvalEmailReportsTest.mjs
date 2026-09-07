import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = await mkdtemp(join(tmpdir(), 'email-reports-'));
try {
 await build({entryPoints:['server/approvalEmailReports.ts','services/approvalEmailCsv.ts','api/approval-email-settings.ts'],outdir:dir,bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'}});
 const r = await import(pathToFileURL(join(dir,'server/approvalEmailReports.mjs')));
 const c = await import(pathToFileURL(join(dir,'services/approvalEmailCsv.mjs')));
 assert.equal(r.emailProblem({email:'bad'}),'Invalid email format');
 assert.equal(r.emailProblem({email:''}),'Missing email');
 const d = r.enrichDelivery({recipient_email:null,status:'skipped',error_summary:'Inactive or unlinked account'}, {full_name:'Test User',email:'valid@example.com',status:'Inactive',auth_user_id:null});
 assert.equal(d.email_problem,''); assert.equal(d.employee_name,'Test User'); assert.equal(d.recipient_email,null); assert.match(d.suggested_fix,/linkage/);
 const rows = Array.from({length:1201},(_,id)=>({id}));
 assert.equal((await r.allRows(()=>({range:async(a,b)=>({data:rows.slice(a,b+1),error:null})}))).length,1201);
 const csv=c.approvalEmailCsv([{employee_name:'=formula',profile_email:'a,"b',error_summary:'line1\nline2'}]);
 assert.ok(csv.includes('"\'=formula"'));assert.ok(csv.includes('"a,""b"'));assert.ok(csv.includes('"line1\nline2"'));
 const handler=(await import(pathToFileURL(join(dir,'api/approval-email-settings.mjs')))).default;
 const response={setHeader(){},status(n){this.code=n;return this;},json(data){this.data=data;return this;}};
 await handler({method:'GET',headers:{},query:{run:'anything'}},response);
 assert.equal(response.code,401);
 console.log('Email reports: identities, email classification, full pagination, safe CSV and unauthorized access passed.');
} finally {await rm(dir,{recursive:true,force:true});}
