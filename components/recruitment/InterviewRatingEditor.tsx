import React, { useEffect, useState } from 'react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import {
  InterviewRatingAttachment,
  InterviewRatingRecord,
  InterviewTemplateField,
  Candidate,
  Permission,
} from '../../types';
import {
  downloadInterviewRatingPdf,
  fetchInterviewRatingAttachments,
  getInterviewRatingAttachmentUrl,
  isInterviewRatingEditable,
  isInterviewRatingSubmitted,
  lockInterviewRating,
  removeInterviewRatingAttachment,
  reopenInterviewRating,
  saveInterviewRating,
  submitInterviewRating,
  uploadInterviewRatingAttachment,
} from '../../services/interviewRatingService';

interface InterviewRatingEditorProps {
  rating: InterviewRatingRecord;
  candidate: Candidate;
  onUpdated: (rating: InterviewRatingRecord) => void;
}

const dateInputValue = (value: unknown) => value ? String(value).slice(0, 10) : '';

const InterviewRatingEditor: React.FC<InterviewRatingEditorProps> = ({ rating, candidate, onUpdated }) => {
  const { user } = useAuth();
  const { can } = usePermissions();
  const canManage = can('Interviews', Permission.Manage);
  const isReviewer = rating.reviewerUserId === user?.id;
  const canEdit = (isReviewer || canManage) && isInterviewRatingEditable(rating.status);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [attachments, setAttachments] = useState<InterviewRatingAttachment[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [removingAttachmentId, setRemovingAttachmentId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const template = rating.templateSnapshot;
  useEffect(() => {
    const initial = { ...rating.formData };
    const candidateName = `${candidate.firstName} ${candidate.lastName}`.trim();
    initial.candidate_date = initial.candidate_date || new Date().toISOString().slice(0, 10);
    initial.position_applied_for = initial.position_applied_for || '';
    initial.applicant_name = initial.applicant_name || candidateName;
    initial.interviewer_name = initial.interviewer_name || rating.reviewerNameSnapshot;
    initial.interviewer_position = initial.interviewer_position || rating.reviewerPositionSnapshot;
    initial.electronic_acknowledgement = initial.electronic_acknowledgement === true;
    setFormData(initial);
    setMessage('');
    setErrorMessage('');
    fetchInterviewRatingAttachments(rating.id).then(setAttachments).catch(() => setAttachments([]));
  }, [candidate.firstName, candidate.lastName, rating]);

  const updateAnswer = (fieldId: string, value: unknown) => setFormData(current => ({ ...current, [fieldId]: value }));

  const save = async (submit: boolean) => {
    if (!canEdit) return;
    setIsSaving(true);
    setErrorMessage('');
    setMessage('');
    try {
      const updated = submit ? await submitInterviewRating(rating.id, formData) : await saveInterviewRating(rating.id, formData);
      onUpdated(updated);
      setFormData(updated.formData);
      setMessage(submit ? 'Rating submitted and locked.' : 'Draft saved.');
    } catch (error: any) {
      setErrorMessage(error?.message || `Unable to ${submit ? 'submit' : 'save'} this rating.`);
    } finally {
      setIsSaving(false);
    }
  };

  const reopen = async () => {
    if (!canManage || !isInterviewRatingSubmitted(rating.status)) return;
    const reason = window.prompt('Reason for reopening this submitted rating');
    if (!reason?.trim()) return;
    setIsSaving(true);
    setErrorMessage('');
    try {
      const updated = await reopenInterviewRating(rating.id, reason.trim());
      onUpdated(updated);
      setMessage('Rating returned for revision. The reviewer was notified.');
    } catch (error: any) {
      setErrorMessage(error?.message || 'Unable to reopen this rating.');
    } finally {
      setIsSaving(false);
    }
  };

  const lock = async () => {
    if (!canManage || rating.status !== 'Submitted') return;
    setIsSaving(true);
    setErrorMessage('');
    try {
      const updated = await lockInterviewRating(rating.id);
      onUpdated(updated);
      setMessage('Rating locked permanently.');
    } catch (error: any) {
      setErrorMessage(error?.message || 'Unable to lock this rating.');
    } finally {
      setIsSaving(false);
    }
  };

  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !canManage) return;
    setIsUploading(true);
    setErrorMessage('');
    try {
      await uploadInterviewRatingAttachment(rating.id, file);
      setAttachments(await fetchInterviewRatingAttachments(rating.id));
      setMessage('Scanned rating attached to this reviewer record.');
    } catch (error: any) {
      setErrorMessage(error?.message || 'Unable to upload the scanned rating.');
    } finally {
      setIsUploading(false);
    }
  };

  const downloadPdf = async () => {
    setErrorMessage('');
    try {
      await downloadInterviewRatingPdf(rating, candidate);
    } catch (error: any) {
      setErrorMessage(error?.message || 'Unable to generate the rating PDF.');
    }
  };

  const removeAttachment = async (attachment: InterviewRatingAttachment) => {
    if (!canManage || !window.confirm(`Remove ${attachment.fileName} from this rating?`)) return;
    setRemovingAttachmentId(attachment.id);
    setErrorMessage('');
    try {
      await removeInterviewRatingAttachment(attachment);
      setAttachments(current => current.filter(item => item.id !== attachment.id));
      setMessage('Scanned rating removed from this reviewer record.');
    } catch (error: any) {
      setErrorMessage(error?.message || 'Unable to remove the scanned rating.');
    } finally {
      setRemovingAttachmentId(null);
    }
  };

  const renderField = (field: InterviewTemplateField) => {
    const value = formData[field.id];
    const fieldDisabled = !canEdit || (field.autoLinked === true && !canManage) || field.system === true;
    const label = <span>{field.label}{field.required && <span className="ml-1 text-red-500">*</span>}</span>;
    if (field.system && field.id !== 'electronic_acknowledgement') {
      const systemValue = field.id === 'interviewer_name' ? rating.reviewerNameSnapshot : field.id === 'interviewer_position' ? rating.reviewerPositionSnapshot : rating.submittedAt?.toLocaleString() || 'Recorded on submission';
      return <div key={field.id}><p className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</p><p className="mt-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200">{systemValue || 'Not provided'}</p></div>;
    }
    if (field.type === 'textarea') return <Textarea key={field.id} label={field.label} id={`rating-${field.id}`} value={String(value ?? '')} onChange={event => updateAnswer(field.id, event.target.value)} disabled={fieldDisabled} placeholder={field.description || ''} />;
    if (field.type === 'rating') {
      const selectedValue = typeof value === 'object' && value !== null ? String((value as Record<string, unknown>).value ?? '') : '';
      return <label key={field.id} className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}<select value={selectedValue} onChange={event => { const selected = template.ratingScale.find(option => String(option.value) === event.target.value); updateAnswer(field.id, selected ? { label: selected.label, value: selected.value } : ''); }} disabled={fieldDisabled} className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"><option value="">Select rating…</option>{template.ratingScale.map(option => <option key={`${field.id}-${option.value}`} value={option.value}>{option.label}</option>)}</select>{field.description && <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">{field.description}</span>}</label>;
    }
    if (field.type === 'choice') return <label key={field.id} className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}<select value={String(value ?? '')} onChange={event => updateAnswer(field.id, event.target.value)} disabled={fieldDisabled} className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"><option value="">Select an option…</option>{(field.options || []).map(option => <option key={`${field.id}-${option.value}`} value={String(option.value)}>{option.label}</option>)}</select></label>;
    if (field.type === 'yes_no') return <label key={field.id} className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}<select value={String(value ?? '')} onChange={event => updateAnswer(field.id, event.target.value)} disabled={fieldDisabled} className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"><option value="">Select…</option><option value="Yes">Yes</option><option value="No">No</option></select></label>;
    if (field.type === 'acknowledgement') return <label key={field.id} className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${fieldDisabled ? 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900/40' : 'border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-100'}`}><input type="checkbox" className="mt-0.5 h-4 w-4" checked={value === true} onChange={event => updateAnswer(field.id, event.target.checked)} disabled={fieldDisabled} />{label}</label>;
    return <Input key={field.id} label={field.label} id={`rating-${field.id}`} type={field.type === 'date' ? 'date' : 'text'} value={field.type === 'date' ? dateInputValue(value) : String(value ?? '')} onChange={event => updateAnswer(field.id, event.target.value)} disabled={fieldDisabled} placeholder={field.description || ''} />;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center dark:border-slate-700 dark:bg-slate-900/50">
        <div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200">{rating.status}</span><span className="text-sm text-slate-500 dark:text-slate-400">{rating.interviewRound} · Template v{rating.templateVersion}</span></div><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Reviewer: <span className="font-semibold">{rating.reviewerNameSnapshot}</span>{rating.reviewerPositionSnapshot ? ` · ${rating.reviewerPositionSnapshot}` : ''}</p>{rating.dueDate && <p className="mt-1 text-xs text-slate-500">Due {rating.dueDate.toLocaleDateString()}</p>}</div>
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={downloadPdf}>Download PDF</Button>{canManage && rating.status === 'Submitted' && <Button size="sm" variant="secondary" onClick={lock} isLoading={isSaving}>Lock</Button>}{canManage && isInterviewRatingSubmitted(rating.status) && <Button size="sm" onClick={reopen} isLoading={isSaving}>Reopen for revision</Button>}</div>
      </div>

      {rating.returnedNotes && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"><p className="font-semibold">Revision instructions</p><p className="mt-1">{rating.returnedNotes}</p></div>}
      {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">{message}</div>}
      {errorMessage && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{errorMessage}</div>}

      {template.sections.map(section => <section key={section.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"><div className="mb-4 border-b border-slate-200 pb-3 dark:border-slate-700"><h2 className="text-lg font-bold text-slate-900 dark:text-white">{section.title}</h2>{section.description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{section.description}</p>}</div><div className="grid gap-4 md:grid-cols-2">{section.fields.map(field => <React.Fragment key={field.id}>{renderField(field)}</React.Fragment>)}</div></section>)}

      {canManage && <section className="rounded-xl border border-dashed border-indigo-300 bg-indigo-50/60 p-4 dark:border-indigo-800 dark:bg-indigo-950/20"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="font-semibold text-slate-900 dark:text-white">Paper form attachment</h2><p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Attach a scanned PDF or image to this reviewer’s rating record only.</p></div><label className="inline-flex cursor-pointer items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"><span>{isUploading ? 'Uploading…' : 'Upload scan'}</span><input type="file" accept="application/pdf,image/jpeg,image/png" onChange={upload} disabled={isUploading} className="sr-only" /></label></div>{attachments.length > 0 && <div className="mt-3 space-y-2">{attachments.map(attachment => <div key={attachment.id} className="flex flex-col justify-between gap-2 rounded-lg border border-indigo-100 bg-white px-3 py-2 text-sm sm:flex-row sm:items-center dark:border-indigo-900 dark:bg-slate-900"><span className="truncate text-slate-700 dark:text-slate-200">{attachment.fileName}</span><div className="flex flex-wrap gap-3 sm:justify-end"><button type="button" className="text-left font-semibold text-indigo-600 hover:text-indigo-800 dark:text-indigo-300" onClick={async () => { try { window.open(await getInterviewRatingAttachmentUrl(attachment.storagePath), '_blank', 'noopener,noreferrer'); } catch (error: any) { setErrorMessage(error?.message || 'Unable to open scan.'); } }}>Open secure copy</button><button type="button" className="font-semibold text-red-600 hover:text-red-800 disabled:opacity-50 dark:text-red-300" onClick={() => void removeAttachment(attachment)} disabled={removingAttachmentId === attachment.id}>{removingAttachmentId === attachment.id ? 'Removing…' : 'Remove'}</button></div></div>)}</div>}</section>}

      <div className="flex flex-col-reverse justify-between gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center dark:border-slate-700"><p className="text-xs text-slate-500 dark:text-slate-400">{isInterviewRatingSubmitted(rating.status) ? 'This submitted rating is locked. An authorized HR user must reopen it for revision.' : canEdit ? 'Save a draft at any time, then submit when complete.' : 'You can view this rating but cannot edit it.'}</p>{canEdit && <div className="flex gap-2"><Button variant="secondary" onClick={() => save(false)} isLoading={isSaving}>Save draft</Button><Button onClick={() => save(true)} isLoading={isSaving}>Submit rating</Button></div>}</div>
    </div>
  );
};

export default InterviewRatingEditor;
