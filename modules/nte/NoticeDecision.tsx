import React,{useEffect,useRef,useState} from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import SignaturePad,{SignaturePadRef} from '../../components/ui/SignaturePad';
import {workflowRpc,phTime} from './workflow';
const cls='w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white';
const fields:Record<string,string>={facts:'Established facts',evidence:'Evidence considered',explanation:'Employee explanation or recorded non-submission',findings:'Findings for each allegation',policy:'Applicable company policy',circumstances:'Aggravating and mitigating circumstances',reasons:'Management’s reasons supporting the decision'};
const NoticeDecision:React.FC<{nteId:string;refresh:number}>=({nteId,refresh})=>{
 const[w,setW]=useState<any>(null),[form,setForm]=useState<Record<string,any>>({}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[version,setVersion]=useState(0),[reason,setReason]=useState(''),[dates,setDates]=useState(''),[rtw,setRtw]=useState(''),[consent,setConsent]=useState(false);
 const sig=useRef<SignaturePadRef>(null),lock=useRef(false);
 const[serviceTime,setServiceTime]=useState('');
 useEffect(()=>{let live=true;workflowRpc('get_nod_workflow',{p_nte_id:nteId}).then(v=>{if(live){setW(v);setForm(v.decision?.review_fields||{});}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[nteId,refresh,version]);
 const change=(key:string,value:any)=>setForm(f=>({...f,[key]:value}));
 async function act(action:string,data:any={}){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await workflowRpc('act_on_nod',{p_nte_id:nteId,p_action:action,p_data:data});setVersion(x=>x+1);}catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}}
 const d=w?.decision,i=w?.implementation,editing=w?.canReview&&['Draft','Rejected'].includes(d?.status);
 const textInput=(key:string,label:string,type='text')=><label className="block" key={key}>{label}<input type={type} className={cls} value={form[key]||''} onChange={e=>change(key,e.target.value)}/></label>;
 return <Card title="Notice of Decision">
  {error&&<p role="alert" className="mb-3 text-red-600 dark:text-red-300">{error}</p>}
  {!d?<p>No issued decision. Management drafting opens after the response window closes.</p>:<div className="space-y-4">
   <p className="font-semibold">{i?.status||d.status}</p>{d.document_reference&&<p>{d.document_reference} · {phTime(d.sent_to_employee_at)}</p>}
   {editing?<>
    <p>This draft contains no automatic finding or penalty. Complete the review before requesting approval.</p>
    {Object.entries(fields).map(([key,label])=><label className="block" key={key}>{label}<textarea rows={3} className={cls} value={form[key]||''} onChange={e=>change(key,e.target.value)}/></label>)}
    <label className="block">Recommended decision<select className={cls} value={form.decision||''} onChange={e=>change('decision',e.target.value)}><option value="">Select after reviewing evidence</option>{['CaseDismissed','Verbal Warning','Written Warning','Suspension','Salary Deduction','Termination'].map(x=><option key={x} value={x}>{x==='CaseDismissed'?'Close without violation':x}</option>)}</select></label>
    {textInput('effectiveDate','Authorized effective date','date')}
    {form.decision==='Suspension'&&<>
     {textInput('days','Number of suspension days','number')}
     <label className="block">Suspension schedule<select className={cls} value={form.scheduleStatus||'TBA'} onChange={e=>change('scheduleStatus',e.target.value)}><option>TBA</option><option>Scheduled</option></select></label>
     {form.scheduleStatus==='Scheduled'&&<label className="block">Suspension dates (YYYY-MM-DD, separated by commas)<input className={cls} value={(form.dates||[]).join(',')} onChange={e=>change('dates',e.target.value.split(',').map(x=>x.trim()))}/></label>}
    </>}
    {form.decision==='Salary Deduction'&&<>{textInput('legalBasis','Legal or contractual basis — must permit this deduction')}{textInput('total','Total amount (PHP)','number')}{textInput('perCutoff','Deduction per payroll cutoff (PHP)','number')}{textInput('installments','Number of installments','number')}{textInput('firstDate','First deduction date','date')}{textInput('finalDate','Final deduction date','date')}</>}
    <p className="text-sm">Required approvers: {(d.approver_steps||[]).map((s:any)=>s.userName).join(' → ')}. All must approve.</p>
    <div className="flex flex-wrap gap-3"><Button variant="secondary" disabled={busy} onClick={()=>act('save',{...form,scheduleStatus:form.scheduleStatus||'TBA'})}>Save draft</Button><Button disabled={busy} onClick={()=>act('submit',{...form,scheduleStatus:form.scheduleStatus||'TBA'})}>Send for approval</Button></div>
   </>:<>
    <p className="font-bold">{d.resolution_type==='CaseDismissed'?'Closed — no violation found':d.resolution_type}</p>
    {Object.entries(fields).map(([key,label])=><section key={key}><h3 className="font-semibold">{label}</h3><p className="whitespace-pre-wrap">{d.review_fields[key]||'Not recorded'}</p></section>)}
    <p>Effective date: {d.review_fields.effectiveDate||'Not recorded'}</p>
    {d.resolution_type==='Suspension'&&<div><p>{d.suspension_days} suspension days · {i?.suspensionProgress||d.review_fields.scheduleStatus} · {(i?.scheduled_dates||d.review_fields.dates||[]).join(', ')}</p>{i?.actual_dates?.length>0&&<p>Actual dates served: {i.actual_dates.join(', ')} · Return to work: {i.return_to_work}</p>}</div>}
    {!w.isEmployee&&<ul>{d.approver_steps.map((s:any)=><li key={s.userId}>{s.userName}: {s.status}</li>)}</ul>}
   </>}
   {w.canApprove&&<><label className="block">Review comments / rejection reason<textarea className={cls} value={reason} onChange={e=>setReason(e.target.value)}/></label><div className="flex gap-3"><Button disabled={busy} onClick={()=>act('approve',{reason})}>Approve decision</Button><Button disabled={busy||!reason.trim()} variant="secondary" onClick={()=>act('reject',{reason})}>Return for review</Button></div></>}
   {w.isEmployee&&d.status==='Pending Acknowledgement'&&<><p>Acknowledge receipt of this decision. This is not consent to salary deduction.</p><SignaturePad ref={sig}/><Button disabled={busy} onClick={()=>act('acknowledge',{signature:sig.current?.getSignatureDataUrl()})}>Acknowledge Notice of Decision</Button></>}
   {i?.atd&&<section className="space-y-3 border-t pt-4"><h3 className="text-lg font-bold">Authority to Deduct — separate employee authorization</h3><p>{i.atd.reference} · {i.atd.employeeName} · {i.atd.employeeNumber||'Employee number not recorded'}</p><p>Basis: {i.atd.legalBasis}</p><p>PHP {i.atd.total} total · PHP {i.atd.perCutoff} per cutoff · {i.atd.installments} installments</p><p>{i.atd.firstDate} to {i.atd.finalDate}</p>
    {i.employee_signed_at?<p>Employee signed: {phTime(i.employee_signed_at)}</p>:w.isEmployee&&<><label className="flex gap-2"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>I authorize the stated deduction</label><SignaturePad ref={sig}/><Button disabled={busy||!consent} onClick={()=>act('sign_atd',{consent:'I authorize the stated deduction',signature:sig.current?.getSignatureDataUrl()})}>Sign Authority to Deduct</Button></>}
    {w.canReview&&i.employee_signed_at&&!i.hr_verified_at&&<><label className="block">HR verification of signature and legally permissible basis<textarea className={cls} value={reason} onChange={e=>setReason(e.target.value)}/></label><Button disabled={busy||!reason.trim()} onClick={()=>act('verify_atd',{reason})}>Verify signed ATD</Button></>}
    {w.canFinance&&i.hr_verified_at&&!i.finance_approved_at&&<Button disabled={busy} onClick={()=>act('approve_atd')}>Finance: approve ATD</Button>}
    <p>HR verification: {i.hr_verified_at?phTime(i.hr_verified_at):'Pending'} · Finance approval: {i.finance_approved_at?phTime(i.finance_approved_at):'Pending'}</p>
   </section>}
   {w.canReview&&i&&!d.employee_acknowledged_at&&!i.decision_service_at&&<details><summary>Record valid service of the decision</summary><div className="mt-3 space-y-3"><label className="block">Actual receipt date and time — Philippine time<input type="datetime-local" className={cls} value={serviceTime} onChange={e=>setServiceTime(e.target.value)}/></label><label className="block">Proof of valid service<textarea className={cls} value={reason} onChange={e=>setReason(e.target.value)}/></label><Button disabled={busy||!serviceTime||!reason} onClick={()=>act('decision_service',{receivedAt:serviceTime+':00+08:00',proof:reason})}>Record service evidence</Button><p className="text-sm">This does not sign an Authority to Deduct for the employee.</p></div></details>}
   {w.canReview&&i&&d.resolution_type==='Suspension'&&i.status!=='Fully Served'&&<details><summary>Record suspension implementation</summary><div className="mt-3 space-y-3"><label className="block">Dates (YYYY-MM-DD, separated by commas)<input className={cls} value={dates} onChange={e=>setDates(e.target.value)}/></label>
    {i.schedule_status==='TBA'?<Button disabled={busy} onClick={()=>act('schedule',{dates:dates.split(',').map(x=>x.trim())})}>Confirm and send schedule</Button>:<><label className="block">Evidence that the days were fully served<textarea className={cls} value={reason} onChange={e=>setReason(e.target.value)}/></label><label className="block">Return-to-work date<input type="date" className={cls} value={rtw} onChange={e=>setRtw(e.target.value)}/></label><Button disabled={busy} onClick={()=>act('served',{dates:dates.split(',').map(x=>x.trim()),reason,returnToWork:rtw})}>Confirm all suspension days fully served</Button></>}
   </div></details>}
   {w.canReview&&i&&d.status==='Acknowledged'&&!['Suspension','Salary Deduction'].includes(d.resolution_type)&&i.status!=='Completed'&&<><label className="block">Implementation / closure evidence<textarea className={cls} value={reason} onChange={e=>setReason(e.target.value)}/></label><Button disabled={busy||!reason.trim()} onClick={()=>act('complete',{reason})}>Confirm implementation and close</Button></>}
  </div>}
 </Card>;
}
export default NoticeDecision;
