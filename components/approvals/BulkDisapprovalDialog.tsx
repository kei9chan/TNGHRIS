import React,{useRef,useState} from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import {processTimeRequestApproval} from '../../services/approverConfigService';
import {createNotification} from '../../services/notificationService';
import {NotificationType} from '../../types';
import {disapproveSelected,DisapprovalItem,DisapprovalResult} from '../../services/bulkDisapproval';

export default function BulkDisapprovalDialog({kind,items,onClose,onDone}:{kind:'leave'|'wfh'|'overtime';items:DisapprovalItem[];onClose:()=>void;onDone:()=>Promise<void>}){
 const [reason,setReason]=useState('');const [busy,setBusy]=useState(false);const [finished,setFinished]=useState(false);
 const [results,setResults]=useState<DisapprovalResult[]>([]);const [error,setError]=useState('');const inFlight=useRef(false);
 const run=async()=>{
  if(inFlight.current||finished)return;
  inFlight.current=true;setBusy(true);setError('');
  try{
   await disapproveSelected(items,reason,async(id,note)=>{
    const result=await processTimeRequestApproval(kind,id,'reject',note);
    const item=items.find(x=>x.id===id);
    if(!result?.alreadyDecided&&item?.employeeId)void createNotification({userId:item.employeeId,title:'Request disapproval recorded',message:`A disapproval was recorded for your ${kind} request. Reason: ${note}`,type:NotificationType.GENERAL,link:`/approvals?type=${kind}&item=${id}`}).catch(e=>console.error('Disapproval notification failed',e));
    return result;
   },setResults);
   setFinished(true);
   try{await onDone();}catch{setError('Decisions are recorded below. The queue could not refresh; reload it before selecting more requests.');}
  }catch(e){setError(e instanceof Error?e.message:'Unable to process the selected requests.');}
  finally{inFlight.current=false;setBusy(false);}
 };
 return <Modal isOpen title={`Disapprove ${items.length} selected ${kind} requests`} onClose={()=>{if(!inFlight.current)onClose();}} footer={<div className="space-y-3">
  {error&&<p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
  <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={onClose}>{finished?'Close':'Cancel'}</Button><Button variant="danger" disabled={busy||finished||!reason.trim()||items.length>100} isLoading={busy} onClick={()=>void run()}>Confirm disapproval — {items.length}</Button></div>
 </div>}>
  <p>The reason below will be recorded for each selected request. Each request is checked against your current approval assignment.</p>
  <Textarea id="bulk-disapproval-reason" label="Reason for disapproval (required)" value={reason} onChange={e=>setReason(e.target.value)} disabled={busy||finished} />
  {items.length>100&&<p role="alert">Select no more than 100 requests at a time.</p>}
  <ul className="space-y-2">{items.map(item=><li key={item.id} className="rounded border border-slate-300 p-3 dark:border-slate-600"><b>{item.reference}</b> · {item.employee}</li>)}</ul>
  {!!results.length&&<div aria-live="polite" className="space-y-2"><p>{results.length}/{items.length} processed · {results.filter(r=>r.outcome==='Disapproved').length} disapproved · {results.filter(r=>r.outcome==='Not saved').length} not saved</p>{results.map(r=><p key={r.id} className="rounded border p-3"><b>{r.reference} — {r.outcome}</b><br/>{r.message}</p>)}</div>}
 </Modal>;
}
