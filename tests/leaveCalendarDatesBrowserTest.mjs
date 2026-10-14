// Real leave form, service serialization/mapping, calendar and attendance table.
// Auth and transport are fixtures; dates round-trip through PostgreSQL date columns.
import assert from 'node:assert/strict';
import http from 'node:http';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const db=new PGlite();
await db.exec('create table requests (start_date date,end_date date,payload jsonb);');
const result=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import Modal from './components/payroll/LeaveRequestModal';import Calendar from './components/payroll/LeaveCalendar';import Attendance from './components/payroll/AttendanceTable';import Table from './components/payroll/LeaveRequestTable';
import {createLeaveRequest,fetchLeaveRequests} from './services/leaveService';import {parseLocalCalendarDate} from './utils/calendarDate';import {leaveDateFields,leaveDurationDays} from './utils/leaveDates';import {leaveForDay} from './services/scheduleStatuses';
const user={id:'employee',name:'Test Employee',role:'Employee',businessUnit:'Office'};
const types=[{id:'lwop',name:'Leave Without Pay'}];
function App(){const[open,setOpen]=useState(true),[leaves,setLeaves]=useState([]);window.fixtureDates={leaveDateFields,leaveDurationDays,parseLocalCalendarDate};
return <><Modal isOpen={open} request={null} leaveTypes={types} onClose={()=>setOpen(false)} onSave={async(request,status)=>{window.formStatus=status;window.formFields=leaveDateFields(request);await createLeaveRequest(request,user);const stored=await fetchLeaveRequests();window.fetchedDates=stored.map(r=>leaveDateFields(r));setLeaves(stored.map(r=>({...r,status:'Approved'})));setOpen(false);}} onApprove={()=>{}}/>
{!open&&<><button onClick={()=>setOpen(true)}>New request</button><Table requests={leaves} leaveTypes={types} onSelectRequest={()=>{}}/><Calendar leaves={leaves} currentUser={user}/><section aria-label="Attendance fixture"><Attendance approvedLeaves={leaves} approvedOvertimes={[]} allUsers={[user]} records={['2026-10-16','2026-10-17','2026-10-19','2026-10-20','2026-10-21'].map(date=>({id:date,employeeId:user.id,employeeName:user.name,date:parseLocalCalendarDate(date),scheduledStart:null,scheduledEnd:null,firstIn:new Date(date+'T08:00:00'),lastOut:new Date(date+'T17:00:00'),totalWorkMinutes:480,exceptions:[]}))}/></section></>}
<div id="schedule-fixture">{['2026-10-16','2026-10-17','2026-10-20','2026-10-21'].map(date=><span data-work-date={date}>{leaveForDay(leaves,user.id,parseLocalCalendarDate(date))?'On Leave':'Working'}</span>)}</div></>}
createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,format:'iife',jsx:'automatic',write:false,plugins:[{name:'fixture',setup(b){
b.onResolve({filter:/supabaseClient$|useAuth$|acknowledgments\/Gate$/},a=>({path:a.path,namespace:'fixture'}));
b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path.endsWith('useAuth')?`export const useAuth=()=>({user:{id:'employee'}});`:a.path.endsWith('Gate')?`export const useAcknowledgmentGate=()=>({blocked:false,loading:false,error:null});export const GateMessage=()=>null;`:`
async function call(action,args){const r=await fetch('/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,args})});return r.json();}
export const supabase={rpc:(action,args)=>call(action,args),from:()=>({select:()=>({order:()=>call('fetch',{})})})};`}));
}}]});
const server=http.createServer(async(req,res)=>{
if(req.url==='/api'){
let raw='';for await(const chunk of req)raw+=chunk;const {action,args}=JSON.parse(raw);
res.setHeader('Content-Type','application/json');
if(action==='submit_leave_request'){
const p=args.p_data;
assert.match(p.start_date,/^\d{4}-\d{2}-\d{2}$/,'RPC must receive a date, never a timestamp');assert.match(p.end_date,/^\d{4}-\d{2}-\d{2}$/);
p.id='request';await db.query('insert into requests values($1::date,$2::date,$3::jsonb)',[p.start_date,p.end_date,JSON.stringify(p)]);
res.end(JSON.stringify({data:{request:p}}));
}else {const {rows}=await db.query('select payload || jsonb_build_object(\'start_date\',start_date::text,\'end_date\',end_date::text) as request from requests');res.end(JSON.stringify({data:rows.map(r=>r.request)}));}
return;}
res.setHeader('Content-Type',req.url==='/app.js'?'text/javascript':'text/html');res.end(req.url==='/app.js'?result.outputFiles[0].text:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Arial}button,input{padding:8px;margin:3px}</style><div id="root"></div><script src="/app.js"></script>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
browser=await chromium.launch({executablePath:process.env.TNG_TEST_CHROMIUM||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
for(const timezoneId of ['Asia/Manila','UTC','America/Los_Angeles','Australia/Sydney']){
 await db.exec('truncate requests');
 const context=await browser.newContext({timezoneId,viewport:{width:1280,height:900}}),page=await context.newPage();
 const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
 await page.clock.install({time:new Date('2026-10-14T04:00:00Z')});
 await page.goto('http://127.0.0.1:'+server.address().port);
 const start=page.getByLabel('Start date',{exact:true}),end=page.getByLabel('End date',{exact:true});
 await start.fill('2026-10-17');assert.equal(await start.inputValue(),'2026-10-17',timezoneId+': start must not jump backward');assert.equal(await end.inputValue(),'2026-10-17');
 await end.fill('2026-10-20');assert.equal(await end.inputValue(),'2026-10-20',timezoneId+': end must not jump backward');
 await start.fill('2026-10-17');assert.equal(await start.inputValue(),'2026-10-17','Reselecting the start day must work');
 const summary=page.locator('aside');assert.match(await summary.innerText(),/Saturday, October 17, 2026.*Tuesday, October 20, 2026/s);assert.equal(await page.locator('input[type=number]').inputValue(),'4');
 await page.getByRole('button',{name:'Continue as Leave Without Pay'}).click();await page.getByRole('button',{name:'New request'}).waitFor();
 const fields={start_date:'2026-10-17',end_date:'2026-10-20'};
 assert.deepEqual(await page.evaluate(()=>window.formFields),fields,'Page submission date fields');assert.deepEqual(await page.evaluate(()=>window.fetchedDates),[fields],'Fetched request maps to same calendar dates');
 const persisted=(await db.query('select start_date::text,end_date::text,payload->>\'duration_days\' as days from requests')).rows[0];assert.deepEqual(persisted,{...fields,days:'4'});
 for(const date of ['2026-10-17','2026-10-18','2026-10-19','2026-10-20'])assert.equal(await page.locator('[data-date="'+date+'"]').getByText('Me',{exact:true}).count(),1,'Inclusive calendar '+date);
 for(const date of ['2026-10-16','2026-10-21'])assert.equal(await page.locator('[data-date="'+date+'"]').getByText('Me',{exact:true}).count(),0,'Outside calendar '+date);
 const attendance=page.getByRole('region',{name:'Attendance fixture'});
 for(const date of ['2026-10-16','2026-10-17','2026-10-19','2026-10-20','2026-10-21']){
 await attendance.getByLabel('Filter by Date').fill(date);const row=attendance.getByRole('row').filter({hasText:'Test Employee'});assert.equal(await row.count(),1,'Attendance filter '+date);
 assert.equal(await row.getByText('lwop',{exact:true}).count(),date>='2026-10-17'&&date<='2026-10-20'?1:0,'Attendance leave '+date);
 }
 for(const date of ['2026-10-16','2026-10-17','2026-10-20','2026-10-21'])assert.equal(await page.locator('[data-work-date="'+date+'"]').innerText(),date>='2026-10-17'&&date<='2026-10-20'?'On Leave':'Working');
 assert.deepEqual(await page.evaluate(()=>[window.fixtureDates.leaveDurationDays('2026-03-07','2026-03-09'),window.fixtureDates.leaveDurationDays('2026-10-31','2026-11-02')]),[3,3],'Duration through DST boundaries');
 await page.getByRole('button',{name:'New request'}).click();await start.fill('');await page.getByRole('button',{name:'Save draft'}).click();await page.getByRole('alert').filter({hasText:'Choose a valid start and end date'}).waitFor();assert.equal((await db.query('select count(*)::int n from requests')).rows[0].n,1,'Clearing a date must not submit');
 assert.deepEqual(pageErrors,[]);await context.close();console.log('PASS: '+timezoneId+' date selection, summary, PostgreSQL round-trip, calendar endpoints, attendance and roster, cleared date validation and DST duration');
}
}finally{await browser?.close();await new Promise(r=>server.close(r));await db.close();}
