import React, { useEffect, useState } from 'react';
import { ManpowerApprovalStage, ManpowerRequest, ManpowerRequestItem, ManpowerRequestStatus } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';

interface ManpowerReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: ManpowerRequest | null;
  onApprove: (requestId: string, comments?: string) => void | Promise<void>;
  onReject: (requestId: string, reason: string) => void | Promise<void>;
  canApprove?: boolean;
}

const numberValue = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizedItem = (item: ManpowerRequestItem) => {
  const reporting = numberValue(item.reportingFte ?? item.currentFte);
  const needed = numberValue(item.onCallNeeded ?? item.requestedCount);
  return {
    department: item.departmentName || item.role || 'Department not specified',
    required: numberValue(item.requiredFte, reporting + needed),
    reporting,
    needed,
    rate: numberValue(item.ratePerDay ?? item.costPerHead),
    total: numberValue(item.totalItemCost, needed * numberValue(item.ratePerDay ?? item.costPerHead)),
    shift: item.shiftTime || 'Not specified',
    reason: item.reason || item.justification || '—',
    note: item.departmentNote || '',
  };
};

const stageLabel = (request: ManpowerRequest) => {
  if (request.status === ManpowerRequestStatus.Approved || request.approvalStage === ManpowerApprovalStage.Completed) return 'Approved';
  if (request.status === ManpowerRequestStatus.Rejected || request.approvalStage === ManpowerApprovalStage.Rejected) return 'Rejected';
  if (request.approvalStage === ManpowerApprovalStage.BodGm) return 'Pending BOD / GM Approval';
  return 'Pending Business Unit Manager';
};

const statusClasses = (label: string) => label === 'Approved'
  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
  : label === 'Rejected'
    ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
    : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200';

