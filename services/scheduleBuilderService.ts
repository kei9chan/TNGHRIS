import {supabase} from './supabaseClient';
import type {ShiftAssignment} from '../types';
import type {ScheduleScope} from '../modules/payroll/scheduleScope';
export type EmployeeScope=ScheduleScope;
export const mapBuilderAssignment=(row:any):ShiftAssignment=>({id:row.id,employeeId:row.employee_id,shiftTemplateId:row.shift_template_id,date:new Date(row.date+'T00:00:00'),locationId:'OFFICE-MAIN',assignedAreaId:row.assigned_area_id||undefined});
export async function loadBuilder(scope:EmployeeScope,week:string){
 const {data,error}=await supabase.rpc('get_schedule_builder_data',{p_scope:scope,p_week:week});
 if(error)throw new Error(error.message);
 if(!data||!Array.isArray(data.people)||!Array.isArray(data.assignments)||!Array.isArray(data.statuses))throw new Error('The server returned an incomplete schedule. Please retry.');
 return data;
}
export async function saveBuilderShift(scope:EmployeeScope,week:string,employee:string,date:string,template:string,existing?:ShiftAssignment){
 const {data,error}=await supabase.rpc('save_schedule_builder_shift',{p_scope:scope,p_week:week,p_employee:employee,p_date:date,p_template:template,p_expected_id:existing?.id??null,p_expected_template:existing?.shiftTemplateId??null});
 if(error)throw new Error(error.message);
 if(!data?.id||data.employee_id!==employee||data.date!==date||data.shift_template_id!==template)throw new Error('The server did not confirm this shift. Your selection has been kept. Please retry.');
 const saved=await loadBuilder(scope,week);
 if(!saved.assignments.some((r:any)=>r.id===data.id&&r.employee_id===employee&&r.date===date&&r.shift_template_id===template))throw new Error('The shift could not be read back after saving. Your selection has been kept. Please retry.');
 return saved;
}

export async function publishBuilderWeek(scope:EmployeeScope,employees:string[],week:string,reference:string,rows:{employeeId:string;draftHash:string}[]){
 const {data,error}=await supabase.rpc('publish_schedule_builder_week',{p_scope:scope,p_employee_ids:employees,p_week:week,p_reference:reference,p_expected:Object.fromEntries(rows.map(r=>[r.employeeId,r.draftHash]))});
 if(error)throw new Error(error.message);
 return data;
}
