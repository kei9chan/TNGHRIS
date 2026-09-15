import React, {useEffect, useState} from 'react';
import {useAuth} from '../../hooks/useAuth';
import {getScheduleWeek, SchedulePublication} from '../../services/schedulePublicationService';
import {personalScheduleDays, currentScheduleWeek, moveScheduleWeek} from '../../services/personalSchedule';

export default function MySchedule() {
 const {user}=useAuth();
 const [week,setWeek]=useState(currentScheduleWeek);
 const [row,setRow]=useState<SchedulePublication|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [retry,setRetry]=useState(0);
 useEffect(()=>{
  let active=true;
  setLoading(true);setError('');setRow(null);
  if(!user?.id){setLoading(false);return;}
  const timeout=setTimeout(()=>{if(active){active=false;setLoading(false);setError('Your schedule is taking too long to load. Please retry.');}},15000);
  getScheduleWeek([user.id],week).then(rows=>{if(active){setRow(rows.find(r=>r.employeeId===user.id)||null);setLoading(false);}})
   .catch(e=>{if(active){setError(e?.message||'Unable to load your schedule. Please retry.');setLoading(false);}})
   .finally(()=>clearTimeout(timeout));
  return()=>{active=false;clearTimeout(timeout);};
 },[user?.id,week,retry]);
 const days=personalScheduleDays(row,week);
 return <section className="space-y-5 p-4 sm:p-6">
  <h1 className="text-2xl font-bold">My Published Schedule</h1>
  <p>{user?.name} · All shift times are Philippine time.</p>
  <div className="flex flex-wrap items-center gap-3">
   <button className="min-h-11 rounded border px-4" onClick={()=>setWeek(moveScheduleWeek(week,-7))}>Previous week</button>
   <span className="font-semibold">{week} – {moveScheduleWeek(week,6)}</span>
   <button className="min-h-11 rounded border px-4" onClick={()=>setWeek(moveScheduleWeek(week,7))}>Next week</button>
   <button className="min-h-11 rounded border px-4" onClick={()=>{setWeek(currentScheduleWeek());setRetry(v=>v+1);}}>This week / Refresh</button>
  </div>
  {loading?<p role="status">Loading your published schedule…</p>:error?<div role="alert"><p>{error}</p><button className="min-h-11 underline" onClick={()=>setRetry(v=>v+1)}>Retry</button></div>:!row?.activeVersion?<p>No published schedule is available for this week. Please contact your manager if you were expecting one.</p>:<>
   <p className="font-semibold text-emerald-700 dark:text-emerald-300">Published · Version {row.activeVersion}</p>
   <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{days.map(day=><article key={day.date} className="rounded-xl border bg-white p-4 dark:bg-slate-800">
    <h2 className="mb-3 font-semibold">{new Date(day.date+'T12:00:00').toLocaleDateString('en-PH',{weekday:'short',month:'short',day:'numeric'})}</h2>
    {day.entries.length?day.entries.map((entry,i)=><div key={i} className="mb-3"><p className="font-medium">{entry.name}</p><p>{entry.time}</p></div>):<p>No published shift for this day.</p>}
   </article>)}</div>
  </>}
 </section>;
}
