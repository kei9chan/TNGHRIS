import type {ReviewTimeRow} from './attendanceReadiness';

export type ReadinessCategory='attendance'|'schedule'|'payroll_setup'|'overtime';
export type SetupDependency={key:string;label:string;detail:string;action:string;path:string;dates:string[];blocking:boolean};
export type ReadinessIssue={category:ReadinessCategory;label:string;raw:string;date:string;blocking:boolean;action:string;path:string};
export type EmployeeReadinessCard={key:string;employeeId:string;employeeName:string;employeeCode:string;businessUnit:string;from:string;to:string;issues:ReadinessIssue[];setup:SetupDependency[];counts:Record<ReadinessCategory,number>;total:number;status:'Ready'|'Needs attention'|'Blocking payroll';days:ReviewTimeRow[]};

export function specificIssue(issue:string,date:string):ReadinessIssue{
 const text=issue.toLowerCase();
 if(/salary|pay package|base.pay/.test(text))return {category:'payroll_setup',label:'Approved salary source — Missing',raw:issue,date,blocking:true,action:'Add salary source',path:'/payroll/pay-packages'};
 if(/employment start|employee profile information incomplete|hire date/.test(text))return {category:'payroll_setup',label:'Timekeeping setup needed — Employment start date is missing',raw:issue,date,blocking:true,action:'Open employee setup',path:'/employees'};
 if(/classification|payroll group|business.unit assignment|pay frequency|tax|benefit/.test(text))return {category:'payroll_setup',label:`Payroll setup needed — ${issue}`,raw:issue,date,blocking:true,action:'Open employee setup',path:'/employees'};
 if(/schedule|shift|roster/.test(text)&&!/ot|overtime/.test(text))return {category:'schedule',label:'Published schedule — Missing',raw:issue,date,blocking:true,action:'Open schedule',path:'/payroll/timekeeping'};
 if(/ot|overtime|rest.day|offset/.test(text))return {category:'overtime',label:'Overtime approval needs review',raw:issue,date,blocking:true,action:'Review overtime',path:'/payroll/overtime-requests'};
 if(/break|lunch/.test(text))return {category:'attendance',label:'Missing or extended break',raw:issue,date,blocking:true,action:'Open correction',path:'/payroll/historical-corrections'};
 if(/punch|clock/.test(text))return {category:'attendance',label:'Missing punch',raw:issue,date,blocking:true,action:'Open correction',path:'/payroll/historical-corrections'};
 if(/late|undertime|absence/.test(text))return {category:'attendance',label:issue.replace(/employee profile information incomplete/ig,'Timekeeping setup needed'),raw:issue,date,blocking:false,action:'Review attendance',path:'/payroll/historical-corrections'};
 return {category:'attendance',label:issue.replace(/employee profile information incomplete/ig,'Timekeeping setup needed'),raw:issue,date,blocking:true,action:'Review issue',path:'/payroll/daily-review'};
}

export function setupDependencies(rows:ReviewTimeRow[],extra:SetupDependency[]=[]){
 const map=new Map<string,SetupDependency>();
 for(const row of rows)for(const raw of row.issues){const issue=specificIssue(raw,row.date);if(issue.category!=='payroll_setup'&&issue.category!=='schedule')continue;const key=`${issue.category}:${issue.label}`;const prior=map.get(key);if(prior){if(!prior.dates.includes(row.date))prior.dates.push(row.date);}else map.set(key,{key,label:issue.label,detail:issue.category==='schedule'?'These dates cannot be evaluated until a schedule is published.':'A required payroll or timekeeping field is missing for this employee and business unit.',action:issue.action,path:issue.path,dates:[row.date],blocking:true});}
 for(const item of extra){const prior=map.get(item.key);if(prior)prior.dates=[...new Set([...prior.dates,...item.dates])];else map.set(item.key,{...item,dates:[...new Set(item.dates)]});}
 return [...map.values()].map(item=>({...item,dates:item.dates.sort()}));
}

