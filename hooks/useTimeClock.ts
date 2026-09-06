import {useMemo} from 'react';
import {useAuth} from './useAuth';
import {useAttendanceClock} from './useAttendanceClock';
import {TimeEvent,TimeEventType,TimeEventSource,ShiftAssignment} from '../types';
export class DebounceError extends Error{constructor(message:string){super(message);this.name='DebounceError';}}
// Legacy input screens now share the same server clock. Client timestamps, target
// employee identifiers and inferred auto-close times are never written.
export const useTimeClock=(_simulateFailures=false)=>{
 const {user}=useAuth();const clock=useAttendanceClock();
 const lastEvent=useMemo(()=>{const e=clock.day?.events.at(-1);return e&&user?{id:e.id??'',employeeId:user.id,timestamp:new Date(e.timestamp),type:e.type as TimeEventType,source:TimeEventSource.System,locationId:'',extra:{timezone:'Asia/Manila',anomaly_tags:[]}} as TimeEvent:null;},[clock.day,user?.id]);
 const todaysShift=useMemo(()=>{const e=clock.day?.schedule.entries[0];return e&&user?{id:e.id,employeeId:user.id,shiftTemplateId:e.templateId,date:new Date(clock.day!.workDate+'T00:00:00+08:00'),locationId:''} as ShiftAssignment:undefined;},[clock.day,user?.id]);
 const addTimeEvent=async(event:Omit<TimeEvent,'id'|'employeeId'>)=>{const success=await clock.act(event.type as 'CLOCK_IN'|'START_BREAK'|'END_BREAK'|'CLOCK_OUT');if(!success)throw new Error('Clock action was not saved. Refresh your attendance dashboard to see the current state.');};
 const addBatchTimeEvents=async(_events:TimeEvent[])=>{throw new Error('Use HR attendance review to record verified corrections. Direct attendance imports are not enabled.');};
 const autoCloseStaleShifts=async(_hours:number):Promise<number>=>{throw new Error('An open shift needs HR review; a clock-out time cannot be invented.');};
 return{attendance:clock,isLoading:clock.loading,clockInStatus:(clock.day?.state==='working'||clock.day?.state==='on_break'?'in':'out') as 'in'|'out',lastEvent,todaysShift,addTimeEvent,addBatchTimeEvents,isRetrying:false,retryCount:0,autoCloseStaleShifts};
};
