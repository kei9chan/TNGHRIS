import React,{useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../../hooks/useAuth';
import {canImportActualAttendance} from './scheduleScope';
import {supabase} from '../../services/supabaseClient';
import {usePayrollField} from './usePayrollSelection';
import {fetchTimeContext,TimeScope} from './attendanceReadiness';
import NormalPayrollPeriodSelector from './NormalPayrollPeriodSelector';
import {attendanceCsv,attendanceFields,attendanceSample,downloadText,normalizeAttendance,readAttendanceFile} from './actualAttendanceImport';
import type {AttendanceInput} from './actualAttendanceImport';
type Employee={id:string;code:string;name:string;businessUnit:string};
type ImportHistory={id:string;filename:string;accepted_rows:number;duplicate_rows:number;created_at:string};
type Preview={ready:number;duplicates:number;alreadyImported?:boolean;confirmed?:boolean;errors:{row:number;message:string}[];rows:{row:number;employee:string;workDate:string;error:string|null;duplicate:boolean;warnings:string[]}[]};
const field='mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900';
const button='inline-flex min-h-11 items-center justify-center rounded-xl border px-4 py-3 font-semibold';
export default function ActualAttendancePage(){
 const {user}=useAuth();
 const [scope,setScope]=usePayrollField('scope'),[from]=usePayrollField('from'),[to]=usePayrollField('to');
 if(!canImportActualAttendance(user))return <main className="p-6"><h1 className="text-2xl font-bold">Import Attendance</h1><p className="mt-3">Actual attendance imports require Board of Director, Admin, HR Manager or HR Staff access to the selected business unit.</p><Link to="/payroll/run" className="mt-4 inline-block text-violet-600">Return to Prepare payroll</Link></main>;
 return <AttendanceWorkspace key={`${user?.id}:${scope}:${from}:${to}`} scope={scope} setScope={setScope} from={from} to={to}/>;
}
function AttendanceWorkspace({scope,setScope,from,to}:{key?:string;scope:string;setScope:(value:string)=>void;from:string;to:string}){
 const [history,setHistory]=useState<ImportHistory[]>([]),[historyRevision,setHistoryRevision]=useState(0);
 const [scopes,setScopes]=useState<TimeScope[]>([]),[employees,setEmployees]=useState<Employee[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [rows,setRows]=useState<AttendanceInput[]>([]),[filename,setFilename]=useState(''),[preview,setPreview]=useState<Preview|null>(null),[sample,setSample]=useState(false),[manual,setManual]=useState(false),[entry,setEntry]=useState<string[]>(Array(9).fill(''));
 const unit=scopes.find(s=>s.id===scope)?.name||'';
 useEffect(()=>{let active=true;fetchTimeContext().then(x=>{if(active)setScopes(x.scopes.filter(s=>s.canView));}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
 useEffect(()=>{let active=true;if(!scope||!from||!to)return;
  Promise.resolve(supabase.rpc('get_actual_attendance_import_context',{p_scope:scope,p_from:from,p_to:to})).then(({data,error})=>{if(!active)return;if(error)setError(error.message);else {setEmployees(data.employees);setHistory(data.imports||[]);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};
 },[scope,from,to,historyRevision]);
 async function check(next:AttendanceInput[],name:string,confirm=false){setBusy(true);setError('');try{
  const {data,error}=await supabase.rpc('import_actual_attendance',{p_scope:scope,p_from:from,p_to:to,p_filename:name,p_rows:next,p_confirm:confirm});if(error)throw error;setRows(next);setFilename(name);setPreview(data);if(data.confirmed)setHistoryRevision(x=>x+1);
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function upload(file:File){setBusy(true);setError('');setPreview(null);try{await check(await readAttendanceFile(file,unit),file.name);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <main className="mx-auto max-w-7xl space-y-5 p-5 text-slate-900 dark:text-slate-100">
  <header><Link to="/payroll/run" className="text-violet-600">← Prepare payroll</Link><h1 className="mt-3 text-3xl font-bold">Import Attendance</h1><p className="mt-2 text-slate-500">Importing saves actual attendance for this period. Review before confirming. Existing records will not be overwritten automatically.</p></header>
  <div className="grid gap-4 lg:grid-cols-2"><label>Business unit<select className={field} value={scope} disabled={busy} onChange={e=>setScope(e.target.value)}><option value="">Choose business unit</option>{scopes.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><NormalPayrollPeriodSelector disabled={busy}/></div>
  <Link className={`${button} text-violet-700`} to="/payroll/import/attendance-events">Multiple sessions or breaks? Use the event-log template</Link>
  <section className="rounded-2xl border bg-white p-5 dark:bg-slate-900"><h2 className="text-xl font-bold">Daily attendance · template version 1</h2><p className="mt-2 text-sm text-slate-500">One employee and work date per row. Enter actual date/times in Asia/Manila, including the next-day date for overnight clock-out. Payroll calculates hours; later clock-out does not authorize overtime.</p>
   <a href="/templates/attendance-v1.xlsx" download className={`${button} mt-4 border-violet-300 text-violet-700`}>Download template (XLSX)</a>
   <div className="mt-4 flex flex-wrap gap-3"><button className={button} onClick={()=>downloadText('attendance-v1.csv',attendanceCsv())}>Download template (CSV)</button><button className={button} disabled={!employees.length} onClick={()=>downloadText('attendance-prefilled.csv',attendanceCsv(employees.flatMap(e=>{const result:string[][]=[];for(let d=new Date(from+'T00:00:00Z');d.toISOString().slice(0,10)<=to;d.setUTCDate(d.getUTCDate()+1))result.push([e.code,unit,d.toISOString().slice(0,10),'','','','','','']);return result;})))}>Download prefilled template</button><button className={button} onClick={()=>setSample(!sample)}>View sample</button><label className={`${button} bg-violet-600 text-white ${busy||!employees.length?'opacity-50':''}`}>Upload completed file<input className="sr-only" type="file" accept=".csv,.xlsx" disabled={busy||!employees.length} onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file);e.target.value='';}}/></label><button className={button} onClick={()=>setManual(!manual)}>Enter manually</button></div>
   {sample&&<div className="mt-4 overflow-x-auto"><p className="mb-3 font-semibold">Example only — DEMO-001 is not accepted in a real import.</p><table className="text-sm"><thead><tr>{attendanceFields.map(([h])=><th className="whitespace-nowrap p-3 text-left" key={h}>{h}</th>)}</tr></thead><tbody><tr>{attendanceSample.map((v,i)=><td className="whitespace-nowrap border-t p-3" key={i}>{v}</td>)}</tr></tbody></table></div>}
   {manual&&<form className="mt-5" onSubmit={e=>{e.preventDefault();try{void check(normalizeAttendance([[entry[0],unit,...entry.slice(2)]],unit),'Manual attendance entry');}catch(e){setError((e as Error).message);}}}><div className="grid gap-3 sm:grid-cols-3">{attendanceFields.map(([label],i)=>i===1?null:<label key={label} className="text-sm">{label}{i===0?<select className={field} required value={entry[0]} onChange={e=>setEntry(v=>v.map((x,n)=>n===0?e.target.value:x))}><option value="">Choose employee</option>{employees.map(e=><option key={e.id} value={e.code}>{e.name} · {e.code}</option>)}</select>:<input className={field} type={i===2?'date':i>=3&&i<=6?'datetime-local':'text'} required={i===2} value={entry[i]} onChange={e=>setEntry(v=>v.map((x,n)=>n===i?e.target.value:x))}/>}</label>)}</div><button disabled={busy} className={`${button} mt-4`}>Preview actual attendance</button></form>}
  </section>
  {error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
  {busy&&<p role="status">Checking attendance records…</p>}
  {!!history.length&&<section className="rounded-2xl border bg-white p-5 dark:bg-slate-900"><h2 className="text-xl font-bold">Saved imports for this cutoff</h2><p className="mt-2 text-sm text-slate-500">These are actual attendance records, not preview or test data.</p><ul className="mt-3 space-y-2">{history.map(h=><li key={h.id} className="border-t py-3"><span className="font-semibold">{h.filename}</span> · {h.accepted_rows} accepted · {h.duplicate_rows} duplicates skipped · {new Date(h.created_at).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}</li>)}</ul><Link to="/payroll/attendance-readiness" className={`${button} mt-3`}>Review saved attendance</Link></section>}
  {preview&&<section className="rounded-2xl border bg-white p-5 dark:bg-slate-900"><h2 className="text-xl font-bold">{preview.confirmed?'Confirmed actual attendance':preview.alreadyImported?'This file was already imported':'Review before confirming'}</h2><p className="mt-2">{filename} · {unit} · {from}–{to}</p><p className="mt-3 font-semibold">{preview.ready} {preview.confirmed?'accepted records':'rows ready'} · {preview.errors.length} requiring correction · {preview.duplicates} duplicates skipped</p>
   <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Row','Employee','Work date','Result'].map(h=><th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody>{preview.rows.map(r=><tr key={r.row} className="border-t"><td className="p-3">{r.row+1}</td><td className="p-3">{r.employee}</td><td className="p-3">{r.workDate}</td><td className={`p-3 ${r.error?'text-red-700':r.warnings.length?'text-amber-700':'text-emerald-700'}`}>{r.error|| (r.duplicate?'Duplicate — will not be added':r.warnings.join(' ')||'Ready')}</td></tr>)}</tbody></table></div>
   {!!preview.errors.length&&<button className={`${button} mt-4`} onClick={()=>downloadText('attendance-errors.csv','Row,Error\r\n'+preview.errors.map(e=>`${e.row+1},"${e.message.replaceAll('"','""')}"`).join('\r\n'))}>Download errors</button>}
   {!preview.confirmed&&!preview.alreadyImported&&<button disabled={busy||!!preview.errors.length||!preview.ready} className={`${button} mt-4 bg-violet-600 text-white disabled:opacity-50`} onClick={()=>void check(rows,filename,true)}>Confirm import</button>}
   {(preview.confirmed||preview.alreadyImported)&&<Link className={`${button} mt-4`} to="/payroll/run">Return to Prepare payroll</Link>}
  </section>}
 </main>;
}
