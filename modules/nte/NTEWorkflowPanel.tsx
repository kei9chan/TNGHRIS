import React,{useEffect,useRef,useState} from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import SignaturePad,{SignaturePadRef} from '../../components/ui/SignaturePad';
import {NTE} from '../../types';
import {deadlineLabel,phTime,workflowRpc,uploadResponse,validateAttachment,validateLink,openResponseAttachment} from './workflow';
import NoticeDecision from './NoticeDecision';
const inputClass='w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white';
const NTEWorkflowPanel:React.FC<{nte:NTE;onChanged:()=>void}>=({nte,onChanged})=>{
 const[w,setW]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0);
 const[text,setText]=useState(''),[link,setLink]=useState(''),[file,setFile]=useState<File|null>(null),[proof,setProof]=useState(''),[receiptTime,setReceiptTime]=useState('');
 const signature=useRef<SignaturePadRef>(null),lock=useRef(false),uploaded=useRef<{file:File,path:string}|null>(null);
 useEffect(()=>{let active=true;setW(null);workflowRpc('get_nte_response_workflow',{p_nte_id:nte.id}).then(v=>{if(active)setW(v);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[nte.id,refresh]);
 async function run(fn:()=>Promise<unknown>){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await fn();setRefresh(x=>x+1);onChanged();}catch(e){setError(e instanceof Error?e.message:'Unable to save. Please retry.');}finally{lock.current=false;setBusy(false);}}
 const acknowledge=()=>run(()=>workflowRpc('record_nte_receipt',{p_nte_id:nte.id}));
 const submit=()=>run(async()=>{
  if(!text.trim())throw new Error('Enter your written explanation.');validateLink(link);
  if(signature.current?.isEmpty())throw new Error('Sign your written explanation before submitting.');
  let path:string|null=null;if(file){if(uploaded.current?.file!==file)uploaded.current={file,path:await uploadResponse(nte.id,file)};path=uploaded.current.path;}
  await workflowRpc('submit_nte_explanation',{p_nte_id:nte.id,p_explanation:text,p_signature:signature.current?.getSignatureDataUrl(),p_link:link.trim()||null,p_attachment:path});
 });
 return <div className="space-y-5">
  <Card title="Receipt and written explanation">
   {error&&<p role="alert" className="mb-3 text-red-600 dark:text-red-300">{error}</p>}
   {!w?<p>Loading response window…</p>:<div className="space-y-4">
    {!w.published?<p>Pending issuance. No employee response period has started.</p>:!w.receipt?<>
     <p>The five-calendar-day response period starts only when receipt or valid service is documented.</p>
     {w.isRecipient&&<><p>Acknowledging receipt confirms that you received this notice. It does not mean you admit the allegations.</p><Button disabled={busy} onClick={acknowledge}>Acknowledge receipt and reply</Button></>}
     {w.canRecordService&&<details><summary className="cursor-pointer font-semibold">Record documented service</summary><div className="mt-3 space-y-3">
      <label className="block">Actual receipt date and time — Philippine time<input type="datetime-local" className={inputClass} value={receiptTime} onChange={e=>setReceiptTime(e.target.value)}/></label>
      <label className="block">Proof of valid service / document reference<textarea className={inputClass} value={proof} onChange={e=>setProof(e.target.value)}/></label>
      <Button disabled={busy||!receiptTime||!proof.trim()} onClick={()=>run(()=>workflowRpc('record_nte_receipt',{p_nte_id:nte.id,p_received_at:receiptTime+':00+08:00',p_proof:proof}))}>Record service</Button>
     </div></details>}
    </>:<><p>Received: <strong>{phTime(w.receipt.received_at)}</strong></p><p className="rounded-lg bg-violet-50 p-3 text-violet-950 dark:bg-violet-950 dark:text-violet-100">Written explanation due: <strong>{deadlineLabel(w.receipt.deadline_exclusive)}</strong></p>
     {w.receipt.closed_at&&<p className="font-semibold">{w.receipt.non_submission_notice?'For Management Review and Decision — No Response':'For Management Review and Decision'}</p>}
     {w.receipt.non_submission_notice&&<details><summary>Notice of non-submission</summary><p className="mt-3 whitespace-pre-wrap">{w.receipt.non_submission_notice}</p></details>}
    </>}
    {w.canRespond&&<div className="space-y-4 border-t pt-4">
     <h3 className="text-lg font-bold">Reply to this NTE</h3>
     <label className="block">Your written explanation<textarea rows={7} maxLength={50000} className={inputClass} value={text} onChange={e=>setText(e.target.value)}/></label>
     <label className="block">Attachment (optional, maximum 5 MB)<input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" className="block w-full py-3" onChange={e=>{try{const f=e.target.files?.[0]||null;if(f)validateAttachment(f);setFile(f);setError('');}catch(err){setError((err as Error).message);e.target.value='';setFile(null);}}}/></label>
     <label className="block">Or paste an attachment link (optional)<input type="url" className={inputClass} placeholder="https://…" value={link} onChange={e=>setLink(e.target.value)}/></label>
     <p className="text-sm">For a linked document, give HR permission to open it. The 5 MB limit applies to uploaded files.</p>
     <p className="font-medium">Your signature</p><SignaturePad ref={signature}/>
     <Button disabled={busy} onClick={submit}>{busy?'Saving…':'Submit written explanation'}</Button>
    </div>}
    {nte.employeeResponse&&<section className="space-y-2"><h3 className="font-bold">Submitted explanation</h3><p className="whitespace-pre-wrap">{nte.employeeResponse}</p>{nte.responseDate&&<p>{phTime(nte.responseDate.toISOString())}</p>}
     {nte.employeeResponseEvidenceUrl&&<a className="block break-all text-violet-600 underline" href={nte.employeeResponseEvidenceUrl} target="_blank" rel="noreferrer">Open linked attachment</a>}
     {w.receipt?.response_attachment&&<Button variant="secondary" onClick={()=>openResponseAttachment(w.receipt.response_attachment).catch(e=>setError(e.message))}>Download attachment</Button>}
    </section>}
    <details><summary className="cursor-pointer font-semibold">Receipt, reminders and submission timeline</summary><ol className="mt-3 space-y-2">{w.events.map((e:any)=><li key={e.id}>{phTime(e.occurred_at)} — {e.event}</li>)}</ol></details>
   </div>}
  </Card>
  {w?.published&&<NoticeDecision key={nte.id} nteId={nte.id} refresh={refresh}/>}
 </div>;
}
export default NTEWorkflowPanel;
