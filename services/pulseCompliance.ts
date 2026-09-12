export type ComplianceRow = {id:string;name:string;employeeNumber?:string;businessUnit?:string;department?:string;position?:string;employmentStatus?:string;roles?:string[];isManager?:boolean;addedAt:string;completedAt?:string;complianceStatus:string;canRemind:boolean};
export type ComplianceFilters = {businessUnit:string;department:string;level:string;classification:string;status:string;search:string};
export const emptyComplianceFilters = ():ComplianceFilters=>({businessUnit:'',department:'',level:'',classification:'',status:'',search:''});
export function filterCompliance(rows:ComplianceRow[],f:ComplianceFilters):ComplianceRow[]{return rows.filter(r=>{
 const employment=(r.employmentStatus||'').trim().toLowerCase();
 const classification=!f.classification || (f.classification==='regular'?employment==='regular':f.classification==='nonRegular'?!!employment&&employment!=='regular':f.classification==='seasonal'?['seasonal','seasonal employee'].includes(employment):f.classification==='consultants'?['consultant','consultants','consultant / contractor'].includes(employment):f.classification==='managers'?r.isManager:false);
 return (!f.businessUnit||r.businessUnit===f.businessUnit)&&(!f.department||r.department===f.department)&&(!f.level||(f.level==='manager'?r.isManager:f.level==='nonManager'?!r.isManager:r.roles?.includes(f.level.slice(5))))&&classification&&(!f.status||r.complianceStatus===f.status)&&[r.name,r.employeeNumber].join(' ').toLowerCase().includes(f.search.trim().toLowerCase());
 });}
export function complianceCsv(rows:ComplianceRow[],title:string,publication:any):string{
 const cell=(v:unknown)=>{let s=String(v??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
 return [['Survey',title],['Published at (server timestamp)',publication?.published_at],['Original audience criteria',JSON.stringify(publication?.criteria||{})],[],['Employee','Employee ID','Business unit at assignment','Department at assignment','Position at assignment','Employment classification at assignment','Manager at assignment','Roles at assignment','Assigned at','Compliance status','Completed at (server timestamp)'],...rows.map(r=>[r.name,r.employeeNumber,r.businessUnit,r.department,r.position,r.employmentStatus,r.isManager?'Yes':'No',r.roles?.join('; '),r.addedAt,r.complianceStatus,r.completedAt])].map(row=>row.map(cell).join(',')).join('\r\n');
}

export function complianceSummary(rows:ComplianceRow[]) {
 const count=(status:string)=>rows.filter(r=>r.complianceStatus.toLowerCase()===status).length;
 const completed=count('completed'), pending=count('pending'), overdue=count('overdue');
 const excluded=count('excluded')+count('withdrawn');
 const eligible=rows.length-excluded;
 return {total:rows.length,completed,pending,overdue,excluded,percentage:eligible?Math.round(10000*completed/eligible)/100:0};
}

// Every sheet is built from the server-authorized, filtered recipient set.
export function complianceExportSheets(report:any,filters:ComplianceFilters) {
 const rows:ComplianceRow[]=report.rows||[];
 const criteria=JSON.stringify(filters), summary=complianceSummary(rows);
 const metadata=[['Survey',report.title],['Published at',report.publication?.published_at||'Not recorded'],['Due date',report.dueDate||'Not set'],['Filter criteria',criteria]];
 const details=[...metadata,[],['Employee','Employee ID','Business Unit','Department','Managerial Level','Employment Classification','Compliance Status','Completed / acknowledged at','Last reminder sent at','Current response status'],...rows.map((r:any)=>[r.name,r.employeeNumber,r.businessUnit,r.department,r.isManager?'Manager':'Non-manager',r.employmentStatus,r.complianceStatus,r.completedAt||'',r.lastReminderAt||'Not recorded',r.completedAt?'Submitted':'Not submitted'])];
 const totals=(s:ReturnType<typeof complianceSummary>)=>[s.total,s.completed,s.pending,s.overdue,s.excluded,s.percentage];
 const summaryRows:any[][]=[...metadata,[],['Summary','Total recipients','Completed','Pending (not overdue)','Overdue','Excluded / withdrawn','Compliance %'],['Filtered recipients',...totals(summary)]];
 const groups:[string,(r:ComplianceRow)=>string][]=[['Business Unit',r=>r.businessUnit||'Not recorded'],['Department',r=>r.department||'Not recorded'],['Managerial Level',r=>r.isManager?'Manager':'Non-manager'],['Employment Classification',r=>r.employmentStatus||'Not recorded']];
 for(const [label,key] of groups){summaryRows.push([], [label,'Total recipients','Completed','Pending (not overdue)','Overdue','Excluded / withdrawn','Compliance %']);for(const name of [...new Set(rows.map(key))].sort())summaryRows.push([name,...totals(complianceSummary(rows.filter(r=>key(r)===name)))]);}
 const results:any[][]=[...metadata,[],['Results handling',report.resultsNotice||'Latest submitted response per filtered recipient'],['Question','Answer / selection','Response count','Average score']];
 for(const q of report.results||[])results.push([q.question,q.answer,q.count,q.average??'']);
 if(!report.results?.length)results.push(['No reportable answers in the selected recipient set.']);
 return {'Compliance Details':details,'Compliance Summary':summaryRows,'Survey Results':results};
}
