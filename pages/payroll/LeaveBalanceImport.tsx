import React,{useEffect,useMemo,useRef,useState} from 'react';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import {supabase} from '../../services/supabaseClient';
import {RawBalanceRow,ValidatedBalanceRow,validateBalanceRows} from '../../modules/payroll/leaveManagementModel';

const columns=[
  'Employee ID','Employee name','Business unit','Leave type','Opening balance','Accrued credits',
  'Used credits','Remaining balance','As-of date','Source','Supporting document or link','Notes',
];
const fieldNames=['employeeId','employeeName','businessUnit','leaveType','openingBalance','accruedCredits','usedCredits','remainingBalance','asOfDate','source','supportingDocument','notes'] as const;
const statusStyle={valid:'bg-emerald-50 text-emerald-700 border-emerald-200',review:'bg-amber-50 text-amber-800 border-amber-200',invalid:'bg-rose-50 text-rose-700 border-rose-200',not_applicable:'bg-slate-100 text-slate-600 border-slate-200'};
const statusLabel={valid:'Valid',review:'Needs review',invalid:'Invalid',not_applicable:'Not applicable'};
const stepStyle=(active:boolean,done:boolean)=>`flex h-9 w-9 items-center justify-center rounded-full font-bold ${done?'bg-emerald-500 text-white':active?'bg-violet-600 text-white':'bg-slate-200 text-slate-500'}`;

function downloadCsv(){
  const sample=['TNG-001','Dela Cruz, Juan','Dessert Museum','Vacation Leave','5','2','1','6','2026-08-31','Previous HRIS','','Opening balance migration'];
  const csv=[columns,sample].map(row=>row.map(value=>`"${String(value).replace(/"/g,'""')}"`).join(',')).join('\n');
  const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));link.download='leave_balance_migration_template.csv';link.click();URL.revokeObjectURL(link.href);
}
function parseCsv(text:string){
  const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'&&quoted&&text[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=!quoted;else if(c===','&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell='';}else cell+=c;}
  if(cell||row.length){row.push(cell);rows.push(row);}return rows.slice(1).map(values=>Object.fromEntries(fieldNames.map((field,index)=>[field,values[index]??''])) as RawBalanceRow);
}

