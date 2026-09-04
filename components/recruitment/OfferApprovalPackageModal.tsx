import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Application, Candidate, InterviewRatingRecord, OfferPackageDocument } from '../../types';
import { EnrichedOffer } from './OfferTable';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import InterviewSummaryPanel from './InterviewSummaryPanel';
import { createInterviewRatingSummary } from '../../services/interviewRatingSummary';
import {
  createOfferApprovalRequest,
  fetchCandidatePackageDocuments,
  getDefaultOfferPackageDocumentIds,
  openOfferPackageDocument,
  removeCandidateDocument,
  updateCandidateDocumentType,
  uploadCandidateDocument,
} from '../../services/offerApprovalService';
import { usePermissions } from '../../hooks/usePermissions';
import { Permission } from '../../types';

interface OfferApprovalPackageModalProps {
  isOpen: boolean;
  onClose: () => void;
  offer: EnrichedOffer;
  candidate: Candidate;
  application: Application;
  ratings: InterviewRatingRecord[];
  onSubmitted?: (requestId: string) => void;
}

const packageDocumentLabel = (document: OfferPackageDocument) => {
  if (document.source === 'rating') return `${document.reviewerName || 'Reviewer'} · Digital rating`;
  if (document.source === 'rating_attachment') return `${document.reviewerName || 'Reviewer'} · Scanned rating`;
  return document.fileName;
};

