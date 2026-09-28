import {parseDelimited} from '../../services/biometricImport';
import schema from './attendanceTemplate.json';
import {readImportWorkbook} from './readImportWorkbook';

export const attendanceFields = schema.fields.map(field=>[field.label,field.key] as const);
export const dayStatuses=schema.fields.find(field=>field.key==='dayStatus')!.choices!;
export const reviewChoices=schema.fields.find(field=>field.key==='reviewRequest')!.choices!;
export type AttendanceInput = {employeeId:string;businessUnit:string;workDate:string;dayStatus:string;classification?:string;events:{type:string;timestamp:string}[];reference:string;notes:string;reviewRequest:string;reviewExplanation:string;sourceRow:number};
export const attendanceSample = schema.samples[0];
export const attendanceRestSample=schema.samples[1];
const dayAliases:Record<string,string>={'Worked':'Workday','Absent':'Absent (review)','Sick or unable to report':'Absent (review)','Approved leave':'Absent (review)','Leave without pay':'Absent (review)','Suspension':'Suspended','Regular holiday':'Legal holiday','Special nonworking day':'Legal holiday','For review':'Missing punches (review)'};
const reviewAliases:Record<string,string>={'Absent':'Absence','Sick or unable to report':'Absence','Approved leave':'Absence','Leave without pay':'Absence','Suspension':'Suspension','For review':'Other'};
export type PrefilledAttendanceDay={code:string;name:string;businessUnit:string;date:string;status:string};
export async function prefillAttendanceWorkbook(bytes:ArrayBuffer,days:PrefilledAttendanceDay[]){
 if(days.length>2000)throw new Error('The prefilled cutoff has more than 2,000 employee-days. Choose a smaller scope.');
 const book=await readImportWorkbook(bytes);const entry=book.getWorksheet('Data Entry');
 if(!entry||book.getWorksheet('Instructions')?.getCell('B1').text!=='attendance:4')throw new Error('Download the current attendance template.');
 days.forEach((item,i)=>{const row=entry.getRow(i+2);
  [item.code,item.name,item.businessUnit,item.date,item.status].forEach((value,n)=>{row.getCell(n+1).value=value;});
  for(let n=1;n<=4;n++)row.getCell(n).numFmt='@';
 });
 return book.xlsx.writeBuffer();
}
const quote=(value:string)=>`"${value.replaceAll('"','""')}"`;
export function attendanceCsv(rows:string[][]=[]){return '\uFEFF'+[attendanceFields.map(([label])=>label),...rows].map(row=>row.map(quote).join(',')).join('\r\n');}
export function strictDate(value:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw new Error('Use a real Excel date or YYYY-MM-DD. Ambiguous text dates are not accepted.');
 return value;
}
export function attendanceStamp(value:string,workDate?:string){
 if(/^\d{1,2}:\d{2}(:\d{2})?$/.test(value)&&workDate){strictDate(workDate);value=`${workDate} ${value.replace(/^\d{1,2}/,hour=>hour.padStart(2,'0'))}`;}
 const match=value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\+08:00)?$/);
 if(!match||Number(match[2])>23||Number(match[3])>59||Number(match[4]||0)>59)throw new Error('Use YYYY-MM-DD HH:mm with explicit overnight dates. Times use Asia/Manila.');
 return `${strictDate(match[1])}T${match[2]}:${match[3]}:${match[4]||'00'}+08:00`;
}
export function normalizeAttendance(rows:string[][],businessUnit:string,rowNumbers?:number[],savedStatuses:Record<string,string>={}):AttendanceInput[]{
 return rows.flatMap((cells,i)=>{
  if(!cells.some(value=>value.trim()))return [];
  try {
   if(cells.some(value=>/^[=+@]/.test(value.trim())))throw new Error('Formulas are not accepted. Paste values only.');
   // Direct callers may still provide the version 3 shape without the new
   // informational name column. The HRIS Employee ID remains authoritative.
   const values=(cells.length<attendanceFields.length?[cells[0],'',...cells.slice(1)]:cells).map(value=>value.trim());
   const [employeeId,,unit,workDate,rawDayStatus,clockIn,breakStart,breakEnd,clockOut,reference='',notes='',rawReview='',rawExplanation='']=values;
   const classification=rawDayStatus||savedStatuses[`${employeeId}:${workDate}`]||'Workday';
   const dayStatus=dayAliases[classification]||classification;
   const reviewRequest=rawReview&&rawReview!=='None'?rawReview:reviewAliases[classification]||'None';
   const reviewExplanation=rawExplanation||(!notes&&reviewAliases[classification]?`Classification: ${classification}; check the separately authorized record.`:'');
   if(!employeeId||/^DEMO-/i.test(employeeId))throw new Error('Use an actual HRIS Employee ID, not an example ID.');
   if(unit!==businessUnit)throw new Error('Business unit does not match the selected business unit.');
   strictDate(workDate);
   if(!dayStatuses.includes(classification))throw new Error(`Choose a Day status: ${dayStatuses.join(', ')}.`);
   if(!reviewChoices.includes(reviewRequest))throw new Error(`Choose a Needs review option: ${reviewChoices.join(', ')}.`);
   if(reviewRequest!=='None'&&!reviewExplanation&&!notes&&!reviewAliases[classification])throw new Error('Explain the review request in Review explanation or Notes.');
   const events=([['ClockIn',clockIn],['BreakStart',breakStart],['BreakEnd',breakEnd],['ClockOut',clockOut]] as const).filter(([,v])=>v).map(([type,v])=>({type,timestamp:attendanceStamp(v,workDate)}));
   if(dayStatus==='Workday'&&!events.length)throw new Error('Workday has no actual punches. Choose the correct no-punch Day status or enter actual times.');
   if(!['Workday','Rest day','Legal holiday'].includes(dayStatus)&&events.length)throw new Error(`${dayStatus} cannot contain punches. Use Workday for actual work, then review the date and roster.`);
   if(events.some((event,n)=>n>0&&Date.parse(event.timestamp)<=Date.parse(events[n-1].timestamp)))throw new Error('Clock-out or break is earlier than the preceding punch. Check the date for an overnight shift.');
   return [{employeeId,businessUnit:unit,workDate,dayStatus,classification,events,reference,notes,reviewRequest,reviewExplanation,sourceRow:rowNumbers?.[i]??i+2}];
  }catch(e){throw new Error(`Row ${rowNumbers?.[i]??i+2} — ${(e as Error).message}`);}
 });
}
export async function readAttendanceFile(file:File,businessUnit:string,savedStatuses:Record<string,string>={}):Promise<AttendanceInput[]>{
 if(file.size>5*1024*1024)throw new Error('Upload a file smaller than 5 MB.');
 let rows:string[][],rowNumbers:number[]|undefined,version=4;
 if(file.name.toLowerCase().endsWith('.csv'))rows=parseDelimited(await file.text(),',');
 else if(file.name.toLowerCase().endsWith('.xlsx')){
  const book=await readImportWorkbook(await file.arrayBuffer());
  const data=book.getWorksheet('Data Entry');if(!data)throw new Error('Missing Data Entry sheet. Download the attendance template.');
  const template=book.getWorksheet('Instructions')?.getCell('B1').text;
  if(!['attendance:1','attendance:2','attendance:3','attendance:4'].includes(template))throw new Error('Unsupported template type or version. Download attendance template version 4.');
  version=Number(template.slice(-1));
  if(data.rowCount>2001)throw new Error('Use at most 2,000 attendance rows.');
  rows=[];rowNumbers=[];data.eachRow({includeEmpty:false},row=>{
   const fields=attendanceFields.filter(([,key])=>version===4||!['employeeName',...(version<3?['reviewRequest','reviewExplanation']:[]),...(version===1?['dayStatus']:[])].includes(key));
   const values=fields.map(([,key],n)=>{const v=row.getCell(n+1).value;
    if(v==null)return '';
    if(v instanceof Date)return v.toISOString().slice(0,key==='workDate'?10:19).replace('T',' ');
    if(typeof v==='object')throw new Error(`Row ${row.number} — Formulas and linked cells are not accepted. Paste values only.`);
    if(n===0&&typeof v==='number')throw new Error(`Row ${row.number} — Employee ID must be text to preserve leading zeros.`);
    if(typeof v==='number'&&['clockIn','breakStart','breakEnd','clockOut'].includes(key)&&v>=0&&v<1){const minutes=Math.round(v*1440);return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;}
    const value=String(v).trim();if(/^[=+@]/.test(value))throw new Error(`Row ${row.number} — Paste values, not formulas.`);return value;
   });if(values.some(Boolean)){rows.push(values);rowNumbers!.push(row.number);}
  });
 }else throw new Error('Upload CSV or XLSX.');
 const headers=rows.shift();rowNumbers?.shift();
 const current=attendanceFields.map(([label])=>label);
 const v3=attendanceFields.filter(([,key])=>key!=='employeeName').map(([label])=>label);
 const v2=attendanceFields.filter(([,key])=>!['employeeName','reviewRequest','reviewExplanation'].includes(key)).map(([label])=>label);
 const legacy=attendanceFields.filter(([,key])=>!['employeeName','dayStatus','reviewRequest','reviewExplanation'].includes(key)).map(([label])=>label);
 const matches=(expected:string[])=>headers?.length===expected.length&&headers.every((v,i)=>v.replace(/^\uFEFF/,'')===expected[i]);
 if(!matches(current)&&!matches(v3)&&!matches(v2)&&!matches(legacy))throw new Error('Columns do not match the attendance template. Download version 4 and paste your values into its columns.');
 // Version 1 had no Day status column. Leave it empty so a saved roster
 // status (Rest day, holiday, suspension, or no scheduled work) can be used
 // for blank-punch rows; otherwise the row remains a Workday review item.
 if(matches(legacy)){version=1;rows=rows.map(row=>[row[0],'',...row.slice(1,3),'',...row.slice(3),'','']);}
 else if(matches(v2)){version=2;rows=rows.map(row=>[row[0],'',...row.slice(1),'','']);}
 else if(matches(v3)){version=3;rows=rows.map(row=>[row[0],'',...row.slice(1)]);}
 if(!rows.length)throw new Error('Data Entry contains no attendance records. Examples are never imported.');
 if(rows.length>2000)throw new Error('Use at most 2,000 attendance rows.');
 return normalizeAttendance(rows,businessUnit,rowNumbers,savedStatuses);
}
export function downloadText(filename:string,text:string){const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
