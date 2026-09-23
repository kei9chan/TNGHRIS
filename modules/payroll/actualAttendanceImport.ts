import {parseDelimited} from '../../services/biometricImport';
import schema from './attendanceTemplate.json';
import {readImportWorkbook} from './readImportWorkbook';

export const attendanceFields = schema.fields.map(field=>[field.label,field.key] as const);
export type AttendanceInput = {employeeId:string;businessUnit:string;workDate:string;events:{type:string;timestamp:string}[];reference:string;notes:string};
export const attendanceSample = schema.samples[0];
const quote=(value:string)=>`"${value.replaceAll('"','""')}"`;
export function attendanceCsv(rows:string[][]=[]){return '\uFEFF'+[attendanceFields.map(([label])=>label),...rows].map(row=>row.map(quote).join(',')).join('\r\n');}
export function strictDate(value:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw new Error('Use a real Excel date or YYYY-MM-DD. Ambiguous text dates are not accepted.');
 return value;
}
export function attendanceStamp(value:string){
 const match=value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\+08:00)?$/);
 if(!match||Number(match[2])>23||Number(match[3])>59||Number(match[4]||0)>59)throw new Error('Use YYYY-MM-DD HH:mm with explicit overnight dates. Times use Asia/Manila.');
 return `${strictDate(match[1])}T${match[2]}:${match[3]}:${match[4]||'00'}+08:00`;
}
export function normalizeAttendance(rows:string[][],businessUnit:string):AttendanceInput[]{
 return rows.filter(row=>row.some(value=>value.trim())).map((cells,i)=>{
  try {
   if(cells.some(value=>/^[=+@]/.test(value.trim())))throw new Error('Formulas are not accepted. Paste values only.');
   const [employeeId,unit,workDate,clockIn,breakStart,breakEnd,clockOut,reference='',notes='']=cells.map(value=>value.trim());
   if(!employeeId||/^DEMO-/i.test(employeeId))throw new Error('Use an actual HRIS Employee ID, not an example ID.');
   if(unit!==businessUnit)throw new Error('Business unit does not match the selected business unit.');
   strictDate(workDate);
   const events=([['ClockIn',clockIn],['BreakStart',breakStart],['BreakEnd',breakEnd],['ClockOut',clockOut]] as const).filter(([,v])=>v).map(([type,v])=>({type,timestamp:attendanceStamp(v)}));
   if(!events.length)throw new Error('Enter at least one actual punch. Blank punches are never replaced with guessed times.');
   if(events.some((event,n)=>n>0&&Date.parse(event.timestamp)<=Date.parse(events[n-1].timestamp)))throw new Error('Clock-out or break is earlier than the preceding punch. Check the date for an overnight shift.');
   return {employeeId,businessUnit:unit,workDate,events,reference,notes};
  }catch(e){throw new Error(`Row ${i+2} — ${(e as Error).message}`);}
 });
}
export async function readAttendanceFile(file:File,businessUnit:string):Promise<AttendanceInput[]>{
 if(file.size>5*1024*1024)throw new Error('Upload a file smaller than 5 MB.');
 let rows:string[][];
 if(file.name.toLowerCase().endsWith('.csv'))rows=parseDelimited(await file.text(),',');
 else if(file.name.toLowerCase().endsWith('.xlsx')){
  const book=await readImportWorkbook(await file.arrayBuffer());
  const data=book.getWorksheet('Data Entry');if(!data)throw new Error('Missing Data Entry sheet. Download the attendance template.');
  if(book.getWorksheet('Instructions')?.getCell('B1').text!=='attendance:1')throw new Error('Unsupported template type or version. Download attendance template version 1.');
  if(data.rowCount>2001)throw new Error('Use at most 2,000 attendance rows.');
  rows=[];data.eachRow({includeEmpty:false},row=>{
   const values=attendanceFields.map((_,n)=>{const v=row.getCell(n+1).value;
    if(v==null)return '';
    if(v instanceof Date)return v.toISOString().slice(0,n===2?10:19).replace('T',' ');
    if(typeof v==='object')throw new Error(`Row ${row.number} — Formulas and linked cells are not accepted. Paste values only.`);
    if(n===0&&typeof v==='number')throw new Error(`Row ${row.number} — Employee ID must be text to preserve leading zeros.`);
    const value=String(v).trim();if(/^[=+@]/.test(value))throw new Error(`Row ${row.number} — Paste values, not formulas.`);return value;
   });if(values.some(Boolean))rows.push(values);
  });
 }else throw new Error('Upload CSV or XLSX.');
 const headers=rows.shift();if(!headers||headers.some((v,i)=>v.replace(/^\uFEFF/,'')!==attendanceFields[i]?.[0])||headers.length!==attendanceFields.length)throw new Error('Columns do not match the attendance template. Download the current template and paste your values into its columns.');
 if(!rows.length)throw new Error('Data Entry contains no attendance records. Examples are never imported.');
 if(rows.length>2000)throw new Error('Use at most 2,000 attendance rows.');
 return normalizeAttendance(rows,businessUnit);
}
export function downloadText(filename:string,text:string){const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
