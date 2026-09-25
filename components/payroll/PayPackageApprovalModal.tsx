import React, { useEffect, useState } from 'react';
import { fetchPayPackages, reviewPayPackage } from '../../modules/payroll/payPackages';
import type { PayPackage } from '../../modules/payroll/payPackages';
import { calculatePackagePreview, classificationLabels, componentClassification, componentTaxLabel, includedInGuaranteedPay } from '../../modules/payroll/payPackageBuilderModel';
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
  `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PayPackageApprovalModal: React.FC<PayPackageApprovalModalProps> = ({
  isOpen,
  item,
  onClose,
  onProcessed,
}) => {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [payPackage, setPayPackage] = useState<PayPackage | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setNote('');
    setError('');
    setPayPackage(null);
    if (!item) return;
    let cancelled = false;
    setLoadingDetails(true);
    void fetchPayPackages(item.employeeId)
      .then((context) => {
        if (!cancelled) setPayPackage(context.packages.find((entry) => entry.id === item.id) || null);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Package details could not be loaded.');
      })
      .finally(() => { if (!cancelled) setLoadingDetails(false); });
    return () => { cancelled = true; };
  }, [isOpen, item?.id]);

  const preview = payPackage ? calculatePackagePreview({ baseAmount: payPackage.base_amount, components: payPackage.components, treatment: payPackage.treatment }) : null;

  const decide = async (approved: boolean) => {
    if (!item) return;
    if (!approved && note.trim().length < 3) {
      setError('Add a rejection reason of at least 3 characters before rejecting.');
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
      <Button className="min-h-11" variant="success" disabled={busy} onClick={() => void decide(true)}>Approve</Button>
    </div>
  );

  return (
    <Modal isOpen={isOpen && Boolean(item)} onClose={busy ? () => {} : onClose} title="Review Pay Package" size="xl" footer={footer}>
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

        {loadingDetails && <p className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900">Loading the complete compensation breakdown…</p>}
        {payPackage && preview && <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ['Guaranteed monthly pay', preview.guaranteedMonthlyPay, 'bg-emerald-50 text-emerald-950'],
              ['Conditional maximum', preview.conditionalMaximum, 'bg-amber-50 text-amber-950'],
              ['Reimbursable maximum', preview.reimbursableMaximum, 'bg-amber-50 text-amber-950'],
              ['Employee deductions · estimated', preview.estimatedEmployeeDeductions, 'bg-blue-50 text-blue-950'],
              ['Employer contributions · estimated', preview.estimatedEmployerContributions, 'bg-blue-50 text-blue-950'],
              ['Total monthly company cost · estimated', preview.estimatedCompanyCost, 'bg-violet-50 text-violet-950'],
            ].map(([label, amount, tone]) => <div key={String(label)} className={`rounded-xl p-4 ${tone}`}><p className="text-xs font-bold uppercase tracking-wide opacity-70">{label}</p><p className="mt-2 text-xl font-black tabular-nums">{money(amount as number)}</p></div>)}
          </section>
          <section>
            <h4 className="mb-3 font-bold">Exact compensation breakdown</h4>
            <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Component</th><th className="p-3">Exact amount</th><th className="p-3">Frequency</th><th className="p-3">Classification</th><th className="p-3">Tax treatment</th><th className="p-3">Guaranteed</th></tr></thead><tbody className="divide-y divide-slate-200"><tr><th className="p-3">Basic salary</th><td className="p-3 font-bold">{money(payPackage.base_amount)}</td><td className="p-3">{payPackage.rate_type}</td><td className="p-3">Guaranteed</td><td className="p-3">Taxable</td><td className="p-3 font-semibold">Yes</td></tr>{payPackage.components.map((component, index) => <tr key={`${component.name}:${index}`}><th className="p-3">{component.name}</th><td className="p-3 font-bold">{componentClassification(component) === 'receipt_based' ? `Up to ${money(component.amount)}` : money(component.amount)}</td><td className="p-3">{component.frequency || component.recurrence}</td><td className="p-3">{classificationLabels[componentClassification(component)]}</td><td className="p-3">{componentTaxLabel(component)}</td><td className="p-3 font-semibold">{includedInGuaranteedPay(component) ? 'Yes' : 'No'}</td></tr>)}</tbody></table></div>
          </section>
          <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950"><h4 className="font-bold">Payroll-period items</h4><p className="mt-2">Government contributions, withholding tax, approved loans, authorized deductions, attendance adjustments, overtime, and eligible service charge are applied only to the relevant payroll run. The estimates above are not guaranteed take-home pay.</p></section>
        </>}

        <section className="rounded-xl border border-slate-200 p-4">
          <h4 className="font-bold">Approval progress</h4>
          <div className="mt-3 flex flex-wrap gap-2">
            {item.approvalSteps.map(step => <span key={`${step.userId}:${step.role}`} className={`rounded-full px-3 py-1 text-xs font-semibold ${step.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' : step.status === 'Pending' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600'}`}>{step.name} · {step.role} · {step.status}</span>)}
          </div>
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><strong>Waiting for:</strong> {item.pendingApprovers.join(' or ') || 'No pending reviewer'}</p>
        </section>

        <Textarea id="pay-package-approval-note" label="Approval note (optional)" value={note} onChange={event => setNote(event.target.value)} rows={3} placeholder="Add an optional note" />
        <p className="text-xs text-slate-500">Optional when approving. A rejection reason of at least 3 characters is required when rejecting.</p>
        {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      </div>}
    </Modal>
  );
};

export default PayPackageApprovalModal;
