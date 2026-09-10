import { supabase } from '../../services/supabaseClient';

import React, { useState, useEffect, useRef } from 'react';
import { LeaveRequest, LeaveRequestStatus } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import FileUploader from '../ui/FileUploader';
import {
    approvalContextNumber,
    formatApprovalNumber,
    getApprovalStatusLabel,
    getApprovalStepLabel,
    getTimeApprovalNextStep,
    getTimeApprovalReason,
} from '../../utils/approvalPresentation';

interface LeaveRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: LeaveRequest | null;
  leaveTypes: { id: string; name: string }[];
  onSave: (request: Partial<LeaveRequest>, status: LeaveRequestStatus) => void | Promise<void>;
  onApprove: (request: LeaveRequest, approved: boolean, notes: string) => void | Promise<void>;
}

const LeaveRequestModal: React.FC<LeaveRequestModalProps> = ({ isOpen, onClose, request, leaveTypes, onSave, onApprove }) => {
    const { user } = useAuth();
    const [current, setCurrent] = useState<Partial<LeaveRequest>>(request || {});
    const [decisionError,setDecisionError] = useState('');
    const [busy,setBusy] = useState(false);
    const [progress,setProgress] = useState<any>(null);
    const decisionLock = useRef(false);
    useEffect(() => {
      let active=true; setDecisionError('');setProgress(null);
      if (isOpen && request?.id) {
        supabase.rpc('get_time_approval_progress',{p_request_type:'leave',p_request_id:request.id}).then(({data,error})=>{if(active){if(error)setDecisionError(error.message);else setProgress(data);}});
      }
      return ()=>{active=false;};
    }, [isOpen,request?.id,request?.status]);
    const decide = async (approved:boolean) => {
      if (!request || decisionLock.current) return;
      decisionLock.current=true;setBusy(true);setDecisionError('');
      try { if(approved&&progress?.creditException&&request.status===LeaveRequestStatus.PendingBOD&&!window.confirm('This request exceeds the employee’s available earned credits. You are approving this as a BOD exception. No additional earned credits will be granted.'))return; await onApprove(request,approved,managerNotes); }
      catch(error:any){setDecisionError(error.message || 'Decision was not saved. Please retry.');}
      finally{decisionLock.current=false;setBusy(false);}
    };
    const saveLock=useRef(false);
    const save=async(status:LeaveRequestStatus)=>{if(saveLock.current)return;saveLock.current=true;setBusy(true);setDecisionError('');try{await onSave(current,status);}catch(e:any){setDecisionError(e.message||'Leave request was not saved. Your entry is retained; retry.');}finally{saveLock.current=false;setBusy(false);}};
    const [managerNotes, setManagerNotes] = useState('');

    const isNewRequest = !request;
    const isManagerView = Boolean(request && request.employeeId !== user?.id && [LeaveRequestStatus.Pending, LeaveRequestStatus.PendingGM, LeaveRequestStatus.PendingBOD].includes(request.status));
    const canEdit = isNewRequest || request?.status === LeaveRequestStatus.Draft;
    const approvalStep = request ? getApprovalStepLabel(request.status) : '';
    const approvalStatus = request ? getApprovalStatusLabel(request.status) : '';
    const requiresBod = request?.approvalRoute === 'BOD_REQUIRED';
    const approvalReason = request ? getTimeApprovalReason('leave', request.approvalContext, request.approvalReason, requiresBod) : undefined;
    const nextStep = request ? getTimeApprovalNextStep(request.status, requiresBod) : undefined;
    const requestDays = approvalContextNumber(request?.approvalContext, 'requestDays');
    const yearLeaveDays = approvalContextNumber(request?.approvalContext, 'yearLeaveDays');
    const threshold = approvalContextNumber(request?.approvalContext, 'threshold');
    const monthsRemaining = approvalContextNumber(request?.approvalContext, 'monthsRemaining');

    useEffect(() => {
        if (isOpen) {
            setCurrent(request || {
                leaveTypeId: leaveTypes[0]?.id || '',
                startDate: new Date(),
                endDate: new Date(),
                status: LeaveRequestStatus.Draft
            });
            setManagerNotes('');
        }
    }, [request, isOpen, leaveTypes]);

    useEffect(() => {
        if (!current.leaveTypeId && leaveTypes.length > 0) {
            setCurrent(prev => ({ ...prev, leaveTypeId: leaveTypes[0].id }));
        }
    }, [leaveTypes, current.leaveTypeId]);
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setCurrent(prev => ({...prev, [name]: value}));
    };

    const handleDateChange = (field: 'startDate' | 'endDate', value: string) => {
        const newDate = new Date(value);
        let newStartDate = current.startDate || new Date();
        let newEndDate = current.endDate || new Date();
        
        if (field === 'startDate') {
            newStartDate = newDate;
            if (newDate > newEndDate) {
                newEndDate = newDate;
            }
        } else {
            newEndDate = newDate;
        }
        
        // Calculate diff in days (inclusive, so +1)
        // Note: For a more advanced HRIS, this should skip weekends and holidays. 
        // For now, doing simple math.
        const diffTime = Math.abs(newEndDate.getTime() - newStartDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

        setCurrent(prev => ({ 
            ...prev, 
            startDate: newStartDate, 
            endDate: newEndDate,
            durationDays: diffDays
        }));
    };
    
    const footer = () => {
        if (isManagerView) {
            return (
                <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
                    <Textarea label={request?.status===LeaveRequestStatus.PendingBOD?"BOD note (optional for approval; required for rejection)":"Manager Notes (Required for Rejection)"} value={managerNotes} onChange={e => setManagerNotes(e.target.value)} rows={1} />
                    <div className="flex space-x-2 ml-4">
                        <Button variant="danger" onClick={() => void decide(false)} disabled={busy || !managerNotes.trim() || progress?.alreadyApproved}>Reject</Button>
                        <Button onClick={() => void decide(true)} disabled={busy || progress?.alreadyApproved || (request?.status===LeaveRequestStatus.PendingBOD && !progress?.canAct)} isLoading={busy}>{progress?.alreadyApproved ? 'Already approved by you' : 'Approve'}</Button>
                    </div>
                </div>
            );
        }
        if (canEdit) {
            return (
                <div className="flex w-full justify-end space-x-2">
                    <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
                    <Button disabled={busy} onClick={() => void save(LeaveRequestStatus.Draft)}>Save Draft</Button>
                    <Button 
                        disabled={busy} onClick={() => void save(LeaveRequestStatus.Pending)}
                        variant="primary"
                    >
                        {busy ? 'Submitting leave request…' : 'Submit'}
                    </Button>
                </div>
            )
        }
        return <div className="flex w-full justify-end"><Button variant="secondary" onClick={onClose}>Close</Button></div>;
    };
    
    return (
        <Modal acknowledgmentRequestType={canEdit ? "Leave" : undefined} acknowledgmentDraft={!isNewRequest}
            isOpen={isOpen}
            onClose={busy ? () => {} : onClose}
            title={isNewRequest ? 'Request Leave' : 'Leave Request Details'}
            size="3xl" viewportFit
            footer={footer()}
        >
            <div className="space-y-4">
                {decisionError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800 dark:bg-red-950 dark:text-red-200">{decisionError}</p>}
                {progress?.required > 0 && <p role="status">{progress.completed} of {progress.required} BOD approvals completed{progress.alreadyApproved ? ' · Already approved by you' : ''}</p>}
                {progress?.creditException && <p className="rounded-lg bg-amber-50 p-3 text-amber-900 dark:bg-amber-950 dark:text-amber-100">Insufficient earned credits. This request requires BOD exception approval. An authorized BOD may approve or reject this request.</p>}
                {progress?.creditTracked && <dl className="grid grid-cols-2 gap-3 rounded-xl border p-4">{[['Available earned credits',progress.availableCredits],['Requested days',progress.requestedCredits],['Credit shortfall',progress.creditShortfall],['Balance after this request',progress.remainingBalance],['Exception status',progress.creditOverrides?.length?'BOD exception recorded':progress.creditException?'BOD exception required':'Within available credits']].map(([label,value])=><div key={String(label)}><dt className="text-sm">{label}</dt><dd className="font-semibold">{String(value)}</dd></div>)}</dl>}
                {progress?.creditOverrides?.map((o:any)=><p key={o.approver_id} className="text-sm">BOD credit exception · {new Date(o.created_at).toLocaleString('en-PH')} · {o.note||'No approval note'} · Approver {o.approver_id}</p>)}
                {request && (
                    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-600 dark:bg-slate-800">
                        <p><span className="font-semibold">Employee:</span> {request.employeeName}</p>
                        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Current step</p><p className="mt-1 font-semibold">{approvalStep}</p></div>
                            <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Status</p><p className="mt-1"><span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">{approvalStatus}</span></p></div>
                            <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Leave period</p><p className="mt-1 font-semibold">{new Date(request.startDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}–{new Date(request.endDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</p></div>
                            {monthsRemaining !== undefined && <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Months remaining</p><p className="mt-1 font-semibold">{formatApprovalNumber(monthsRemaining)}</p></div>}
                            {approvalReason && <div className="sm:col-span-2"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Details</p><p className="mt-1">{approvalReason}</p></div>}
                            {(requestDays !== undefined || request.durationDays !== undefined) && <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Leave requested</p><p className="mt-1 font-semibold">{formatApprovalNumber(requestDays ?? request.durationDays)} days</p></div>}
                            {yearLeaveDays !== undefined && <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Year leave total</p><p className="mt-1 font-semibold">{formatApprovalNumber(yearLeaveDays)} days{threshold !== undefined ? ` / ${formatApprovalNumber(threshold)}-day allowance` : ''}</p></div>}
                        </div>
                        {nextStep && <span className="mt-4 inline-flex rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 dark:bg-violet-950 dark:text-violet-200">{nextStep}</span>}
                    </div>
                 )}

                 {isNewRequest && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md mb-4">
                        {user?.managerId ? (
                            <p className="text-sm text-blue-800 dark:text-blue-200">
                                <span className="font-bold">Approver:</span> Your assigned manager will review this request.
                            </p>
                        ) : (
                            <p className="text-sm text-red-600 dark:text-red-400 font-bold">
                                Warning: You do not have a reporting manager assigned. Please contact HR before submitting.
                            </p>
                        )}
                    </div>
                 )}
                 
                <div>
                    <label className="block text-sm font-medium">Leave Type</label>
                    <select
                      name="leaveTypeId"
                      value={current.leaveTypeId || ''}
                      onChange={handleChange}
                      disabled={!canEdit || leaveTypes.length === 0}
                      className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:bg-gray-200 dark:disabled:bg-gray-800"
                    >
                        {leaveTypes.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Start Date" type="date" value={current.startDate ? new Date(current.startDate).toISOString().split('T')[0] : ''} onChange={e => handleDateChange('startDate', e.target.value)} disabled={!canEdit} />
                    <Input label="End Date" type="date" value={current.endDate ? new Date(current.endDate).toISOString().split('T')[0] : ''} onChange={e => handleDateChange('endDate', e.target.value)} disabled={!canEdit} />
                </div>
                <Textarea label="Reason" name="reason" value={current.reason || ''} onChange={handleChange} rows={3} required disabled={!canEdit} />
                
                {!isManagerView && 
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Attach Document (Optional)</label>
                        <FileUploader onFileUpload={() => {}} />
                    </div>
                }
            </div>
        </Modal>
    );
};

export default LeaveRequestModal;
