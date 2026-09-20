import React,{useEffect,useMemo,useState} from 'react';
import {usePayrollField} from './usePayrollSelection';
import {defaultPayrollCycle,formatCutoff,payrollCycleForCutoff,payrollCycleForRelease,payrollCycleLabel,payrollCycleOptions} from './payrollCycle';

const field='min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white';

export default function PayrollCycleSelector({compact=false,className=''}:{compact?:boolean;className?:string}){
 const [from,setFrom]=usePayrollField('from'),[to,setTo]=usePayrollField('to');const [special,setSpecial]=useState(false);
 const options=useMemo(()=>payrollCycleOptions(),[]);const selected=payrollCycleForCutoff(from,to);const current=selected||defaultPayrollCycle();
 useEffect(()=>{if(!from||!to){const next=defaultPayrollCycle();setFrom(next.from);setTo(next.to);}},[from,to,setFrom,setTo]);
 const choose=(release:string)=>{if(release==='special'){setSpecial(true);return;}const next=payrollCycleForRelease(release);setSpecial(false);setFrom(next.from);setTo(next.to);};
 return <section className={`${compact?'rounded-xl border p-4':'rounded-2xl border bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900'} ${className}`} aria-label="Payroll cycle selector">
  <div className={`grid gap-4 ${compact?'lg:grid-cols-[minmax(0,1fr)_auto]':'lg:grid-cols-[minmax(0,1fr)_minmax(320px,.8fr)]'}`}><label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">Payroll cycle<select className={`${field} mt-2`} value={special||(!selected&&from&&to)?'special':current.releaseDate} onChange={event=>choose(event.target.value)}>{options.map(cycle=><option value={cycle.releaseDate} key={cycle.releaseDate}>{cycle.kind==='5th'?'11–25 → release on the 5th':'26–10 → release on the 20th'} · {formatPayrollDateShort(cycle.releaseDate)}</option>)}<option value="special">Special or historical range…</option></select></label>
   <div className="rounded-xl bg-violet-50 px-4 py-3 text-sm text-violet-950 dark:bg-violet-950/30 dark:text-violet-100"><p className="font-bold">{selected?payrollCycleLabel(selected):from&&to?`Special payroll · ${formatCutoff(from,to)}`:'Selecting the next payroll…'}</p><p className="mt-1">Same cutoff rules across all business units</p></div></div>
  {(special||(!selected&&from&&to))&&<div className="mt-4 grid gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:grid-cols-2 dark:border-amber-800 dark:bg-amber-950/20"><p className="sm:col-span-2 text-sm text-amber-900 dark:text-amber-100">Use manual dates only for a special or historical payroll.</p><label className="text-sm font-medium">Cutoff starts<input className={`${field} mt-1`} type="date" value={from} onChange={event=>setFrom(event.target.value)}/></label><label className="text-sm font-medium">Cutoff ends<input className={`${field} mt-1`} type="date" value={to} onChange={event=>setTo(event.target.value)}/></label></div>}
 </section>;
}

const formatPayrollDateShort=(value:string)=>new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric',year:'numeric'}).format(new Date(`${value}T12:00:00Z`));

