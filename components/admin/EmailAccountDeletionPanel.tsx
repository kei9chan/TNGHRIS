import React,{useEffect,useRef,useState} from 'react';
import {useLocation} from 'react-router-dom';
import type {User} from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import {getApprovalRequestId} from '../../services/approvalDeepLinks';
import {decideEmailAccountDeletion,requestEmailAccountDeletion,type EmailAccountDeletionRequest,type EmailAccountDeletionWorkspace} from '../../services/emailAccountDeletionService';

type Props={workspace:EmailAccountDeletionWorkspace;target:User|null;onClose:()=>void;onSaved:()=>Promise<void>};
export default function EmailAccountDeletionPanel({workspace,target,onClose,onSaved}:Props) {
  const location=useLocation(),opened=useRef<string|null>(null);
  const [review,setReview]=useState<EmailAccountDeletionRequest|null>(null),[history,setHistory]=useState(false);
  const [reason,setReason]=useState(''),[comment,setComment]=useState(''),[confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const nonce=useRef('');
  useEffect(()=>{setReason('');setConfirmed(false);setError('');nonce.current=crypto.randomUUID();},[target?.id]);
  useEffect(()=>{
    const id=getApprovalRequestId(location.search);
    if(!id){opened.current=null;return;}
    const found=workspace.requests.find(r=>r.id===id);
    if(found&&opened.current!==id){opened.current=id;setReview(found);setComment('');setConfirmed(false);setError('');}
  },[location.search,workspace.requests]);
  const reviewed=review?workspace.requests.find(r=>r.id===review.id)||review:null;
  const openReview=(r:EmailAccountDeletionRequest)=>{setReview(r);setComment('');setConfirmed(false);setError('');};
  async function submitRequest(){
    if(!target||!confirmed||reason.trim().length<5)return;
    setBusy(true);setError('');
    try {await requestEmailAccountDeletion(target.id,target.email,reason.trim(),nonce.current);await onSaved();onClose();setNotice('Request sent to Kay Lacap for BOD approval. The login stays unchanged until approval.');}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function decide(decision:'approve'|'reject'){
    if(!reviewed||!reviewed.isActionable||(decision==='approve'&&!confirmed)||(decision==='reject'&&comment.trim().length<5))return;
    setBusy(true);setError('');
    try {await decideEmailAccountDeletion(reviewed.id,decision,comment.trim());await onSaved();setReview(null);setNotice(decision==='approve'?'Email-linked HRIS login deleted. Employee records are retained.':'Deletion request rejected. The login stays unchanged.');}
    catch(e){setError((e as Error).message);await onSaved().catch(()=>{});}finally{setBusy(false);}
  }
  if(!workspace.canRequest&&!workspace.canApprove)return null;
  const rows=workspace.requests.filter(r=>history||r.status==='Pending'||r.status==='Approved');
  return <section className="rounded-2xl border border-violet-200 bg-white p-5 dark:border-violet-900 dark:bg-slate-800" aria-label="Email-account deletion requests">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Email-account deletion requests</h2><p className="mt-1 text-sm text-slate-500">{workspace.canRequest?'Request removal of an old HRIS login.':'Review each email before authorizing deletion.'} Approval: {workspace.approverName||'Kay Lacap'} · BOD.</p></div><Button size="sm" variant="secondary" onClick={()=>setHistory(v=>!v)}>{history?'Show pending':'View history'}</Button></div>
    {notice&&<p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <div className="mt-4 space-y-3">{rows.map(r=><article key={r.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div className="flex flex-wrap justify-between gap-3"><div className="min-w-0"><p className="font-semibold">{r.employeeName}</p><p className="break-all text-sm text-violet-700 dark:text-violet-300">{r.email}</p><p className="mt-2 text-sm">{r.reason}</p><p className="mt-2 text-xs text-slate-500">Requested by {r.requestedBy} · {new Date(r.createdAt).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}</p></div><div className="space-y-2"><span className="block rounded-full bg-violet-50 px-3 py-1 text-center text-xs font-semibold text-violet-800 dark:bg-violet-950 dark:text-violet-200">{r.status==='Approved'?r.executionStatus==='Failed'?'Approved · retry needed':'Approved · completing':r.status==='Completed'?'Login deleted':r.status==='Pending'?'Pending Kay’s approval':'Rejected'}</span><Button size="sm" variant="secondary" onClick={()=>openReview(r)}>{workspace.canApprove&&r.isActionable?r.status==='Approved'?'Retry deletion':'Review request':'View details'}</Button></div></div>{r.error&&<p className="mt-3 text-sm text-amber-800">{r.error}</p>}</article>)}{!rows.length&&<p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-900">No {history?'recorded':'pending'} deletion requests.</p>}</div>
    {target&&<Modal isOpen viewportFit title="Request email-account deletion" size="lg" onClose={()=>!busy&&onClose()} footer={<div className="flex justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy||!confirmed||reason.trim().length<5} onClick={()=>void submitRequest()}>{busy?'Submitting…':'Send to Kay for approval'}</Button></div>}><div className="space-y-4"><div className="rounded-xl bg-violet-50 p-4 dark:bg-violet-950"><p className="font-semibold">{target.name}</p><p className="break-all">{target.email}</p></div><p className="text-sm text-slate-500">After Kay’s approval, this email’s HRIS login will be removed. Payroll, attendance, documents and employee history are retained.</p><label className="block text-sm font-medium">Reason<textarea aria-label="Reason for deleting email account" className="mt-2 w-full rounded-xl border p-3 dark:border-slate-600 dark:bg-slate-900" rows={3} maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)} placeholder="For example: old email cannot be accessed; employee has registered a replacement."/></label><label className="flex gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I verified this is the email-linked HRIS login to remove.</label>{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}</div></Modal>}
    {reviewed&&<Modal isOpen viewportFit title="Review email-account deletion" size="lg" onClose={()=>!busy&&setReview(null)} footer={workspace.canApprove&&reviewed.isActionable?<div className="flex flex-wrap justify-end gap-2">{reviewed.status==='Pending'&&<Button variant="secondary" disabled={busy||comment.trim().length<5} onClick={()=>void decide('reject')}>Reject request</Button>}<Button disabled={busy||!confirmed} onClick={()=>void decide('approve')}>{busy?'Completing…':reviewed.status==='Approved'?'Retry approved deletion':'Approve & delete HRIS login'}</Button></div>:<Button onClick={()=>setReview(null)}>Close</Button>}><div className="space-y-4"><div className="rounded-xl bg-violet-50 p-4 dark:bg-violet-950"><p className="font-semibold">{reviewed.employeeName}</p><p className="break-all">{reviewed.email}</p></div><dl className="space-y-2 text-sm"><div><dt className="text-slate-500">Requested by</dt><dd>{reviewed.requestedBy}</dd></div><div><dt className="text-slate-500">Reason</dt><dd>{reviewed.reason}</dd></div><div><dt className="text-slate-500">Status</dt><dd>{reviewed.status} · {reviewed.executionStatus}</dd></div>{reviewed.decisionComment&&<div><dt className="text-slate-500">Decision notes</dt><dd>{reviewed.decisionComment}</dd></div>}</dl>{workspace.canApprove&&reviewed.isActionable&&<><p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Approval removes this HRIS sign-in permanently. The employee’s payroll, attendance, documents and history are kept.</p><label className="block text-sm font-medium">Decision notes (required for rejection)<textarea aria-label="Deletion decision notes" className="mt-2 w-full rounded-xl border p-3 dark:border-slate-600 dark:bg-slate-900" rows={2} maxLength={2000} value={comment} onChange={e=>setComment(e.target.value)}/></label><label className="flex gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I confirm this exact email login should be deleted.</label></>}{(error||reviewed.error)&&<p role="alert" className="text-sm text-red-700">{error||reviewed.error}</p>}</div></Modal>}
  </section>;
}
