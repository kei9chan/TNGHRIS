import React, { useEffect, useMemo, useState } from 'react';
import { PANActionTaken, PANActionType, PANFieldConfig, PANSectionConfig, PANTemplate, PANTemplateStatus } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import FileUploader from '../ui/FileUploader';
import { supabase } from '../../services/supabaseClient';
import { DEFAULT_PAN_FIELDS, DEFAULT_PAN_SECTIONS, PAN_ACTION_TYPE_LABELS } from '../../services/panTemplateUtils';

interface PANTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  template: PANTemplate | null;
  businessUnits: Array<{ id: string; name: string }>;
  onSave: (template: PANTemplate) => Promise<void> | void;
}

const emptyActions: PANActionTaken = { changeOfStatus: false, promotion: false, transfer: false, salaryIncrease: false, changeOfJobTitle: false, others: '' };
const actionLabels: Array<[keyof PANActionTaken, string]> = [
  ['changeOfStatus', 'Change of employment status'], ['promotion', 'Promotion'], ['transfer', 'Transfer'],
  ['salaryIncrease', 'Salary increase'], ['changeOfJobTitle', 'Change of job title'],
];
const protectedSections = new Set(['employee_information', 'action_taken', 'effective_date', 'approval_signatures', 'employee_acknowledgement']);
const protectedFields = new Set(['employee_name', 'signatures']);

const newTemplate = (): Partial<PANTemplate> => ({
  name: '', actionTaken: { ...emptyActions }, actionType: 'general', status: 'draft', version: 1, notes: '',
  businessUnitId: undefined, isDefault: false, documentTitle: 'PERSONNEL ACTION NOTICE', documentCode: 'TNG-HRD-022',
  footerText: '', colorAccent: '#172554', paperSize: 'A4', orientation: 'portrait',
  sections: DEFAULT_PAN_SECTIONS.map(item => ({ ...item })), fieldConfig: DEFAULT_PAN_FIELDS.map(item => ({ ...item })),
});