const ManpowerReviewModal: React.FC<ManpowerReviewModalProps> = ({ isOpen, onClose, request, onApprove, onReject, canApprove = false }) => {
  const [rejectReason, setRejectReason] = useState('');
  const [approvalComment, setApprovalComment] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setRejectReason('');
    setApprovalComment('');
    setIsRejecting(false);
  }, [isOpen, request?.id]);

  if (!request) return null;

  const currentStage = stageLabel(request);
  const canAct = canApprove
    && request.status === ManpowerRequestStatus.Pending
    && (request.approvalStage === ManpowerApprovalStage.BusinessUnitManager || request.approvalStage === ManpowerApprovalStage.BodGm);
  const items = request.items.map(normalizedItem);
  const totalNeeded = items.reduce((sum, item) => sum + item.needed, 0);

  const handleApprove = () => {
    if (window.confirm(`Approve this on-call request with ${totalNeeded} on-call FTE and an estimated cost of ₱${request.grandTotal?.toLocaleString()}?`)) {
      void onApprove(request.id, approvalComment.trim() || undefined);
    }
  };

  const confirmReject = () => {
    if (!rejectReason.trim()) {
      alert('Please provide a reason for rejection.');
      return;
    }
    void onReject(request.id, rejectReason.trim());
    setIsRejecting(false);
    setRejectReason('');
  };

  const footer = (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <Button variant="secondary" onClick={onClose}>Close</Button>
      {canAct && (
        <>
          <Button variant="danger" onClick={() => setIsRejecting(true)}>Reject</Button>
          <Button variant="success" onClick={handleApprove}>Approve</Button>
        </>
      )}
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`On-Call Request · ${request.businessUnitName}`} size="5xl" footer={footer}>
      <div className="space-y-6 text-slate-900 dark:text-slate-100">
        <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-4 dark:border-slate-600 dark:bg-slate-900/40">
          <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Date needed</p><p className="mt-1 font-semibold">{new Date(request.date).toLocaleDateString()}</p></div>
          <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Forecasted PAX</p><p className="mt-1 font-semibold">{request.forecastedPax}</p></div>
          <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Requested by</p><p className="mt-1 font-semibold">{request.requesterName}</p></div>
          <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Status</p><span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusClasses(currentStage)}`}>{currentStage}</span></div>
          {request.generalNote && <div className="col-span-2 border-t border-slate-200 pt-3 sm:col-span-4 dark:border-slate-600"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Event / operational context</p><p className="mt-1 font-medium">{request.generalNote}</p></div>}
        </div>

        <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-600">
          <p className="mb-3 text-sm font-bold">Approval progress</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {['Pending Business Unit Manager', 'Pending BOD / GM Approval', 'Approved'].map((step, index) => {
              const complete = (currentStage === 'Approved') || (currentStage === 'Pending BOD / GM Approval' && index === 0);
              const active = currentStage === step;
              return <div key={step} className={`rounded-lg border px-3 py-2 text-sm ${active ? 'border-indigo-400 bg-indigo-50 font-bold text-indigo-800 dark:bg-indigo-950 dark:text-indigo-100' : complete ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100' : 'border-slate-200 text-slate-500 dark:border-slate-600 dark:text-slate-400'}`}><span className="mr-2">{complete ? '✓' : index + 1}</span>{step}</div>;
            })}
          </div>
          {request.approvalIssue && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">⚠ {request.approvalIssue}</p>}
        </div>

        {isRejecting && canAct && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
            <Textarea label="Reason for rejection" value={rejectReason} onChange={event => setRejectReason(event.target.value)} required autoFocus />
            <div className="mt-3 flex justify-end gap-2"><Button size="sm" variant="secondary" onClick={() => setIsRejecting(false)}>Cancel</Button><Button size="sm" variant="danger" onClick={confirmReject}>Confirm rejection</Button></div>
          </div>
        )}

        {canAct && (
          <Textarea
            label="Approval comments (optional)"
            value={approvalComment}
            onChange={event => setApprovalComment(event.target.value)}
            placeholder="Add context for the approval decision"
          />
        )}

        <div>
          <div className="mb-3 flex items-end justify-between gap-3"><div><h3 className="text-lg font-bold">Coverage by Department</h3><p className="text-sm text-slate-500 dark:text-slate-300">Required FTE − Reporting FTE = On-call needed</p></div><p className="text-right text-sm font-semibold text-emerald-700 dark:text-emerald-300">₱{request.grandTotal?.toLocaleString()} estimated</p></div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-600">
            <table className="min-w-[980px] w-full divide-y divide-slate-200 text-sm dark:divide-slate-600">
              <thead className="bg-slate-100 text-left text-xs font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-700 dark:text-slate-200"><tr><th className="px-4 py-3">Department / Area</th><th className="px-4 py-3 text-center">Required FTE</th><th className="px-4 py-3 text-center">Reporting FTE</th><th className="px-4 py-3 text-center">On-call needed</th><th className="px-4 py-3 text-right">Rate / Day</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Shift / Coverage</th><th className="px-4 py-3">Reason / Note</th></tr></thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-600 dark:bg-slate-800">
                {items.map(item => <tr key={`${item.department}-${item.shift}`} className="align-top"><td className="px-4 py-3 font-semibold">{item.department}</td><td className="px-4 py-3 text-center">{item.required}</td><td className="px-4 py-3 text-center">{item.reporting}</td><td className="px-4 py-3 text-center font-bold text-orange-600 dark:text-orange-300">{item.needed}</td><td className="px-4 py-3 text-right">₱{item.rate.toLocaleString()}</td><td className="px-4 py-3 text-right font-semibold">₱{item.total.toLocaleString()}</td><td className="px-4 py-3">{item.shift}</td><td className="max-w-xs px-4 py-3"><div>{item.reason}</div>{item.note && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.note}</div>}</td></tr>)}
              </tbody>
              <tfoot className="bg-slate-50 font-bold dark:bg-slate-900"><tr><td className="px-4 py-3">Totals</td><td></td><td></td><td className="px-4 py-3 text-center text-orange-600 dark:text-orange-300">{totalNeeded}</td><td></td><td className="px-4 py-3 text-right text-emerald-700 dark:text-emerald-300">₱{request.grandTotal?.toLocaleString()}</td><td colSpan={2}></td></tr></tfoot>
            </table>
          </div>
        </div>

        {!!request.approvalTrail?.length && (
          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-600">
            <h3 className="text-lg font-bold">Approval trail</h3>
            <div className="mt-3 space-y-3">{request.approvalTrail.map((entry, index) => <div key={`${entry.timestamp}-${index}`} className="flex gap-3 border-l-2 border-indigo-200 pl-4 dark:border-indigo-800"><div className="min-w-0"><p className="font-semibold">{entry.action} · {entry.stage === ManpowerApprovalStage.BodGm ? 'BOD / GM Approval' : entry.stage === ManpowerApprovalStage.BusinessUnitManager ? 'Business Unit Manager' : entry.stage}</p><p className="text-sm text-slate-600 dark:text-slate-300">{entry.approverName} · {entry.approverRole} · {new Date(entry.timestamp).toLocaleString()}</p>{entry.comments && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{entry.comments}</p>}</div></div>)}</div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ManpowerReviewModal;
