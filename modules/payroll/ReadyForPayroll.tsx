import React,{useEffect,useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {supabase} from '../../services/supabaseClient';
import {usePayrollField} from './usePayrollSelection';
import PayrollCycleSelector from './PayrollCycleSelector';
import {validCutoff} from './workspace';
export type HandoverRow={scopeId:string;name:string;packageId:string|null;version:number|null;submittedAt:string|null;grossId:string|null;netId:string|null};
export function handoverStatus(row:HandoverRow){return !row.packageId?'Not sent to Finance':row.netId?'Payroll draft calculated':row.grossId?'Gross calculated · Finance review needed':'Ready for Finance calculation';}
export default function ReadyForPayroll(){
 const [from]=usePayrollField('from'),[to]=usePayrollField('to'),[,setScope]=usePayrollField('scope');
 const navigate=useNavigate();
 const [rows,setRows]=useState<HandoverRow[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{const controller=new AbortController();let active=true;setRows([]);setError('');
  if(!validCutoff(from,to)){setLoading(false);return;}setLoading(true);
  const timer=setTimeout(()=>controller.abort(),25000);
  Promise.resolve(supabase.rpc('get_payroll_handover_queue',{p_from:from,p_to:to}).abortSignal(controller.signal)).then(({data,error})=>{if(!active)return;if(error)throw new Error(error.message);setRows(data||[]);}).catch(e=>{if(active)setError(controller.signal.aborted?'Queue loading timed out. Please refresh.':e.message);}).finally(()=>{clearTimeout(timer);if(active)setLoading(false);});
  return()=>{active=false;clearTimeout(timer);controller.abort();};
 },[from,to,revision]);
 useEffect(()=>{const refresh=()=>setRevision(v=>v+1);window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh);},[]);
 const received=rows.filter(r=>r.packageId).length;
 return <main className="min-h-screen space-y-5 bg-slate-50 p-4 pb-28 text-slate-900 dark:bg-slate-950 dark:text-white sm:p-7">
  <header><h1 className="text-3xl font-bold">Ready for Payroll</h1><p className="mt-2 text-slate-500">Finance’s attendance inbox. “Send ready attendance to Finance” in Run Payroll puts the business unit here.</p></header>
  <PayrollCycleSelector compact/>
  <div className="flex flex-wrap items-center justify-between gap-3"><p className="font-semibold">{loading?'Loading handovers…':error?'Queue unavailable':`${received} of ${rows.length} business units sent attendance`}</p><button className="min-h-11 rounded-xl border px-4 py-2" disabled={loading} onClick={()=>setRevision(v=>v+1)}>Refresh queue</button></div>
  {error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
  {!loading&&!error&&<><div className="overflow-x-auto rounded-xl border bg-white dark:bg-slate-900"><table className="w-full text-left text-sm"><thead><tr>{['Business unit','Status','Sent to Finance (Manila)','Action'].map(h=><th key={h} className="p-4">{h}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.scopeId} className="border-t"><td className="p-4 font-semibold">{row.name}</td><td className="p-4"><span className={row.packageId?'text-emerald-700 dark:text-emerald-300':'text-slate-500'}>{handoverStatus(row)}</span>{row.version&&<p className="mt-1 text-xs text-slate-500">Attendance version {row.version}</p>}</td><td className="p-4">{row.submittedAt?new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}).format(new Date(row.submittedAt)):'—'}</td><td className="p-4"><button className="min-h-11 whitespace-nowrap rounded-xl bg-violet-600 px-4 py-2 font-semibold text-white" onClick={()=>{setScope(row.scopeId);navigate('/payroll/run');}}>{row.packageId?'Open payroll':'Prepare attendance'}</button></td></tr>)}</tbody></table></div>{!rows.length&&<p>No business units are available for your payroll access.</p>}</>}
  <p className="text-sm text-slate-500">This shows saved handovers for {from || 'the selected cutoff'}{to?` to ${to}`:''}. Opening payroll rechecks current attendance and pay inputs. A saved draft does not mean payroll has been approved or paid.</p>
  <Link className="inline-flex min-h-11 items-center font-semibold text-violet-600" to="/payroll/run">Go to Run Payroll →</Link>
 </main>;
}
