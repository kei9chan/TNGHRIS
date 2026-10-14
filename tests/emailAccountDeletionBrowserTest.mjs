// Actual User Management, request/review dialogs, dashboard widget and new SQL
// workflow. Only authentication transport and managed Auth deletion are fixtures.
import assert from 'node:assert/strict';
import http from 'node:http';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {createEmailDeletionFixture,id} from './emailAccountDeletionFixture.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const {db,actor,rpc}=await createEmailDeletionFixture();
let latestRequest,queue=Promise.resolve();
const mockQueues="pendingLeaveApprovals:[],pendingWfhApprovals:[],pendingOtApprovals:[],pendingManpowerApprovals:[],pendingNTEApprovals:[],pendingPANApprovals:[],pendingRequisitionApprovals:[],pendingAwardApprovals:[],pendingOfferApprovals:[],pendingAssetApprovals:[],pendingBenefitApprovals:[],pendingPayPackageApprovals:[]";
const result=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter} from 'react-router-dom';import Users from './pages/admin/UserManagement';import Widget from './components/dashboard/ApprovalWidget';const n=new URLSearchParams(location.search).get('actor');window.fixtureActor=n==='kay'?10:n==='other'?12:11;window.fixtureUser={id:'00000000-0000-4000-8000-'+String(window.fixtureActor).padStart(12,'0'),role:window.fixtureActor===11?'HR Manager':'Board of Director',roles:[window.fixtureActor===11?'HR Manager':'Board of Director']};createRoot(document.getElementById('root')).render(<BrowserRouter><Widget/><Users/></BrowserRouter>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,platform:'browser',format:'iife',plugins:[{name:'local-workflow-transport',setup(b){
 b.onResolve({filter:/supabaseClient$|useAuth$|usePermissions$|PermissionsContext$|UserRoleEditModal$|AccountLifecycleModal$|PasswordManagementModal$|useApprovals$|useAdditionalApprovals$|attendanceIssues$|approvalPageLoader$|PayrollAttendanceInbox$|acknowledgments\/Gate$/},args=>({path:args.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>{
  const p=args.path;
  let contents;
  if(p.endsWith('supabaseClient'))contents=`async function call(action,args={}){const response=await fetch('/fixture-api',{method:'POST',headers:{'Content-Type':'application/json','X-Fixture-Actor':String(window.fixtureActor)},body:JSON.stringify({action,args})});const body=await response.json();return body.error?{data:null,error:{message:body.error,context:{json:async()=>body}}}:{data:body.data,error:null};}export const supabase={rpc:call,from:table=>{const q={select:()=>q,eq:()=>q,order:()=>q,then:resolve=>call('table',{table}).then(resolve)};return q;},functions:{invoke:(_name,options)=>call('execute',options.body)}};`;
  else if(p.endsWith('useAuth'))contents='export const useAuth=()=>({user:window.fixtureUser});';
  else if(p.endsWith('usePermissions'))contents="export const usePermissions=()=>({can:(_resource,permission)=>permission==='view'});";
  else if(p.endsWith('PermissionsContext'))contents='export const usePermissionsContext=()=>({refreshPermissions:async()=>{}});';
  else if(p.endsWith('useAdditionalApprovals'))contents=`import {useEmailAccountDeletions} from '${process.cwd()}/hooks/useEmailAccountDeletions';export function useAdditionalApprovals(){const d=useEmailAccountDeletions(window.fixtureUser.id);return {${mockQueues},pendingAccountDeletionApprovals:d.workspace.requests.filter(r=>r.isActionable),additionalApprovalError:d.error,refreshAdditionalApprovals:d.refresh};}`;
  else if(p.endsWith('useApprovals'))contents=`export const useApprovals=()=>({${mockQueues},refreshApprovals:async()=>{}});`;
  else if(p.endsWith('attendanceIssues'))contents='export const useAttendanceIssues=()=>({pending:[],rows:[],load:async()=>{},error:null});export const issueLabels={};export const shiftText=()=>"";';
  else if(p.endsWith('approvalPageLoader'))contents='export const warmApprovalPage=()=>{};';
  else if(p.endsWith('Gate'))contents='export const useAcknowledgmentGate=()=>({blocked:false,loading:false,error:null});export const GateMessage=()=>null;';
  else contents='export default function FixtureUnusedComponent(){return null;}';
  return {contents,loader:'js',resolveDir:process.cwd()};
 });
}}]});
const server=http.createServer(async(req,res)=>{
 if(req.url==='/fixture-api'){
  let raw='';for await(const chunk of req)raw+=chunk;
  const body=JSON.parse(raw),n=Number(req.headers['x-fixture-actor']);
  const run=async()=>{
   try{
    await actor(n);
    let data;
    if(body.action==='table'){
     await db.exec('reset role');data=['roles','user_roles'].includes(body.args.table)?(await db.query(`select * from public.${body.args.table}`)).rows:[];
    }else if(body.action==='get_accessible_hris_users'){
     await db.exec('reset role');data=(await db.query('select id,full_name,email,role,status from public.hris_users order by full_name')).rows;
    }else if(body.action==='request_email_account_deletion'){
     data=await rpc(body.action,[body.args.p_target,body.args.p_reason,body.args.p_confirm_email,body.args.p_request]);latestRequest=data;
    }else if(body.action==='execute'){
     const lease=await rpc('decide_email_account_deletion',[body.args.requestId,body.args.decision,body.args.comment]);
     if(lease.status==='Approved'){
      await db.exec('reset role');await db.query('update auth.users set email=null,deleted_at=now() where id=$1',[lease.authUserId]);
      await actor(null,'service_role');await rpc('finish_email_account_deletion',[lease.requestId,lease.executionToken,true,null]);
     }
     data={ok:true};
    }else data=await rpc(body.action);
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data}));
   }catch(error){res.statusCode=409;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:error.message}));}
  };
  queue=queue.then(run,run);await queue;return;
 }
 res.setHeader('Content-Type',req.url==='/app.js'?'text/javascript':'text/html');
 res.end(req.url==='/app.js'?result.outputFiles[0].text:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Arial;padding:16px}button{padding:10px;margin:4px}input,textarea{padding:8px}table{border-spacing:8px} [role=dialog]{background:white;padding:16px;max-height:100%;overflow:auto} .fixed{position:fixed}.inset-0{inset:0}.overflow-hidden{overflow:hidden}.flex{display:flex}.flex-col{flex-direction:column}.overflow-y-auto{overflow-y:auto}.flex-1{flex:1} .min-h-0{min-height:0} </style><div id="root"></div><script src="/app.js"></script>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({executablePath:process.env.TNG_TEST_CHROMIUM||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const hr=await context.newPage();await hr.goto(`http://127.0.0.1:${server.address().port}/admin/users?actor=hr`);
 await hr.getByRole('row').filter({hasText:'old@example.invalid'}).getByRole('button',{name:'Request email-account deletion'}).click();
 const form=hr.getByRole('dialog',{name:'Request email-account deletion'});
 assert.equal(await form.getByRole('button',{name:'Send to Kay for approval'}).isDisabled(),true);
 await form.getByLabel('Reason for deleting email account').fill('Old email is inaccessible and a replacement is registered.');
 await form.getByRole('checkbox').check();await form.getByRole('button',{name:'Send to Kay for approval'}).click();
 await hr.getByText('Request sent to Kay Lacap for BOD approval.',{exact:false}).waitFor();
 assert.equal(await hr.getByRole('button',{name:'Approve & delete HRIS login'}).count(),0);
 assert.equal(await hr.getByText('Pending Kay’s approval',{exact:true}).count(),1);
 const kay=await context.newPage();await kay.goto(`http://127.0.0.1:${server.address().port}/admin/users?actor=kay`);
 const approvalLink=kay.getByRole('link',{name:'Review request for Email Account Deletions: 1 pending'});await approvalLink.waitFor();assert.equal(await approvalLink.getAttribute('href'),'/admin/users?review='+latestRequest);await approvalLink.click();
 const review=kay.getByRole('dialog',{name:'Review email-account deletion'});await review.waitFor();
 assert.equal(await review.getByText('old@example.invalid',{exact:true}).count(),1);
 assert.equal(await review.getByRole('button',{name:'Approve & delete HRIS login'}).isDisabled(),true);
 await review.getByRole('checkbox').check();await review.getByRole('button',{name:'Approve & delete HRIS login'}).click();
 await kay.getByText('Email-linked HRIS login deleted. Employee records are retained.',{exact:true}).waitFor();
 assert.equal(await kay.getByRole('dialog').count(),0,'Successful execution closes review without reopening from its URL');
 await kay.getByRole('button',{name:'View history'}).click();assert.equal(await kay.getByText('Login deleted',{exact:true}).count(),1);
 await kay.getByLabel('Account filter').selectOption('inactive');await kay.getByRole('row').filter({hasText:'old@example.invalid'}).waitFor();
 await queue;await db.exec('reset role');assert.equal((await db.query('select auth_user_id from hris_users where id=$1',[id(13)])).rows[0].auth_user_id,null);assert.equal((await db.query('select count(*) n from payroll_history')).rows[0].n,1);
 const other=await context.newPage();await other.goto(`http://127.0.0.1:${server.address().port}/admin/users?actor=other&review=${latestRequest}`);await other.getByLabel('Account filter').selectOption('inactive');await other.getByRole('row').filter({hasText:'old@example.invalid'}).waitFor();assert.equal(await other.getByRole('button',{name:/Request email-account deletion|Approve & delete HRIS login/}).count(),0);
 await context.close();console.log('PASS: mobile real User Management → HR request → named BOD review → managed-login removal → retained profile/history, required confirmations, requester/other-BOD denial, and stable review deep link.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));await db.close();}
