export type Selection={scope:string;from:string;to:string};
export type Readiness={employees:number;totalDays:number;blockedDays:number;publishedDays:number;payVisible:boolean;savedPayEmployees:number|null;reviewedPayEmployees:number|null;savedVersions:number;submittedVersions:number;mode:string;canFinalize:boolean;checkedAt:string;issues:{issue:string;days:number}[]};
export const workspaceKey=(userId:string)=>`payroll-workspace-v1:${userId}`;
export function readSelection(storage:Pick<Storage,'getItem'>,userId:string):Selection{try{const s=JSON.parse(storage.getItem(workspaceKey(userId))||'{}');return {scope:typeof s.scope==='string'?s.scope:'',from:/^\d{4}-\d{2}-\d{2}$/.test(s.from)?s.from:'',to:/^\d{4}-\d{2}-\d{2}$/.test(s.to)?s.to:''};}catch{return {scope:'',from:'',to:''};}}
export function validCutoff(from:string,to:string){const a=Date.parse(from),b=Date.parse(to);return /^\d{4}-\d{2}-\d{2}$/.test(from)&&/^\d{4}-\d{2}-\d{2}$/.test(to)&&Number.isFinite(a)&&Number.isFinite(b)&&new Date(a).toISOString().slice(0,10)===from&&new Date(b).toISOString().slice(0,10)===to&&b>=a&&b-a<=30*86400000;}
export function modeLabel(mode?:string){return mode==='live'?'LIVE':mode==='shadow'?'TEST — NO PAYMENT':mode==='off'?'PROCESSING OFF':'MODE UNAVAILABLE';}
export function nextPayrollStep(r:Readiness|null){
 if(!r)return {label:'Check readiness',owner:'HR / Finance',path:''};
 if(!r.employees)return {label:'Review payroll scope and employees',owner:'Payroll access manager',path:'/payroll/access'};
 if(r.publishedDays<r.totalDays)return {label:'Review missing published schedules',owner:'BU manager / HR',path:'/payroll/timekeeping'};
 if(!r.payVisible)return {label:'Have HR / Finance verify pay packages',owner:'Authorized compensation reviewer',path:'/payroll/pay-packages'};
 if((r.reviewedPayEmployees||0)<r.employees)return {label:'Review dated pay packages',owner:'HR / Finance',path:'/payroll/pay-packages'};
 if(r.blockedDays)return {label:'Resolve attendance blockers',owner:'HR / BU manager',path:'/payroll/attendance-readiness'};
 if(!r.submittedVersions)return {label:r.canFinalize?'Review and submit timekeeping':'Open timekeeping for HR submission',owner:'Authorized HR finalizer',path:'/payroll/attendance-readiness'};
 if(r.mode==='off')return {label:'Review test-processing controls',owner:'Payroll access manager',path:'/payroll/gross-pay'};
 return {label:'Continue payroll calculation and review',owner:'Finance preparer',path:'/payroll/gross-pay'};
}
export const payrollGroups=[
 {name:'Schedule Builder',path:'/payroll/timekeeping',names:['Schedule Builder','Timekeeping']},
 {name:'Payroll Home',path:'/payroll/home',names:[] as string[]},
 {name:'Run Payroll',path:'/payroll/attendance-readiness',names:['Attendance Readiness','Import Historical Attendance','Gross Pay Review','Take-home Pay Review','Compare & Pilot','Payroll Approvals','Payments & Reports','Payslips']},
 {name:'Employee Pay Setup',path:'/payroll/pay-packages',names:['Pay Packages','Loan Application System','Leave Credits']},
 {name:'Reports & Settings',path:'/payroll/access',names:[] as string[]},
];
export function payrollGroupFor(name:string){return payrollGroups.find(g=>g.names.includes(name))?.name||'Reports & Settings';}
