import {useCallback,useEffect,useRef,useState} from 'react';
import {useAuth} from '../hooks/useAuth';
import {supabase} from './supabaseClient';
export const issueLabels={absence:'Unable to report to work',early:'Early out',late:'Late arrival',punch:'Missed punch'};
export const issueStatuses:Record<string,string>={pending:'Pending Manager Approval',approved:'Approved',rejected:'Rejected – HR Review Pending',withdrawn:'Withdrawn',cancelled:'Cancelled',details:'Needs Clarification',hr_review:'Requires HR review'};
export const approvedLabels={absence:'Approved absence · No clock-in required',early:'Approved early out',late:'Approved late arrival',punch:'Approved punch correction'};
export const manila=(v:string)=>new Date(v).toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'});
export const todayManila=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
export type AttendanceIssue={id:string;employee_id:string;employeeName:string;employeeCode:string;businessUnit:string;department:string;approverName:string;isOwn:boolean;isManager:boolean;canReview:boolean;kind:keyof typeof issueLabels;work_date:string;requested_time:string|null;punch_type:string|null;category:string;explanation:string;attachment:string|null;confirmed:boolean;schedule:any;status:string;revision:number;submitted_at:string;due_at:string;escalated_at:string|null;reviewed_at:string|null;clarification_message?:string;rejection_category?:string;rejection_comments?:string;hrState?:string;audit:{id:string;action:string;actor:string;reason:string;created_at:string}[];exception:any};
export const caseStates:Record<string,string>={draft:'Draft – Awaiting HR Review',employee_clarification:'HR awaiting employee clarification',response_received:'Employee clarification received',nte_draft:'NTE Draft – Not Sent',nte_approval:'NTE awaiting designated approvals – Not Sent',nte_ready:'NTE awaiting HR sending – Not Sent',nte_sent:'NTEs Awaiting Employee Response',nte_response_received:'NTE Response Received – HR Review',closed_no_violation:'Closed – No Violation',closed_confirmed:'Closed – HR review completed'};
export const requestStatus=(r:AttendanceIssue)=>r.hrState?.startsWith('closed')?caseStates[r.hrState]:issueStatuses[r.status];
export async function issueRpc<T=any>(name:string,args={}){const {data,error}=await supabase.rpc(name,args);if(error)throw new Error(error.message);return data as T;}
export const shiftText=(schedule:any)=>(schedule?.entries??[]).map((s:any)=>s.kind==='work'?`${s.start}–${s.end}${s.endDayOffset?' (+1 day)':''}`:s.name||s.kind).join(' · ')||'Schedule not yet published';
// Share simultaneous dashboard reads without caching across mutations or accounts.
const pendingReads=new Map<string,Promise<any>>();
function readIssues(userId:string){let request=pendingReads.get(userId);if(!request){request=issueRpc('get_attendance_issues');pendingReads.set(userId,request);const cleanup=()=>{if(pendingReads.get(userId)===request)pendingReads.delete(userId);};void request.then(cleanup,cleanup);}return request;}
export function useAttendanceIssues(){const {user}=useAuth();const generation=useRef(0);const [rows,setRows]=useState<AttendanceIssue[]>([]);const [canManage,setCanManage]=useState(false);const [error,setError]=useState('');const [loading,setLoading]=useState(true);
 const load=useCallback(async()=>{const n=++generation.current;if(!user?.id)return;try{const d=await readIssues(user.id);if(n!==generation.current)return;setRows(d.rows);setCanManage(d.canManage);setError('');}catch(e){if(n===generation.current)setError((e as Error).message);}finally{if(n===generation.current)setLoading(false);}},[user?.id]);
 useEffect(()=>{setRows([]);setCanManage(false);void load();const fn=()=>{if(document.visibilityState==='visible')void load();};const timer=window.setInterval(fn,60000);window.addEventListener('focus',fn);window.addEventListener('attendance-issues-changed',fn);return()=>{generation.current++;window.clearInterval(timer);window.removeEventListener('focus',fn);window.removeEventListener('attendance-issues-changed',fn);};},[load]);
 return {rows,canManage,error,loading,load,pending:rows.filter(r=>r.canReview)};
}
export const attendanceChanged=()=>{pendingReads.clear();window.dispatchEvent(new Event('attendance-issues-changed'));window.dispatchEvent(new Event('attendance-updated'));};
