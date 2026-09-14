import {useCallback,useEffect,useRef,useState} from 'react';
import type {ClockEvidence} from '../services/attendanceChannels';
import {useAuth} from './useAuth';
import {AttendanceDay,ClockAction,getMyAttendance,recordMyAttendance} from '../services/employeeAttendance';

export function useAttendanceClock(){
 const {user}=useAuth();
 const [day,setDay]=useState<AttendanceDay|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const [elapsed,setElapsed]=useState(0);
 const refreshing=useRef(0),generation=useRef(0);
 const inFlight=useRef<object|null>(null);
 const viewer=useRef(user?.id);viewer.current=user?.id;
 const dayOwner=useRef<string|undefined>(undefined);
 const anchor=useRef({server:0,elapsed:0,tick:0,state:'not_started'});
 const accept=useCallback((value:AttendanceDay)=>{
  dayOwner.current=viewer.current;setDay(value);
  anchor.current={server:Date.parse(value.serverTime),elapsed:value.elapsedSeconds,tick:performance.now(),state:value.state};
  setElapsed(value.elapsedSeconds);
 },[]);
 const refresh=useCallback(async(recover=false)=>{
  if(!user||(inFlight.current&&!recover))return;
  const owner=user.id,stamp=++generation.current;refreshing.current++;
  const current=()=>stamp===generation.current&&viewer.current===owner;
  try{const value=await getMyAttendance();if(current()){accept(value);setError('');}}
  catch(e){if(current())setError((e as Error).message);}
  finally{refreshing.current--;if(current())setLoading(false);}
 },[user?.id,accept]);
 useEffect(()=>{
  setDay(null);dayOwner.current=undefined;setLoading(!!user);setBusy(false);setError('');setElapsed(0);
  anchor.current={server:0,elapsed:0,tick:performance.now(),state:"not_started"};
  inFlight.current=null;void refresh();
  const poll=()=>{if(document.visibilityState==='visible'&&!inFlight.current&&!refreshing.current)void refresh();};
  const timer=setInterval(poll,30000);
  window.addEventListener('focus',poll);window.addEventListener('online',poll);window.addEventListener('attendance-updated',poll);document.addEventListener('visibilitychange',poll);
  return()=>{generation.current++;window.removeEventListener('focus',poll);window.removeEventListener('online',poll);window.removeEventListener('attendance-updated',poll);document.removeEventListener('visibilitychange',poll);clearInterval(timer);};
 },[refresh]);
 useEffect(()=>{const timer=setInterval(()=>setElapsed(Math.max(0,anchor.current.elapsed+(anchor.current.state==='working'?Math.floor((performance.now()-anchor.current.tick)/1000):0))),1000);return()=>clearInterval(timer);},[]);
 const act=useCallback(async(action:ClockAction,evidence?:ClockEvidence)=>{
  if(!day||!user||dayOwner.current!==user.id||inFlight.current)return false;
  const owner=user.id,token={};inFlight.current=token;setBusy(true);setError('');
  const stamp=++generation.current;
  const current=()=>stamp===generation.current&&viewer.current===owner;
  // Reuse the same ID and revision if the server committed but its response was lost.
  const request=crypto.randomUUID();
  try{
   let value:AttendanceDay;
   try{value=await recordMyAttendance(action,request,day,evidence);}
   catch(first){
    if(!current())return false;
    if(/fetch|network|timed? ?out/i.test((first as Error).message))value=await recordMyAttendance(action,request,day,evidence);
    else throw first;
   }
   if(!current())return false;
   accept(value);window.dispatchEvent(new Event('attendance-updated'));return value;
  }catch(e){
   if(!current())return false;
   const message=(e as Error).message;
   await refresh(true);
   if(viewer.current===owner&&inFlight.current===token)setError(message);
   return false;
  }finally{
   if(inFlight.current===token){inFlight.current=null;if(viewer.current===owner)setBusy(false);}
  }
 },[day,user?.id,accept,refresh]);
 // Do not expose the recovery override to click events or ordinary callers.
 return{day,elapsed,busy,error,loading,refresh:()=>refresh(),act};
}
