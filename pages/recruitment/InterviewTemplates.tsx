import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { BusinessUnit, InterviewRatingTemplate, Permission } from '../../types';
import { usePermissions } from '../../hooks/usePermissions';
import {
  duplicateInterviewTemplate,
  fetchInterviewTemplates,
  setInterviewTemplateStatus,
} from '../../services/interviewRatingService';
import InterviewTemplateEditor from '../../components/recruitment/InterviewTemplateEditor';
import { supabase } from '../../services/supabaseClient';

const statusClasses: Record<string, string> = {
  Active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200',
  Inactive: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  Draft: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
};

const InterviewTemplates: React.FC = () => {
  const { can } = usePermissions();
  const canManage = can('Interviews', Permission.Manage);
  const [templates, setTemplates] = useState<InterviewRatingTemplate[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [positionOptions, setPositionOptions] = useState<string[]>([]);
  const [stageOptions, setStageOptions] = useState<string[]>(['New', 'Screen', 'HM Review', 'Interview', 'Offer']);
  const [selectedTemplate, setSelectedTemplate] = useState<InterviewRatingTemplate | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const loadData = useCallback(async () => {
    if (!canManage) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorMessage('');
    try {
      const [loadedTemplates, buResult, postResult] = await Promise.all([
        fetchInterviewTemplates(),
        supabase.from('business_units').select('id,name').order('name'),
        supabase.from('job_posts').select('title').order('title'),
      ]);
      if (buResult.error) throw buResult.error;
      if (postResult.error) throw postResult.error;
      setTemplates(loadedTemplates);
      setBusinessUnits((buResult.data || []) as BusinessUnit[]);
      setPositionOptions(Array.from(new Set((postResult.data || []).map((row: any) => row.title).filter(Boolean))));
      setStageOptions(current => Array.from(new Set([...current, ...loadedTemplates.flatMap(template => template.assignmentStages)])));
    } catch (error: any) {
      console.error('Failed to load interview templates', error);
      setErrorMessage(error?.message || 'Unable to load interview templates.');
    } finally {
      setIsLoading(false);
    }
  }, [canManage]);

  useEffect(() => { loadData(); }, [loadData]);

  const businessUnitName = useMemo(() => new Map(businessUnits.map(unit => [unit.id, unit.name])), [businessUnits]);

  const openNew = () => {
    setSelectedTemplate(null);
    setIsEditorOpen(true);
  };

  const handleDuplicate = async (template: InterviewRatingTemplate) => {
    const requestedName = window.prompt('Name for the duplicated template', `${template.name} — Copy`);
    if (!requestedName?.trim()) return;
    try {
      await duplicateInterviewTemplate(template.id, requestedName.trim());
      await loadData();
    } catch (error: any) {
      setErrorMessage(error?.message || 'Unable to duplicate interview template.');
    }
  };

  const handleStatus = async (template: InterviewRatingTemplate) => {
    const nextStatus = template.status === 'Active' ? 'Inactive' : 'Active';
    try {
      await setInterviewTemplateStatus(template.id, nextStatus);
      await loadData();
    } catch (error: any) {
      setErrorMessage(error?.message || 'Unable to update interview template status.');
    }
  };

  if (!canManage) {
    return <Card><p className="text-gray-600 dark:text-slate-300">Interview template management is limited to authorized HR and Admin users.</p></Card>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">Recruitment</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 dark:text-white">Interview Templates</h1>
          <p className="mt-2 max-w-3xl text-gray-600 dark:text-slate-400">Build reusable interview rating forms with version-safe reviewer responses. Existing submitted ratings always retain the version they used.</p>
        </div>
        <Button onClick={openNew}>+ New template</Button>
      </div>

      {errorMessage && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{errorMessage}</div>}

      {isLoading ? <Card><p className="text-gray-500 dark:text-slate-400">Loading interview templates…</p></Card> : templates.length === 0 ? <Card><div className="py-8 text-center"><p className="font-semibold text-slate-900 dark:text-white">No interview templates yet</p><p className="mt-1 text-sm text-slate-500">Create a versioned rating form to start assigning reviewers.</p></div></Card> : (
        <div className="grid gap-5 xl:grid-cols-2">
          {templates.map(template => (
            <Card key={template.id} className="border border-transparent transition hover:border-indigo-200 dark:hover:border-indigo-800">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold text-slate-900 dark:text-white">{template.name}</h2><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses[template.status]}`}>{template.status}</span></div>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Version {template.version} · Updated {template.updatedAt.toLocaleDateString()}</p>
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{template.description || 'No description provided.'}</p>
                </div>
                <div className="flex shrink-0 gap-2"><Button size="sm" variant="secondary" onClick={() => { setSelectedTemplate(template); setIsEditorOpen(true); }}>Edit</Button><Button size="sm" variant="secondary" onClick={() => handleDuplicate(template)}>Duplicate</Button></div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900/60"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sections</p><p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{template.sections.length}</p></div>
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900/60"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fields</p><p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{template.sections.reduce((total, section) => total + section.fields.length, 0)}</p></div>
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900/60"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Scale</p><p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{template.ratingScale.length}</p></div>
              </div>
              <div className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                <p><span className="font-semibold">Business Units:</span> {template.assignmentBusinessUnitIds.length ? template.assignmentBusinessUnitIds.map(id => businessUnitName.get(id) || 'Unknown').join(', ') : 'All accessible business units'}</p>
                <p><span className="font-semibold">Positions:</span> {template.assignmentPositions.length ? template.assignmentPositions.join(', ') : 'All positions'}</p>
                <p><span className="font-semibold">Stages:</span> {template.assignmentStages.length ? template.assignmentStages.join(', ') : 'All interview stages'}</p>
              </div>
              <div className="mt-5 flex justify-end border-t border-slate-200 pt-4 dark:border-slate-700"><Button size="sm" variant={template.status === 'Active' ? 'secondary' : 'success'} onClick={() => handleStatus(template)}>{template.status === 'Active' ? 'Deactivate' : 'Activate'}</Button></div>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={isEditorOpen} onClose={() => setIsEditorOpen(false)} title={selectedTemplate ? `Edit interview template · Version ${selectedTemplate.version}` : 'Create interview template'} size="5xl">
        <InterviewTemplateEditor
          template={selectedTemplate}
          businessUnits={businessUnits}
          positionOptions={positionOptions}
          stageOptions={stageOptions}
          onSaved={async () => { setIsEditorOpen(false); setSelectedTemplate(null); await loadData(); }}
          onCancel={() => setIsEditorOpen(false)}
        />
      </Modal>
    </div>
  );
};

export default InterviewTemplates;
