import React, { useEffect, useMemo, useState } from 'react';
import { Candidate, InterviewRatingRecord } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import InterviewSummaryPanel from './InterviewSummaryPanel';
import {
  fetchOfferApprovalPackage,
  getApprovalPackageDocuments,
  OfferApprovalPackageData,
  openOfferPackageDocument,
  processOfferApproval,
} from '../../services/offerApprovalService';
import { createInterviewRatingSummary, getInterviewAnswerText } from '../../services/interviewRatingSummary';
import { downloadInterviewRatingPdf } from '../../services/interviewRatingService';

interface OfferApprovalReviewModalProps {
  isOpen: boolean;
  requestId: string | null;
  onClose: () => void;
  onProcessed?: () => void;
}

const candidateName = (candidate: Candidate) => `${candidate.firstName} ${candidate.lastName}`.trim();

const ReadOnlyRatingModal: React.FC<{ rating: InterviewRatingRecord | null; candidate: Candidate; onClose: () => void }> = ({ rating, candidate, onClose }) => {
  if (!rating) return null;
  return <Modal isOpen={true} onClose={onClose} title={`Original Rating · ${rating.reviewerNameSnapshot}`} size="4xl">
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50"><div className="flex flex-wrap justify-between gap-3"><div><p className="font-bold text-slate-900 dark:text-white">{candidateName(candidate)}</p><p className="text-sm text-slate-500">{rating.reviewerPositionSnapshot || 'Position not recorded'} · {rating.interviewRound} · Template v{rating.templateVersion}</p></div><Button variant="secondary" onClick={() => void downloadInterviewRatingPdf(rating, candidate)}>Download PDF</Button></div></div>
      {rating.templateSnapshot.sections.map(section => <section key={section.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><h2 className="font-bold text-slate-900 dark:text-white">{section.title}</h2><div className="mt-3 grid gap-3 md:grid-cols-2">{section.fields.map(field => <div key={field.id} className={field.type === 'textarea' ? 'md:col-span-2' : ''}><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{field.label}</p><p className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-800 dark:bg-slate-900/50 dark:text-slate-100">{getInterviewAnswerText(rating.formData[field.id]) || 'Not answered'}</p></div>)}</div></section>)}
    </div>
  </Modal>;
};

const OfferApprovalReviewModal: React.FC<OfferApprovalReviewModalProps> = ({ isOpen, requestId, onClose, onProcessed }) => {
  const [pkg, setPkg] = useState<OfferApprovalPackageData | null>(null);
  const [selectedRating, setSelectedRating] = useState<InterviewRatingRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [comments, setComments] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!isOpen || !requestId) {
      setSelectedRating(null);
      if (!isOpen) setPkg(null);
      return;
    }
    setLoading(true); setError(''); setSuccess(''); setComments(''); setPkg(null);
    fetchOfferApprovalPackage(requestId).then(setPkg).catch((reason: any) => setError(reason?.message || 'Unable to load the offer approval package.')).finally(() => setLoading(false));
  }, [isOpen, requestId]);

  const summary = useMemo(() => createInterviewRatingSummary(pkg?.ratings || []), [pkg?.ratings]);
  const packageDocuments = useMemo(() => pkg ? getApprovalPackageDocuments(pkg) : [], [pkg]);
  const packageCandidateName = pkg ? candidateName(pkg.candidate) : 'Candidate';

  const decide = async (decision: 'approve' | 'return' | 'reject') => {
    if (!requestId) return;
    if ((decision === 'return' || decision === 'reject') && !comments.trim()) { setError('Add comments before returning or rejecting this package.'); return; }
    setBusy(true); setError('');
    try {
      const result = await processOfferApproval(requestId, decision, comments);
      setSuccess(decision === 'approve' ? (String(result.approvalStage || '') === 'BOD_GM' ? 'Approved and advanced to BOD / GM.' : 'Offer approval completed.') : decision === 'return' ? 'Package returned for revision.' : 'Package rejected.');
      onProcessed?.();
      if (decision === 'approve' && String(result.status) === 'Approved') window.setTimeout(onClose, 500);
    } catch (reason: any) { setError(reason?.message || 'Unable to process this approval.'); }
    finally { setBusy(false); }
  };

  return <>
    <Modal isOpen={isOpen} onClose={onClose} title={`Offer Approval Package · ${packageCandidateName}`} size="5xl">
      <div className="space-y-5">
        {loading && <p className="rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-500 dark:bg-slate-900/50">Loading the complete hiring package…</p>}
        {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm font-semibold text-rose-700 dark:bg-rose-950/30 dark:text-rose-200">{error}</p>}
        {success && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200">{success}</p>}
        {pkg && <>
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-900 dark:bg-violet-950/30"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div><p className="text-xs font-bold uppercase text-slate-500">Candidate</p><p className="mt-1 font-bold">{packageCandidateName}</p></div><div><p className="text-xs font-bold uppercase text-slate-500">Position</p><p className="mt-1 font-bold">{pkg.offer.offerDetails?.jobTitle || pkg.application.roleTitleSnapshot || 'Position not recorded'}</p></div><div><p className="text-xs font-bold uppercase text-slate-500">Business unit</p><p className="mt-1 font-bold">{pkg.offer.offerDetails?.businessUnit || 'Business unit not recorded'}</p></div><div><p className="text-xs font-bold uppercase text-slate-500">Approval stage</p><p className="mt-1 font-bold">{pkg.request.approvalStage === 'BOD_GM' ? 'BOD / GM Approval' : 'HR Manager Approval'}</p></div></div></div>
          <InterviewSummaryPanel summary={summary} />
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">Hiring packet documents</h2><span className="text-xs text-slate-500">{packageDocuments.length} attached</span></div><div className="mt-3 space-y-2">{packageDocuments.map(document => <div key={`${document.id}-${document.sourceId}`} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700"><div className="min-w-0 flex-1"><p className="truncate font-semibold">{document.fileName}</p><p className="text-xs text-slate-500">{document.documentType}{document.reviewerName ? ` · ${document.reviewerName}` : ''}</p></div><Button size="sm" variant="secondary" onClick={() => void openOfferPackageDocument(document, { candidate: pkg.candidate, offer: pkg.offer, ratings: pkg.ratings })}>Preview / Download</Button></div>)}</div></section>
            <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><h2 className="text-lg font-bold">Reviewer recommendations</h2><div className="mt-3 space-y-2">{summary.reviewers.map(reviewer => <div key={reviewer.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-bold">{reviewer.name}</p><p className="text-sm text-slate-500">{reviewer.position || 'Position not recorded'} · {reviewer.submittedAt?.toLocaleString() || 'No submission date'}</p></div><button type="button" onClick={() => setSelectedRating(pkg.ratings.find(rating => rating.id === reviewer.id) || null)} className="text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-300">View rating</button></div><div className="mt-2 grid grid-cols-3 gap-2 text-xs"><span>Further: <b>{reviewer.recommendations.further_interview}</b></span><span>Pool: <b>{reviewer.recommendations.active_pool}</b></span><span>Offer: <b>{reviewer.recommendations.job_offer}</b></span></div></div>)}</div></section>
          </div>
          <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><h2 className="text-lg font-bold">Approval trail</h2><div className="mt-3 divide-y dark:divide-slate-700">{pkg.approvalTrail.length ? pkg.approvalTrail.map(entry => <div key={entry.id} className="flex flex-wrap justify-between gap-3 py-3 text-sm"><div><p className="font-semibold">{entry.approverName} · {entry.approverRole}</p><p className="text-slate-500">{entry.action} · {entry.statusBefore || '—'} → {entry.statusAfter || '—'}{entry.comments ? ` · ${entry.comments}` : ''}</p>{entry.documentsReviewed?.length ? <p className="mt-1 text-xs text-slate-500">Documents reviewed: {entry.documentsReviewed.join(', ')}</p> : null}</div><time className="text-slate-500">{entry.createdAt.toLocaleString()}</time></div>) : <p className="py-4 text-sm text-slate-500">No approval actions recorded yet.</p>}</div></section>
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30"><label className="block text-sm font-bold text-amber-950 dark:text-amber-100">Comments <span className="font-normal">(required for Return for Revision or Reject)</span><textarea value={comments} onChange={event => setComments(event.target.value)} className="mt-2 min-h-24 w-full rounded-lg border border-amber-300 bg-white p-3 font-normal text-slate-900 dark:border-amber-800 dark:bg-slate-900 dark:text-white" placeholder="Add your decision comments"/></label></section>
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-700"><Button variant="secondary" onClick={onClose}>Close</Button><Button variant="danger" onClick={() => void decide('reject')} disabled={busy || Boolean(success)} isLoading={busy}>Reject</Button><Button variant="secondary" onClick={() => void decide('return')} disabled={busy || Boolean(success)} isLoading={busy}>Return for Revision</Button><Button variant="success" onClick={() => void decide('approve')} disabled={busy || Boolean(success)} isLoading={busy}>Approve</Button></div>
        </>}
      </div>
    </Modal>
    <ReadOnlyRatingModal rating={selectedRating} candidate={pkg?.candidate || { firstName: '', lastName: '', email: '', phone: '', source: 'Career Site', tags: [], id: '' } as Candidate} onClose={() => setSelectedRating(null)} />
  </>;
};

export default OfferApprovalReviewModal;
