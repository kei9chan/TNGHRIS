import React, { useEffect, useMemo, useState } from 'react';
import { BusinessUnit, COEPurpose, COERequestStatus, COETemplate, COETemplateStatus } from '../../types';
import {
  applyCoePreset,
  COE_PLACEHOLDERS,
  COE_SAMPLE_EMPLOYEE,
  COE_TEMPLATE_PRESETS,
  DEFAULT_COE_LAYOUT,
  validateCoePlaceholders,
} from '../../services/coeDocument';
import Button from '../ui/Button';
import FileUploader from '../ui/FileUploader';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import RichTextEditor from '../ui/RichTextEditor';
import COEDocumentPreview from './COEDocumentPreview';

interface COETemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (template: COETemplate) => void | Promise<void>;
  template: COETemplate | null;
  businessUnits: BusinessUnit[];
  brandTemplates?: COETemplate[];
}

const normalizeBody = (value?: string | null) => {
  if (!value?.trim()) return '';
  if (value.includes('<') && value.includes('>')) return value;
  return `<p>${value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br />')}</p>`;
};

const readAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('The selected image could not be read.'));
  reader.readAsDataURL(file);
});

const COETemplateModal: React.FC<COETemplateModalProps> = ({
  isOpen,
  onClose,
  onSave,
  template,
  businessUnits,
  brandTemplates = [],
}) => {
  const [current, setCurrent] = useState<Partial<COETemplate>>({});
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [savingStatus, setSavingStatus] = useState<COETemplateStatus | null>(null);

  const selectedBusinessUnit = useMemo(
    () => businessUnits.find(unit => unit.id === current.businessUnitId),
    [businessUnits, current.businessUnitId],
  );
  const unsupportedPlaceholders = useMemo(
    () => validateCoePlaceholders(current.body || ''),
    [current.body],
  );

  useEffect(() => {
    if (!isOpen) return;
    const firstBusinessUnit = businessUnits[0];
    if (template) {
      setCurrent({
        ...template,
        body: normalizeBody(template.body),
        documentTitle: template.documentTitle || 'Certificate of Employment',
        name: template.name || 'Certificate of Employment',
        styleKey: template.styleKey || 'classic-corporate',
        primaryColor: template.primaryColor || firstBusinessUnit?.color || '#1e3a8a',
        accentColor: template.accentColor || '#64748b',
        fontFamily: template.fontFamily || 'Times New Roman',
        layoutSettings: { ...DEFAULT_COE_LAYOUT, ...(template.layoutSettings || {}) },
        status: template.status || (template.isActive ? 'Published' : 'Draft'),
      });
    } else {
      const brandSource = brandTemplates.find(item => item.businessUnitId === firstBusinessUnit?.id);
      setCurrent(applyCoePreset({
        id: '',
        businessUnitId: firstBusinessUnit?.id || '',
        businessUnitName: firstBusinessUnit?.name,
        logoUrl: brandSource?.logoUrl,
        address: brandSource?.address || firstBusinessUnit?.address || '',
        signatoryName: brandSource?.signatoryName || '',
        signatoryPosition: brandSource?.signatoryPosition || '',
        signatureUrl: brandSource?.signatureUrl,
        footerText: `${firstBusinessUnit?.name || 'TNG'} · Official Certificate of Employment`,
        status: 'Draft',
        isActive: false,
      }, 'classic-corporate', firstBusinessUnit?.color || brandSource?.primaryColor));
    }
    setMode('edit');
    setSavingStatus(null);
  }, [isOpen, template, businessUnits, brandTemplates]);

  const updateBusinessUnit = (businessUnitId: string) => {
    const unit = businessUnits.find(item => item.id === businessUnitId);
    const brandSource = brandTemplates.find(item => item.businessUnitId === businessUnitId && item.logoUrl)
      || brandTemplates.find(item => item.businessUnitId === businessUnitId);
    setCurrent(previous => ({
      ...previous,
      businessUnitId,
      businessUnitName: unit?.name,
      primaryColor: unit?.color || brandSource?.primaryColor || previous.primaryColor,
      accentColor: brandSource?.accentColor || previous.accentColor,
      logoUrl: brandSource?.logoUrl || previous.logoUrl,
      address: brandSource?.address || unit?.address || previous.address || '',
      signatoryName: brandSource?.signatoryName || previous.signatoryName || '',
      signatoryPosition: brandSource?.signatoryPosition || previous.signatoryPosition || '',
      signatureUrl: brandSource?.signatureUrl || previous.signatureUrl,
      footerText: previous.footerText || `${unit?.name || 'TNG'} · Official Certificate of Employment`,
    }));
  };

  const handleImage = async (field: 'logoUrl' | 'signatureUrl', file: File) => {
    try {
      const value = await readAsDataUrl(file);
      setCurrent(previous => ({ ...previous, [field]: value }));
    } catch (error: any) {
      alert(error?.message || 'The image could not be loaded.');
    }
  };

  const updateLayout = (field: string, value: string) => {
    setCurrent(previous => ({
      ...previous,
      layoutSettings: {
        ...DEFAULT_COE_LAYOUT,
        ...(previous.layoutSettings || {}),
        [field]: ['textAlignment', 'logoAlignment'].includes(field) ? value : Number(value),
      },
    }));
  };

  const insertPlaceholder = (placeholder: string) => {
    setCurrent(previous => ({
      ...previous,
      body: `${previous.body || ''}<p>${placeholder}</p>`,
    }));
  };

  const choosePreset = (presetKey: COETemplate['styleKey']) => {
    if (!presetKey) return;
    setCurrent(previous => applyCoePreset(previous, presetKey, selectedBusinessUnit?.color));
  };

  const handleSave = async (status: COETemplateStatus) => {
    if (!current.businessUnitId || !current.body?.trim() || !current.signatoryName?.trim()) {
      alert('Business unit, certificate body, and signatory name are required.');
      return;
    }
    if (unsupportedPlaceholders.length) {
      alert(`Correct unsupported placeholders before saving: ${unsupportedPlaceholders.join(', ')}`);
      return;
    }
    setSavingStatus(status);
    try {
      await onSave({
        ...(current as COETemplate),
        id: current.id || '',
        businessUnitName: selectedBusinessUnit?.name,
        status,
        isActive: status === 'Published',
        layoutSettings: { ...DEFAULT_COE_LAYOUT, ...(current.layoutSettings || {}) },
      });
    } finally {
      setSavingStatus(null);
    }
  };

  const sampleEmployee = {
    ...COE_SAMPLE_EMPLOYEE,
    businessUnit: selectedBusinessUnit?.name || 'Selected Business Unit',
    businessUnitId: selectedBusinessUnit?.id || '',
  };
  const sampleRequest = {
    id: 'SAMPLE-COE-PREVIEW',
    employeeId: sampleEmployee.id,
    employeeName: sampleEmployee.name,
    employeePosition: sampleEmployee.position,
    businessUnitId: sampleEmployee.businessUnitId,
    purpose: COEPurpose.LoanApplication,
    dateRequested: new Date(),
    status: COERequestStatus.Approved,
    approvedAt: new Date(),
    documentVersion: 1,
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={template ? `Edit COE Template · ${template.name || 'Untitled'}` : 'Create COE Template'}
      size="5xl"
      footer={(
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" onClick={() => handleSave('Draft')} isLoading={savingStatus === 'Draft'}>
            Save Draft
          </Button>
          <Button onClick={() => handleSave('Published')} isLoading={savingStatus === 'Published'}>
            Publish &amp; Activate
          </Button>
        </div>
      )}
    >
      <div className="sticky top-0 z-10 -mx-1 flex gap-2 bg-white pb-3 dark:bg-slate-800">
        <button
          type="button"
          className={`rounded-md px-4 py-2 text-sm font-semibold ${mode === 'edit' ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'}`}
          onClick={() => setMode('edit')}
        >
          Edit
        </button>
        <button
          type="button"
          className={`rounded-md px-4 py-2 text-sm font-semibold ${mode === 'preview' ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'}`}
          onClick={() => setMode('preview')}
        >
          Live Preview
        </button>
        {unsupportedPlaceholders.length > 0 && (
          <span className="ml-auto self-center text-sm font-medium text-red-600">
            {unsupportedPlaceholders.length} unsupported placeholder{unsupportedPlaceholders.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {mode === 'preview' ? (
        <div className="overflow-auto rounded-lg bg-slate-200 p-4 dark:bg-slate-900">
          <div className="mx-auto w-max origin-top scale-[0.82] sm:scale-90 lg:scale-100">
            <COEDocumentPreview
              template={{ ...(current as COETemplate), businessUnitName: selectedBusinessUnit?.name }}
              request={sampleRequest}
              employee={sampleEmployee}
              showSystemFooter={false}
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.6fr)]">
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Unit *</label>
              <select
                value={current.businessUnitId || ''}
                onChange={event => updateBusinessUnit(event.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              >
                {businessUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
              </select>
              <p className="mt-1 text-xs text-slate-500">Brand assets are sourced only from this business unit.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Template Preset</label>
              <select
                value={current.styleKey || 'classic-corporate'}
                onChange={event => choosePreset(event.target.value as COETemplate['styleKey'])}
                className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              >
                {COE_TEMPLATE_PRESETS.map(preset => <option key={preset.key} value={preset.key}>{preset.name}</option>)}
              </select>
              <p className="mt-1 text-xs text-slate-500">{COE_TEMPLATE_PRESETS.find(item => item.key === current.styleKey)?.description}</p>
            </div>

            <Input label="Template Name *" value={current.name || ''} onChange={event => setCurrent(previous => ({ ...previous, name: event.target.value }))} />
            <Input label="Document Title *" value={current.documentTitle || ''} onChange={event => setCurrent(previous => ({ ...previous, documentTitle: event.target.value }))} />
            <Input label="Business Address" value={current.address || ''} onChange={event => setCurrent(previous => ({ ...previous, address: event.target.value }))} />

            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">Business-Unit Logo</label>
              <FileUploader
                inputId="coe-logo-upload"
                onFileUpload={file => handleImage('logoUrl', file)}
                onFileRemove={() => setCurrent(previous => ({ ...previous, logoUrl: undefined }))}
                existingFileUrl={current.logoUrl}
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                allowedMimeTypes={['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']}
                allowedExtensions={['.png', '.jpg', '.jpeg', '.webp', '.svg']}
              />
            </div>

            <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-700">
              <h4 className="font-semibold text-gray-900 dark:text-white">Signatory</h4>
              <Input label="Name *" value={current.signatoryName || ''} onChange={event => setCurrent(previous => ({ ...previous, signatoryName: event.target.value }))} />
              <Input label="Position" value={current.signatoryPosition || ''} onChange={event => setCurrent(previous => ({ ...previous, signatoryPosition: event.target.value }))} />
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Signature Image</label>
              <FileUploader
                inputId="coe-signature-upload"
                onFileUpload={file => handleImage('signatureUrl', file)}
                onFileRemove={() => setCurrent(previous => ({ ...previous, signatureUrl: undefined }))}
                existingFileUrl={current.signatureUrl}
                accept="image/png,image/jpeg,image/webp"
                allowedMimeTypes={['image/png', 'image/jpeg', 'image/webp']}
                allowedExtensions={['.png', '.jpg', '.jpeg', '.webp']}
              />
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/20">
              <p className="mb-2 text-sm font-bold text-blue-900 dark:text-blue-200">Supported placeholders</p>
              <div className="flex flex-wrap gap-2">
                {COE_PLACEHOLDERS.map(placeholder => (
                  <button
                    key={placeholder}
                    type="button"
                    onClick={() => insertPlaceholder(placeholder)}
                    className="rounded border border-blue-200 bg-white px-2 py-1 font-mono text-xs text-blue-900 hover:bg-blue-100 dark:border-blue-700 dark:bg-slate-800 dark:text-blue-200"
                    title="Insert at the end of the document"
                  >
                    {placeholder}
                  </button>
                ))}
              </div>
              {unsupportedPlaceholders.length > 0 && (
                <div className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">
                  Correct or remove: {unsupportedPlaceholders.map(value => `{{${value}}}`).join(', ')}
                </div>
              )}
            </div>

            <RichTextEditor
              key={current.id || `${current.businessUnitId}-${current.styleKey}`}
              label="Certificate Body *"
              value={current.body || ''}
              onChange={body => setCurrent(previous => ({ ...previous, body }))}
              rows={16}
            />

            <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
              <h4 className="mb-3 font-semibold text-gray-900 dark:text-white">Document Styling</h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Input label="Primary Color" type="color" value={current.primaryColor || '#1e3a8a'} onChange={event => setCurrent(previous => ({ ...previous, primaryColor: event.target.value }))} />
                <Input label="Accent Color" type="color" value={current.accentColor || '#64748b'} onChange={event => setCurrent(previous => ({ ...previous, accentColor: event.target.value }))} />
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Font Family</label>
                  <select value={current.fontFamily || 'Times New Roman'} onChange={event => setCurrent(previous => ({ ...previous, fontFamily: event.target.value }))} className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-8 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white">
                    {['Times New Roman', 'Arial', 'Georgia', 'Helvetica', 'Verdana'].map(font => <option key={font}>{font}</option>)}
                  </select>
                </div>
                {(['marginTopMm', 'marginRightMm', 'marginBottomMm', 'marginLeftMm'] as const).map(field => (
                  <Input
                    key={field}
                    label={field.replace('margin', 'Margin ').replace('Mm', ' (mm)')}
                    type="number"
                    min={8}
                    max={40}
                    value={current.layoutSettings?.[field] ?? DEFAULT_COE_LAYOUT[field]}
                    onChange={event => updateLayout(field, event.target.value)}
                  />
                ))}
                <Input label="Line Height" type="number" min={1} max={2.5} step={0.05} value={current.layoutSettings?.lineHeight ?? DEFAULT_COE_LAYOUT.lineHeight} onChange={event => updateLayout('lineHeight', event.target.value)} />
                <Input label="Logo Height (mm)" type="number" min={10} max={45} value={current.layoutSettings?.logoHeightMm ?? DEFAULT_COE_LAYOUT.logoHeightMm} onChange={event => updateLayout('logoHeightMm', event.target.value)} />
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Body Alignment</label>
                  <select value={current.layoutSettings?.textAlignment || 'justify'} onChange={event => updateLayout('textAlignment', event.target.value)} className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-8 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white">
                    {['left', 'center', 'right', 'justify'].map(value => <option key={value} value={value}>{value}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Logo Alignment</label>
                  <select value={current.layoutSettings?.logoAlignment || 'center'} onChange={event => updateLayout('logoAlignment', event.target.value)} className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-8 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white">
                    {['left', 'center', 'right'].map(value => <option key={value} value={value}>{value}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <Input label="Footer Text" value={current.footerText || ''} onChange={event => setCurrent(previous => ({ ...previous, footerText: event.target.value }))} />
          </div>
        </div>
      )}
    </Modal>
  );
};

export default COETemplateModal;
