import React from 'react';
import { Award, BusinessUnit } from '../../types';
import Button from '../ui/Button';
import CertificateRenderer, { renderAwardTemplateText } from './CertificateRenderer';
import { AwardBadgeIcon, createModernAwardDesign, getAwardBrandTheme, STANDARD_AWARD_BADGES } from './AwardVisualSystem';
import { uploadTemplateAsset } from '../../services/awardService';

type Props = {
  award: Award | null;
  businessUnits: BusinessUnit[];
  currentUserId?: string;
  isDuplicate?: boolean;
  onBack: () => void;
  onSave: (award: Award) => Promise<void> | void;
};

const fieldClass = 'mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100';
const labelClass = 'block text-sm font-semibold text-gray-700';
const safeTokens = ['{employee_name}', '{award_title}', '{business_unit}', '{award_reason}', '{award_date}', '{signatory_name}', '{signatory_title}'];

const AwardPresetBuilderPage: React.FC<Props> = ({ award, businessUnits, currentUserId, isDuplicate, onBack, onSave }) => {
  const initialBusinessUnit = businessUnits.find(unit => unit.id === award?.businessUnitId) || businessUnits[0];
  const [draft, setDraft] = React.useState<Award>(() => {
    const design = { ...createModernAwardDesign(initialBusinessUnit?.name, award?.title), ...(award?.design || {}), layoutVersion: 'modern-v2' as const };
    return {
      id: isDuplicate ? '' : award?.id || '',
      title: isDuplicate ? `${award?.title || design.headerText} (Copy)` : award?.title || design.headerText,
      description: award?.description || 'Recognizes an outstanding contribution and memorable service.',
      badgeIconUrl: award?.badgeIconUrl || '',
      isActive: award?.isActive ?? true,
      businessUnitId: award?.businessUnitId || businessUnits[0]?.id,
      category: award?.category || 'Employee Recognition',
      awardValueLabel: award?.awardValueLabel,
      isDefault: isDuplicate ? false : award?.isDefault || false,
      isPreset: true,
      presetKey: isDuplicate ? undefined : award?.presetKey,
      badgeKey: award?.badgeKey || design.badgeKey,
      status: award?.status || 'draft',
      sortOrder: award?.sortOrder || 0,
      isSystem: award?.isSystem || false,
      design,
    };
  });
  const [tab, setTab] = React.useState<'branding' | 'content' | 'signatories' | 'rules'>('branding');
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [message, setMessage] = React.useState('');

  const patchDesign = (patch: Partial<typeof draft.design>) => setDraft(current => ({ ...current, design: { ...current.design, ...patch } }));
  const selectedUnit = businessUnits.find(unit => unit.id === draft.businessUnitId);
  const accent = draft.design.accentColor || '#e11d48';

  const changeBusinessUnit = (id: string) => {
    const unit = businessUnits.find(item => item.id === id);
    const themed = createModernAwardDesign(unit?.name, draft.title);
    setDraft(current => ({ ...current, businessUnitId: id || undefined, design: { ...current.design, ...themed, headerText: current.design.headerText || current.title } }));
  };

  const validate = () => {
    if (!draft.title.trim()) return 'Preset name is required.';
    if (!draft.businessUnitId) return 'Select a business unit.';
    if (!draft.design.headerText?.trim()) return 'Award title is required.';
    if (!draft.design.backgroundColor || !draft.design.accentColor) return 'Choose printable background and accent colors.';
    const sample = renderAwardTemplateText(draft.design.bodyText || '', {
      employeeName: 'Sample Employee', awardTitle: draft.title, businessUnit: selectedUnit?.name, citation: 'creating a memorable guest experience', date: new Date(), issuerName: 'Alex Morgan', issuerTitle: 'HR Manager',
    });
    if (sample.includes('\\n') || sample.length > 550) return 'Certificate message contains invalid line breaks or is too long for print.';
    return '';
  };

  const save = async (status: 'draft' | 'published') => {
    const error = validate();
    if (error) { setMessage(error); return; }
    setSaving(true);
    setMessage('');
    try {
      await onSave({ ...draft, status, isActive: status === 'published', design: { ...draft.design, bodyText: (draft.design.bodyText || '').replace(/\\n/g, '\n'), badgeKey: draft.badgeKey } });
    } finally { setSaving(false); }
  };

  const uploadLogo = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadTemplateAsset(file, currentUserId);
      patchDesign({ logoUrl: result.signedUrl });
    } catch (error) { setMessage((error as Error).message); } finally { setUploading(false); }
  };

  return (
    <div className="-m-4 min-h-screen bg-[#f7f7f8] text-gray-950 sm:-m-6 lg:-m-8">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-4 bg-[#111318] px-5 py-4 text-white lg:px-8">
        <button onClick={onBack} className="rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10" aria-label="Back to Awards Studio">← Back</button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-gray-400">Awards / Business-unit presets / {selectedUnit?.name || 'New preset'}</p>
          <div className="mt-1 flex items-center gap-3"><h1 className="truncate text-lg font-bold">{draft.title || 'Untitled preset'}</h1><span className="rounded-full bg-white/10 px-2.5 py-1 text-xs capitalize">{draft.status}</span></div>
        </div>
        <div className="flex gap-2"><Button variant="secondary" onClick={() => document.querySelector('[data-certificate-page]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>Preview</Button><Button variant="secondary" isLoading={saving} onClick={() => save('draft')}>Save draft</Button><Button className="bg-rose-600 hover:bg-rose-700" isLoading={saving} onClick={() => save('published')}>Publish preset</Button></div>
      </header>

      <div className="grid gap-5 p-4 lg:grid-cols-[320px_minmax(520px,1fr)_330px] lg:p-6">
        <aside className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-6 flex gap-1 overflow-x-auto border-b">
            {(['branding', 'content', 'signatories', 'rules'] as const).map(item => <button key={item} onClick={() => setTab(item)} className={`border-b-2 px-2 py-3 text-sm capitalize ${tab === item ? 'border-rose-500 font-semibold text-gray-950' : 'border-transparent text-gray-500'}`}>{item}</button>)}
          </div>
          {message && <div className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700" role="alert">{message}</div>}
          {tab === 'branding' && <div className="space-y-5">
            <label className={labelClass}>Preset name<input className={fieldClass} value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} /></label>
            <label className={labelClass}>Award title<input className={fieldClass} maxLength={60} value={draft.design.headerText} onChange={event => patchDesign({ headerText: event.target.value })} /></label>
            <label className={labelClass}>Business unit<select className={fieldClass} value={draft.businessUnitId || ''} onChange={event => changeBusinessUnit(event.target.value)}><option value="">Select business unit</option>{businessUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
            <label className={labelClass}>Logo or wordmark<input type="file" accept="image/png,image/jpeg,image/svg+xml" disabled={uploading} className="mt-2 block w-full text-xs" onChange={event => uploadLogo(event.target.files?.[0])} /></label>
            <label className={labelClass}>Wordmark text<textarea className={fieldClass} rows={2} value={draft.design.wordmarkText || ''} onChange={event => patchDesign({ wordmarkText: event.target.value })} /></label>
            <div className="grid grid-cols-2 gap-3"><label className={labelClass}>Accent color<input type="color" className="mt-2 h-11 w-full rounded border" value={draft.design.accentColor || '#e11d48'} onChange={event => patchDesign({ accentColor: event.target.value })} /></label><label className={labelClass}>Background<input type="color" className="mt-2 h-11 w-full rounded border" value={draft.design.backgroundColor} onChange={event => patchDesign({ backgroundColor: event.target.value })} /></label></div>
            <label className={labelClass}>Typography style<select className={fieldClass} value={draft.design.fontFamily} onChange={event => patchDesign({ fontFamily: event.target.value })}><option value="Inter, ui-sans-serif, system-ui, sans-serif">Modern Sans</option><option value="Arial, sans-serif">Clean Grotesk</option><option value="'Trebuchet MS', sans-serif">Friendly Sans</option></select></label>
            <fieldset><legend className={labelClass}>Orientation</legend><div className="mt-2 grid grid-cols-2 gap-2">{(['portrait', 'landscape'] as const).map(value => <button key={value} onClick={() => patchDesign({ orientation: value })} className={`rounded-lg border p-3 text-sm capitalize ${draft.design.orientation === value ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-gray-200'}`}>{value}</button>)}</div></fieldset>
            <fieldset><legend className={labelClass}>Badge style</legend><div className="mt-2 grid grid-cols-3 gap-2">{(['outline', 'filled', 'minimal'] as const).map(value => <button key={value} onClick={() => patchDesign({ badgeStyle: value })} className={`rounded-lg border p-2 text-xs capitalize ${draft.design.badgeStyle === value ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-gray-200'}`}>{value}</button>)}</div></fieldset>
          </div>}
          {tab === 'content' && <div className="space-y-5"><label className={labelClass}>Short description<textarea className={fieldClass} rows={3} value={draft.description} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} /></label><label className={labelClass}>Certificate message<textarea className={fieldClass} rows={7} value={draft.design.bodyText} onChange={event => patchDesign({ bodyText: event.target.value })} /></label><div><p className={labelClass}>Safe tokens</p><div className="mt-2 flex flex-wrap gap-1">{safeTokens.map(token => <button key={token} onClick={() => patchDesign({ bodyText: `${draft.design.bodyText || ''} ${token}`.trim() })} className="rounded bg-gray-100 px-2 py-1 font-mono text-[11px] text-gray-600">{token}</button>)}</div></div><label className={labelClass}>Award value / recognition<input className={fieldClass} value={draft.awardValueLabel || ''} onChange={event => setDraft(current => ({ ...current, awardValueLabel: event.target.value }))} /></label></div>}
          {tab === 'signatories' && <div className="space-y-4">{(draft.design.signatories || []).map((signatory, index) => <div key={index} className="rounded-lg border p-3"><label className={labelClass}>Name<input className={fieldClass} value={signatory.name} onChange={event => patchDesign({ signatories: draft.design.signatories.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) })} /></label><label className={`${labelClass} mt-3`}>Title<input className={fieldClass} value={signatory.title} onChange={event => patchDesign({ signatories: draft.design.signatories.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item) })} /></label></div>)}</div>}
          {tab === 'rules' && <div className="space-y-5"><label className={labelClass}>Category<input className={fieldClass} value={draft.category || ''} onChange={event => setDraft(current => ({ ...current, category: event.target.value }))} /></label><label className="flex items-center justify-between gap-4 text-sm font-semibold"><span>Active preset</span><input type="checkbox" checked={draft.isActive} onChange={event => setDraft(current => ({ ...current, isActive: event.target.checked }))} /></label><p className="rounded-lg bg-indigo-50 p-3 text-xs leading-5 text-indigo-800">Only authorized administrators and HR managers can publish, duplicate, archive, or set business-unit defaults.</p></div>}
          <div className="mt-7 border-t pt-5"><div className="flex items-center gap-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800"><span aria-hidden="true">◌</span><span>Changes apply to new awards only.</span></div><label className="mt-5 flex items-center justify-between gap-4 text-sm font-semibold"><span>Save as business-unit default</span><input type="checkbox" checked={!!draft.isDefault} onChange={event => setDraft(current => ({ ...current, isDefault: event.target.checked }))} /></label></div>
        </aside>

        <main className="min-w-0 rounded-xl border border-gray-200 bg-[#ececef] p-4 shadow-inner lg:p-8">
          <div className="mx-auto w-full overflow-auto"><div className="mx-auto w-max origin-top scale-[.54] sm:scale-[.64] xl:scale-[.72]" style={{ marginBottom: draft.design.orientation === 'landscape' ? -255 : -400 }}><CertificateRenderer design={draft.design} data={{ employeeName: 'Employee name', awardTitle: draft.design.headerText || draft.title, businessUnit: selectedUnit?.name, citation: 'creating memorable moments and lifting the team.', date: new Date(), issuerName: draft.design.signatories?.[0]?.name, issuerTitle: draft.design.signatories?.[0]?.title, awardValue: draft.awardValueLabel }} /></div></div>
          <p className="mt-4 text-center text-xs text-gray-500">A4 {draft.design.orientation || 'portrait'} · preview and PDF use the same renderer</p>
        </main>

        <aside className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold">Ready-made award badges</h2><p className="mt-1 text-sm text-gray-500">Select a minimalist badge for the certificate.</p><div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-1 xl:grid-cols-2">{STANDARD_AWARD_BADGES.map(badge => { const selected = draft.badgeKey === badge.key; return <button key={badge.key} onClick={() => setDraft(current => ({ ...current, badgeKey: badge.key, design: { ...current.design, badgeKey: badge.key } }))} className={`flex min-h-28 flex-col items-start rounded-xl border p-3 text-left transition ${selected ? 'border-current bg-gray-50 ring-2 ring-current/10' : 'border-gray-200 hover:border-gray-400'}`} style={{ color: selected ? accent : '#374151' }}><span className={`grid h-11 w-11 place-items-center rounded-full ${selected ? 'bg-white' : 'bg-gray-50'}`}><AwardBadgeIcon badgeKey={badge.key} className="h-7 w-7" /></span><span className="mt-3 text-xs font-semibold leading-4">{badge.title}</span></button>})}</div></aside>
      </div>
    </div>
  );
};

export default AwardPresetBuilderPage;
