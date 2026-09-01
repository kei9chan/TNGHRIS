import React, { useEffect, useMemo, useState } from 'react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import { Application, Candidate, InterviewRatingRecord, InterviewRatingTemplate, JobPost } from '../../types';
import {
  createInterviewRatingAssignments,
  fetchActiveInterviewTemplates,
  templateMatchesApplication,
} from '../../services/interviewRatingService';
import { supabase } from '../../services/supabaseClient';

interface ReviewerOption {
  id: string;
  name: string;
  email: string;
  position: string;
}

interface CreateInterviewRatingModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidate: Candidate;
  applications: Application[];
  jobPosts: JobPost[];
  onAssigned: (records: InterviewRatingRecord[]) => void;
}

const CreateInterviewRatingModal: React.FC<CreateInterviewRatingModalProps> = ({ isOpen, onClose, candidate, applications, jobPosts, onAssigned }) => {
  const candidateApplications = useMemo(() => applications.filter(application => application.candidateId === candidate.id), [applications, candidate.id]);
  const [templates, setTemplates] = useState<InterviewRatingTemplate[]>([]);
  const [reviewers, setReviewers] = useState<ReviewerOption[]>([]);
  const [applicationId, setApplicationId] = useState(candidateApplications[0]?.id || '');
  const [templateId, setTemplateId] = useState('');
  const [reviewerSearch, setReviewerSearch] = useState('');
  const [selectedReviewerIds, setSelectedReviewerIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState('');
  const [round, setRound] = useState('Round 1');
  const [customRound, setCustomRound] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const selectedApplication = candidateApplications.find(application => application.id === applicationId);
  const selectedJobPost = jobPosts.find(post => post.id === selectedApplication?.jobPostId);
  const matchingTemplates = useMemo(() => templates.filter(template => selectedApplication && templateMatchesApplication(template, selectedApplication, selectedJobPost?.businessUnitId, selectedJobPost?.title)), [selectedApplication, selectedJobPost?.businessUnitId, selectedJobPost?.title, templates]);
  const filteredReviewers = useMemo(() => {
    const query = reviewerSearch.trim().toLowerCase();
    return reviewers.filter(reviewer => !selectedReviewerIds.includes(reviewer.id) && (!query || `${reviewer.name} ${reviewer.email} ${reviewer.position}`.toLowerCase().includes(query))).slice(0, 12);
  }, [reviewerSearch, reviewers, selectedReviewerIds]);
  const selectedReviewers = useMemo(() => selectedReviewerIds.map(id => reviewers.find(reviewer => reviewer.id === id)).filter(Boolean) as ReviewerOption[], [reviewers, selectedReviewerIds]);

  useEffect(() => {
    if (!isOpen) return;
    setApplicationId(candidateApplications[0]?.id || '');
    setTemplateId('');
    setReviewerSearch('');
    setSelectedReviewerIds([]);
    setDueDate('');
    setRound('Round 1');
    setCustomRound('');
    setErrorMessage('');
    setIsLoading(true);
    Promise.all([
      fetchActiveInterviewTemplates(),
      supabase.from('hris_users').select('id,full_name,email,position,status').eq('status', 'Active').order('full_name'),
    ]).then(([loadedTemplates, reviewerResult]) => {
      if (reviewerResult.error) throw reviewerResult.error;
      setTemplates(loadedTemplates);
      setReviewers((reviewerResult.data || []).map((row: any) => ({ id: row.id, name: row.full_name || row.email, email: row.email || '', position: row.position || '' })));
    }).catch((error: any) => setErrorMessage(error?.message || 'Unable to load rating templates and reviewers.')).finally(() => setIsLoading(false));
  }, [candidateApplications, isOpen]);

  useEffect(() => {
    if (!templateId && matchingTemplates.length) setTemplateId(matchingTemplates[0].id);
    if (templateId && !matchingTemplates.some(template => template.id === templateId)) setTemplateId(matchingTemplates[0]?.id || '');
  }, [matchingTemplates, templateId]);

  const addReviewer = (id: string) => setSelectedReviewerIds(current => [...current, id]);
  const removeReviewer = (id: string) => setSelectedReviewerIds(current => current.filter(item => item !== id));

  const submit = async () => {
    if (!applicationId) return setErrorMessage('Select an application first.');
    if (!templateId) return setErrorMessage('Select an active interview template.');
    if (!selectedReviewerIds.length) return setErrorMessage('Add at least one reviewer.');
    const interviewRound = round === 'Custom' ? customRound.trim() : round;
    if (!interviewRound) return setErrorMessage('Enter an interview round.');
    setIsSaving(true);
    setErrorMessage('');
    try {
      const records = await createInterviewRatingAssignments({ candidateId: candidate.id, applicationId, templateVersionId: templateId, reviewerUserIds: selectedReviewerIds, dueDate: dueDate || undefined, interviewRound });
      onAssigned(records);
      onClose();
    } catch (error: any) {
      setErrorMessage(error?.message || 'Unable to assign interview ratings.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Interview Rating" size="3xl" footer={<div className="flex flex-col-reverse justify-end gap-3 sm:flex-row"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} isLoading={isSaving}>Send rating forms</Button></div>}>
      <div className="space-y-5">
        <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/30"><p className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">{candidate.firstName} {candidate.lastName}</p><p className="mt-1 text-xs text-indigo-700 dark:text-indigo-300">Each reviewer receives an independent versioned form. Their answers remain separate.</p></div>
        {errorMessage && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{errorMessage}</div>}
        {isLoading ? <p className="text-sm text-slate-500">Loading active templates and reviewers…</p> : <>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Application
              <select value={applicationId} onChange={event => setApplicationId(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white">
                {candidateApplications.length === 0 ? <option value="">No applications found</option> : candidateApplications.map(application => <option key={application.id} value={application.id}>{jobPosts.find(post => post.id === application.jobPostId)?.title || application.roleTitleSnapshot || 'Application'} · {application.stage}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Interview template
              <select value={templateId} onChange={event => setTemplateId(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white">
                {matchingTemplates.length === 0 ? <option value="">No matching active templates</option> : matchingTemplates.map(template => <option key={template.id} value={template.id}>{template.name} · v{template.version}</option>)}
              </select>
            </label>
            <Input label="Due date (optional)" id="rating-due-date" type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} />
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Interview round
              <select value={round} onChange={event => setRound(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"><option>Round 1</option><option>Round 2</option><option>Final</option><option>Custom</option></select>
            </label>
          </div>
          {round === 'Custom' && <Input label="Custom interview round" id="custom-interview-round" value={customRound} onChange={event => setCustomRound(event.target.value)} placeholder="e.g. Panel Interview" />}

          <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold text-slate-900 dark:text-white">Reviewers</h3><p className="text-xs text-slate-500 dark:text-slate-400">Search the active HRIS directory and add each reviewer separately.</p></div><span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200">{selectedReviewers.length} selected</span></div>
            <div className="mt-3"><Input label="Search reviewers" id="reviewer-search" value={reviewerSearch} onChange={event => setReviewerSearch(event.target.value)} placeholder="Name, email, or position" /></div>
            {reviewerSearch && <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">{filteredReviewers.length ? filteredReviewers.map(reviewer => <button key={reviewer.id} type="button" className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800" onClick={() => { addReviewer(reviewer.id); setReviewerSearch(''); }}><span><span className="block font-semibold text-slate-900 dark:text-white">{reviewer.name}</span><span className="text-xs text-slate-500">{reviewer.position || reviewer.email}</span></span><span className="text-indigo-600">Add</span></button>) : <p className="p-3 text-sm text-slate-500">No reviewers found.</p>}</div>}
            {selectedReviewers.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{selectedReviewers.map(reviewer => <span key={reviewer.id} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-800 dark:bg-slate-700 dark:text-slate-100">{reviewer.name}<button type="button" className="font-bold text-slate-500 hover:text-red-600" onClick={() => removeReviewer(reviewer.id)} aria-label={`Remove ${reviewer.name}`}>×</button></span>)}</div>}
          </section>
        </>}
      </div>
    </Modal>
  );
};

export default CreateInterviewRatingModal;
