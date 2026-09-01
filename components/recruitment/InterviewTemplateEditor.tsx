import React, { useEffect, useMemo, useState } from 'react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import {
  InterviewRatingScaleOption,
  InterviewRatingTemplate,
  InterviewTemplateField,
  InterviewTemplateFieldType,
  InterviewTemplateSection,
  InterviewTemplateStatus,
} from '../../types';
import {
  saveInterviewTemplate,
  STANDARD_INTERVIEW_RATING_SCALE,
  STANDARD_INTERVIEW_SECTIONS,
} from '../../services/interviewRatingService';

interface InterviewTemplateEditorProps {
  template?: InterviewRatingTemplate | null;
  businessUnits: Array<{ id: string; name: string }>;
  positionOptions: string[];
  stageOptions: string[];
  onSaved: (templateId: string) => void;
  onCancel: () => void;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const emptyTemplate = (): Omit<InterviewRatingTemplate, 'id' | 'createdByUserId' | 'createdAt' | 'updatedAt'> & { id?: string } => ({
  name: 'New Interview Rating Template',
  description: '',
  status: 'Draft',
  templateGroupId: '',
  version: 1,
  assignmentBusinessUnitIds: [],
  assignmentPositions: [],
  assignmentStages: [],
  sections: clone(STANDARD_INTERVIEW_SECTIONS),
  ratingScale: clone(STANDARD_INTERVIEW_RATING_SCALE),
  isCurrent: true,
});

const createField = (index: number): InterviewTemplateField => ({
  id: `custom-field-${Date.now()}-${index}`,
  label: 'New field',
  type: 'text',
  required: false,
});

const createSection = (index: number): InterviewTemplateSection => ({
  id: `custom-section-${Date.now()}-${index}`,
  title: 'New section',
  description: '',
  order: index + 1,
  fields: [createField(index)],
});

const parseList = (value: string) => value.split(',').map(item => item.trim()).filter(Boolean);

const InterviewTemplateEditor: React.FC<InterviewTemplateEditorProps> = ({
  template,
  businessUnits,
  positionOptions,
  stageOptions,
  onSaved,
  onCancel,
}) => {
  const [draft, setDraft] = useState(() => clone(template || emptyTemplate()));
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    setDraft(clone(template || emptyTemplate()));
    setErrorMessage('');
  }, [template]);

  const allPositions = useMemo(() => Array.from(new Set(positionOptions.filter(Boolean))).sort(), [positionOptions]);
  const allStages = useMemo(() => Array.from(new Set(stageOptions.filter(Boolean))).sort(), [stageOptions]);

  const updateDraft = (changes: Partial<typeof draft>) => setDraft(current => ({ ...current, ...changes }));

  const updateSection = (sectionIndex: number, changes: Partial<InterviewTemplateSection>) => {
    setDraft(current => ({
      ...current,
      sections: current.sections.map((section, index) => index === sectionIndex ? { ...section, ...changes } : section),
    }));
  };

  const updateField = (sectionIndex: number, fieldIndex: number, changes: Partial<InterviewTemplateField>) => {
    setDraft(current => ({
      ...current,
      sections: current.sections.map((section, index) => index !== sectionIndex ? section : {
        ...section,
        fields: section.fields.map((field, fieldPosition) => fieldPosition === fieldIndex ? { ...field, ...changes } : field),
      }),
    }));
  };

  const removeField = (sectionIndex: number, fieldIndex: number) => {
    setDraft(current => ({
      ...current,
      sections: current.sections.map((section, index) => index !== sectionIndex ? section : {
        ...section,
        fields: section.fields.filter((_, fieldPosition) => fieldPosition !== fieldIndex),
      }),
    }));
  };

  const removeSection = (sectionIndex: number) => {
    setDraft(current => ({ ...current, sections: current.sections.filter((_, index) => index !== sectionIndex).map((section, index) => ({ ...section, order: index + 1 })) }));
  };

  const moveSection = (sectionIndex: number, direction: -1 | 1) => {
    setDraft(current => {
      const nextIndex = sectionIndex + direction;
      if (nextIndex < 0 || nextIndex >= current.sections.length) return current;
      const sections = [...current.sections];
      [sections[sectionIndex], sections[nextIndex]] = [sections[nextIndex], sections[sectionIndex]];
      return { ...current, sections: sections.map((section, index) => ({ ...section, order: index + 1 })) };
    });
  };

  const updateScale = (index: number, changes: Partial<InterviewRatingScaleOption>) => {
    setDraft(current => ({ ...current, ratingScale: current.ratingScale.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item) }));
  };

  const save = async () => {
    if (!draft.name.trim()) {
      setErrorMessage('Template name is required.');
      return;
    }
    if (!draft.sections.some(section => section.fields.length > 0)) {
      setErrorMessage('Add at least one field before saving.');
      return;
    }
    if (draft.ratingScale.length < 2) {
      setErrorMessage('Add at least two rating scale options.');
      return;
    }
    setIsSaving(true);
    setErrorMessage('');
    try {
      const id = await saveInterviewTemplate({
        id: draft.id || null,
        name: draft.name.trim(),
        description: draft.description || '',
        status: draft.status as InterviewTemplateStatus,
        assignmentBusinessUnitIds: draft.assignmentBusinessUnitIds,
        assignmentPositions: draft.assignmentPositions,
        assignmentStages: draft.assignmentStages,
        sections: draft.sections.map((section, index) => ({ ...section, order: index + 1 })),
        ratingScale: draft.ratingScale.map(item => ({ label: item.label.trim(), value: Number(item.value) })).filter(item => item.label),
      });
      onSaved(id);
    } catch (error: any) {
      setErrorMessage(error?.message || 'Unable to save interview template.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {errorMessage && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{errorMessage}</div>}

      <div className="grid gap-4 md:grid-cols-2">
        <Input label="Template name" id="interview-template-name" value={draft.name} onChange={event => updateDraft({ name: event.target.value })} />
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Status
          <select value={draft.status} onChange={event => updateDraft({ status: event.target.value as InterviewTemplateStatus })} className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white">
            <option value="Draft">Draft</option><option value="Active">Active</option><option value="Inactive">Inactive</option>
          </select>
        </label>
      </div>
      <Textarea label="Description" id="interview-template-description" value={draft.description} onChange={event => updateDraft({ description: event.target.value })} placeholder="When should this form be used?" />

      <section className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-white">Assignment rules</h4>
            <p className="text-xs text-gray-500 dark:text-slate-400">Leave a filter empty to make the current version available to every matching application.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Business Units
            <select multiple value={draft.assignmentBusinessUnitIds as string[]} onChange={event => updateDraft({ assignmentBusinessUnitIds: Array.from(event.target.selectedOptions as HTMLCollectionOf<HTMLOptionElement>).map((option: HTMLOptionElement) => option.value) })} className="mt-1 h-28 w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white">
              {businessUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Positions
            <select multiple value={draft.assignmentPositions as string[]} onChange={event => updateDraft({ assignmentPositions: Array.from(event.target.selectedOptions as HTMLCollectionOf<HTMLOptionElement>).map((option: HTMLOptionElement) => option.value) })} className="mt-1 h-28 w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white">
              {allPositions.map(position => <option key={position} value={position}>{position}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Interview stages
            <select multiple value={draft.assignmentStages as string[]} onChange={event => updateDraft({ assignmentStages: Array.from(event.target.selectedOptions as HTMLCollectionOf<HTMLOptionElement>).map((option: HTMLOptionElement) => option.value) })} className="mt-1 h-28 w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white">
              {allStages.map(stage => <option key={stage} value={stage}>{stage}</option>)}
            </select>
          </label>
        </div>
        <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">Hold Ctrl/Cmd to select multiple values.</p>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div><h4 className="font-semibold text-gray-900 dark:text-white">Sections and fields</h4><p className="text-xs text-gray-500 dark:text-slate-400">Required fields are validated before a reviewer can submit.</p></div>
          <Button size="sm" variant="secondary" onClick={() => setDraft(current => ({ ...current, sections: [...current.sections, createSection(current.sections.length)] }))}>+ Add section</Button>
        </div>
        {draft.sections.map((section, sectionIndex) => (
          <div key={section.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <div className="flex-1"><Input label={`Section ${sectionIndex + 1} title`} id={`section-title-${section.id}`} value={section.title} onChange={event => updateSection(sectionIndex, { title: event.target.value })} /></div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => moveSection(sectionIndex, -1)} disabled={sectionIndex === 0} aria-label="Move section up">↑</Button>
                <Button size="sm" variant="secondary" onClick={() => moveSection(sectionIndex, 1)} disabled={sectionIndex === draft.sections.length - 1} aria-label="Move section down">↓</Button>
                <Button size="sm" variant="danger" onClick={() => removeSection(sectionIndex)} disabled={draft.sections.length === 1}>Remove</Button>
              </div>
            </div>
            <div className="mt-3"><Input label="Section description (optional)" id={`section-description-${section.id}`} value={section.description || ''} onChange={event => updateSection(sectionIndex, { description: event.target.value })} /></div>
            <div className="mt-4 space-y-3">
              {section.fields.map((field, fieldIndex) => (
                <div key={field.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                  <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr_auto] lg:items-end">
                    <Input label="Field label" id={`field-label-${field.id}`} value={field.label} onChange={event => updateField(sectionIndex, fieldIndex, { label: event.target.value })} />
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Field type
                      <select value={field.type} onChange={event => updateField(sectionIndex, fieldIndex, { type: event.target.value as InterviewTemplateFieldType })} className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white">
                        <option value="text">Short text</option><option value="textarea">Long text</option><option value="date">Date</option><option value="rating">Rating</option><option value="choice">Choice</option><option value="yes_no">Yes / No</option><option value="acknowledgement">Acknowledgement</option>
                      </select>
                    </label>
                    <Input label="Helper text (optional)" id={`field-description-${field.id}`} value={field.description || ''} onChange={event => updateField(sectionIndex, fieldIndex, { description: event.target.value })} />
                    <Button size="sm" variant="danger" onClick={() => removeField(sectionIndex, fieldIndex)} disabled={section.fields.length === 1}>Remove</Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-600 dark:text-slate-300">
                    <label className="inline-flex items-center gap-2"><input type="checkbox" checked={field.required} onChange={event => updateField(sectionIndex, fieldIndex, { required: event.target.checked })} /> Required</label>
                    <label className="inline-flex items-center gap-2"><input type="checkbox" checked={field.autoLinked === true} onChange={event => updateField(sectionIndex, fieldIndex, { autoLinked: event.target.checked })} /> Link to candidate record</label>
                    {field.system && <span className="rounded-full bg-slate-200 px-2 py-1 text-xs dark:bg-slate-700">System field</span>}
                  </div>
                  {field.type === 'choice' && <Input label="Choice options (comma separated)" id={`field-options-${field.id}`} value={(field.options || []).map(option => option.label).join(', ')} onChange={event => updateField(sectionIndex, fieldIndex, { options: parseList(event.target.value).map(option => ({ label: option, value: option })) })} />}
                  {field.type === 'rating' && <p className="mt-2 text-xs text-indigo-600 dark:text-indigo-300">This field uses the rating scale below and stores both the label and its numeric value.</p>}
                </div>
              ))}
              <Button size="sm" variant="secondary" onClick={() => setDraft(current => ({ ...current, sections: current.sections.map((item, index) => index === sectionIndex ? { ...item, fields: [...item.fields, createField(item.fields.length)] } : item) }))}>+ Add field</Button>
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center justify-between gap-3"><div><h4 className="font-semibold text-gray-900 dark:text-white">Rating scale</h4><p className="text-xs text-gray-500 dark:text-slate-400">Reviewers select labels; the numeric value is retained for summaries.</p></div><Button size="sm" variant="secondary" onClick={() => setDraft(current => ({ ...current, ratingScale: [...current.ratingScale, { label: 'New rating', value: current.ratingScale.length + 1 }] }))}>+ Add rating</Button></div>
        <div className="mt-3 space-y-2">
          {draft.ratingScale.map((item, index) => <div key={`${item.label}-${index}`} className="grid grid-cols-[1fr_100px_auto] items-end gap-3"><Input label={index === 0 ? 'Label' : ''} id={`rating-label-${index}`} value={item.label} onChange={event => updateScale(index, { label: event.target.value })} /><Input label={index === 0 ? 'Value' : ''} id={`rating-value-${index}`} type="number" min="1" value={item.value} onChange={event => updateScale(index, { value: Number(event.target.value) })} /><Button size="sm" variant="danger" onClick={() => setDraft(current => ({ ...current, ratingScale: current.ratingScale.filter((_, itemIndex) => itemIndex !== index) }))} disabled={draft.ratingScale.length <= 2}>Remove</Button></div>)}
        </div>
      </section>

      <div className="flex flex-col-reverse justify-end gap-3 border-t border-gray-200 pt-4 sm:flex-row dark:border-slate-700">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button onClick={save} isLoading={isSaving}>{template ? `Save version ${template.version + 1}` : 'Create template'}</Button>
      </div>
    </div>
  );
};

export default InterviewTemplateEditor;
