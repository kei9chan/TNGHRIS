import React,{useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import {useCalculationSelection} from './useCalculationSelection';
import {calculationComparison,saveCalculationComparison} from './calculationReview';
import type {CalculationWorkspaceData,CalculationComparisonData} from './calculationReview';
import type {CompareInput} from './pilot';
import {previewDifferences} from './calculationModel';
import ComparisonEmployeeTable from './ComparisonEmployeeTable';
const field='mt-1 block w-full rounded border p-2 bg-white dark:bg-slate-800 dark:border-slate-600';
const CalculationComparison:React.FC<{workspace:CalculationWorkspaceData}>=({workspace:w})=>{
 const [,select]=useCalculationSelection(w.scopeId,w.from,w.to);
 return <Card title="Compare this calculation with existing payroll"><p className="mb-3">Internal comparison for {w.from}–{w.to}. This evidence does not submit, approve, activate or pay payroll.</p><div className="grid gap-3 sm:grid-cols-2"><label>Gross version<select className={field} value={w.grossId||''} onChange={e=>select({grossId:e.target.value,netId:''})}><option value="">Select…</option>{w.grossRuns.map(r=><option value={r.id} key={r.id}>Version {r.version}</option>)}</select></label><label>Take-home version from this gross run<select className={field} value={w.netId||''} onChange={e=>select({grossId:w.grossId||'',netId:e.target.value})}><option value="">Select…</option>{w.netRuns.map(r=><option value={r.id} key={r.id}>Version {r.version}</option>)}</select></label></div>{w.netId?<ComparisonEditor key={w.netId} id={w.netId}/>:<p className="mt-3">Complete <Link to="/payroll/net-pay" className="underline">Take-home Pay Review</Link> for this cutoff first. Missing historical inputs remain listed above.</p>}</Card>;
};
const ComparisonEditor:React.FC<{id:string}>=({id})=>{
 const [data,setData]=useState<CalculationComparisonData|null>(null),[upload,setUpload]=useState<CompareInput|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[refresh,setRefresh]=useState(0);
 useEffect(()=>{let active=true;setData(null);setBusy(true);setError('');void calculationComparison(id).then(d=>{if(active)setData(d);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[id,refresh]);
 async function perform(work:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await work();}catch(e){setError(e instanceof Error?e.message:'Comparison could not be completed.');}finally{setBusy(false);}}
 return <div className="mt-4 space-y-4">{busy&&<p role="status">Checking comparison…</p>}{error&&<p role="alert" className="text-red-700">{error} <button className="underline" disabled={busy} onClick={()=>setRefresh(v=>v+1)}>Refresh comparison</button></p>}{notice&&<p role="status">{notice}</p>}{data&&<>
 {!data.current&&<p role="alert" className="text-amber-800 dark:text-amber-200">Sources changed: {data.staleReason||'recalculate this version'}. Saved evidence remains visible; saving a new comparison is blocked.</p>}
 <p className="text-sm">Download the component register, enter the actual existing-payroll amounts and explain differences with evidence. Blank amounts are not zero. Each saved revision is retained.</p>
 <Button variant="secondary" disabled={busy||!data.current} onClick={()=>void perform(async()=>{const m=await import('./comparisonWorkbook');await m.downloadComparisonWorkbook(data.template);})}>Download calculation comparison workbook</Button>
 {data.canSave&&<label className="block">Preview existing payroll workbook<input type="file" accept=".xlsx" className={field} disabled={busy||!data.current} onChange={e=>{const file=e.target.files?.[0];if(file)void perform(async()=>{const m=await import('./comparisonWorkbook');const parsed=await m.parseComparisonWorkbook(await file.arrayBuffer(),data.template);setUpload(parsed);});e.target.value='';}}/></label>}
 {upload&&<section className="space-y-3 rounded-lg border p-3"><h3 className="font-semibold">Preview · {upload.legacyEmployees.length} employees</h3><p>{upload.sourceRef} · {upload.coverageRef}</p><ComparisonEmployeeTable rows={previewDifferences(data.template,upload)}/><Button disabled={busy||!data.current||!data.canSave} onClick={()=>void perform(async()=>{await saveCalculationComparison(data.template,upload);const saved=await calculationComparison(id);setData(saved);setUpload(null);setNotice('Comparison revision saved and reloaded from the server. No approval or payment was made.');})}>Save internal comparison revision</Button><p className="text-sm">Unexplained differences can be saved for correction but remain visibly unresolved.</p></section>}
 <h3 className="font-semibold">Saved internal comparison revisions</h3>{data.revisions.length===0?<p>No existing-payroll comparison has been saved for this version.</p>:data.revisions.map((r,i)=><details key={r.id} open={i===0} className="rounded-lg border p-3"><summary className="cursor-pointer">{new Date(r.createdAt).toLocaleString()} · {r.rows.filter(x=>!x.resolved).length} unresolved differences</summary><p className="my-3">{r.sourceRef} · {r.coverageRef}</p><ComparisonEmployeeTable rows={r.rows}/></details>)}
 <p className="text-sm">Ready for formal review? <Link className="underline" to={`/payroll/approvals?net=${id}`}>Submit this exact take-home version through Payroll Approvals</Link>. The existing HR/Finance comparison acceptances and pilot approvals below remain required for live activation.</p>
 </>}</div>;
};
export default CalculationComparison;
