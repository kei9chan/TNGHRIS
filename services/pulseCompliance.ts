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
