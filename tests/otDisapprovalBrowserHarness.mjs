// Isolated browser fixture using the actual OT and bulk dialogs; no production API calls.
import {build} from 'esbuild';
import {createServer} from 'node:http';
const result=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import OT from './components/payroll/OTRequestModal';import Bulk from './components/approvals/BulkDisapprovalDialog';
function App(){const [mode,setMode]=React.useState('ot');const [message,setMessage]=React.useState('');const [fail,setFail]=React.useState(true);return <><button onClick={()=>setMode('bulk')}>Open bulk fixture</button><button onClick={()=>setMode('ot')}>Open OT fixture</button><p role="status">{message}</p>{mode==='ot'&&<OT isOpen onClose={()=>setMode('closed')} requestToEdit={{id:'test-ot',employeeId:'employee',employeeName:'Test Employee',date:new Date('2026-09-05'),startTime:'00:00:00',endTime:'05:19:00',status:'PendingBOD',reason:'Test request',historyLog:[]}} attendanceRecords={[]} canApproveOverride onSave={()=>{}} onApproveOrReject={async(r,status,details)=>{if(fail){setFail(false);throw Error('Simulated save failure; retry with the retained reason.')}setMessage(status+': '+details.managerNote);setMode('closed')}}/>}{mode==='bulk'&&<Bulk kind="overtime" items={[{id:'allowed',reference:'OT-ALLOWED',employee:'Test One'},{id:'denied',reference:'OT-DENIED',employee:'Test Two'}]} onClose={()=>setMode('closed')} onDone={async()=>setMessage('Queue refreshed')}/>}</>};createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',plugins:[{name:'isolated',setup(b){
 b.onResolve({filter:/hooks\/use(Auth|Permissions)$|services\/(supabaseClient|approverConfigService|notificationService)$|acknowledgments\/Gate$|approvals\/ApprovalNavigation$|ui\/FileUploader$/},args=>({path:args.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>{
 let contents='export default ()=>null;';
 if(args.path.endsWith('useAuth'))contents="export const useAuth=()=>({user:{id:'director',role:'Board of Director'}});";
 if(args.path.endsWith('usePermissions'))contents='export const usePermissions=()=>({can:()=>true});';
 if(args.path.endsWith('supabaseClient'))contents='export const supabase={};';
 if(args.path.endsWith('approverConfigService'))contents="export const processTimeRequestApproval=async(kind,id,decision,note)=>{if(id==='denied')throw Error('This request is not assigned to you.');return {status:'Rejected'};};";
 if(args.path.endsWith('notificationService'))contents='export const createNotification=async()=>({});';
 if(args.path.endsWith('Gate'))contents='export const useAcknowledgmentGate=()=>({});export const GateMessage=()=>null;';
 if(args.path.endsWith('ApprovalNavigation'))contents='export const ApprovalDialogNavigation=()=>null;';
 return {contents,loader:'js'};
 });
}}]});
createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'text/javascript':'text/html');res.end(req.url==='/app.js'?result.outputFiles[0].text:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><script src="https://cdn.tailwindcss.com"></script></head><body><div id="root"></div><script src="/app.js"></script></body></html>')}).listen(4176,'0.0.0.0',()=>console.log('OT disapproval fixture on :4176'));
