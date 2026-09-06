import React,{useEffect,useRef,useState} from 'react';
import {getMyAttendance} from '../../services/employeeAttendance';
import type {AttendanceDay} from '../../services/employeeAttendance';
import {dueReminder} from '../../services/attendanceExperience';
import {useAuth} from '../../hooks/useAuth';
const stored=(key:string)=>{try{return localStorage.getItem(key);}catch{return null;}};
const remember=(key:string,value:string)=>{try{localStorage.setItem(key,value);}catch{/* In-memory reminders still work. */}};
export default function AttendanceReminders({day}:{day:AttendanceDay|null}){const {user}=useAuth();const [enabled,setEnabled]=useState(false);const [message,setMessage]=useState('');const seen=useRef(new Set<string>());
 useEffect(()=>{setEnabled(stored(`attendance-reminders:${user?.id}`)==='on');},[user?.id]);
 useEffect(()=>{if(!enabled||!day)return;let active=true;let checking=false;const base=performance.now();const tick=async()=>{
  const candidate=dueReminder(day,Date.parse(day.serverTime)+performance.now()-base);if(!candidate||checking)return;
  const candidateKey=`attendance-reminder:${user?.id}:${day.workDate}:${candidate.kind}`;if(seen.current.has(candidateKey)||stored(candidateKey))return;
  checking=true;try{const latest=await getMyAttendance();if(!active)return;const reminder=dueReminder(latest,Date.parse(latest.serverTime));if(!reminder)return;
   const key=`attendance-reminder:${user?.id}:${latest.workDate}:${reminder.kind}`;if(seen.current.has(key)||stored(key))return;seen.current.add(key);remember(key,'shown');setMessage(reminder.text);
   if('Notification' in window&&Notification.permission==='granted'){try{new Notification('TNG HRIS',{body:reminder.text,tag:key});}catch{/* In-app reminder remains available. */}}
  }catch{/* Wait for a verified server state before reminding. */}finally{checking=false;}
 };void tick();const timer=setInterval(()=>void tick(),15000);return()=>{active=false;clearInterval(timer);};},[day,enabled,user?.id]);
 const toggle=async()=>{const next=!enabled;setEnabled(next);remember(`attendance-reminders:${user?.id}`,next?'on':'off');if(next&&'Notification' in window&&Notification.permission==='default'){try{await Notification.requestPermission();}catch{}}};
 return <div className="mt-3 text-sm"><button type="button" className="min-h-11 underline" onClick={()=>void toggle()}>{enabled?'Turn off attendance reminders':'Enable attendance reminders'}</button><p className="text-xs text-slate-500 dark:text-slate-300">Reminders work while HRIS is open on this device. Browser notifications depend on your permission and browser support.</p>{message&&enabled&&<p role="status" className="mt-2 rounded-lg bg-violet-100 p-3 text-violet-900">{message}</p>}</div>;
}
