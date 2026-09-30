import {parseDelimited} from '../../services/biometricImport';
import schema from './attendanceTemplate.json';
import {readImportWorkbook} from './readImportWorkbook';

export const attendanceFields = schema.fields.map(field=>[field.label,field.key] as const);
export const dayStatuses=schema.fields.find(field=>field.key==='dayStatus')!.choices!;
export const reviewChoices=schema.fields.find(field=>field.key==='reviewRequest')!.choices!;
export type AttendanceInput = {employeeId:string;businessUnit:string;workDate:string;dayStatus:string;classification?:string;events:{type:string;timestamp:string}[];reference:string;notes:string;reviewRequest:string;reviewExplanation:string;sourceRow:number;requestedOtHours?:number;otStart?:string;otEnd?:string;otReason?:string;offlineManagerOtHours?:number;offlineOtReference?:string;leaveType?:string;leaveDays?:number;leaveStart?:string;leaveEnd?:string;leaveReason?:string};
export const attendanceSamples=schema.samples;
export const attendanceSample = schema.samples[0];
export const attendanceRestSample=schema.samples[1];
const dayAliases:Record<string,string>={'Worked':'Workday','Absent':'Absent (review)','Sick or unable to report':'Absent (review)','Approved leave':'Absent (review)','Leave without pay':'Absent (review)','Suspension':'Suspended','Regular holiday':'Legal holiday','Special nonworking day':'Legal holiday','For review':'Missing punches (review)'};
const reviewAliases:Record<string,string>={'Absent':'Absence','Sick or unable to report':'Absence','Approved leave':'Absence','Leave without pay':'Absence','Suspension':'Suspension','For review':'Other'};
export type PrefilledAttendanceDay={code:string;name:string;businessUnit:string;date:string;status:string;weekday?:string;shiftName?:string;scheduledStart?:string;scheduledEnd?:string;scheduledDayType?:string;scheduledPaidHours?:string;breakMinutes?:string;rosterVersion?:string;scheduleCheck?:string};
export async function prefillAttendanceWorkbook(bytes:ArrayBuffer,days:PrefilledAttendanceDay[],leaveTypes:string[]=[]){
 if(days.length>2000)throw new Error('The prefilled cutoff has more than 2,000 employee-days. Choose a smaller scope.');
 const book=await readImportWorkbook(bytes);const entry=book.getWorksheet('Data Entry');
 if(!entry||book.getWorksheet('Instructions')?.getCell('B1').text!=='attendance:6')throw new Error('Download the current attendance template.');
 days.forEach((item,i)=>{const row=entry.getRow(i+2);
  [item.code,item.name,item.businessUnit,item.date,item.status].forEach((value,n)=>{row.getCell(n+1).value=value;});
  for(let n=1;n<=4;n++)row.getCell(n).numFmt='@';
  attendanceFields.forEach(([,key],n)=>{if(n>=22)row.getCell(n+1).value=String(item[key as keyof PrefilledAttendanceDay]||'');});
 });
 if(leaveTypes.length){const guide=book.getWorksheet('Field Guide')!;const column=6;guide.getCell(1,column).value='Configured leave types';leaveTypes.forEach((name,i)=>guide.getCell(i+2,column).value=name);for(let i=2;i<=Math.max(101,days.length+1);i++)entry.getCell(i,18).dataValidation={type:'list',allowBlank:true,formulae:[`'Field Guide'!$F$2:$F$${leaveTypes.length+1}`]};}
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
   const values=((cells.length<=12)?[cells[0],'',...cells.slice(1)]:cells).map(value=>value.trim());
   const [employeeId,,unit,workDate,rawDayStatus,clockIn,breakStart,breakEnd,clockOut,reference='',notes='',rawReview='',rawExplanation='',otHours='',otStartValue='',otEndValue='',otReason='',leaveType='',leaveDaysValue='',leaveStart='',leaveEnd='',leaveReason='']=values;
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
   const requestedOtHours=otHours?Number(otHours):undefined,leaveDays=leaveDaysValue?Number(leaveDaysValue):undefined;
   const offlineHoursValue=values[31]||'',offlineManagerOtHours=offlineHoursValue?Number(offlineHoursValue):undefined,offlineOtReference=values[32]||undefined;
   const otStart=otStartValue?attendanceStamp(otStartValue,workDate):undefined,otEnd=otEndValue?attendanceStamp(otEndValue,workDate):undefined;
   if(otHours||otStart||otEnd||otReason){
    if(!requestedOtHours||!Number.isFinite(requestedOtHours)||requestedOtHours>24||requestedOtHours<0||!otReason)throw new Error('OT needs requested extra-work hours (greater than 0, at most 24) and a reason. Start and end times are optional, but enter both if known.');
    if(Boolean(otStart)!==Boolean(otEnd))throw new Error('Enter both OT start and end times, or leave both blank for a duration-only request.');
    if(otStart&&otEnd&&(Date.parse(otEnd)<=Date.parse(otStart)||requestedOtHours*3600000>Date.parse(otEnd)-Date.parse(otStart)+1))throw new Error('Requested OT hours must fit inside the optional OT start/end interval.');
   }
   if(offlineHoursValue||offlineOtReference){
    if(!requestedOtHours||offlineManagerOtHours===undefined||!Number.isFinite(offlineManagerOtHours)||offlineManagerOtHours<0||offlineManagerOtHours>requestedOtHours||Math.round(offlineManagerOtHours*60)!==offlineManagerOtHours*60||!offlineOtReference)throw new Error('Offline manager OT needs applied OT hours, a confirmed quantity from 0 up to applied hours, and an approval reference. It still goes to the direct manager for HRIS review.');
   }
   if(leaveType||leaveDaysValue||leaveReason||leaveStart||leaveEnd){
    if(!leaveType||!leaveDays||!Number.isFinite(leaveDays)||leaveDays>1||leaveDays<0||!leaveReason)throw new Error('Leave needs a configured type, days (greater than 0, at most 1), and reason.');
    if(leaveDays<1&&(!/^\d{2}:\d{2}$/.test(leaveStart)||!/^\d{2}:\d{2}$/.test(leaveEnd)||leaveStart>=leaveEnd))throw new Error('Partial-day leave needs valid start and end times.');
    if(leaveStart)attendanceStamp(leaveStart,workDate);if(leaveEnd)attendanceStamp(leaveEnd,workDate);
   }
   return [{employeeId,businessUnit:unit,workDate,dayStatus,classification,events,reference,notes,reviewRequest,reviewExplanation,requestedOtHours,otStart,otEnd,otReason,offlineManagerOtHours,offlineOtReference,leaveType,leaveDays,leaveStart,leaveEnd,leaveReason,sourceRow:rowNumbers?.[i]??i+2}];
  }catch(e){throw new Error(`Row ${rowNumbers?.[i]??i+2} — ${(e as Error).message}`);}
 });
}
export type AttendanceParseIssue={row:number;message:string;values:string[]};
export async function readAttendanceFile(file:File,businessUnit:string,savedStatuses:Record<string,string>={},issues?:AttendanceParseIssue[]):Promise<AttendanceInput[]>{
 if(file.size>5*1024*1024)throw new Error('Upload a file smaller than 5 MB.');
 let rows:string[][],rowNumbers:number[]|undefined,version=6;
 if(file.name.toLowerCase().endsWith('.csv'))rows=parseDelimited(await file.text(),',');
 else if(file.name.toLowerCase().endsWith('.xlsx')){
  const book=await readImportWorkbook(await file.arrayBuffer());
  const data=book.getWorksheet('Data Entry');if(!data)throw new Error('Missing Data Entry sheet. Download the attendance template.');
  const template=book.getWorksheet('Instructions')?.getCell('B1').text;
  if(!['attendance:1','attendance:2','attendance:3','attendance:4','attendance:5','attendance:6'].includes(template))throw new Error('Unsupported template type or version. Download attendance template version 6.');
  version=Number(template.slice(-1));
  if(data.rowCount>2001)throw new Error('Use at most 2,000 attendance rows.');
  rows=[];rowNumbers=[];data.eachRow({includeEmpty:false},row=>{
   const fields=(version>=5?attendanceFields.slice(0,version===5?31:undefined):attendanceFields.slice(0,13)).filter(([,key])=>version>=4||!['employeeName',...(version<3?['reviewRequest','reviewExplanation']:[]),...(version===1?['dayStatus']:[])].includes(key));
   const values=fields.map(([,key],n)=>{const v=row.getCell(n+1).value;
    if(v==null)return '';
    if(v instanceof Date)return v.toISOString().slice(0,key==='workDate'?10:19).replace('T',' ');
    if(typeof v==='object')throw new Error(`Row ${row.number} — Formulas and linked cells are not accepted. Paste values only.`);
    if(n===0&&typeof v==='number')throw new Error(`Row ${row.number} — Employee ID must be text to preserve leading zeros.`);
    if(typeof v==='number'&&['clockIn','breakStart','breakEnd','clockOut','otStart','otEnd'].includes(key)&&v>=0&&v<1){const minutes=Math.round(v*1440);return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;}
    const value=String(v).trim();if(/^[=+@]/.test(value))throw new Error(`Row ${row.number} — Paste values, not formulas.`);return value;
   });if(values.some(Boolean)){rows.push(values);rowNumbers!.push(row.number);}
  });
 }else throw new Error('Upload CSV or XLSX.');
 const headers=rows.shift();rowNumbers?.shift();
 const current=attendanceFields.map(([label])=>label);
 const v5=attendanceFields.slice(0,31).map(([label,key])=>key==='requestedOtHours'?'Requested OT hours (optional)':label);
 const v4=attendanceFields.slice(0,13).map(([label])=>label);
 const v3=attendanceFields.slice(0,13).filter(([,key])=>key!=='employeeName').map(([label])=>label);
 const v2=attendanceFields.slice(0,13).filter(([,key])=>!['employeeName','reviewRequest','reviewExplanation'].includes(key)).map(([label])=>label);
 const legacy=attendanceFields.slice(0,13).filter(([,key])=>!['employeeName','dayStatus','reviewRequest','reviewExplanation'].includes(key)).map(([label])=>label);
 const matches=(expected:string[])=>headers?.length===expected.length&&headers.every((v,i)=>v.replace(/^\uFEFF/,'')===expected[i]);
 if(!matches(current)&&!matches(v5)&&!matches(v4)&&!matches(v3)&&!matches(v2)&&!matches(legacy))throw new Error('Columns do not match the attendance template. Download version 6 and paste your values into its columns.');
 // Version 1 had no Day status column. Leave it empty so a saved roster
 // status (Rest day, holiday, suspension, or no scheduled work) can be used
 // for blank-punch rows; otherwise the row remains a Workday review item.
 if(matches(legacy)){version=1;rows=rows.map(row=>[row[0],'',...row.slice(1,3),'',...row.slice(3),'','']);}
 else if(matches(v2)){version=2;rows=rows.map(row=>[row[0],'',...row.slice(1),'','']);}
 else if(matches(v3)){version=3;rows=rows.map(row=>[row[0],'',...row.slice(1)]);}
 if(!rows.length)throw new Error('Data Entry contains no attendance records. Examples are never imported.');
 if(rows.length>2000)throw new Error('Use at most 2,000 attendance rows.');
 if(issues)return rows.flatMap((values,i)=>{const row=rowNumbers?.[i]??i+2;try{return normalizeAttendance([values],businessUnit,[row],savedStatuses);}catch(error){issues.push({row,message:(error as Error).message,values});return [];}});
 return normalizeAttendance(rows,businessUnit,rowNumbers,savedStatuses);
}
export function downloadText(filename:string,text:string){const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

export type PublishedAttendanceDay={employeeId:string;name:string;businessUnit:string;workDate:string;dayStatus:string|null;schedule:{published:boolean;publicationId?:string;version?:number;entries:{name:string;kind:string;start?:string;end?:string;endDayOffset?:number;paidMinutes?:number;breakMinutes?:number;flexible?:boolean}[]}};
export function publishedAttendanceReferences(days:PublishedAttendanceDay[]):PrefilledAttendanceDay[]{
 return days.map(day=>{
  const schedule=day.schedule,entries=schedule.published?schedule.entries||[]:[];
  const work=entries.filter(e=>e.kind==='work');
  const endDate=(offset:number)=>{const d=new Date(`${day.workDate}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);};
  return {code:day.employeeId,name:day.name,businessUnit:day.businessUnit,date:day.workDate,status:day.dayStatus==='Workday'?'':day.dayStatus||'',
   weekday:new Intl.DateTimeFormat('en-PH',{weekday:'long',timeZone:'UTC'}).format(new Date(day.workDate+'T00:00:00Z')),
   shiftName:entries.map(e=>e.name).join(' / '),
   scheduledStart:work.map(e=>e.flexible?'Flexible':`${day.workDate} ${e.start||''}`).join(' / '),
   scheduledEnd:work.map(e=>e.flexible?'Flexible':`${endDate(e.endDayOffset||0)} ${e.end||''}`).join(' / '),
   scheduledDayType:day.dayStatus||'',
   scheduledPaidHours:work.length?work.map(e=>e.paidMinutes==null?'Not specified':String(e.paidMinutes/60)).join(' / '):'',
   breakMinutes:work.map(e=>e.breakMinutes==null?'Not specified':String(e.breakMinutes)).join(' / '),
   rosterVersion:schedule.publicationId?`${schedule.publicationId} · v${schedule.version}`:'',
   scheduleCheck:schedule.published?'Published':schedule.publicationId?'Publication exists but is not current/approved. Open this week in Schedule Builder.':'No published schedule for this employee and date. Open this week in Schedule Builder.'};
 });
}
