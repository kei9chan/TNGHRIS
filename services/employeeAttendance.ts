import type {ClockEvidence} from './attendanceChannels';
import {supabase} from './supabaseClient';
export type ClockAction='CLOCK_IN'|'START_BREAK'|'END_BREAK'|'CLOCK_OUT';
export type ClockState='not_started'|'working'|'on_break'|'completed';
export type ClockEvent={id?:string;type:ClockAction;timestamp:string};
export type PublishedShift={id:string;templateId:string;name:string;start:string;end:string;kind:'work'|'rest'|'no_schedule';flexible:boolean;paidMinutes:number|null;endDayOffset:number|null};
export type AttendanceDay={serverTime:string;timezone:string;workDate:string;sessionId:string|null;revision:number;state:ClockState;schedule:{publicationId:string|null;version:number|null;date:string;entries:PublishedShift[];published:boolean};requiresClock:boolean;exceptionId:string|null;elapsedSeconds:number;breakSeconds:number;events:ClockEvent[];canManage:boolean;attendanceIssues?:{id:string;kind:'absence'|'early'|'late'|'punch';status:string;time:string|null;approvedAt:string|null;approvedBy:string|null}[];originalEvents?:ClockEvent[];audit?:{id:string;revision:number;reason:string;created_by:string;createdByName?:string;created_at:string;events:ClockEvent[]}[]};
export type ClockException={id:string;record_id:string;revision:number;employee_id:string;employeeName:string;exception_type:string;requires_clock:boolean;effective_from:string;effective_to:string|null;reason:string;created_by:string;createdByName:string;created_at:string};
export type ExceptionAdmin={today:string;employees:{id:string;name:string}[];records:ClockException[]};
async function rpc<T>(name:string,args:Record<string,unknown>={}):Promise<T>{const {data,error}=await supabase.rpc(name,args);if(error)throw new Error(error.message);return data as T;}
export const getMyAttendance=()=>rpc<AttendanceDay>('get_my_attendance');
export const recordMyAttendance=(action:ClockAction,requestId:string,day:AttendanceDay,evidence?:ClockEvidence)=>rpc<AttendanceDay>(evidence?'record_my_attendance_verified':'record_my_attendance',{p_action:action,p_request_id:requestId,p_expected_revision:day.revision,p_work_date:day.workDate,...(evidence?{p_evidence:evidence}:{})});
export const getExceptionAdmin=()=>rpc<ExceptionAdmin>('get_attendance_exception_admin');
export const saveClockException=(input:{employee:string;recordId:string|null;revision:number;type:string;requiresClock:boolean;from:string;to:string|null;reason:string})=>rpc<string>('save_attendance_exception',{p_employee:input.employee,p_record_id:input.recordId,p_expected_revision:input.revision,p_type:input.type,p_requires_clock:input.requiresClock,p_from:input.from,p_to:input.to,p_reason:input.reason});
export const getHrAttendanceDay=(employee:string,date:string)=>rpc<AttendanceDay>('get_hr_attendance_day',{p_employee:employee,p_date:date});
export const correctAttendanceDay=(employee:string,date:string,revision:number,events:ClockEvent[],reason:string)=>rpc<AttendanceDay>('correct_attendance_day',{p_employee:employee,p_date:date,p_expected_revision:revision,p_events:events,p_reason:reason});
