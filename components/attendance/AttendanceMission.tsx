import React from 'react';
import {uniqueShifts} from '../../services/attendanceExperience';
import {Link} from 'react-router-dom';
import {useAttendanceClock} from '../../hooks/useAttendanceClock';
import type {AttendanceDay,ClockAction} from '../../services/employeeAttendance';

const duration=(seconds:number)=>{const minutes=Math.floor(seconds/60);return `${Math.floor(minutes/60)}h ${minutes%60}m`;};
const time=(value:string,zone:string)=>new Intl.DateTimeFormat('en-PH',{timeZone:zone,hour:'numeric',minute:'2-digit'}).format(new Date(value));
const shiftTime=(day:string,value:string,zone:string)=>time(`${day}T${value.slice(0,8)}+08:00`,zone);
const status={not_started:'READY WHEN YOU ARE',working:'ON THE CLOCK',on_break:'RECHARGING',completed:'DAY COMPLETE'};
export function AttendanceMissionView({day,elapsed,busy,error,onAction,onRefresh,exceptionActions}:{day:AttendanceDay|null;elapsed:number;busy:boolean;error:string;onAction:(action:ClockAction)=>void;onRefresh:()=>void;exceptionActions?:React.ReactNode}){
 const working=day?.state==='working',onBreak=day?.state==='on_break',done=day?.state==='completed';
 const schedule=day?.schedule,entries=uniqueShifts(schedule?.entries??[]);
 const canStart=!!day&&day.requiresClock&&schedule?.published&&entries.length>0&&entries.every(s=>s.kind==='work');
 const events=day?.events??[];const started=events.find(e=>e.type==='CLOCK_IN'),breaks=events.filter(e=>e.type==='START_BREAK'),back=events.filter(e=>e.type==='END_BREAK'),finish=events.find(e=>e.type==='CLOCK_OUT');
 const paid=entries.reduce((total,s)=>{if(s.kind!=='work')return total;if(s.flexible)return total+(s.paidMinutes??0);const mins=(t:string)=>Number(t.slice(0,2))*60+Number(t.slice(3,5));return total+Math.max(0,mins(s.end)-mins(s.start)+(s.endDayOffset??0)*1440-60);},0);
 const progress=paid?Math.min(100,elapsed/(paid*60)*100):0;
 const nextCopy=!day?'Getting your day ready…':!day.requiresClock?'Attendance is handled by your schedule.':done?'You made today count!':onBreak?'Enjoy your recharge.':working?'Keep the momentum going!':canStart?'Ready when you are ✦':'Your next shift is on its way.';
 return <section aria-label="Time and Attendance" className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-7 lg:p-8">
  <div className="mb-6 flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-bold tracking-[0.15em] text-violet-600 dark:text-violet-300 sm:text-sm">TODAY’S MISSION ✦</p><h2 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">{day?new Intl.DateTimeFormat('en-PH',{timeZone:day.timezone,weekday:'long',year:'numeric',month:'long',day:'numeric'}).format(new Date(day.serverTime)):'Getting your day ready'}</h2><p className="mt-2 text-sm text-slate-500 dark:text-slate-300 sm:text-base">{done?'Thanks for everything you brought to today.':'Make today count — you’re off to a great start.'}</p></div>
  {day&&<span role="status" className={`rounded-full px-4 py-2 text-xs font-bold tracking-wide ${onBreak?'bg-violet-100 text-violet-700':'bg-emerald-50 text-emerald-700'} dark:bg-slate-700 dark:text-emerald-300`}>{day.requiresClock?status[day.state]:'SCHEDULE-BASED'}</span>}</div>
  <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3">
   <div className="min-w-0 rounded-2xl border border-slate-200 p-5 dark:border-slate-600 sm:p-6"><h3 className="text-xs font-bold tracking-widest text-slate-500 dark:text-slate-300">YOUR SHIFT</h3>
    <div className="mt-3 space-y-2 text-2xl font-bold text-slate-900 dark:text-white">{entries.length?entries.map(s=><p key={s.id}>{s.kind==='rest'?'Rest day':s.kind==='no_schedule'?'Leave / No Schedule':s.flexible?`Flexible shift · ${(s.paidMinutes??0)/60} hours`:`${shiftTime(day!.workDate,s.start,day!.timezone)} – ${shiftTime(day!.workDate,s.end,day!.timezone)}${s.endDayOffset===1?' (+1 day)':''}`}</p>):<p>Schedule coming soon</p>}</div>
    <p className="mt-3 text-sm font-semibold text-violet-600 dark:text-violet-300">Ready when you are ✦</p><p className="mt-2 text-xs text-slate-500 dark:text-slate-300">{schedule?.published?`Published schedule · v${schedule.version}`:'Check with your manager for your published shift.'}</p>
    {day&&started&&<div className="mt-6"><div className="mb-2 flex justify-between text-xs text-slate-500 dark:text-slate-300"><span>DAY PROGRESS</span><span>{duration(elapsed)} in</span></div><div role="progressbar" aria-label="Day progress" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700"><div className="h-full rounded-full bg-violet-600 transition-all" style={{width:`${progress}%`}}/></div></div>}
   </div>
   <div className="min-w-0 rounded-2xl border border-slate-200 p-5 dark:border-slate-600 sm:p-6"><h3 className="text-xs font-bold tracking-widest text-slate-500 dark:text-slate-300">TODAY’S PROGRESS</h3><p className="mt-3 text-4xl font-bold tabular-nums text-slate-900 dark:text-white">{day&&!day.requiresClock&&!started?'Your day, supported':duration(elapsed)}</p><p className="mt-2 text-sm text-slate-500 dark:text-slate-300">You’re doing great</p>
    <dl className="mt-5 space-y-2 text-sm">{[['Started',started?time(started.timestamp,day!.timezone):'Ready when you are'],['Recharge',breaks.length?`${time(breaks[0].timestamp,day!.timezone)} · ${duration(day!.breakSeconds)}`:'Still ahead'],['Back at it',back.length?time(back[back.length-1].timestamp,day!.timezone):'After your break'],['Finish',finish?time(finish.timestamp,day!.timezone):'When ready']].map(([label,value])=><div key={label} className="flex flex-wrap justify-between gap-x-3"><dt className="text-slate-500 dark:text-slate-300">{label}</dt><dd className="font-semibold text-slate-800 dark:text-white">{value}</dd></div>)}</dl>
   </div>
   <div className="min-w-0 rounded-2xl border border-violet-200 bg-violet-50 p-5 dark:border-violet-800 dark:bg-violet-950/40 sm:p-6"><h3 className="text-xs font-bold tracking-widest text-slate-500 dark:text-slate-300">WHAT’S NEXT? ✦</h3><p className="mt-3 text-xl font-bold text-slate-900 dark:text-white">{nextCopy}</p>
    {day?.requiresClock&&!done&&<div className="mt-6 grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
     {(working||onBreak||canStart)&&<button disabled={busy} onClick={()=>onAction(onBreak?'END_BREAK':working?'START_BREAK':'CLOCK_IN')} className={`min-h-14 rounded-xl bg-violet-600 px-4 py-3 text-base font-bold text-white shadow-sm hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:opacity-50 ${!working?'col-span-full':''}`}>{busy?'Saving…':onBreak?'End Break':working?'Take a Break':'Clock In'}</button>}
     {working&&<button disabled={busy} onClick={()=>onAction('CLOCK_OUT')} className="min-h-14 rounded-xl border border-violet-300 bg-white px-4 py-3 text-base font-bold text-violet-700 hover:bg-violet-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:opacity-50 dark:bg-slate-800 dark:text-violet-200">Clock Out</button>}
    </div>}
    {exceptionActions}
    <p className="mt-4 text-sm text-violet-700 dark:text-violet-200">{done?'Your day is recorded. See you next time!':onBreak?'A little recharge goes a long way.':'Keep your day moving — you’ve got this.'}</p>
    <Link to="/payroll/timekeeping" className="mt-4 inline-block text-sm font-semibold text-violet-700 underline dark:text-violet-200">View schedule</Link>
   </div>
  </div>
  {error&&<div role="alert" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{error}<button onClick={onRefresh} className="ml-3 min-h-11 font-semibold underline">Refresh my day</button></div>}
  <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-slate-100 pt-5 text-sm dark:border-slate-700"><span className="font-bold text-slate-500 dark:text-slate-300">YOUR DAY</span>{[['Started',!!started],['Recharge',breaks.length>0],['Back at it',back.length>0],['Finish',!!finish]].map(([label,complete],i)=><React.Fragment key={String(label)}>{i>0&&<span aria-hidden="true" className="text-slate-300">→</span>}<span className={complete?'font-semibold text-emerald-600 dark:text-emerald-300':'text-slate-500 dark:text-slate-300'}>{complete?'✓':'○'} {label}</span></React.Fragment>)}</div>
  {day?.canManage&&<Link to="/payroll/clocking-exceptions" className="mt-4 inline-block min-h-11 text-sm font-semibold text-violet-700 underline dark:text-violet-200">Manage clocking exceptions & attendance review</Link>}
 </section>;
}
export default function AttendanceMission(){const c=useAttendanceClock();return <AttendanceMissionView day={c.day} elapsed={c.elapsed} busy={c.busy||c.loading} error={c.error} onAction={a=>void c.act(a)} onRefresh={()=>void c.refresh()}/>;}
