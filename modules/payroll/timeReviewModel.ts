import type {ReviewTimeRow,TestTimeEvidence} from './attendanceReadiness';

export const missingPunchIssue=(issue:string)=>/punch.*missing|missing.*(?:punch|clock|break)|unpaired|out-of-order|duplicate.*clock/i.test(issue);
const fields=['scheduledMinutes','actualMinutes','breakMinutes','lateMinutes','undertimeMinutes','approvedOtMinutes','actualOtMinutes'] as const;
export function timeTotals(rows:ReviewTimeRow[]){
 const totals=Object.fromEntries(fields.map(field=>[field,rows.reduce((sum,row)=>sum+row[field],0)])) as Record<typeof fields[number],number>;
 return {...totals,days:rows.length,blockedDays:rows.filter(r=>!r.ready).length,publishedDays:rows.filter(r=>r.evidence?.scheduleStatus==='published').length,missingPunchDays:rows.filter(r=>r.issues.some(missingPunchIssue)).length,leaveDays:rows.filter(r=>r.approvedFullLeave).length};
}
export function employeeReviews(rows:ReviewTimeRow[],test:TestTimeEvidence[]=[]){
 const grouped=new Map<string,{id:string;name:string;days:ReviewTimeRow[];test:TestTimeEvidence[]}>();
 for(const row of rows){if(!grouped.has(row.employeeId))grouped.set(row.employeeId,{id:row.employeeId,name:row.employeeName,days:[],test:[]});grouped.get(row.employeeId)!.days.push(row);}
 for(const record of test){if(!grouped.has(record.employeeId))grouped.set(record.employeeId,{id:record.employeeId,name:record.employeeName,days:[],test:[]});grouped.get(record.employeeId)!.test.push(record);}
 return [...grouped.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id)).map(employee=>({...employee,days:employee.days.sort((a,b)=>a.date.localeCompare(b.date)),totals:timeTotals(employee.days)}));
}
export function correctionWorkflow(issue:string){
 if(/official business|\bOB\b/i.test(issue))return {path:'/official-business',label:'Review OB approval',owner:'HR / approving manager'};
 if(/offset/i.test(issue))return {path:'/payroll/attendance-readiness#offset-approvals',label:'Review offset approvals',owner:'HR → GM → BOD'};
 if(/leave/i.test(issue))return {path:'/payroll/leave',label:'Review leave',owner:'Leave approver / HR'};
 if(/WFH/i.test(issue))return {path:'/payroll/wfh-requests',label:'Review WFH',owner:'WFH approver'};
 if(/employment|inactive employee|hire date/i.test(issue))return {path:'/employees',label:'Review employee record',owner:'HR'};
 if(/rules|holiday calendar|policy|classification/i.test(issue))return {path:'/payroll/attendance-readiness#attendance-references',label:'Review attendance references',owner:'Authorized HR'};
 if(/punch|clock|break end|lunch.*logs/i.test(issue))return {path:'/payroll/historical-corrections',label:'Review actual-time evidence',owner:'Authorized HR'};
 if(/schedule|shift|roster/i.test(issue)&&!/OT|overtime/i.test(issue))return {path:'/payroll/timekeeping',label:'Review and publish schedule',owner:'Scheduling manager'};
 if(/OT|overtime|worked|rest-day|compensation/i.test(issue))return {path:'/payroll/overtime-requests',label:'Review approved OT / worked time',owner:'OT approver / HR'};
 return {path:'/payroll/daily-review',label:'Open daily time review',owner:'HR / timekeeping reviewer'};
}
export function correctionLink(issue:string,row:ReviewTimeRow){
 const target=correctionWorkflow(issue);
 if(target.path==='/payroll/historical-corrections')return {...target,path:`${target.path}?employee=${encodeURIComponent(row.employeeId)}&date=${row.date}`};
 if(target.path==='/payroll/timekeeping'){
  const d=new Date(`${row.date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
  return {...target,path:`${target.path}?week=${d.toISOString().slice(0,10)}`};
 }
 return target;
}
