import {useCallback,useEffect,useRef,useState} from 'react';
import type {ClockEvidence} from '../services/attendanceChannels';
import {useAuth} from './useAuth';
import {AttendanceDay,ClockAction,getMyAttendance,recordMyAttendance} from '../services/employeeAttendance';

export function useAttendanceClock(){
 const {user}=useAuth();const [day,setDay]=useState<AttendanceDay|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [loading,setLoading]=useState(true);
 const [elapsed,setElapsed]=useState(0);const inFlight=useRef(false);const generation=useRef(0);const anchor=useRef({server:0,elapsed:0,tick:0,state:'not_started'});
 const accept=useCallback((value:AttendanceDay)=>{setDay(value);anchor.current={server:Date.parse(value.serverTime),elapsed:value.elapsedSeconds,tick:performance.now(),state:value.state};setElapsed(value.elapsedSeconds);},[]);
 const refresh=useCallback(async()=>{if(!user)return;const stamp=++generation.current;try{const value=await getMyAttendance();if(stamp===generation.current){accept(value);setError('');}}catch(e){if(stamp===generation.current)setError((e as Error).message);}finally{if(stamp===generation.current)setLoading(false);}},[user?.id,accept]);
 useEffect(()=>{setDay(null);setLoading(true);void refresh();const timer=setInterval(()=>{if(document.visibilityState==='visible'&&!inFlight.current)void refresh();},10000);
 const onFocus=()=>{if(!inFlight.current)void refresh();};window.addEventListener('focus',onFocus);window.addEventListener('online',onFocus);window.addEventListener('attendance-updated',onFocus);document.addEventListener('visibilitychange',onFocus);
 return()=>{generation.current++;clearInterval(timer);window.removeEventListener('focus',onFocus);window.removeEventListener('online',onFocus);window.removeEventListener('attendance-updated',onFocus);document.removeEventListener('visibilitychange',onFocus);};},[refresh]);
 useEffect(()=>{const timer=setInterval(()=>setElapsed(Math.max(0,anchor.current.elapsed+(anchor.current.state==='working'?Math.floor((performance.now()-anchor.current.tick)/1000):0))),1000);return()=>clearInterval(timer);},[]);
 const act=useCallback(async(action:ClockAction,evidence?:ClockEvidence)=>{if(!day||inFlight.current)return false;inFlight.current=true;setBusy(true);setError('');const stamp=++generation.current;
 // Same request identifier survives the one network retry. The server also compares
 // the observed revision, so another device's action cannot create a duplicate.
 const request=crypto.randomUUID();try{let value:AttendanceDay;try{value=await recordMyAttendance(action,request,day,evidence);}catch(first){if(/fetch|network|timeout/i.test((first as Error).message))value=await recordMyAttendance(action,request,day,evidence);else throw first;}if(stamp!==generation.current)return false;accept(value);window.dispatchEvent(new Event('attendance-updated'));return value;}
 catch(e){const message=(e as Error).message;await refresh();setError(message);return false;}finally{inFlight.current=false;setBusy(false);}},[day,accept,refresh]);
 return{day,elapsed,busy,error,loading,refresh,act};
}
