import { supabase } from './supabaseClient';
export type OtWeekRow = { id:string;updated_at:string;canSend?:boolean;managerName?:string;handoff?:{state:string;note:string|null;returnNote:string|null;senderName:string}|null;manager_night_minutes:number|null;date:string; start_time:string|null;end_time:string|null;end_date:string|null;reason:string;status:string;requestedMinutes:number|null;reviewedMinutes:number|null;finalMinutes:number|null;canDecide:boolean;blocked:string|null;attachment_url:string|null;history_log:unknown[] };
export type OtWeek = {employeeId:string;employee:{name:string;position:string;businessUnit:string};version:string;canConfirmBaseline:boolean;requests:OtWeekRow[];summary:{weekStart:string;weekEnd:string;quantitiesMissing?:boolean;quantityIssueIds?:string[];regularMinutes:number|null;approvedMinutes:number|null;reviewedMinutes:number|null;unreviewedMinutes:number;projectedMinutes:number|null;thresholdMinutes:number;baselineSource:string;baselineMissing:boolean;requiresBod:boolean;baselineEvidence:string|null}};
export const minutesLabel=(minutes:number|null|undefined)=>minutes==null?'Not confirmed':`${Math.floor(minutes/60)}h${minutes%60?` ${minutes%60}m`:''}`;
export const workDateLabel=(date:string)=>new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric',timeZone:'Asia/Manila'}).format(new Date(`${date}T12:00:00+08:00`));
export async function getOtWeeks(ids:string[]):Promise<OtWeek[]> {
 const groups=new Map<string,OtWeek>();
 for(let i=0;i<ids.length;i+=500){const {data,error}=await supabase.rpc('get_ot_week_review',{p_ids:ids.slice(i,i+500)});if(error)throw new Error(error.message);for(const week of data||[])groups.set(`${week.employeeId}:${week.summary.weekStart}`,week);}
 return [...groups.values()].sort((a,b)=>b.summary.weekStart.localeCompare(a.summary.weekStart)||a.employee.name.localeCompare(b.employee.name));
}
export async function decideOtWeek(ids:string[],minutes:Record<string,number|{minutes:number;nightMinutes:number}>,version:string,operation:string,decision:string,note:string){
 const {data,error}=await supabase.rpc('decide_ot_week',{p_ids:ids,p_minutes:minutes,p_version:version,p_operation:operation,p_decision:decision,p_note:note||null});if(error)throw new Error(error.message);return data;
}
export async function confirmOtBaseline(employee:string,week:string,minutes:number,evidence:string){const {error}=await supabase.rpc('confirm_ot_week_baseline',{p_employee:employee,p_week:week,p_minutes:minutes,p_evidence:evidence});if(error)throw new Error(error.message);}
export async function verifyLegacyOtHours(amounts:Record<string,number>,note:string){const {data,error}=await supabase.rpc('verify_legacy_ot_hours',{p_amounts:amounts,p_note:note||null});if(error)throw new Error(error.message);return data;}

export async function getPayrollOtWeeks(employee:string,from:string,to:string):Promise<OtWeek[]> {const {data,error}=await supabase.rpc('get_payroll_ot_review',{p_employee:employee,p_from:from,p_to:to});if(error)throw new Error(error.message);return data||[];}
export async function sendPayrollOt(rows:OtWeekRow[],operation:string,note:string){const {data,error}=await supabase.rpc('send_payroll_ot_to_manager',{p_ids:rows.map(r=>r.id),p_versions:Object.fromEntries(rows.map(r=>[r.id,r.updated_at])),p_operation:operation,p_note:note.trim()||null});if(error)throw new Error(error.message);return data;}
