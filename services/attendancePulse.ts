import {useCallback,useEffect,useRef,useState} from 'react';
import {useAuth} from '../hooks/useAuth';
import {issueRpc,todayManila} from './attendanceIssues';
export type PulseRow={id:string;employeeId:string;employeeName:string;employeeCode:string;businessUnitId:string;businessUnit:string;department:string;date:string;kind:string;status:string;hrState?:string;source:string;schedule:any;submittedAt:string;dueAt:string;managerId:string;needsAttention:boolean;canReadDetails:boolean;canReview:boolean};
export type Pulse={allowed:boolean;date:string;generatedAt:string;scope:string;canManage:boolean;reported:number;approved:number;pending:number;attention:number;usual:number|null;baselineDays:number;severity:string;units:{id:string;name:string;count:number;scheduled:number;affectedScheduled:number;percent:number|null;overlap:number;severity:string;usual:number|null}[];concerns:{code:string;text:string;businessUnitId?:string;severity:string}[];trend:{date:string;count:number;tracked:boolean}[];rows:PulseRow[]};
export function useAttendancePulse(date=todayManila()){
 const {user}=useAuth();const [data,setData]=useState<Pulse>();const [error,setError]=useState('');const generation=useRef(0);
 const load=useCallback(async()=>{const n=++generation.current;if(!user?.id)return;try{const d=await issueRpc<Pulse>('get_attendance_pulse',{p_date:date});if(n===generation.current){setData(d);setError('');}}catch(e){if(n===generation.current)setError((e as Error).message);}},[user?.id,date]);
 useEffect(()=>{setData(undefined);void load();const refresh=()=>{if(document.visibilityState==='visible')void load();};const timer=setInterval(refresh,60000);window.addEventListener('attendance-issues-changed',refresh);window.addEventListener('focus',refresh);return()=>{generation.current++;clearInterval(timer);window.removeEventListener('attendance-issues-changed',refresh);window.removeEventListener('focus',refresh);};},[load]);return {data,error,load};
}
export const pulsePath=(date:string)=>`/payroll/attendance-pulse?date=${date}`;
export function impactedSchedule(date:string,manager?:string){return `/payroll/timekeeping?week=${date}${manager?'&manager='+encodeURIComponent(manager):''}`;}
export const pulseLevel:Record<string,string>={normal:'Normal',attention:'Needs attention',critical:'Critical staffing risk'};
export const pulseTone:Record<string,string>={normal:'border-emerald-400 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',attention:'border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200',critical:'border-red-400 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-200'};
