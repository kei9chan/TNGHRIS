import React, { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import {
  AssetApprovalDetail,
  fetchAssetApprovalDetail,
  processAssetApproval,
} from '../../services/assetApprovalService';

interface Props {
  isOpen: boolean;
  requestId: string | null;
  onClose: () => void;
  onProcessed?: () => void;
}

const dateTime = (value?: string) => value ? new Date(value).toLocaleString('en-PH') : '—';

const AssetRequestApprovalModal: React.FC<Props> = ({ isOpen, requestId, onClose, onProcessed }) => {
  const [detail, setDetail] = useState<AssetApprovalDetail | null>(null);
  const [comments, setComments] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!isOpen || !requestId) {
      if (!isOpen) setDetail(null);
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    setComments('');
    fetchAssetApprovalDetail(requestId)
      .then(setDetail)
      .catch((reason: any) => setError(reason?.message || 'Unable to load this Asset Request.'))
      .finally(() => setLoading(false));
  }, [isOpen, requestId]);

  const decide = async (action: 'APPROVE' | 'REJECT') => {
    if (!requestId || !detail?.canAct) return;
    if (action === 'REJECT' && !comments.trim()) {
      setError('Add a reason before rejecting this Asset Request.');
      return;
    }
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const next = await processAssetApproval(requestId, action, comments);
      setDetail(next);
      setComments('');
      if (action === 'REJECT') {
        setSuccess('Asset Request rejected. The requester has been notified.');
      } else if (next.request.status === 'Approved') {
        setSuccess('Asset Request completed all required approvals. The requester has been notified.');
      } else if (next.request.approvalStage === 'BOD') {
        setSuccess(next.request.bodApprovalCount > 0
          ? `BOD approval recorded. ${next.request.approvalProgress}.`
          : 'Direct manager approval recorded. The request is now awaiting BOD approval.');
      } else {
        setSuccess('Approval recorded.');
      }
      onProcessed?.();
    } catch (reason: any) {
      setError(reason?.message || 'Unable to process this approval. Refresh and try again.');
    } finally {
      setBusy(false);
    }
  };

  const request = detail?.request;
  return <Modal
    isOpen={isOpen}
    onClose={onClose}
    title={`Asset Request${request?.employeeName ? ` · ${request.employeeName}` : ''}`}
    size="4xl"
  >
    <div className="space-y-5">
      {loading && <p className="rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-500 dark:bg-slate-900/50">Loading Asset Request approval…</p>}
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">{error}</p>}
      {success && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">{success}</p>}
      {request && <>
        <section className="rounded-xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-900 dark:bg-violet-950/30">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div><p className="text-xs font-bold uppercase text-slate-500">Employee</p><p className="mt-1 font-bold">{request.employeeName}</p></div>
            <div><p className="text-xs font-bold uppercase text-slate-500">Asset requested</p><p className="mt-1 font-bold">{request.assetDescription}</p></div>
            <div><p className="text-xs font-bold uppercase text-slate-500">Current stage</p><p className="mt-1 font-bold">{request.currentStep}</p></div>
            <div><p className="text-xs font-bold uppercase text-slate-500">BOD progress</p><p className="mt-1 font-bold">{request.approvalProgress}</p></div>
          </div>
        </section>

        {request.approvalStage === 'DIRECT_MANAGER' && !detail.canAct && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 font-semibold text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">Waiting for Direct Manager Approval. This request is read-only until that approval is recorded.</p>}
        {request.approvalStage === 'BOD' && detail.viewerActionStatus === 'Approved' && <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 font-semibold text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">Your BOD approval is already recorded. Waiting for the remaining required approval.</p>}
        {request.approvalIssue && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{request.approvalIssue}</p>}

        <section className="grid gap-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700 sm:grid-cols-2">
          <div><p className="text-xs font-bold uppercase text-slate-500">Justification</p><p className="mt-1 whitespace-pre-wrap">{request.justification || 'No justification provided.'}</p></div>
          <div className="space-y-2 text-sm"><p><b>Submitted:</b> {dateTime(request.requestedAt)}</p><p><b>Direct manager:</b> {request.managerName || 'Not resolved'}</p><p><b>Manager approved:</b> {dateTime(request.managerApprovedAt)}</p><p><b>Overall status:</b> {request.status}</p></div>
        </section>

        <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">BOD approvals</h2><span className="rounded-full bg-violet-100 px-3 py-1 text-sm font-bold text-violet-800">{request.approvalProgress}</span></div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {detail.bodApprovals.length ? detail.bodApprovals.map(approval => <div key={approval.approverId} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700"><div className="flex items-start justify-between gap-2"><p className="font-semibold">{approval.approverName}</p><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-100">{approval.status}</span></div>{approval.actedAt && <p className="mt-1 text-xs text-slate-500">{dateTime(approval.actedAt)}</p>}{approval.comments && <p className="mt-2 text-sm">{approval.comments}</p>}</div>) : <p className="text-sm text-slate-500">BOD assignments become actionable after direct manager approval.</p>}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <h2 className="text-lg font-bold">Approval history</h2>
          <div className="mt-2 divide-y divide-slate-200 dark:divide-slate-700">
            {detail.history.map(entry => <div key={entry.id} className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:justify-between"><div><p className="font-semibold">{entry.action} · {entry.actorName || entry.actorRole}</p><p className="text-slate-500">{entry.stage}{entry.comments ? ` · ${entry.comments}` : ''}</p></div><time className="text-slate-500">{dateTime(entry.createdAt)}</time></div>)}
          </div>
        </section>

        {detail.canAct && <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30"><label className="block text-sm font-bold text-amber-950 dark:text-amber-100">Decision comments <span className="font-normal">(required for rejection)</span><textarea value={comments} onChange={event => setComments(event.target.value)} rows={3} className="mt-2 w-full rounded-lg border border-amber-300 bg-white p-3 font-normal text-slate-900 dark:border-amber-800 dark:bg-slate-900 dark:text-white" placeholder="Add an approval note or rejection reason" /></label></section>}

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 dark:border-slate-700 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          {detail.canAct && <><Button variant="danger" onClick={() => void decide('REJECT')} disabled={busy} isLoading={busy}>Reject</Button><Button variant="success" onClick={() => void decide('APPROVE')} disabled={busy} isLoading={busy}>Approve</Button></>}
        </div>
      </>}
    </div>
  </Modal>;
};

export default AssetRequestApprovalModal;
