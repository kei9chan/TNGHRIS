import React from 'react';
import {Link} from 'react-router-dom';
import {approvedLabels,manila} from '../../services/attendanceIssues';
import {uniqueShifts} from '../../services/attendanceExperience';
import type {AttendanceDay,ClockAction,AttendanceHistory} from '../../services/employeeAttendance';

export const duration=(seconds:number)=>{const minutes=Math.floor(Math.max(0,seconds)/60);return `${Math.floor(minutes/60)}h ${minutes%60}m`;};
const time=(value:string,zone:string)=>new Intl.DateTimeFormat('en-PH',{timeZone:zone,hour:'numeric',minute:'2-digit'}).format(new Date(value));
export function shiftLabel(day:AttendanceDay){return uniqueShifts(day.schedule?.entries??[]).map(s=>s.kind==='rest'?'Rest day':s.kind==='no_schedule'?s.name||'No schedule':s.flexible?`Flexible shift · ${(s.paidMinutes??0)/60} hours`:`${time(`${day.workDate}T${s.start.slice(0,8)}+08:00`,day.timezone)} – ${time(`${day.workDate}T${s.end.slice(0,8)}+08:00`,day.timezone)}${s.endDayOffset===1?' (+1 day)':''}`).join(' · ')||'No published shift';}
export function weeklyTotals(history:AttendanceHistory,day:AttendanceDay|null,elapsed:number){
 const days=history.days.map(d=>d.workDate===day?.workDate?day:d);
 return {seconds:days.reduce((sum,d)=>sum+(d.workDate===day?.workDate?elapsed:d.elapsedSeconds),0),scheduled:days.reduce((sum,d)=>sum+uniqueShifts(d.schedule?.entries??[]).reduce((n,s)=>{if(s.kind!=='work'||!d.schedule.published)return n;if(s.paidMinutes!=null)return n+s.paidMinutes*60;const minutes=(t:string)=>Number(t.slice(0,2))*60+Number(t.slice(3,5));return n+Math.max(0,minutes(s.end)-minutes(s.start)+(s.endDayOffset??0)*1440-60)*60;},0),0)};
}
export function attendanceHelpLabel(day:AttendanceDay|null,returned=false){
 if(returned||day?.attendanceIssues?.some(r=>r.status==='details'))return 'Update returned request';
 if(day&&['working','on_break'].includes(day.state)){
  const today=new Date(Date.parse(day.serverTime)+8*3600000).toISOString().slice(0,10);
  const ends=day.schedule.entries.filter(s=>s.kind==='work'&&!s.flexible).map(s=>Date.parse(`${day.workDate}T${s.end.slice(0,8)}+08:00`)+(s.endDayOffset??0)*86400000);
  if(day.workDate<today&&ends.length&&Math.max(...ends)<Date.parse(day.serverTime))return 'Review a missed punch';
 }
 return 'Need to fix an attendance issue?';
}
const card='rounded-2xl bg-white p-5 shadow-sm dark:bg-slate-800 sm:p-7';
const heading='text-xs font-bold tracking-widest text-violet-700 dark:text-violet-300';
export function AttendanceMissionView({day,elapsed,busy,error,onAction,onRefresh,onHelp,onAbsence,onHistory,history,historyError}:{day:AttendanceDay|null;elapsed:number;busy:boolean;error:string;onAction:(action:ClockAction)=>void;onRefresh:()=>void;onHelp:()=>void;onAbsence:()=>void;onHistory:()=>void;history:AttendanceHistory|null;historyError:string}){
 const working=day?.state==='working',onBreak=day?.state==='on_break',done=day?.state==='completed';
 const entries=uniqueShifts(day?.schedule?.entries??[]);
 const canStart=!!day&&day.requiresClock&&day.schedule.published&&entries.length>0&&entries.every(s=>s.kind==='work');
 const events=day?.events??[],started=events.find(e=>e.type==='CLOCK_IN'),breaks=events.filter(e=>e.type==='START_BREAK'),finish=events.find(e=>e.type==='CLOCK_OUT');
 const total=history?weeklyTotals(history,day,elapsed):null;
 const progress=total?.scheduled?Math.min(100,total.seconds/total.scheduled*100):0;
 const help=attendanceHelpLabel(day,history?.needsClarification),attention=help!=='Need to fix an attendance issue?';
 return <section aria-label="Time and Attendance" className="mb-4 min-w-0 text-slate-900 dark:text-white">
 <div className="grid min-w-0 grid-cols-1 items-start gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
  <div data-attendance-action className="min-w-0 rounded-3xl border border-violet-500 bg-gradient-to-br from-violet-50 to-white p-4 shadow-lg dark:from-indigo-950 dark:to-slate-900 sm:p-7">
   <span role="status" className="inline-flex rounded-xl bg-emerald-300/10 px-3 py-2 text-xs font-bold tracking-wide text-emerald-700 dark:text-emerald-300">{!day?'LOADING':day.requiresClock?(onBreak?'ON BREAK':working?'ON THE CLOCK':'OFF THE CLOCK'):'CLOCKING EXEMPT'}</span>
   <p aria-label="Current company time" className="mt-3 text-5xl font-bold tracking-tight tabular-nums sm:text-6xl">{day?time(day.serverTime,day.timezone):'—'}</p>
   <p className="mt-1 text-sm text-violet-700 dark:text-violet-200">{day?new Intl.DateTimeFormat('en-PH',{timeZone:day.timezone,month:'short',day:'numeric',weekday:'short'}).format(new Date(day.serverTime)):''}</p>
   <p className={'mt-4 '+heading}>YOUR SHIFT</p><p className="mt-1 text-lg font-semibold sm:text-2xl">{day?shiftLabel(day):'Loading shift…'}</p>
   {day&&!day.requiresClock?<><p className="mt-4 text-sm font-semibold text-emerald-700 dark:text-emerald-300">Clock-in and clock-out are not required for you on this date.</p><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Your published schedule remains available for attendance and payroll review.</p></>:done?<p className="mt-4 text-sm text-emerald-700 dark:text-emerald-300">Clock-out recorded.</p>:<>
    <button disabled={busy||!(working||onBreak||canStart)} onClick={()=>onAction(onBreak?'END_BREAK':working?'CLOCK_OUT':'CLOCK_IN')} className="mt-4 min-h-14 w-full rounded-2xl bg-violet-600 px-4 py-3 text-lg font-bold text-white hover:bg-violet-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-400 disabled:opacity-50">{busy?'PLEASE WAIT…':onBreak?'END BREAK':working?'CLOCK OUT':'CLOCK IN'}</button>
    {(working||onBreak)&&<button disabled={busy} onClick={()=>onAction(onBreak?'END_BREAK':'START_BREAK')} className="mt-2 min-h-11 w-full rounded-xl border border-violet-400 px-4 py-2 font-semibold text-violet-700 hover:bg-violet-100 dark:text-violet-100 dark:hover:bg-white/5 disabled:opacity-50">{onBreak?'RETURN TO WORK':'TAKE A BREAK'}</button>}
    {day&&!working&&!onBreak&&!canStart&&<p className="mt-2 text-xs">A published working shift is required to clock in.</p>}
   </>}
   <div className="mt-4 border-t border-slate-300 pt-1 text-center dark:border-slate-700">
    <button onClick={onHelp} className={'min-h-11 text-sm font-semibold underline underline-offset-4 '+(attention?'text-amber-700 dark:text-amber-300':'text-violet-800 dark:text-violet-100')}>{help} <span aria-hidden>›</span></button>
    <p className="text-xs text-slate-600 dark:text-violet-200">We’ll guide you to the right form.</p>
    <button onClick={onAbsence} className="mt-2 min-h-11 text-xs text-slate-600 underline underline-offset-4 dark:text-violet-200 sm:text-sm">Report that I am unable to work today <span aria-hidden>›</span></button>
    <p className="text-xs text-slate-500 dark:text-slate-400">Can’t report to work today? Submit an absence notice.</p>
   </div>
   {error&&<div role="alert" className="mt-3 rounded-xl bg-amber-100 p-3 text-sm text-amber-950">{error}<button onClick={onRefresh} className="ml-2 min-h-11 font-semibold underline">Refresh my day</button></div>}
  </div>
  <div className="min-w-0 space-y-4">
   <div className={card}><h3 className={heading}>TODAY</h3><dl className="mt-5 space-y-5 text-sm">{[['Started',started?time(started.timestamp,day!.timezone):'Not started'],['Break',onBreak?'Currently on break':breaks.length?'Taken':'Not taken'],['Finish',finish?time(finish.timestamp,day!.timezone):working||onBreak?'In progress':'Not started']].map(([label,value])=><div key={label} className="flex items-center justify-between gap-3"><dt className="flex items-center gap-3"><span aria-hidden className={'h-3 w-3 shrink-0 rounded-full '+(label==='Started'&&started||label==='Break'&&breaks.length||label==='Finish'&&finish?'bg-emerald-400':'bg-slate-400 dark:bg-slate-600')}/>{label}</dt><dd className="text-right font-medium">{value}</dd></div>)}</dl>
    {day?.attendanceIssues?.filter(r=>r.status==='approved').map(r=><Link key={r.id} className="mt-4 block text-sm text-emerald-700 underline dark:text-emerald-300" to={'/payroll/attendance-requests?review='+r.id}>{approvedLabels[r.kind]}{r.time?' · '+manila(r.time):''}</Link>)}
   </div>
   <div className={card}><h3 className={heading}>THIS WEEK</h3><p className="mt-5 text-sm">Hours worked</p><p className="mt-2 text-3xl font-bold tabular-nums">{total?duration(total.seconds):'—'}</p>
    {total&&<><div role="progressbar" aria-label="Hours worked against published weekly shift hours" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className="h-full rounded-full bg-violet-500" style={{width:`${progress}%`}}/></div><p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{total.scheduled?`${duration(total.scheduled)} in published shifts`:'No published weekly hours'}</p></>}
    {historyError&&<p role="alert" className="mt-3 text-sm text-amber-700 dark:text-amber-300">Weekly hours unavailable. Open history to retry.</p>}
    <button onClick={onHistory} className="mt-4 min-h-11 text-sm underline underline-offset-4">View attendance history <span aria-hidden>›</span></button>
   </div>
  </div>
 </div>
 <Link to="/payroll/timekeeping" className="mt-2 flex min-h-11 items-center justify-end text-sm underline underline-offset-4">View schedule</Link>
 </section>;
}
