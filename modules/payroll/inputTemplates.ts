import {parseDelimited} from '../../services/biometricImport';
import {readImportWorkbook} from './readImportWorkbook';
import {strictDate,attendanceStamp} from './actualAttendanceImport';

export type Field={key:string;label:string;type:'text'|'date'|'datetime'|'number';required:boolean;help:string;choices?:string[]};
export type InputTemplate={type:string;version:number;title:string;meaning:string;fields:Field[];sample:Record<string,string>;notice:string};
const f=(key:string,label:string,type:Field['type']='text',required=false,help='',choices?:string[]):Field=>({key,label:label+(required?'*':' (optional)'),type,required,help,choices});
const employee=f('employeeId','Employee ID','text',true,'Use the actual HRIS ID. Keep as text to preserve leading zeros. DEMO IDs are rejected.');
const unit=f('businessUnit','Business unit','text',true,'Must match the selected business unit and employee assignment.');
const date=f('workDate','Work date','date',true,'YYYY-MM-DD or a real Excel date.');
const notes=f('notes','Notes','text',false,'Additional source information.');
const reference=f('reference','Source reference','text',false,'Keep document and source identifiers as text.');
const document=f('document','Supporting document','text',false,'Accessible HTTPS document link. The reviewer must open and verify it; a link is not approval.');
const period=f('payrollDate','Payroll release date','date',true,'The release date from the configured payroll calendar.');
const stamp=(key:string,label:string)=>f(key,label,'datetime',false,'Required when applicable. YYYY-MM-DD HH:mm in Asia/Manila. Specify the next date for overnight work.');
export const inputTemplates:Record<string,InputTemplate>={
 schedules:{type:'schedules',version:1,title:'Schedules',meaning:'One employee shift or non-working-day assignment.',notice:'Imported schedules are saved as drafts. Review and publish through Schedule Builder.',fields:[employee,f('employeeName','Employee name'),unit,date,f('dayType','Day type','text',true,'Use configured holidays; a typed holiday label does not authorize holiday pay.',['Workday','Rest day']),stamp('start','Shift start'),stamp('end','Shift end'),stamp('breakStart','Planned break start'),stamp('breakEnd','Planned break end'),f('department','Department or work area'),notes],sample:{employeeId:'DEMO-001',employeeName:'Sample Employee',businessUnit:'Bakebe - SM Aura',workDate:'2026-08-26',dayType:'Workday',start:'2026-08-26 09:00',end:'2026-08-26 18:00',breakStart:'2026-08-26 12:00',breakEnd:'2026-08-26 13:00'}},
 'leave-balances':{type:'leave-balances',version:1,title:'Leave opening balances',meaning:'One employee, leave type and as-of date.',notice:'Enter the remaining balance at the END of the as-of date, not annual entitlement. Earlier leave usage is already included. Approval is required.',fields:[employee,f('leaveType','Leave type','text',true,'Choose the HRIS leave type.',['Vacation Leave','Sick Leave','Offset Leave']),f('balance','Opening balance in days','number',true,'Remaining days, including fractions. Zero is allowed.'),f('asOf','Balance as-of date','date',true,'Balance AFTER all transactions on this date.'),reference,document,notes],sample:{employeeId:'DEMO-001',leaveType:'Vacation Leave',balance:'3.50',asOf:'2026-08-25',reference:'Opening balance migration'}},
 'leave-taken':{type:'leave-taken',version:1,title:'Leave taken',meaning:'One dated leave request. Opening balances do not establish leave taken.',notice:'Imported leave follows the existing approval route. Imported approval references do not bypass review.',fields:[employee,f('leaveType','Leave type','text',true,'Use the exact HRIS leave type.'),f('startDate','Start date','date',true),f('endDate','End date','date',true),f('dayPart','Full or partial day','text',true,'Partial day requires start/end times.',['Full day','Partial day']),f('duration','Duration','number',true,'Positive number of days or hours.'),f('durationUnit','Duration unit','text',true,'Hours must correspond to the dated schedule.',['Days','Hours']),stamp('start','Partial-day start'),stamp('end','Partial-day end'),f('approvalReference','Approval reference','text',true,'Original approved leave reference or evidence description. HRIS approval is still required.'),document,notes],sample:{employeeId:'DEMO-001',leaveType:'Vacation Leave',startDate:'2026-09-02',endDate:'2026-09-02',dayPart:'Full day',duration:'1',durationUnit:'Days',approvalReference:'DEMO-LEAVE-001'}},
 deductions:{type:'deductions',version:1,title:'Loans and authorized deductions',meaning:'One existing obligation, with the outstanding balance after prior repayments.',notice:'Finance must verify authority evidence before deductions become eligible. Do not include past repayments in the new balance.',fields:[employee,f('reference','Obligation reference','text',true,'Unique existing loan or deduction reference. Preserve leading zeros.'),f('kind','Type','text',true,'Choose the type of obligation.',['Loan','Authorized deduction']),f('original','Original amount','number',true),f('repaid','Amount already repaid','number',true),f('balance','Outstanding balance','number',true,'Original amount minus already repaid.'),f('asOf','Balance as-of date','date',true,'Balance after transactions on this date.'),f('payrollDate','Deduction start payroll','date',true),f('method','Repayment method','text',true,'Select one method.',['Amount per cutoff','Number of cutoffs','Number of months']),f('installment','Installment amount','number',false,'Required for Amount per cutoff.'),f('duration','Repayment duration','number',false,'Required integer for Number of cutoffs or Number of months.'),f('frequency','Deduction frequency','text',true,'Monthly method is split across the configured two cutoffs.',['Every cutoff']),f('document','Authority-to-deduct document','text',true,'Accessible HTTPS link to signed authority. Finance verifies access and accepts evidence before approval.'),f('nteReference','External NTE reference','text',false,'Optional. A fabricated internal NTE is not required.'),notes],sample:{employeeId:'DEMO-001',reference:'DEMO-LOAN-001',kind:'Loan',original:'10000',repaid:'4000',balance:'6000',asOf:'2026-08-25',payrollDate:'2026-09-20',method:'Number of cutoffs',duration:'6',frequency:'Every cutoff',document:'https://example.com/signed-authority.pdf'}},
 additions:{type:'additions',version:1,title:'Allowances and reimbursements',meaning:'One employee’s one-time payroll addition or approved receipt-based claim.',notice:'Recurring allowances belong in pay packages. Reimbursement caps do not create payments. Required receipts and independent approval are checked.',fields:[employee,period,f('kind','Component type','text',true,'Choose the one-time payment type.',['Allowance','Reimbursement']),f('description','Description','text',true),f('amount','Amount','number',true,'Numeric pesos without the peso sign.'),document,f('approvalReference','Approval reference','text',true,'Approved policy or claim reference. Pending imports still require review.'),f('tax','Tax treatment','text',true,'Finance must confirm treatment before calculation.',['Taxable','Excluded']),notes],sample:{employeeId:'DEMO-001',payrollDate:'2026-09-20',kind:'Reimbursement',description:'Approved transport receipt',amount:'250',document:'https://example.com/receipt.pdf',approvalReference:'DEMO-CLAIM-001',tax:'Excluded'}},
 'service-charge':{type:'service-charge',version:1,title:'Service-charge allocations',meaning:'One eligible employee’s allocation for a selected payroll.',notice:'Allocation totals must match the existing approved pool. No automatic employee distribution or duplicate pool payment.',fields:[employee,unit,period,f('amount','Allocation amount','number',true),reference,notes],sample:{employeeId:'DEMO-001',businessUnit:'Bakebe - SM Aura',payrollDate:'2026-09-20',amount:'500',reference:'DEMO-POOL-001'}},
 'attendance-events':{type:'attendance-events',version:1,title:'Attendance event log',meaning:'One actual punch event. Group complete sessions using Work date, including overnight events.',notice:'Use for multiple sessions or breaks. Missing punches need review; overtime still requires approval.',fields:[employee,unit,date,f('eventType','Event type','text',true,'Choose the actual event.',['ClockIn','BreakStart','BreakEnd','ClockOut']),f('timestamp','Timestamp','datetime',true,'YYYY-MM-DD HH:mm in Asia/Manila.'),reference,notes],sample:{employeeId:'DEMO-001',businessUnit:'Bakebe - SM Aura',workDate:'2026-08-26',eventType:'ClockIn',timestamp:'2026-08-26 09:00'}}
};
export type ImportRow={rowNumber:number;values:Record<string,string>;errors:string[]};
export function templateCsv(schema:InputTemplate,records:Record<string,string>[]=[]){return '\uFEFF'+[schema.fields.map(f=>f.label),...records.map(r=>schema.fields.map(f=>r[f.key]||''))].map(row=>row.map(v=>'"'+(/^[=+@-]/.test(v)?"'"+v:v).replaceAll('"','""')+'"').join(',')).join('\r\n');}
export function validateInputRow(schema:InputTemplate,values:Record<string,string>,rowNumber:number):ImportRow{
 const errors:string[]=[];
 for(const field of schema.fields){const value=values[field.key]?.trim()||'';values[field.key]=value;
  if(field.required&&!value)errors.push(`${field.label.replace('*','')} is required.`);
  if(!value)continue;
  if(/^[=+@]/.test(value))errors.push(`${field.label}: paste values, not formulas.`);
  if(field.choices&&!field.choices.includes(value))errors.push(`${field.label}: choose ${field.choices.join(', ')}.`);
  try{if(field.type==='date')strictDate(value);if(field.type==='datetime')attendanceStamp(value);}catch(e){errors.push(`${field.label}: ${(e as Error).message}`);}
  if(field.type==='number'&&(!/^\d+(\.\d{1,4})?$/.test(value)||!Number.isFinite(Number(value))))errors.push(`${field.label}: enter a non-negative number.`);
 }
 if(/^DEMO-/i.test(values.employeeId||''))errors.push('Example-only Employee ID. Select an actual HRIS employee.');
 if(values.document&&!/^https:\/\/\S+$/.test(values.document))errors.push('Supporting document must be an accessible HTTPS link.');
 if(schema.type==='schedules'&&values.dayType==='Workday'){
  if(!values.start||!values.end)errors.push('Workday requires shift start and end with explicit dates.');
  if(values.end<=values.start)errors.push('Shift end must follow shift start. Check the date for an overnight shift.');
  if(!!values.breakStart!==!!values.breakEnd)errors.push('Enter both planned break times.');
 }
 if(schema.type==='additions'&&values.kind==='Reimbursement'&&!values.document)errors.push('Receipt document is required for a reimbursement.');
 if(schema.type==='deductions'){
  if(Math.abs(Number(values.original)-Number(values.repaid)-Number(values.balance))>.005)errors.push('Original amount minus already repaid must equal the outstanding balance.');
  if(values.method==='Amount per cutoff'&&!(Number(values.installment)>0))errors.push('A positive installment amount is required.');
  if(values.method!=='Amount per cutoff'&&(!Number.isInteger(Number(values.duration))||Number(values.duration)<1))errors.push('A positive whole-number duration is required.');
  if(values.asOf>=values.payrollDate)errors.push('Deduction start payroll must be after the balance as-of date.');
 }
 if(schema.type==='leave-taken'){
  if(values.endDate<values.startDate)errors.push('End date must be on or after start date.');
  if(!(Number(values.duration)>0))errors.push('Leave duration must be positive.');
  if(values.dayPart==='Partial day'&&(!values.start||!values.end||values.end<=values.start))errors.push('Partial-day leave requires valid start and end times.');
 }
 return {rowNumber,values,errors};
}
export async function readInputFile(file:File,schema:InputTemplate){
 if(file.size>5*1024*1024)throw new Error('Use a file smaller than 5 MB.');
 let headers:string[]=[],raw:{row:number;cells:string[]}[]=[],unversionedWorkbook=false;
 if(file.name.toLowerCase().endsWith('.csv')){const rows=parseDelimited(await file.text(),',');headers=rows.shift()||[];raw=rows.map((cells,i)=>({row:i+2,cells}));}
 else if(file.name.toLowerCase().endsWith('.xlsx')){
  const book=await readImportWorkbook(await file.arrayBuffer());const sheet=book.getWorksheet('Data Entry');
  if(!sheet)throw new Error('Missing Data Entry sheet. Download the current template. Only Data Entry is imported.');
  const version=book.getWorksheet('Instructions')?.getCell('B1').text;
  if(version&&version!==`${schema.type}:${schema.version}`)throw new Error(`Unsupported template ${version}. Download ${schema.title} version ${schema.version}.`);
  unversionedWorkbook=!version;
  if(sheet.rowCount>2001)throw new Error('Use at most 2,000 rows.');
  sheet.eachRow({includeEmpty:false},row=>{const cells:Array<string>=[];for(let i=1;i<=Math.max(row.cellCount,schema.fields.length);i++){
   const value=row.getCell(i).value;
   if(value&&typeof value==='object'&&!(value instanceof Date))throw new Error(`Row ${row.number} — Formulas or linked cells are not accepted. Paste values.`);
   if(i===1&&row.number>1&&typeof value==='number')throw new Error(`Row ${row.number} — Keep Employee ID as text to preserve leading zeros.`);
   cells.push(value instanceof Date?value.toISOString().slice(0,schema.fields[i-1]?.type==='date'?10:19).replace('T',' '):String(value??''));
  }if(row.number===1)headers=cells;else if(cells.some(v=>v.trim()))raw.push({row:row.number,cells});});
 }else throw new Error('Upload CSV or XLSX.');
 headers=headers.map(h=>h.replace(/^\uFEFF/,'').trim());while(headers.at(-1)==='')headers.pop();
 if(!raw.length)throw new Error('Data Entry has no records. Instructions and examples are never imported.');
 if(raw.length>2000)throw new Error('Use at most 2,000 rows.');
 if(new Set(headers).size!==headers.length)throw new Error('Duplicate column names. Give each column a unique header before mapping.');
 const mapping=schema.fields.map(f=>headers.indexOf(f.label));
 return {headers,raw,mapping,needsMapping:unversionedWorkbook||headers.length!==schema.fields.length||mapping.some((n,i)=>n!==i)};
}
