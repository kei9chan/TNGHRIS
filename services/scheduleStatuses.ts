import {supabase} from './supabaseClient';
import type {LeaveRequest,ShiftAssignment,ShiftTemplate} from '../types';
export type DayTag='rest'|'skeletal'|'company_holiday'|'absence'|'suspended';
export type DayStatus={id:string;employee_id:string;work_date:string;tag:DayTag|null;revision:number};
export const statusPresets=[{tag:'rest',label:'Rest Day',color:'bg-gray-200 text-gray-800'},{tag:'skeletal',label:'Skeletal',color:'bg-orange-100 text-orange-800'},{tag:'company_holiday',label:'Company Holiday',color:'bg-violet-100 text-violet-800'},{tag:'absence',label:'Absence · for review',color:'bg-red-100 text-red-800'},{tag:'suspended',label:'Suspended',color:'bg-cyan-100 text-cyan-900'}] as const;
export const dateKey=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export async function getDayStatuses(ids:string[],from:string,to:string){if(!ids.length)return [];const {data,error}=await supabase.rpc('get_schedule_day_statuses',{p_employees:ids,p_from:from,p_to:to});if(error)throw error;return data as DayStatus[];}
export async function setDayStatus(employee:string,date:string,tag:DayTag|null,reason?:string){const {error}=await supabase.rpc('set_schedule_day_status',{p_employee:employee,p_date:date,p_tag:tag,p_reason:reason||(tag?`Manager assigned ${tag} in the weekly roster`:'Manager restored the underlying shift')});if(error)throw error;}
export function leaveForDay(leaves:LeaveRequest[],employee:string,date:Date){return leaves.find(l=>l.employeeId===employee&&l.status==='Approved'&&dateKey(date)>=dateKey(new Date(l.startDate))&&dateKey(date)<=dateKey(new Date(l.endDate)));}
export function leaveLabel(l:LeaveRequest){return `${(l as any).paid===true?'Paid':(l as any).paid===false?'Unpaid':'Pay status unconfirmed'} Leave${l.startTime||l.endTime?' · partial day':''}`;}