const OfferApprovalPackageModal: React.FC<OfferApprovalPackageModalProps> = ({ isOpen, onClose, offer, candidate, application, ratings, onSubmitted }) => {
  const { can } = usePermissions();
  const [documents, setDocuments] = useState<OfferPackageDocument[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [documentType, setDocumentType] = useState<'Resume' | 'Interview Rating' | 'Offer' | 'Other Supporting Document'>('Other Supporting Document');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [classifyingDocumentId, setClassifyingDocumentId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [overrideIncompleteRatings, setOverrideIncompleteRatings] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');

  const summary = useMemo(() => createInterviewRatingSummary(ratings), [ratings]);
  const canOverride = can('Offers', Permission.Manage);
  const allRatingsSubmitted = ratings.length > 0 && ratings.every(rating => rating.status === 'Submitted' || rating.status === 'Locked');

  const loadDocuments = useCallback(async () => {
    if (!isOpen) return;
    setLoading(true); setError(''); setSuccess('');
    try {
      const next = await fetchCandidatePackageDocuments(candidate, application, offer, ratings);
      setDocuments(next);
      setSelectedIds(current => {
        const retained = current.filter(id => next.some(document => document.id === id));
        return retained.length > 0 ? retained : getDefaultOfferPackageDocumentIds(next);
      });
    } catch (reason: any) {
      setError(reason?.message || 'Unable to load candidate documents.');
    } finally { setLoading(false); }
  }, [application, candidate, isOpen, offer, ratings]);

  useEffect(() => { void loadDocuments(); }, [loadDocuments]);

  const selectedDocuments = useMemo(() => selectedIds.map(id => documents.find(document => document.id === id)).filter(Boolean) as OfferPackageDocument[], [documents, selectedIds]);
  const visibleDocuments = useMemo(() => documents.filter(document => {
    const uploadedDate = document.uploadedAt?.toLocaleDateString() || '';
    const haystack = `${document.fileName} ${document.reviewerName || ''} ${document.reviewerPosition || ''} ${document.documentType} ${candidate.firstName} ${candidate.lastName} ${uploadedDate}`.toLowerCase();
    return (typeFilter === 'All' || document.documentType === typeFilter) && haystack.includes(search.trim().toLowerCase());
  }), [candidate.firstName, candidate.lastName, documents, search, typeFilter]);
  const hasResume = selectedDocuments.some(document => document.documentType === 'Resume');
  const hasRating = selectedDocuments.some(document => document.documentType === 'Interview Rating');
  const hasOffer = selectedDocuments.some(document => document.documentType === 'Offer');
  const requiresOverride = !allRatingsSubmitted;

  const toggleDocument = (document: OfferPackageDocument) => {
    if (document.isSelectable === false) return;
    setSelectedIds(current => current.includes(document.id) ? current.filter(id => id !== document.id) : [...current, document.id]);
  };

  const moveSelected = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= selectedIds.length) return;
    const next = [...selectedIds];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setSelectedIds(next);
  };

  const handleUpload = async (file?: File) => {
    if (!file) return;
    setUploading(true); setError('');
    try {
      const uploaded = await uploadCandidateDocument(candidate.id, application.id, file, documentType);
      setDocuments(current => [uploaded, ...current]);
      setSelectedIds(current => Array.from(new Set([...current, uploaded.id])));
    } catch (reason: any) {
      setError(reason?.message || 'Unable to upload the candidate document.');
    } finally { setUploading(false); }
  };

  const handleDocumentTypeChange = async (document: OfferPackageDocument, nextType: OfferPackageDocument['documentType']) => {
    if (document.source !== 'candidate_document' || document.documentType === nextType) return;
    setClassifyingDocumentId(document.id); setError(''); setSuccess('');
    try {
      const updated = await updateCandidateDocumentType(document, nextType);
      setDocuments(current => current.map(item => item.id === document.id ? updated : item));
    } catch (reason: any) {
      setError(reason?.message || 'Unable to update the candidate document type.');
    } finally { setClassifyingDocumentId(null); }
  };

  const handlePreview = async (document: OfferPackageDocument) => {
    setError('');
    try {
      await openOfferPackageDocument(document, { candidate, offer, ratings });
    } catch (reason: any) {
      setError(reason?.message || `Unable to open ${document.fileName}.`);
    }
  };

  const handleRemove = async (document: OfferPackageDocument) => {
    if (document.source !== 'candidate_document' || !window.confirm(`Remove ${document.fileName} from this candidate's document library?`)) return;
    setError('');
    try {
      await removeCandidateDocument(document);
      setDocuments(current => current.filter(item => item.id !== document.id));
      setSelectedIds(current => current.filter(id => id !== document.id));
    } catch (reason: any) { setError(reason?.message || 'Unable to remove the document.'); }
  };

  const submit = async () => {
    if (!hasResume || !hasOffer || (!hasRating && !overrideIncompleteRatings)) { setError('Attach a resume, at least one interview rating, and the offer before requesting approval. An authorized incomplete-ratings override may be used when appropriate.'); return; }
    if (requiresOverride && (!canOverride || !overrideIncompleteRatings || !overrideReason.trim())) { setError('All assigned ratings must be submitted, or an authorized override with an explanation is required.'); return; }
    setSubmitting(true); setError(''); setSuccess('');
    try {
      const requestId = await createOfferApprovalRequest({ offerId: offer.id, documents: selectedDocuments, candidate, application, offer, ratings, overrideIncompleteRatings, overrideReason });
      setSuccess('Offer approval request submitted. The configured approvers have been notified.');
      onSubmitted?.(requestId);
    } catch (reason: any) {
      setError(reason?.message || 'Unable to request offer approval.');
    } finally { setSubmitting(false); }
  };

  return <Modal isOpen={isOpen} onClose={onClose} title={`Request Offer Approval · ${candidate.firstName} ${candidate.lastName}`} size="5xl">
    <div className="space-y-5">
      <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-900 dark:bg-violet-950/30"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-violet-700 dark:text-violet-300">Review package</p><h2 className="mt-1 text-xl font-black text-slate-900 dark:text-white">{candidate.firstName} {candidate.lastName}</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{offer.jobTitle} · {offer.businessUnitName || offer.offerDetails?.businessUnit || 'Business unit not recorded'}</p></div><div className="text-right"><p className="text-xs font-semibold uppercase text-slate-500">Proposed salary</p><p className="text-xl font-black text-slate-900 dark:text-white">₱{offer.basePay.toLocaleString('en-PH')}</p><p className="text-xs text-slate-500">Start {offer.startDate.toLocaleDateString('en-PH')}</p></div></div></div>

      <InterviewSummaryPanel summary={summary} />

      <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Package checklist</h2>
            <p className="mt-1 text-sm text-slate-500">Select only documents belonging to this candidate. Correct a legacy document type before attaching it.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm" aria-label="Required document status">
            <span className={`rounded-full px-3 py-1 font-semibold ${hasResume ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{hasResume ? '✓' : '○'} Resume attached</span>
            <span className={`rounded-full px-3 py-1 font-semibold ${hasRating ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{hasRating ? '✓' : '○'} Interview rating(s) attached</span>
            <span className={`rounded-full px-3 py-1 font-semibold ${hasOffer ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{hasOffer ? '✓' : '○'} Offer attached</span>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_190px]">
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by document, reviewer, or candidate" aria-label="Search package documents" className="min-w-0 rounded-lg border border-slate-300 px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-800"/>
          <select value={typeFilter} onChange={event => setTypeFilter(event.target.value)} aria-label="Filter package documents by type" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-800"><option>All</option><option>Resume</option><option>Interview Rating</option><option>Offer</option><option>Other Supporting Document</option></select>
        </div>
        <div className="mt-3 divide-y rounded-xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
          {loading ? <p className="p-5 text-sm text-slate-500">Loading candidate documents…</p> : visibleDocuments.length ? visibleDocuments.map(document => (
            <div key={document.id} className="grid gap-3 p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
              <input type="checkbox" checked={selectedIds.includes(document.id)} disabled={document.isSelectable === false || classifyingDocumentId === document.id} onChange={() => toggleDocument(document)} aria-label={`Attach ${packageDocumentLabel(document)}`} className="h-4 w-4" />
              <div className="min-w-0">
                <p className="break-words font-semibold text-slate-800 dark:text-slate-100">{packageDocumentLabel(document)}</p>
                <p className="text-xs text-slate-500">{document.documentType}{document.reviewerPosition ? ` · ${document.reviewerPosition}` : ''}{document.status ? ` · ${document.status}` : ''}</p>
              </div>
              <div className="col-span-full flex flex-wrap items-center gap-2 sm:col-span-1 sm:justify-end">
                {document.source === 'candidate_document' && <select value={document.documentType} disabled={classifyingDocumentId === document.id} onChange={event => void handleDocumentTypeChange(document, event.target.value as OfferPackageDocument['documentType'])} aria-label={`Document type for ${document.fileName}`} className="max-w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-800"><option>Resume</option><option>Interview Rating</option><option>Offer</option><option>Other Supporting Document</option></select>}
                <Button size="sm" variant="secondary" onClick={() => void handlePreview(document)}>Preview / Download</Button>
                {document.source === 'candidate_document' && <button type="button" onClick={() => void handleRemove(document)} className="px-2 py-1 text-sm font-semibold text-rose-600">Remove</button>}
              </div>
            </div>
          )) : <p className="p-5 text-sm text-slate-500">No candidate documents match your search.</p>}
        </div>
        <div className="mt-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="font-semibold text-slate-800 dark:text-slate-100">Selected attachments</p><p className="text-xs text-slate-500">Reorder the package as it will be reviewed.</p></div>
            <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2">
              <select value={documentType} onChange={event => setDocumentType(event.target.value as typeof documentType)} aria-label="New candidate document type" className="min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"><option>Other Supporting Document</option><option>Resume</option><option>Interview Rating</option><option>Offer</option></select>
              <label className="cursor-pointer rounded-lg bg-white px-3 py-2 text-center text-sm font-semibold text-violet-700 shadow-sm ring-1 ring-inset ring-violet-200 hover:bg-violet-50 dark:bg-slate-800 dark:ring-violet-800">{uploading ? 'Uploading…' : 'Add Existing Candidate Document'}<input type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" disabled={uploading} onChange={event => { void handleUpload(event.target.files?.[0]); event.currentTarget.value = ''; }}/></label>
            </div>
          </div>
          {selectedDocuments.length ? <div className="mt-3 space-y-2">{selectedDocuments.map((document, index) => <div key={document.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-800"><span className="w-6 text-center font-bold text-slate-400">{index + 1}</span><span className="min-w-40 flex-1 break-words font-semibold">{packageDocumentLabel(document)}</span><button type="button" onClick={() => moveSelected(index, -1)} disabled={index === 0} className="rounded border px-2 py-1 disabled:opacity-40" aria-label="Move attachment up">↑</button><button type="button" onClick={() => moveSelected(index, 1)} disabled={index === selectedDocuments.length - 1} className="rounded border px-2 py-1 disabled:opacity-40" aria-label="Move attachment down">↓</button><button type="button" onClick={() => toggleDocument(document)} className="rounded border px-2 py-1 text-rose-600" aria-label={`Remove ${document.fileName} from package`}>×</button></div>)}</div> : <p className="mt-3 text-sm text-slate-500">No documents selected yet.</p>}
        </div>
      </section>

      {requiresOverride && <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30"><p className="font-bold text-amber-900 dark:text-amber-100">Interview ratings are incomplete</p><p className="mt-1 text-sm text-amber-800 dark:text-amber-200">{summary.submittedReviewers} of {summary.totalReviewers} assigned reviewers have submitted. An authorized Admin or HR Manager must explicitly override this before sending the package.</p>{canOverride && <><label className="mt-3 flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-100"><input type="checkbox" checked={overrideIncompleteRatings} onChange={event => setOverrideIncompleteRatings(event.target.checked)} /> Allow approval request with incomplete ratings</label>{overrideIncompleteRatings && <textarea value={overrideReason} onChange={event => setOverrideReason(event.target.value)} placeholder="Explain why approval may proceed before all ratings are submitted" className="mt-3 min-h-24 w-full rounded-lg border border-amber-300 bg-white p-3 text-sm dark:border-amber-800 dark:bg-slate-900"/>}</>}</section>}
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm font-semibold text-rose-700 dark:bg-rose-950/30 dark:text-rose-200">{error}</p>}
      {success && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200">{success}</p>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-700"><Button variant="secondary" onClick={onClose}>Close</Button><Button onClick={() => void submit()} isLoading={submitting} disabled={Boolean(success) || loading || uploading || submitting || classifyingDocumentId !== null}>Request Offer Approval</Button></div>
    </div>
  </Modal>;
};

export default OfferApprovalPackageModal;
