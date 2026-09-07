import React from 'react';
import {uniqueShifts} from '../../services/attendanceExperience';
import {Link} from 'react-router-dom';
import {useAttendanceClock} from '../../hooks/useAttendanceClock';
import type {AttendanceDay,ClockAction} from '../../services/employeeAttendance';

const duration=(seconds:number)=>{const minutes=Math.floor(seconds/60);return `${Math.floor(minutes/60)}h ${minutes%60}m`;};
const time=(value:string,zone:string)=>new Intl.DateTimeFormat('en-PH',{timeZone:zone,hour:'numeric',minute:'2-digit'}).format(new Date(value));
const shiftTime=(day:string,value:string,zone:string)=>time(`${day}T${value.slice(0,8)}+08:00`,zone);
const status={not_started:'READY TO START',working:'ON THE CLOCK',on_break:'ON BREAK',completed:'SHIFT COMPLETE'};
export function AttendanceMissionView({day,elapsed,busy,error,onAction,onRefresh,exceptionActions}:{day:AttendanceDay|null;elapsed:number;busy:boolean;error:string;onAction:(action:ClockAction)=>void;onRefresh:()=>void;exceptionActions?:React.ReactNode}){
 const working=day?.state==='working',onBreak=day?.state==='on_break',done=day?.state==='completed';
 const schedule=day?.schedule,entries=uniqueShifts(schedule?.entries??[]);
 const canStart=!!day&&day.requiresClock&&schedule?.published&&entries.length>0&&entries.every(s=>s.kind==='work');
 const events=day?.events??[];const started=events.find(e=>e.type==='CLOCK_IN'),breaks=events.filter(e=>e.type==='START_BREAK'),back=events.filter(e=>e.type==='END_BREAK'),finish=events.find(e=>e.type==='CLOCK_OUT');
 const paid=entries.reduce((total,s)=>{if(s.kind!=='work')return total;if(s.flexible)return total+(s.paidMinutes??0);const mins=(t:string)=>Number(t.slice(0,2))*60+Number(t.slice(3,5));return total+Math.max(0,mins(s.end)-mins(s.start)+(s.endDayOffset??0)*1440-60);},0);
 const progress=paid?Math.min(100,elapsed/(paid*60)*100):0;

 const shiftLabel=entries.length?entries.map(s=>s.kind==='rest'?'Rest day':s.kind==='no_schedule'?(['Paid Leave','Unpaid Leave','Company Holiday'].includes(s.name)?s.name:'Leave / No Schedule'):s.flexible?`Flexible shift · ${(s.paidMinutes??0)/60} hours`:`${shiftTime(day!.workDate,s.start,day!.timezone)} – ${shiftTime(day!.workDate,s.end,day!.timezone)}${s.endDayOffset===1?' (+1 day)':''}`).join(' · '):'Schedule coming soon';
 return <section aria-label="Time and Attendance" className="mb-5 grid min-w-0 grid-cols-1 items-start gap-4 text-slate-900 dark:text-white md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
  <div data-attendance-action className="min-w-0 rounded-3xl border border-violet-500 bg-gradient-to-br from-violet-50 to-white dark:from-indigo-950 dark:to-slate-900 p-5 shadow-lg sm:p-7">
   <span role="status" className="inline-flex rounded-xl bg-emerald-300/10 px-3 py-2 text-xs font-bold tracking-wide text-emerald-700 dark:text-emerald-300">{day?(day.requiresClock?status[day.state]:'SCHEDULE-BASED'):'GETTING READY'}</span>
   <p aria-label="Current company time" className="mt-4 text-5xl font-bold tracking-tight tabular-nums sm:text-6xl">{day?time(day.serverTime,day.timezone):'—'}</p>
   <p className="mt-2 text-xs text-violet-700 dark:text-violet-200">{day?new Intl.DateTimeFormat('en-PH',{timeZone:day.timezone,month:'short',day:'numeric',weekday:'short'}).format(new Date(day.serverTime)):''}</p>
   <p className="mt-5 text-xs font-bold tracking-widest text-violet-700 dark:text-violet-300">YOUR SHIFT</p><p className="mt-1 text-lg font-semibold sm:text-2xl">{shiftLabel}</p>
   {day&&!day.requiresClock?<p className="mt-5 rounded-xl bg-white/5 p-4 font-semibold">Clocking is not required for you today.</p>:done?<p className="mt-5 text-emerald-700 dark:text-emerald-300">Your day is recorded. See you next time!</p>:<>
    {(working||onBreak||canStart)&&<button disabled={busy} onClick={()=>onAction(onBreak?'END_BREAK':working?'CLOCK_OUT':'CLOCK_IN')} className="mt-5 min-h-14 w-full rounded-2xl bg-violet-600 px-4 py-4 text-lg font-bold text-white hover:bg-violet-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-300 disabled:opacity-50">{busy?'SAVING…':onBreak?'END BREAK':working?'CLOCK OUT':'CLOCK IN'}</button>}
    {working&&<button disabled={busy} onClick={()=>onAction('START_BREAK')} className="mt-3 min-h-14 w-full rounded-xl border border-violet-400 px-4 font-semibold text-violet-700 dark:text-violet-100 hover:bg-white/5 disabled:opacity-50">TAKE A BREAK</button>}
    {day&&!working&&!onBreak&&!canStart&&<p className="mt-4 text-sm text-violet-700 dark:text-violet-200">Your published working shift will appear here when it’s ready.</p>}
   </>}
   <Link to="/payroll/timekeeping" className="mt-3 flex min-h-11 items-center justify-center text-sm font-semibold text-violet-700 dark:text-violet-200 underline">View schedule</Link>
   {error&&<div role="alert" className="mt-3 rounded-xl bg-amber-100 p-3 text-sm text-amber-950">{error}<button onClick={onRefresh} className="ml-2 min-h-11 font-semibold underline">Refresh my day</button></div>}
  </div>
  <div className="min-w-0 space-y-4">
   <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 p-5"><h3 className="text-xs font-bold tracking-widest text-violet-700 dark:text-violet-300">TODAY’S PROGRESS</h3><p className="mt-2 text-3xl font-bold tabular-nums">{day&&!day.requiresClock&&!started?'Schedule-based':duration(elapsed)}</p><p className="mt-1 text-sm text-violet-700 dark:text-violet-200">{done?'You made today count!':started?'You’re doing great':'You’re all set. Let’s make it a great day!'}</p>
    {started&&<div role="progressbar" aria-label="Day progress" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className="h-full rounded-full bg-violet-500" style={{width:`${progress}%`}}/></div>}
   </div>
   <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 p-5"><h3 className="text-xs font-bold tracking-widest text-violet-700 dark:text-violet-300">YOUR DAY</h3><dl className="mt-3 space-y-2 text-sm">{[['Started',started?time(started.timestamp,day!.timezone):'Not started'],['Recharge',breaks.length?`${time(breaks[0].timestamp,day!.timezone)} · ${duration(day!.breakSeconds)}`:'Still ahead'],['Back at it',back.length?time(back[back.length-1].timestamp,day!.timezone):'After your break'],['Finish',finish?time(finish.timestamp,day!.timezone):'When ready']].map(([label,value])=><div key={label} className="flex flex-wrap justify-between gap-2"><dt className="text-violet-700 dark:text-violet-200">{label}</dt><dd className="font-semibold">{value}</dd></div>)}</dl></div>
   <details className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 p-4"><summary className="min-h-6 cursor-pointer text-sm font-semibold text-violet-700 dark:text-violet-200">Schedule details & missed punches</summary><p className="mt-3 text-sm text-violet-700 dark:text-violet-200">{schedule?.published?`Published schedule · v${schedule.version}`:'Check with your manager for your published shift.'}</p>{exceptionActions}{day?.canManage&&<Link to="/payroll/clocking-exceptions" className="mt-3 inline-flex min-h-11 items-center text-sm text-violet-700 dark:text-violet-200 underline">Manage clocking exceptions & attendance review</Link>}</details>
  </div>
 </section>;
}
export default function AttendanceMission(){const c=useAttendanceClock();return <AttendanceMissionView day={c.day} elapsed={c.elapsed} busy={c.busy||c.loading} error={c.error} onAction={a=>void c.act(a)} onRefresh={()=>void c.refresh()}/>;}
