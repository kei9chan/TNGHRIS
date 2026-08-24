import React, { useEffect, useState } from 'react';
import { PANTemplate, PANActionTaken } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import FileUploader from '../ui/FileUploader';
import { supabase } from '../../services/supabaseClient';

interface PANTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  template: PANTemplate | null;
  businessUnits: Array<{ id: string; name: string }>;
  onSave: (template: PANTemplate) => void;
}

const emptyActions: PANActionTaken = { changeOfStatus: false, promotion: false, transfer: false, salaryIncrease: false, changeOfJobTitle: false, others: '' };
const actionLabels: Array<[keyof PANActionTaken, string]> = [
  ['changeOfStatus', 'Change of employment status'], ['promotion', 'Promotion'], ['transfer', 'Transfer'],
  ['salaryIncrease', 'Salary increase'], ['changeOfJobTitle', 'Change of job title'],
];

const PANTemplateModal: React.FC<PANTemplateModalProps> = ({ isOpen, onClose, template, businessUnits, onSave }) => {
  const [current, setCurrent] = useState<Partial<PANTemplate>>({});
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setCurrent(template || { name: '', actionTaken: { ...emptyActions }, notes: '', businessUnitId: '' });
    setLogoFile(null); setSignatureFile(null);
  }, [template, isOpen]);

  const uploadAttachment = async (file: File) => {
    const path = `templates/${crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString()}-${file.name}`;
    const { data, error } = await supabase.storage.from('pan_templates_attachments').upload(path, file);
    if (error) throw error;
    return supabase.storage.from('pan_templates_attachments').getPublicUrl(data.path).data.publicUrl;
  };

  const save = async () => {
    if (!current.name?.trim()) return alert('Template name is required.');
    try {
      const logoUrl = logoFile ? await uploadAttachment(logoFile) : current.logoUrl;
      const preparerSignatureUrl = signatureFile ? await uploadAttachment(signatureFile) : current.preparerSignatureUrl;
      onSave({ ...(current as PANTemplate), name: current.name.trim(), logoUrl, preparerSignatureUrl });
    } catch (error) {
      console.error('Failed to upload PAN template attachments', error);
      alert('Failed to upload the template attachment.');
    }
  };

  const setAction = (key: keyof PANActionTaken, value: boolean | string) => setCurrent(previous => ({ ...previous, actionTaken: { ...emptyActions, ...previous.actionTaken, [key]: value } }));

  return <Modal isOpen={isOpen} onClose={onClose} title={template ? 'Edit PAN Template' : 'Create PAN Template'} footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>{template ? 'Save changes' : 'Create template'}</Button></div>}>
    <div className="space-y-5">
      <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 dark:border-indigo-900 dark:bg-indigo-950/30"><h3 className="font-semibold text-indigo-900 dark:text-indigo-200">Reusable document preset</h3><p className="mt-1 text-sm text-indigo-800 dark:text-indigo-300">Assign this template to one business unit, or leave it Global so it can be used anywhere.</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Template name" name="name" value={current.name || ''} onChange={event => setCurrent(previous => ({ ...previous, name: event.target.value }))} required />
        <div><label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Business unit</label><select value={current.businessUnitId || ''} onChange={event => setCurrent(previous => ({ ...previous, businessUnitId: event.target.value || undefined, businessUnitName: businessUnits.find(unit => unit.id === event.target.value)?.name }))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"><option value="">Global — all business units</option>{businessUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></div>
      </div>

      <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><h3 className="mb-3 font-semibold">Default action checklist</h3><div className="grid gap-2 sm:grid-cols-2">{actionLabels.map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!current.actionTaken?.[key]} onChange={event => setAction(key, event.target.checked)} className="h-4 w-4 text-indigo-600" />{label}</label>)}<div className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={!!current.actionTaken?.others} onChange={event => setAction('others', event.target.checked ? current.actionTaken?.others || 'Other action' : '')} className="h-4 w-4 text-indigo-600" /><Input value={current.actionTaken?.others || ''} onChange={event => setAction('others', event.target.value)} placeholder="Other action" /></div></div></div>

      <div className="grid gap-4 sm:grid-cols-2"><div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><h3 className="mb-2 font-semibold">Header logo</h3><FileUploader onFileUpload={file => { setLogoFile(file); setCurrent(previous => ({ ...previous, logoUrl: URL.createObjectURL(file) })); }} />{current.logoUrl && <img src={current.logoUrl} alt="Template logo preview" className="mt-3 max-h-16 max-w-40 object-contain" />}</div><div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><h3 className="mb-2 font-semibold">Preparer signature</h3><Input label="Preparer name" value={current.preparerName || ''} onChange={event => setCurrent(previous => ({ ...previous, preparerName: event.target.value }))} /><div className="mt-3"><FileUploader onFileUpload={file => { setSignatureFile(file); setCurrent(previous => ({ ...previous, preparerSignatureUrl: URL.createObjectURL(file) })); }} /></div>{current.preparerSignatureUrl && <img src={current.preparerSignatureUrl} alt="Signature preview" className="mt-3 max-h-16 max-w-40 object-contain" />}</div></div>

      <div><Textarea label="Default remarks / justifications" value={current.notes || ''} onChange={event => setCurrent(previous => ({ ...previous, notes: event.target.value }))} rows={5} placeholder="Optional. You can use {{effective_date}}." /><p className="mt-1 text-xs text-slate-500">The effectivity-date placeholder is replaced when the template is applied.</p></div>
    </div>
  </Modal>;
};

export default PANTemplateModal;

