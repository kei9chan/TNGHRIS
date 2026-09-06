import React,{useEffect,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import {useAuth} from '../../hooks/useAuth';
import SetupChecklistLink from './SetupChecklistLink';
import {listApprovals} from './approvals';
import type {ApprovalSummary} from './approvals';
import {processCodes,outputKinds,getPaymentWorkspace,getOutputSetup,recordOutputProcess,createPaymentBatch,closePaymentBatch,preparePaymentAttempt,recordPaymentOutcome,completePaymentBatch,createOutput,downloadOutput} from './payments';
import type {PaymentWorkspace,OutputSetup} from './payments';
const input='mt-1 block w-full rounded border border-gray-300 p-2 dark:bg-slate-800 dark:border-slate-600';

export default function PaymentsPage(){
 const {user}=useAuth();const [params,setParams]=useSearchParams();const id=params.get('run');
 const [list,setList]=useState<ApprovalSummary[]>([]),[w,setW]=useState<PaymentWorkspace|null>(null),[setup,setSetup]=useState<OutputSetup>({scopes:[],owners:[]});
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [scopeId,setScopeId]=useState(''),[code,setCode]=useState('bank'),[owner,setOwner]=useState(''),[processRef,setProcessRef]=useState('');
 const [reference,setReference]=useState(''),[employee,setEmployee]=useState(''),[amount,setAmount]=useState(''),[date,setDate]=useState(''),[reissue,setReissue]=useState('');
 const [attemptId,setAttemptId]=useState(''),[status,setStatus]=useState('confirmed'),[outcomeRef,setOutcomeRef]=useState(''),[reason,setReason]=useState(''),[outcomeDate,setOutcomeDate]=useState(''),[kind,setKind]=useState('register');
 const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
 const scope=setup.scopes.find(s=>s.id===scopeId);const attempt=w?.attempts.find(a=>a.id===attemptId);
 useEffect(()=>{let active=true;setBusy(true);setError('');setMessage('');setW(null);setList([]);setSetup({scopes:[],owners:[]});setEmployee('');setAttemptId('');setReissue('');setReference('');setAmount('');setReason('');setOutcomeRef('');setRequestId(crypto.randomUUID());
  void Promise.all([listApprovals(),getOutputSetup(),id?getPaymentWorkspace(id):Promise.resolve(null)])
   .then(([a,b,c])=>{if(active){setList(a);setSetup(b);setW(c);}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy(false);});
  return()=>{active=false;};
 },[user?.id,id]);
 async function perform(fn:()=>Promise<unknown>,success:string){setBusy(true);setError('');setMessage('');try{
  await fn();const [s,v]=await Promise.all([getOutputSetup(),id?getPaymentWorkspace(id):Promise.resolve(null)]);setSetup(s);setW(v);setMessage(success);
 }catch(e){setError((e as Error).message);if(id)try{setW(await getPaymentWorkspace(id));}catch{setW(null);}}finally{setBusy(false);}}
 async function download(exportId:string){const payload=await downloadOutput(exportId);const {savePaymentWorkbook}=await import('./paymentWorkbook');await savePaymentWorkbook(payload);}
 function editOutcome(){setRequestId(crypto.randomUUID());}
 return <div className="space-y-6">
  <h1 className="text-3xl font-bold">Payments & Reports</h1>
  <p>Reconcile actual payment evidence against the approved payroll. This page does not transfer money or file agency returns.</p>
  <SetupChecklistLink/>
  {error&&<p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-red-800">{error}</p>}
  {message&&<p role="status" className="rounded bg-green-50 p-3 text-green-800">{message}</p>}
  <Card title="Existing payment and filing processes">
   <p className="mb-3 text-sm">Finance records the actual owner and current process for each required output. Workpapers support that process; they are not validated bank, BIR, SSS, PhilHealth or Pag-IBIG upload files. Missing ownership stays pending.</p>
   <label>Business unit<select className={input} value={scopeId} onChange={e=>setScopeId(e.target.value)} disabled={busy}><option value="">Choose a business unit</option>{setup.scopes.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
   {scope&&<div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Output</th><th className="p-2">Owner / existing process</th></tr></thead><tbody>{processCodes.map(([value,label])=>{const p=scope.processes.find(x=>x.code===value);return <tr key={value} className="border-t"><td className="p-2">{label}</td><td className="p-2">{p?<>{p.owner}{!p.ownerActive&&' — owner needs review'}<p>{p.process_ref}</p></>:'Waiting on Finance'}</td></tr>;})}</tbody></table></div>}
   {scope?.canManage&&<form className="mt-4 space-y-3" onSubmit={e=>{e.preventDefault();void perform(()=>recordOutputProcess(scope.id,code,owner,processRef),'Existing process recorded.');}}>
    <div className="grid gap-3 sm:grid-cols-2"><label>Output<select className={input} value={code} onChange={e=>setCode(e.target.value)} disabled={busy}>{processCodes.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label>Existing Finance owner<select className={input} value={owner} onChange={e=>setOwner(e.target.value)} required disabled={busy}><option value="">Choose an owner</option>{setup.owners.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label></div>
    <label className="block">Approved procedure / filing process reference<textarea className={input} value={processRef} onChange={e=>setProcessRef(e.target.value)} required minLength={3} maxLength={1000} disabled={busy}/></label><Button disabled={busy}>Record process</Button>
   </form>}
  </Card>
  <Card title="Reviewed payroll version"><label>Select a submitted version<select className={input} value={id||''} onChange={e=>setParams(e.target.value?{run:e.target.value}:{})} disabled={busy}><option value="">Choose payroll</option>{list.map(r=><option key={r.id} value={r.id}>{r.from}–{r.to} · {r.kind} v{r.version} · {r.mode}</option>)}</select></label>
   {!list.length&&<p className="mt-3">No submitted version is available in your scope. Complete the assigned duties and payroll review, then open <Link className="text-indigo-600" to="/payroll/approvals">Payroll Approvals</Link>.</p>}
  </Card>
  {w&&<>
   <Card title="Payment reconciliation">
    <p>{w.approval.stage} · {w.approval.mode} · reviewed payday {w.approval.source.payDate}</p>
    {!w.canRelease&&<p className="mt-2 text-amber-800 dark:text-amber-300">{w.blockedReason}</p>}
    <div className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Approved net',w.totals.net],['Confirmed',w.totals.confirmed],['Pending',w.totals.pending],['Unpaid',w.totals.unpaid]].map(([l,v])=><div key={l}><p>{l}</p><strong>PHP {v}</strong></div>)}</div>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Employee','Approved net','Confirmed','Pending','Unpaid','Available'].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{w.rows.map(r=><tr key={r.employeeId} className="border-t"><td className="p-2">{r.employeeName}</td>{[r.due,r.confirmed,r.pending,r.unpaid,r.available].map((v,i)=><td key={i} className="p-2">{v}</td>)}</tr>)}</tbody></table></div>
    <p className="mt-3 text-sm">Pending attempts reserve their amount. Reissue only a confirmed failure, cancellation or full return. Payslips and loan posting follow full-batch reconciliation; individual partial payments remain visible here.</p>
    {w.batch?<p className="mt-3 font-medium">Batch: {w.batch.reference} · {w.batch.closed?'Closed':'Open'}</p>:w.canRelease&&<form className="mt-4 space-y-3" onSubmit={e=>{e.preventDefault();void perform(()=>createPaymentBatch(w.approval.id,reference),'Payment batch opened. No transfer was made.');}}><label>Batch reference<input className={input} value={reference} onChange={e=>setReference(e.target.value)} required minLength={3} maxLength={300} disabled={busy}/></label><Button disabled={busy}>Open authorized payment batch</Button></form>}
   </Card>
   {w.batch&&!w.batch.closed&&w.canRelease&&<Card title="Prepare an attempt or linked reissue"><p className="mb-3 text-sm">Record a distinct payment reference for this employee and transfer. Use the existing verified payment process to send it. Preparing an attempt does not confirm payment.</p>
    <form className="space-y-3" onSubmit={e=>{e.preventDefault();void perform(()=>preparePaymentAttempt(w.batch!.id,employee,amount,reference,date,reissue||null),'Attempt recorded as pending.');}}>
     <div className="grid gap-3 sm:grid-cols-2"><label>Employee<select className={input} value={employee} onChange={e=>{setEmployee(e.target.value);setReissue('');}} required disabled={busy}><option value="">Choose employee</option>{w.rows.map(r=><option key={r.employeeId} value={r.employeeId}>{r.employeeName} · available {r.available}</option>)}</select></label>
     <label>Linked failed / returned attempt<select className={input} value={reissue} onChange={e=>setReissue(e.target.value)} disabled={busy}><option value="">Initial payment / additional unpaid portion</option>{w.attempts.filter(a=>a.employee_id===employee&&['failed','cancelled','returned'].includes(a.status)).map(a=><option key={a.id} value={a.id}>{a.reference} · {a.status} · {a.amount}</option>)}</select></label>
     <label>Amount (PHP)<input inputMode="decimal" className={input} value={amount} onChange={e=>setAmount(e.target.value)} required disabled={busy}/></label><label>Scheduled date<input type="date" className={input} value={date} min={w.approval.source.payDate} onChange={e=>setDate(e.target.value)} required disabled={busy}/></label></div>
     <label className="block">Employee transfer reference<input className={input} value={reference} onChange={e=>setReference(e.target.value)} required minLength={3} maxLength={300} disabled={busy}/></label><Button disabled={busy}>Record pending attempt</Button>
    </form>
   </Card>}
   <Card title="Payment evidence and reissue history">
    {!w.attempts.length?<p>No payment attempts recorded.</p>:w.attempts.map(a=><details key={a.id} className="border-b py-3"><summary>{w.rows.find(r=>r.employeeId===a.employee_id)?.employeeName} · {a.reference} · PHP {a.amount} · {a.status}</summary><p>Scheduled {a.scheduled_on}{a.reissue_of&&` · reissue of ${w.attempts.find(x=>x.id===a.reissue_of)?.reference||a.reissue_of}`}</p>{a.bankChanged&&<p className="text-amber-800">Bank details changed after preparation. Reconcile the original transfer; new attempts require current verification.</p>}{a.events.map(e=><p key={e.id} className="mt-2 text-sm">{e.occurred_on} · {e.status} · {e.reference} · {e.reason}</p>)}</details>)}
    {w.batch&&!w.batch.closed&&w.canRecordOutcome&&<form className="mt-4 space-y-3" onSubmit={e=>{e.preventDefault();if(attempt)void perform(async()=>{await recordPaymentOutcome(attempt.id,attempt.lastEvent,status,outcomeDate,outcomeRef,reason,requestId);setAttemptId('');setOutcomeRef('');setReason('');setRequestId(crypto.randomUUID());},'Actual outcome recorded.');}}>
     <label>Attempt<select className={input} value={attemptId} onChange={e=>{setAttemptId(e.target.value);setStatus(w.attempts.find(a=>a.id===e.target.value)?.status==='confirmed'?'returned':'confirmed');editOutcome();}} required disabled={busy}><option value="">Choose attempt</option>{w.attempts.filter(a=>['pending','confirmed'].includes(a.status)).map(a=><option key={a.id} value={a.id}>{a.reference} · {a.status}</option>)}</select></label>
     <div className="grid gap-3 sm:grid-cols-2"><label>Actual outcome<select className={input} value={status} onChange={e=>{setStatus(e.target.value);editOutcome();}} disabled={busy}>{(attempt?.status==='confirmed'?['returned']:['confirmed','failed','cancelled']).map(s=><option key={s} value={s}>{s}</option>)}</select></label><label>Actual outcome date<input type="date" className={input} value={outcomeDate} onChange={e=>{setOutcomeDate(e.target.value);editOutcome();}} required disabled={busy}/></label></div>
     <label className="block">Bank / payment outcome reference<input className={input} value={outcomeRef} onChange={e=>{setOutcomeRef(e.target.value);editOutcome();}} required minLength={3} maxLength={1000} disabled={busy}/></label><label className="block">Reason / reconciliation evidence<textarea className={input} value={reason} onChange={e=>{setReason(e.target.value);editOutcome();}} required minLength={3} maxLength={1000} disabled={busy}/></label>
     <p className="text-sm">Returned means this entire attempt was returned. For an unverified or partial return, keep the amount reserved and resolve it through Finance before recording a full return.</p><Button disabled={busy||!attempt}>Record actual outcome</Button>
    </form>}
   </Card>
   {w.batch&&!w.batch.closed&&(w.canRelease||w.canRecordOutcome)&&<Card title="Complete reconciliation"><p>Once every employee matches the approved net, record the reconciliation reference. First completion reuses Phase 7’s full-payment receipt and private payslips. Reissued payments restore reversed loan postings once; original receipts remain intact.</p><label className="mt-3 block">Reconciliation / closure reference<input className={input} value={reference} onChange={e=>setReference(e.target.value)} minLength={3} maxLength={1000} disabled={busy}/></label><div className="mt-3 flex flex-wrap gap-3"><Button disabled={busy||reference.trim().length<3||!w.canRelease||!w.rows.every(r=>r.complete)} onClick={()=>void perform(()=>completePaymentBatch(w.batch!.id,reference),'Batch reconciled. Private release and loan accounting checked.')}>Complete reconciliation</Button><Button variant="secondary" disabled={busy||reference.trim().length<3||w.attempts.some(a=>['pending','confirmed','returned'].includes(a.status))||w.approval.paid} onClick={()=>void perform(()=>closePaymentBatch(w.batch!.id,reference),'Unused batch closed. A fresh approved version may be used.')}>Close unused batch</Button></div>{w.loanAdjustments.map(a=><p className="mt-2 text-sm" key={a.id}>{a.kind} · PHP {a.amount} · {a.reason}</p>)}</Card>}
   <Card title="Finance exports"><p className="mb-3 text-sm">Download the reviewed register, Finance totals, payment reconciliation, BIR source data or contribution data. All files carry their exact version, status and source fingerprint. BIR annual/YTD snapshots must be reconciled across the full year; do not add snapshots together.</p><div className="flex flex-wrap items-end gap-3"><label>Output<select className={input} value={kind} onChange={e=>setKind(e.target.value)} disabled={busy}>{outputKinds.map(([v,l])=><option key={v} value={v} disabled={v==='payment_schedule'&&!w.canRelease}>{l}</option>)}</select></label><Button disabled={busy} onClick={()=>void perform(async()=>{const exportId=await createOutput(w.approval.id,kind);await download(exportId);},'Export generated; download requested. No payment or filing was made.')}>Generate & download</Button></div>
    {w.exports.map(e=><div key={e.id} className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3"><p>{e.kind} · {new Date(e.at).toLocaleString('en-PH')} · {e.downloadRequests} download requests</p><Button variant="secondary" disabled={busy} onClick={()=>void perform(()=>download(e.id),'Saved export download requested.')}>Download saved version</Button></div>)}
   </Card>
  </>}
 </div>;
}