export default function LeaveBalanceImport(){
 const [step,setStep]=useState(1),[fileName,setFileName]=useState(''),[rows,setRows]=useState<ValidatedBalanceRow[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[batch,setBatch]=useState<any>(null),[batches,setBatches]=useState<any[]>([]),[manual,setManual]=useState(false);
 const fileRef=useRef<HTMLInputElement>(null);
 const [entry,setEntry]=useState<RawBalanceRow>({leaveType:'Vacation Leave',asOfDate:'2026-08-31',source:'Manual record'});
 const counts=useMemo(()=>rows.reduce((value,row)=>({...value,[row.status]:value[row.status]+1}),{valid:0,review:0,invalid:0,not_applicable:0}),[rows]);
 const loadBatches=async()=>{const {data,error}=await supabase.rpc('get_leave_balance_migration_workspace');if(!error)setBatches(data?.batches||[]);};
 useEffect(()=>{void loadBatches();},[]);
 async function handleFile(file:File){
  setBusy(true);setMessage('');
  try{
   let raw:RawBalanceRow[]=[];
   if(file.name.toLowerCase().endsWith('.csv'))raw=parseCsv(await file.text());
   else{
    const ExcelJS=(await import('exceljs')).default;const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await file.arrayBuffer());const sheet=workbook.worksheets[0];
    raw=[];sheet.eachRow((excelRow,index)=>{if(index===1)return;const values=fieldNames.map((_,i)=>{const value:any=excelRow.getCell(i+1).value;return value instanceof Date?value.toISOString().slice(0,10):value?.text??value?.result??value??'';});if(values.some(Boolean))raw.push(Object.fromEntries(fieldNames.map((field,i)=>[field,values[i]])) as RawBalanceRow);});
   }
   setFileName(file.name);setRows(validateBalanceRows(raw));setStep(2);
  }catch(error:any){setMessage(error.message||'The file could not be read.');}finally{setBusy(false);}
 }
 const addManual=()=>{setRows(previous=>validateBalanceRows([...previous,entry]));setFileName(previous=>previous||'Manual balance entry');setManual(false);setStep(2);setEntry({leaveType:'Vacation Leave',asOfDate:'2026-08-31',source:'Manual record'});};
 async function save(submit:boolean){
  setBusy(true);setMessage('');
  try{
   const payload=rows.map(row=>({employee_id_code:row.employeeId,employee_name:row.employeeName,business_unit:row.businessUnit,leave_type:row.leaveType,opening_balance:row.openingBalance,accrued_credits:row.accruedCredits,used_credits:row.usedCredits,remaining_balance:row.remainingBalance,as_of_date:row.asOfDate||null,source:row.source,supporting_document:row.supportingDocument,notes:row.notes,validation_status:row.status,validation_messages:row.messages,raw_data:row}));
   const {data,error}=await supabase.rpc('save_leave_balance_migration',{p_batch_id:batch?.id||null,p_source_file:fileName||'Manual balance entry',p_rows:payload,p_submit:submit,p_manual:fileName==='Manual balance entry'});if(error)throw error;
   setBatch(data);setStep(submit?3:2);setMessage(submit?'Submitted for the required approval. Balances remain inactive until approval.':'Draft saved. Valid rows and correction items are preserved.');await loadBatches();
  }catch(error:any){setMessage(error.message||'Could not save the balance migration.');}finally{setBusy(false);}
 }
 async function review(action:'approve'|'reject'|'return'){
  if(!batch?.id)return;const note=window.prompt(action==='approve'?'Approval note (optional)':'Reason is required')||'';if(action!=='approve'&&!note.trim())return;
  setBusy(true);const {data,error}=await supabase.rpc('review_leave_balance_migration',{p_batch_id:batch.id,p_action:action,p_note:note});setBusy(false);if(error)setMessage(error.message);else{setBatch(data);setMessage(action==='approve'?'Approval recorded. Eligible balances are active only when the route is complete.':action==='return'?'Returned for correction.':'Migration rejected.');await loadBatches();}
 }
 return <div className="space-y-6 pb-10">
  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-sm font-semibold text-violet-600">Leaves / Balance migration</p><h1 className="text-3xl font-black text-slate-950 dark:text-white">Import existing leave balances</h1><p className="mt-1 max-w-3xl text-slate-600 dark:text-slate-300">Import opening and current leave balances from existing records. Balances become active only after the required approval.</p></div><div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950"><strong>Imported balances are not yet active</strong><span className="mt-1 block">Existing approved leave records are never overwritten.</span></div></div>
  <nav aria-label="Import progress" className="grid gap-3 md:grid-cols-3">{[['Upload file','Excel, CSV, or manual entry'],['Review balances','Validate and correct rows'],['Approval and activation','Complete the required route']].map(([title,copy],index)=><div key={title} className="flex items-center gap-3"><span className={stepStyle(step===index+1,step>index+1)}>{index+1}</span><div><strong>{title}</strong><p className="text-xs text-slate-500">{copy}</p></div>{index<2&&<div className="ml-auto hidden h-px flex-1 bg-slate-200 md:block"/>}</div>)}</nav>
  {message&&<div role="status" className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-violet-900">{message}</div>}
  <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]"><div className="space-y-5">
   <Card><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">1. Upload your file</h2><p className="text-sm text-slate-500">Use the template or enter one employee manually.</p></div><div className="flex gap-2"><Button variant="secondary" onClick={downloadCsv}>Download template</Button><Button variant="secondary" onClick={()=>setManual(true)}>Manual entry</Button></div></div>
    <input ref={fileRef} className="hidden" type="file" accept=".csv,.xlsx,.xls" onChange={e=>e.target.files?.[0]&&void handleFile(e.target.files[0])}/>
    <button type="button" onClick={()=>fileRef.current?.click()} className="mt-4 w-full rounded-2xl border-2 border-dashed border-slate-300 px-6 py-10 text-center hover:border-violet-400 hover:bg-violet-50/40"><span className="text-3xl">⇧</span><strong className="mt-2 block">{busy?'Reading file…':'Drag and drop your Excel or CSV file here'}</strong><span className="text-sm text-violet-600">or click to browse files</span></button>
    {fileName&&<div className="mt-3 flex items-center justify-between rounded-xl border bg-slate-50 p-3"><span><strong>{fileName}</strong><small className="block text-emerald-600">File loaded · {rows.length} records</small></span><Button variant="secondary" onClick={()=>fileRef.current?.click()}>Replace file</Button></div>}
   </Card>
   {manual&&<Card><h2 className="text-lg font-bold">Manual balance entry</h2><div className="mt-4 grid gap-3 md:grid-cols-2">{[
    ['Employee ID','employeeId','text'],['Employee name','employeeName','text'],['Business unit','businessUnit','text'],['As-of date','asOfDate','date'],['Opening balance','openingBalance','number'],['Accrued credits','accruedCredits','number'],['Used credits','usedCredits','number'],['Remaining balance','remainingBalance','number'],['Source','source','text'],['Supporting document or link','supportingDocument','text'],['Notes','notes','text'],
   ].map(([label,key,type])=><Input key={key} label={label} type={type} step={type==='number'?'0.001':undefined} value={String((entry as any)[key]??'')} onChange={e=>setEntry(value=>({...value,[key]:e.target.value}))}/>)}<label className="text-sm font-medium">Leave type<select className="mt-1 block min-h-11 w-full rounded-lg border px-3" value={entry.leaveType} onChange={e=>setEntry(value=>({...value,leaveType:e.target.value}))}><option>Vacation Leave</option><option>Sick Leave</option><option>Offset Leave</option><option>Leave Without Pay</option></select></label></div><div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={()=>setManual(false)}>Cancel</Button><Button onClick={addManual}>Add for review</Button></div></Card>}
   {!!rows.length&&<Card><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold">2. Review balances</h2><p className="text-sm text-slate-500">Invalid rows stay visible for correction. Valid rows can be kept in a draft.</p></div><div className="flex flex-wrap gap-2">{(['valid','review','invalid','not_applicable'] as ImportStatus[]).map(status=><span key={status} className={`rounded-full border px-3 py-1 text-xs font-bold ${statusStyle[status]}`}>{counts[status]} {statusLabel[status]}</span>)}</div></div>
    <div className="mt-4 overflow-x-auto"><table className="min-w-[1100px] w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr>{['#','Employee','Leave type','Opening','Accrued','Used','Remaining','As-of','Source','Status','Remarks'].map(x=><th key={x} className="p-3">{x}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.rowNumber} className={`border-t ${row.status==='valid'?'bg-emerald-50/50':row.status==='review'?'bg-amber-50/70':row.status==='invalid'?'bg-rose-50/60':'bg-slate-50'}`}><td className="p-3">{row.rowNumber}</td><td className="p-3"><strong>{row.employeeName||'Missing name'}</strong><small className="block">{row.employeeId||'Missing ID'} · {row.businessUnit||'No BU'}</small></td><td className="p-3">{row.leaveType||'—'}</td><td className="p-3">{row.openingBalance}</td><td className="p-3">{row.accruedCredits}</td><td className="p-3">{row.usedCredits}</td><td className="p-3 font-bold">{row.remainingBalance}</td><td className="p-3">{row.asOfDate||'—'}</td><td className="p-3">{row.source||'—'}</td><td className="p-3"><span className={`rounded-full border px-2 py-1 font-bold ${statusStyle[row.status]}`}>{statusLabel[row.status]}</span></td><td className="max-w-xs p-3">{row.messages.join(' · ')||'—'}</td></tr>)}</tbody></table></div>
    <div className="mt-4 flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={()=>void save(false)}>Save draft</Button><Button disabled={busy||counts.invalid>0} onClick={()=>void save(true)}>{counts.invalid?'Correct invalid rows before submission':'Submit for approval'}</Button></div>
   </Card>}
  </div><aside className="space-y-5"><Card><h2 className="text-lg font-bold">Approval rules</h2><ol className="mt-4 space-y-4 text-sm"><li><strong>1 · HR Staff entry → HR Manager</strong><p className="text-slate-500">Activates after HR Manager approval.</p></li><li><strong>2 · HR Manager entry → at least one BOD</strong><p className="text-slate-500">The creator cannot approve their own entry.</p></li><li><strong>3 · Initial manager and control-role balances → BOD</strong><p className="text-slate-500">BUM, Manager, General Manager, Operations Manager/Director, and Auditor require BOD approval.</p></li></ol>{batch?.can_act&&<div className="mt-5 grid gap-2"><Button onClick={()=>void review('approve')}>Approve and activate when complete</Button><Button variant="secondary" onClick={()=>void review('return')}>Return for correction</Button><Button variant="danger" onClick={()=>void review('reject')}>Reject</Button></div>}</Card>
   <Card><h2 className="text-lg font-bold">Request status</h2><div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">{['Draft','Pending HR Manager','Pending BOD','Approved','Returned'].map(value=><div key={value} className="rounded-xl border bg-slate-50 p-3"><strong className="block text-base">{batches.filter(batch=>String(batch.status).replaceAll('_',' ').toLowerCase()===value.toLowerCase()).length}</strong>{value}</div>)}</div></Card>
   <Card><h2 className="text-lg font-bold">Import audit trail</h2>{batch?<dl className="mt-3 space-y-2 text-sm">{[['Entered by',batch.created_by_name],['Source file',batch.source_file],['Date entered',batch.created_at],['As-of date',batch.as_of_date],['Approval route',batch.approval_route],['Approved by',batch.approved_by_name],['Approval date',batch.approved_at],['Status',batch.status]].map(([label,value])=><div key={label} className="flex justify-between gap-3 border-b pb-2"><dt className="text-slate-500">{label}</dt><dd className="text-right font-medium">{value||'—'}</dd></div>)}</dl>:<p className="mt-3 text-sm text-slate-500">Save a draft to begin the audit trail.</p>}</Card>
  </aside></div>
 </div>;
}

type ImportStatus=ValidatedBalanceRow['status'];
