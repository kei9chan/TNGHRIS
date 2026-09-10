import React,{useState} from 'react';
import {AttendanceIssue,issueStatuses} from '../../services/attendanceIssues';
export default function GCMessage({request:r}:{request:AttendanceIssue}){
 const [message,setMessage]=useState('');
 if(!r.isOwn||r.kind!=='absence')return null;
 const text=`Unable to report to work${r.work_date===new Date(Date.now()+28800000).toISOString().slice(0,10)?' today':''}: ${r.employeeName}\nDate: ${new Date(r.work_date+'T00:00:00+08:00').toLocaleDateString('en-PH',{timeZone:'Asia/Manila',month:'long',day:'numeric',year:'numeric'})}\nStatus: ${issueStatuses[r.status]||r.status}`;
 return <section className="my-4 rounded-xl border border-violet-300 p-4 dark:border-violet-700"><h3 className="font-semibold">Message for your group chat</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Copy this short update to your designated GC. Private reasons and attachments are excluded.</p><textarea aria-label="Copy-ready group chat message" readOnly className="mt-3 w-full rounded-lg border bg-transparent p-3 text-sm" rows={3} value={text} onFocus={e=>e.target.select()}/><button className="min-h-11 rounded-lg bg-violet-600 px-4 text-white" onClick={async()=>{try{await navigator.clipboard.writeText(text);setMessage('Copied. Paste it into your designated group chat.');}catch{setMessage('Select the message above and copy it.');}}}>Copy GC message</button>{message&&<p role="status" className="mt-2 text-sm">{message}</p>}</section>;
}