export function groupEmployeeReadiness(rows:ReviewTimeRow[],businessUnit:string,from:string,to:string,extra:Record<string,SetupDependency[]>={}):EmployeeReadinessCard[]{
 const groups=new Map<string,ReviewTimeRow[]>();
 for(const row of rows){const key=`${row.employeeId}:${businessUnit}`;groups.set(key,[...(groups.get(key)||[]),row]);}
 const order:Record<EmployeeReadinessCard['status'],number>={'Blocking payroll':0,'Needs attention':1,Ready:2};
 return [...groups.entries()].map(([key,days])=>{
  days.sort((a,b)=>a.date.localeCompare(b.date));
  const setup=setupDependencies(days,extra[days[0].employeeId]||[]);
  const issues=days.flatMap(day=>day.issues.map(raw=>specificIssue(raw,day.date))).filter(issue=>(issue.category!=='payroll_setup'&&issue.category!=='schedule')||!setup.some(item=>item.label===issue.label));
  const counts={attendance:issues.filter(i=>i.category==='attendance').length,schedule:setup.filter(i=>i.key.startsWith('schedule:')).length,payroll_setup:setup.filter(i=>!i.key.startsWith('schedule:')).length,overtime:issues.filter(i=>i.category==='overtime').length};
  const total=counts.attendance+counts.schedule+counts.payroll_setup+counts.overtime;
  const blocking=setup.some(item=>item.blocking)||issues.some(item=>item.blocking);
  const status:EmployeeReadinessCard['status']=blocking?'Blocking payroll':total?'Needs attention':'Ready';
  return {key,employeeId:days[0].employeeId,employeeName:days[0].employeeName,employeeCode:(days[0] as ReviewTimeRow&{employeeCode?:string}).employeeCode||days[0].employeeId.slice(0,8),businessUnit,from,to,issues,setup,counts,total,status,days};
 }).sort((a,b)=>order[a.status]-order[b.status]||a.employeeName.localeCompare(b.employeeName));
}

export type AttendanceFixCandidate={key:string;employeeId:string;employeeName:string;date:string;scheduled:string;actual:string;difference:number;eligible:boolean;reason:string;row:ReviewTimeRow};
const firstPunch=(row:ReviewTimeRow)=>row.evidence?.punches.find(p=>/clock.?in/i.test(p.type));
const firstShift=(row:ReviewTimeRow)=>row.evidence?.shifts.find(shift=>shift.kind!=='rest'&&shift.start)||row.evidence?.shifts.find(shift=>shift.start);
export function attendanceFixCandidates(rows:ReviewTimeRow[],graceMinutes=5):AttendanceFixCandidate[]{
 return rows.flatMap(row=>{const shift=firstShift(row),punch=firstPunch(row);if(!shift?.start||!punch?.timestamp)return [];const scheduledStamp=Date.parse(`${row.date}T${shift.start.length===5?shift.start+':00':shift.start}+08:00`),actualStamp=Date.parse(punch.timestamp);const difference=Math.max(0,Math.round((actualStamp-scheduledStamp)/60000));if(difference<1)return [];return [{key:`${row.employeeId}:${row.date}`,employeeId:row.employeeId,employeeName:row.employeeName,date:row.date,scheduled:shift.start,actual:new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',hour:'numeric',minute:'2-digit'}).format(new Date(actualStamp)),difference,eligible:difference<=graceMinutes,reason:difference<=graceMinutes?'Within grace':'Needs detailed review',row}];});
}

export function presetForIssue(issue:string){const text=issue.toLowerCase();if(/break|lunch/.test(text))return ['use_scheduled_break','mark_break_compliant','keep_exception'] as const;if(/clock.?out|missing punch/.test(text))return ['use_scheduled_end','send_clarification','keep_exception'] as const;if(/schedule/.test(text))return ['open_schedule','copy_previous_schedule','request_schedule_confirmation'] as const;if(/late/.test(text))return ['review_lateness','approved_adjustment','send_manager','keep_exception'] as const;return ['open_advanced','send_clarification','keep_exception'] as const;}
