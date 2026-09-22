import React, { useEffect, useState } from 'react';
import { reviewPayPackage } from '../../modules/payroll/payPackages';
import type { PendingPayPackageApproval } from '../../services/payPackageApprovalService';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Textarea from '../ui/Textarea';

interface PayPackageApprovalModalProps {
  isOpen: boolean;
  item: PendingPayPackageApproval | null;
  onClose: () => void;
  onProcessed: (approved: boolean) => void | Promise<void>;
}

const money = (value: string | number | null | undefined) =>
  value == null
    ? 'Pending'
    : `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PayPackageApprovalModal: React.FC<PayPackageApprovalModalProps> = ({
  isOpen,
  item,
  onClose,
  onProcessed,
}) => {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setNote('');
    setError('');
  }, [isOpen, item?.id]);

  const decide = async (approved: boolean) => {
    if (!item || note.trim().length < 3) {
      setError('Add an approval or rejection note before recording the decision.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await reviewPayPackage(item.id, approved, note.trim());
      await onProcessed(approved);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The decision could not be recorded.');
    } finally {
      setBusy(false);
    }
  };

  const footer = (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <Button className="min-h-11" variant="secondary" disabled={busy} onClick={onClose}>Close</Button>
      <Button className="min-h-11" variant="danger" disabled={busy || note.trim().length < 3} onClick={() => void decide(false)}>Reject</Button>
      <Button className="min-h-11" variant="success" disabled={busy || note.trim().length < 3} onClick={() => void decide(true)}>Approve</Button>
    </div>
  );

  return (
    <Modal isOpen={isOpen && Boolean(item)} onClose={busy ? () => {} : onClose} title="Review Pay Package" size="2xl" footer={footer}>
      {item && <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-fuchsia-100 px-3 py-1 font-bold text-fuchsia-800">Pay package approval</span>
          <span className="text-slate-500">Submitted {new Date(item.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </div>

        <section className="rounded-xl border border-violet-100 bg-violet-50/70 p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Employee</p><p className="mt-1 text-xl font-black text-slate-950">{item.employeeName}</p><p className="text-sm text-slate-600">{item.employeeCode || 'No employee ID'} · {item.businessUnit}</p></div>
            <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Effective date</p><p className="mt-1 text-lg font-bold text-slate-950">{new Date(`${item.effectiveFrom}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p></div>
          </div>
          <div className="mt-4 grid gap-3 border-t border-violet-100 pt-4 sm:grid-cols-3">
            <p><span className="block text-xs text-slate-500">Base amount</span><strong>{money(item.baseAmount)} / {item.rateType}</strong></p>
            <p><span className="block text-xs text-slate-500">Scope</span><strong>{item.scopeName}</strong></p>
            <p><span className="block text-xs text-slate-500">Submitted by</span><strong>{item.submittedBy}</strong></p>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 p-4">
          <h4 className="font-bold">Approval progress</h4>
          <div className="mt-3 flex flex-wrap gap-2">
            {item.approvalSteps.map(step => <span key={`${step.userId}:${step.role}`} className={`rounded-full px-3 py-1 text-xs font-semibold ${step.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' : step.status === 'Pending' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600'}`}>{step.name} · {step.role} · {step.status}</span>)}
          </div>
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><strong>Waiting for:</strong> {item.pendingApprovers.join(' or ') || 'No pending reviewer'}</p>
        </section>

        <Textarea id="pay-package-approval-note" label="Approval note" value={note} onChange={event => setNote(event.target.value)} rows={3} placeholder="Reason and approval reference" />
        <p className="text-xs text-slate-500">A note of at least 3 characters is required for approval or rejection.</p>
        {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      </div>}
    </Modal>
  );
};

export default PayPackageApprovalModal;