const PANTemplateModal: React.FC<PANTemplateModalProps> = ({ isOpen, onClose, template, businessUnits, onSave }) => {
  const [current, setCurrent] = useState<Partial<PANTemplate>>(newTemplate());
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setCurrent(template ? {
      ...newTemplate(), ...template,
      sections: (template.sections || DEFAULT_PAN_SECTIONS).map(item => ({ ...item })),
      fieldConfig: (template.fieldConfig || DEFAULT_PAN_FIELDS).map(item => ({ ...item })),
    } : newTemplate());
    setLogoFile(null); setSignatureFile(null);
  }, [template, isOpen]);

  const uploadAttachment = async (file: File) => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const path = `templates/${crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString()}-${safeName}`;
    const { data, error } = await supabase.storage.from('pan_templates_attachments').upload(path, file);
    if (error) throw error;
    return supabase.storage.from('pan_templates_attachments').getPublicUrl(data.path).data.publicUrl;
  };

  const save = async (status: PANTemplateStatus) => {
    if (!current.name?.trim()) return alert('Template name is required.');
    if (!current.actionType) return alert('Select the action type for this template.');
    setIsSaving(true);
    try {
      const logoUrl = logoFile ? await uploadAttachment(logoFile) : current.logoUrl;
      const preparerSignatureUrl = signatureFile ? await uploadAttachment(signatureFile) : current.preparerSignatureUrl;
      await onSave({ ...(current as PANTemplate), name: current.name.trim(), status, logoUrl, preparerSignatureUrl,
        sections: current.sections || DEFAULT_PAN_SECTIONS, fieldConfig: current.fieldConfig || DEFAULT_PAN_FIELDS });
    } catch (error) {
      console.error('Failed to save PAN template', error);
      alert(error instanceof Error ? error.message : 'Failed to save the PAN template.');
    } finally { setIsSaving(false); }
  };

  const setAction = (key: keyof PANActionTaken, value: boolean | string) => setCurrent(previous => ({
    ...previous, actionTaken: { ...emptyActions, ...previous.actionTaken, [key]: value },
  }));
  const updateSection = (key: string, changes: Partial<PANSectionConfig>) => setCurrent(previous => ({
    ...previous, sections: (previous.sections || DEFAULT_PAN_SECTIONS).map(section => section.key === key ? { ...section, ...changes } : section),
  }));
  const moveSection = (index: number, direction: -1 | 1) => setCurrent(previous => {
    const sections = [...(previous.sections || DEFAULT_PAN_SECTIONS)].sort((a, b) => a.order - b.order);
    const target = index + direction;
    if (target < 0 || target >= sections.length) return previous;
    [sections[index], sections[target]] = [sections[target], sections[index]];
    return { ...previous, sections: sections.map((section, order) => ({ ...section, order: order + 1 })) };
  });
  const updateField = (key: string, changes: Partial<PANFieldConfig>) => setCurrent(previous => ({
    ...previous, fieldConfig: (previous.fieldConfig || DEFAULT_PAN_FIELDS).map(field => field.key === key ? { ...field, ...changes } : field),
  }));
  const sortedSections = useMemo(() => [...(current.sections || DEFAULT_PAN_SECTIONS)].sort((a, b) => a.order - b.order), [current.sections]);

  return <Modal isOpen={isOpen} onClose={onClose} title={template ? `Edit PAN Template — v${template.version}` : 'Create PAN Template'} size="5xl" centered={false} footer={
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between"><Button variant="secondary" onClick={onClose}>Cancel</Button><div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" isLoading={isSaving} onClick={() => save('draft')}>Save draft</Button><Button isLoading={isSaving} onClick={() => save('published')}>Publish template</Button></div></div>
  }>
    <div className="space-y-6">
      <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 dark:border-indigo-900 dark:bg-indigo-950/30"><h3 className="font-semibold text-indigo-900 dark:text-indigo-200">Configurable business-unit document</h3><p className="mt-1 text-sm text-indigo-800 dark:text-indigo-300">Assign the layout to one business unit and action type, or leave the scope Global as the fallback template.</p></div>

      <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><h3 className="mb-4 font-semibold">Template identity and assignment</h3><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Input label="Template name" value={current.name || ''} onChange={event => setCurrent(previous => ({ ...previous, name: event.target.value }))} required />
        <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Business unit</label><select value={current.businessUnitId || ''} onChange={event => setCurrent(previous => ({ ...previous, businessUnitId: event.target.value || undefined, businessUnitName: businessUnits.find(unit => unit.id === event.target.value)?.name }))} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"><option value="">Global — all business units</option>{businessUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></div>
        <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Action type</label><select value={current.actionType || 'general'} onChange={event => setCurrent(previous => ({ ...previous, actionType: event.target.value as PANActionType }))} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white">{Object.entries(PAN_ACTION_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <label className="mt-6 flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"><input type="checkbox" checked={!!current.isDefault} onChange={event => setCurrent(previous => ({ ...previous, isDefault: event.target.checked }))} className="h-4 w-4 text-indigo-600" /><span><b>Default template</b><br /><span className="text-xs text-slate-500">Fallback for this scope</span></span></label>
      </div></section>

      <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><h3 className="mb-4 font-semibold">Document identity</h3><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Input label="Document title" value={current.documentTitle || ''} onChange={event => setCurrent(previous => ({ ...previous, documentTitle: event.target.value }))} />
        <Input label="Document reference code" value={current.documentCode || ''} onChange={event => setCurrent(previous => ({ ...previous, documentCode: event.target.value }))} />
        <Input label="Color accent" type="color" value={current.colorAccent || '#172554'} onChange={event => setCurrent(previous => ({ ...previous, colorAccent: event.target.value }))} />
        <div className="grid grid-cols-2 gap-2"><div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Paper</label><select value={current.paperSize || 'A4'} onChange={event => setCurrent(previous => ({ ...previous, paperSize: event.target.value as 'A4' | 'Letter' }))} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:bg-slate-900"><option>A4</option><option>Letter</option></select></div><div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Orientation</label><select value={current.orientation || 'portrait'} onChange={event => setCurrent(previous => ({ ...previous, orientation: event.target.value as 'portrait' | 'landscape' }))} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:bg-slate-900"><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></div></div>
      </div><div className="mt-4 grid gap-4 lg:grid-cols-2"><Textarea label="Footer text" value={current.footerText || ''} onChange={event => setCurrent(previous => ({ ...previous, footerText: event.target.value }))} rows={3} /><Textarea label="Default remarks / justifications" value={current.notes || ''} onChange={event => setCurrent(previous => ({ ...previous, notes: event.target.value }))} rows={3} placeholder="Optional. Use {{effective_date}} where needed." /></div></section>

      <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><h3 className="mb-3 font-semibold">Default action checklist</h3><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{actionLabels.map(([key, label]) => <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"><input type="checkbox" checked={!!current.actionTaken?.[key]} onChange={event => setAction(key, event.target.checked)} className="h-4 w-4 text-indigo-600" />{label}</label>)}<div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700"><input type="checkbox" checked={!!current.actionTaken?.others} onChange={event => setAction('others', event.target.checked ? current.actionTaken?.others || 'Other action' : '')} className="h-4 w-4 text-indigo-600" /><Input label="" value={current.actionTaken?.others || ''} onChange={event => setAction('others', event.target.value)} placeholder="Other action" /></div></div></section>

      <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div className="mb-3"><h3 className="font-semibold">Document sections</h3><p className="text-sm text-slate-500">Reorder sections and hide optional content. Required workflow sections remain protected.</p></div><div className="space-y-2">{sortedSections.map((section, index) => { const locked = protectedSections.has(section.key); return <div key={section.key} className="grid items-center gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[72px_1fr_auto_auto] dark:border-slate-700"><div className="flex gap-1"><button type="button" onClick={() => moveSection(index, -1)} disabled={index === 0} className="rounded border px-2 py-1 text-xs disabled:opacity-30">↑</button><button type="button" onClick={() => moveSection(index, 1)} disabled={index === sortedSections.length - 1} className="rounded border px-2 py-1 text-xs disabled:opacity-30">↓</button></div><Input label="" value={section.label} onChange={event => updateSection(section.key, { label: event.target.value })} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={section.visible} disabled={locked} onChange={event => updateSection(section.key, { visible: event.target.checked })} />Visible</label><span className={`rounded-full px-2 py-1 text-xs ${locked ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>{locked ? 'Required' : 'Optional'}</span></div>; })}</div></section>

      <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div className="mb-3"><h3 className="font-semibold">Field controls</h3><p className="text-sm text-slate-500">Rename printable labels and control whether optional fields are shown or required.</p></div><div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700"><thead><tr>{['Field', 'Printable label', 'Display', 'Visible', 'Required'].map(item => <th key={item} className="px-3 py-2 text-left text-xs uppercase tracking-wide text-slate-500">{item}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{(current.fieldConfig || DEFAULT_PAN_FIELDS).map(field => { const locked = protectedFields.has(field.key); return <tr key={field.key}><td className="px-3 py-2 font-medium">{field.key.replaceAll('_', ' ')}</td><td className="px-3 py-2"><Input label="" value={field.label} onChange={event => updateField(field.key, { label: event.target.value })} /></td><td className="px-3 py-2"><select value={field.display} onChange={event => updateField(field.key, { display: event.target.value as PANFieldConfig['display'] })} className="rounded-md border border-slate-300 bg-white px-2 py-2 dark:bg-slate-900"><option value="text">Text</option><option value="table">Table</option><option value="checkbox">Checkbox</option><option value="signature">Signature</option></select></td><td className="px-3 py-2"><input type="checkbox" checked={field.visible} disabled={locked} onChange={event => updateField(field.key, { visible: event.target.checked })} /></td><td className="px-3 py-2"><input type="checkbox" checked={field.required} disabled={locked} onChange={event => updateField(field.key, { required: event.target.checked })} /></td></tr>; })}</tbody></table></div></section>

      <section className="grid gap-4 lg:grid-cols-2"><div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><h3 className="mb-2 font-semibold">Header logo</h3><FileUploader onFileUpload={file => { setLogoFile(file); setCurrent(previous => ({ ...previous, logoUrl: URL.createObjectURL(file) })); }} />{current.logoUrl && <img src={current.logoUrl} alt="Template logo preview" className="mt-3 max-h-16 max-w-48 object-contain" />}</div><div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><h3 className="mb-2 font-semibold">Prepared by</h3><Input label="Preparer name" value={current.preparerName || ''} onChange={event => setCurrent(previous => ({ ...previous, preparerName: event.target.value }))} /><div className="mt-3"><FileUploader onFileUpload={file => { setSignatureFile(file); setCurrent(previous => ({ ...previous, preparerSignatureUrl: URL.createObjectURL(file) })); }} /></div>{current.preparerSignatureUrl && <img src={current.preparerSignatureUrl} alt="Signature preview" className="mt-3 max-h-16 max-w-48 object-contain" />}</div></section>
    </div>
  </Modal>;
};

export default PANTemplateModal;
