export type CaseRow = Record<string, string | number | boolean | null> & {id: string; incidentId: string; employeeId: string; status: string; stage: string};
export type Filters = Record<string,string>;
export const columns = [
 ['reference','Case/IR Reference Number'],['nteReference','NTE Reference Number'],['businessUnit','Business Unit'],['department','Department'],
 ['employee','Employee Name'],['position','Position'],['employmentStatus','Employment Status'],['summary','Brief Summary of Incident'],
 ['offense','Type of Offense'],['policy','Code/Policy Violated'],['incidentDate','Incident Date'],['reportedDate','Date Reported'],
 ['servedDate','NTE Served On'],['replyDate','Employee Replied On'],['dueDate','Response Due Date'],['stage','Current Workflow Stage'],
 ['status','Case Status'],['pendingDays','Number of Pending Days'],['action','Disciplinary Action Implemented'],['decisionDate','Notice of Decision Date'],
 ['handler','Case Handler'],['nteDocument','NTE Document Reference'],['replyDocument','Employee Reply Reference'],['decisionDocument','Notice of Decision Reference'],['closedDate','Date Closed'],
] as const;
export const defaultColumns = ['reference','nteReference','businessUnit','employee','offense','reportedDate','dueDate','stage','status','pendingDays','handler'];
export const confidentiality = 'CONFIDENTIAL — Personnel and disciplinary records. Authorized use only. Do not distribute outside the approved recipients.';
export function safeLink(value: unknown, origin: string): string | null {
 if(typeof value!=='string' || !value.trim()) return null;
 try { const u=new URL(value,origin); return u.protocol==='https:' && !u.username && !u.password && (value.startsWith('https://') || value.startsWith('/feedback/cases?')) ? u.href : null; } catch {return null;}
}
export function cellValue(row: CaseRow,key: string,origin: string): string | number {
 const value=row[key]; if(value===null || value===undefined) return '';
 if(key.endsWith('Document')) return safeLink(value,origin)||String(value);
 if(key.endsWith('Date')) {const d=new Date(String(value));return Number.isFinite(d.getTime())?d.toLocaleString('sv-SE',{timeZone:'Asia/Manila',hour12:false}):'';}
 return typeof value==='number'?value:String(value);
}
export function csvCell(value: unknown): string {
 let s=String(value??''); if(/^[\s\u0000-\u001f]*[=+@-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;
 return '"'+s.replace(/"/g,'""')+'"';
}
export function reportSummary(rows:CaseRow[]) {
 const groups=new Map<string,{businessUnit:string;offense:string;total:number;open:number;closed:number;overdue:number;days:number;samples:number}>();
 for(const r of rows){const key=JSON.stringify([r.businessUnit,r.offense]);const g=groups.get(key)||{businessUnit:String(r.businessUnit||'Not recorded'),offense:String(r.offense||'Not recorded'),total:0,open:0,closed:0,overdue:0,days:0,samples:0};g.total++;if(r.stage==='Closed')g.closed++;else g.open++;if(r.overdue)g.overdue++;if(typeof r.resolutionDays==='number'){g.days+=r.resolutionDays;g.samples++;}groups.set(key,g);}
 return [...groups.values()].map(g=>[g.businessUnit,g.offense,g.total,g.open,g.closed,g.overdue,g.samples?Math.round(g.days/g.samples*10)/10:'',g.samples]);
}
export function exportFilters(base:Filters,scope:string,bu:string,status:string,from:string,to:string):Filters {
 const f=scope==='all'?{}:{...base};
 if(scope==='bu'){if(!bu)throw new Error('Choose a Business Unit.');if(f.buId&&f.buId!==bu)throw new Error('Choose the filtered Business Unit, or clear the BU filter first.');f.buId=bu;}
 if(status){if(f.status && f.status!==status)throw new Error('The export status conflicts with the table filter. Clear or change the table status first.');f.status=status;}
 if(from) f.from=f.from && f.from>from?f.from:from;
 if(to) f.to=f.to && f.to<to?f.to:to;
 if(f.from && f.to && f.from>f.to)throw new Error('The export date range does not overlap the applied filters.');
 return f;
}
