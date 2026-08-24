import React from 'react';
import { Award, BusinessUnit, ResolutionStatus } from '../../types';
import Button from '../ui/Button';
import { AwardBadgeIcon, createModernAwardDesign, getAwardBrandTheme, STANDARD_AWARD_BADGES } from './AwardVisualSystem';

type Props = {
  awards: Award[];
  employeeAwards: any[];
  businessUnits: BusinessUnit[];
  canManage: boolean;
  canAssign: boolean;
  onNewPreset: () => void;
  onEditPreset: (award: Award) => void;
  onDuplicatePreset: (award: Award) => void;
  onArchivePreset: (award: Award) => void;
  onUseAward: (award: Award) => void;
  onReviewAward: (award: any) => void;
  onDownloadCertificate: (award: any) => void;
};

type StudioView = 'studio' | 'presets' | 'wall';

const MiniCertificate: React.FC<{ unit: BusinessUnit; preset?: Award; compact?: boolean }> = ({ unit, preset, compact }) => {
  const theme = getAwardBrandTheme(unit.name);
  const design = { ...createModernAwardDesign(unit.name, preset?.title), ...(preset?.design || {}) };
  const background = design.backgroundColor || theme.background;
  const color = design.textColor || theme.text;
  const accent = design.accentColor || theme.accent;
  return <div className={`relative overflow-hidden ${compact ? 'h-32' : 'h-52'} rounded-t-xl p-5`} style={{ background, color }}>
    <span className="absolute inset-y-0 left-0 w-2" style={{ background: accent }} />
    <span className="absolute -bottom-12 -right-8 h-28 w-40 rounded-full opacity-90" style={{ background: design.secondaryAccentColor || theme.primary }} />
    <div className="relative z-10 flex justify-between gap-3"><div className="whitespace-pre-line text-lg font-black leading-[.9] tracking-wide">{design.wordmarkText || theme.wordmark}</div><span className="grid h-11 w-11 place-items-center rounded-full border" style={{ borderColor: accent, color: accent }}><AwardBadgeIcon badgeKey={preset?.badgeKey || design.badgeKey} className="h-7 w-7" /></span></div>
    {!compact && <div className="relative z-10 mt-8"><p className="text-[8px] font-bold uppercase tracking-[.16em]" style={{ color: accent }}>Certificate of recognition</p><div className="mt-3 h-px w-32 opacity-50" style={{ background: color }} /><p className="mt-3 text-[9px] opacity-70">Proudly awarded to</p><div className="mt-2 h-px w-40 opacity-70" style={{ background: color }} /></div>}
  </div>;
};

const EmptyState = ({ title, message }: { title: string; message: string }) => <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center"><h3 className="font-bold text-gray-900">{title}</h3><p className="mt-1 text-sm text-gray-500">{message}</p></div>;

const AwardsStudioDashboard: React.FC<Props> = ({ awards, employeeAwards, businessUnits, canManage, canAssign, onNewPreset, onEditPreset, onDuplicatePreset, onArchivePreset, onUseAward, onReviewAward, onDownloadCertificate }) => {
  const [view, setView] = React.useState<StudioView>('studio');
  const [search, setSearch] = React.useState('');
  const [unitFilter, setUnitFilter] = React.useState('');
  const [presetStatus, setPresetStatus] = React.useState('');
  const [wallUnit, setWallUnit] = React.useState('');
  const [wallAward, setWallAward] = React.useState('');
  const [wallPeriod, setWallPeriod] = React.useState('month');
  const presets = awards.filter(award => award.isPreset);
  const readyAwards = STANDARD_AWARD_BADGES.map(definition => awards.find(award => award.presetKey === `standard-${definition.key}` || award.badgeKey === definition.key && award.isSystem && !award.isPreset) || ({ id: definition.key, title: definition.title, description: definition.description, badgeKey: definition.key, badgeIconUrl: '', isActive: true, design: createModernAwardDesign(undefined, definition.title), category: 'Core Recognition' } as Award));
  const publishedPresets = presets.filter(preset => preset.isActive && preset.status !== 'archived');

  const presetForUnit = (unit: BusinessUnit) => publishedPresets.find(preset => preset.businessUnitId === unit.id && preset.isDefault) || publishedPresets.find(preset => preset.businessUnitId === unit.id);
  const filteredPresets = presets.filter(preset => {
    const unit = businessUnits.find(item => item.id === preset.businessUnitId);
    return (!search || `${preset.title} ${unit?.name || ''}`.toLowerCase().includes(search.toLowerCase())) && (!unitFilter || preset.businessUnitId === unitFilter) && (!presetStatus || (preset.status || 'published') === presetStatus);
  });
  const wallAwards = employeeAwards.filter(item => {
    const issued = new Date(item.dateAwarded);
    const now = new Date();
    const matchesPeriod = wallPeriod !== 'month' || (issued.getMonth() === now.getMonth() && issued.getFullYear() === now.getFullYear());
    return (!wallUnit || item.businessUnitId === wallUnit) && (!wallAward || item.awardId === wallAward) && matchesPeriod;
  });
  const featured = wallAwards.filter(item => item.status === ResolutionStatus.Issued).slice(0, 6);

  const nav = <div className="mb-6 flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm">{([['studio', 'Awards Studio'], ['presets', 'Preset Library'], ['wall', 'Recognition Wall']] as const).map(([key, label]) => <button key={key} onClick={() => setView(key)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${view === key ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}>{label}</button>)}</div>;

  const badgeCards = <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">{readyAwards.map((award, index) => { const badge = STANDARD_AWARD_BADGES[index]; return <article key={badge.key} className="group flex min-h-48 flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><span className="grid h-12 w-12 place-items-center rounded-full" style={{ background: `${badge.color}15`, color: badge.color }}><AwardBadgeIcon badgeKey={badge.key} className="h-7 w-7" /></span><h3 className="mt-4 text-sm font-bold leading-5 text-gray-950">{award.title}</h3><p className="mt-2 flex-1 text-xs leading-5 text-gray-500">{award.description || badge.description}</p>{canAssign && <button onClick={() => onUseAward(award)} className="mt-4 rounded-lg border px-3 py-2 text-xs font-bold transition hover:text-white" style={{ borderColor: badge.color, color: badge.color }} onMouseEnter={event => { event.currentTarget.style.background = badge.color; event.currentTarget.style.color = '#fff'; }} onMouseLeave={event => { event.currentTarget.style.background = 'transparent'; event.currentTarget.style.color = badge.color; }}>Use award</button>}</article>})}</div>;

  return <div className="space-y-6 text-gray-950">
    {nav}
    {view === 'studio' && <>
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><h1 className="text-4xl font-black tracking-tight">Awards Studio</h1><p className="mt-2 text-gray-500">Create, manage, and celebrate great work.</p></div>{canAssign && <Button onClick={() => onUseAward(readyAwards[0])}>Give an award</Button>}</header>
      <section aria-label="Awards summary" className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border bg-white p-5 shadow-sm"><p className="text-3xl font-black text-indigo-700">{businessUnits.length}</p><p className="text-sm text-gray-500">Active business units</p></div><div className="rounded-xl border bg-white p-5 shadow-sm"><p className="text-3xl font-black text-indigo-700">{readyAwards.filter(award => award.isActive).length}</p><p className="text-sm text-gray-500">Ready-made awards</p></div><div className="rounded-xl border bg-white p-5 shadow-sm"><p className="text-3xl font-black text-indigo-700">{employeeAwards.filter(item => item.status === ResolutionStatus.Issued).length}</p><p className="text-sm text-gray-500">Awards issued</p></div></section>
      <section><div className="mb-4 flex items-center justify-between"><div><h2 className="text-xl font-bold">Business-unit presets</h2><p className="text-sm text-gray-500">One distinctive, printable award style for every team.</p></div><button onClick={() => setView('presets')} className="text-sm font-semibold text-indigo-700">View all presets →</button></div>{businessUnits.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{businessUnits.map(unit => { const preset = presetForUnit(unit); const theme = getAwardBrandTheme(unit.name); return <article key={unit.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"><MiniCertificate unit={unit} preset={preset} /><div className="p-3"><div className="flex items-center justify-between gap-2"><span className="rounded-full border px-2 py-0.5 text-[10px] font-bold" style={{ color: theme.accent, borderColor: theme.accent }}>{preset?.isDefault ? 'Default' : preset?.status || 'Draft'}</span><span className="text-[10px] text-gray-400">{preset?.updatedAt ? preset.updatedAt.toLocaleDateString() : 'Starter'}</span></div><h3 className="mt-2 truncate text-sm font-bold">{unit.name}</h3>{canManage && <div className="mt-3 grid grid-cols-3 gap-1"><button onClick={() => preset ? onEditPreset(preset) : onNewPreset()} className="rounded-lg border px-1 py-2 text-[11px] font-semibold" style={{ color: theme.primary }}>Open preset</button><button onClick={() => preset ? onEditPreset(preset) : onNewPreset()} className="rounded-lg border px-1 py-2 text-[11px] font-semibold">Edit preset</button><button onClick={() => preset && onDuplicatePreset(preset)} disabled={!preset} className="rounded-lg border px-1 py-2 text-[11px] font-semibold disabled:opacity-40">Duplicate</button></div>}</div></article>})}</div> : <EmptyState title="No active business units" message="Business-unit presets will appear automatically when units are available." />}</section>
      <section><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-bold">Ready-made awards</h2><button onClick={() => setView('wall')} className="text-sm font-semibold text-indigo-700">Open Recognition Wall →</button></div>{badgeCards}</section>
    </>}

    {view === 'presets' && <>
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><h1 className="text-4xl font-black tracking-tight">Business-unit presets</h1><p className="mt-2 text-gray-500">Search, publish, duplicate, and manage every award style.</p></div>{canManage && <Button onClick={onNewPreset}>+ New preset</Button>}</header>
      <div className="grid gap-3 rounded-xl border bg-white p-4 shadow-sm md:grid-cols-3"><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search presets" className="rounded-lg border px-3 py-2.5 text-sm" /><select value={unitFilter} onChange={event => setUnitFilter(event.target.value)} className="rounded-lg border px-3 py-2.5 text-sm"><option value="">All business units</option>{businessUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select><select value={presetStatus} onChange={event => setPresetStatus(event.target.value)} className="rounded-lg border px-3 py-2.5 text-sm"><option value="">All statuses</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select></div>
      {filteredPresets.length ? <div className="grid gap-5 lg:grid-cols-2">{filteredPresets.map(preset => { const unit = businessUnits.find(item => item.id === preset.businessUnitId) || ({ id: 'company', name: 'Company-wide' } as BusinessUnit); const theme = getAwardBrandTheme(unit.name); return <article key={preset.id} className="overflow-hidden rounded-xl border bg-white shadow-sm"><MiniCertificate unit={unit} preset={preset} /><div className="flex flex-wrap items-center gap-2 p-4"><div className="min-w-0 flex-1"><h3 className="truncate font-bold">{preset.title}</h3><p className="mt-1 text-xs text-gray-500">{unit.name} · {preset.isDefault ? 'Default preset' : 'Editable preset'} · <span className="capitalize">{preset.status || 'published'}</span></p></div>{canManage && <><button onClick={() => onEditPreset(preset)} className="rounded-lg border px-3 py-2 text-xs font-semibold" style={{ color: theme.primary }}>Edit preset</button><button onClick={() => onDuplicatePreset(preset)} className="rounded-lg border px-3 py-2 text-xs font-semibold">Duplicate</button>{preset.status !== 'archived' && <button onClick={() => onArchivePreset(preset)} className="rounded-lg px-3 py-2 text-xs font-semibold text-gray-500">Archive</button>}</>}</div></article>})}</div> : <EmptyState title="No presets found" message="Adjust the filters or create a new business-unit preset." />}
    </>}

    {view === 'wall' && <>
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="text-sm font-black tracking-wide">TNG HRIS</p><h1 className="mt-3 text-4xl font-black tracking-tight">Recognition Wall</h1><p className="mt-2 text-gray-500">Celebrate the people who make every experience memorable.</p></div><div className="flex flex-wrap gap-2"><select value={wallUnit} onChange={event => setWallUnit(event.target.value)} className="rounded-lg border bg-white px-3 py-2 text-sm"><option value="">All business units</option>{businessUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select><select value={wallAward} onChange={event => setWallAward(event.target.value)} className="rounded-lg border bg-white px-3 py-2 text-sm"><option value="">All award types</option>{readyAwards.map(award => <option key={award.id} value={award.id}>{award.title}</option>)}</select><select value={wallPeriod} onChange={event => setWallPeriod(event.target.value)} className="rounded-lg border bg-white px-3 py-2 text-sm"><option value="month">This month</option><option value="all">All time</option></select>{canAssign && <Button onClick={() => onUseAward(readyAwards[0])}>Give an award</Button>}</div></header>
      {featured.length ? <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{featured.map(item => { const theme = getAwardBrandTheme(item.businessUnitName); const template = awards.find(award => award.id === item.awardId); const initials = item.employeeName.split(/\s+/).map((part: string) => part[0]).join('').slice(0, 2); return <article key={item.id} className="relative min-h-60 overflow-hidden rounded-xl border bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-full text-sm font-black" style={{ background: `${theme.accent}18`, color: theme.primary }}>{initials}</span><div><h3 className="font-bold">{item.employeeName}</h3><p className="text-xs" style={{ color: theme.primary }}>{item.businessUnitName}</p></div><span className="ml-auto text-xs text-gray-400">{new Date(item.dateAwarded).toLocaleDateString()}</span></div><p className="mt-6 text-sm leading-6 text-gray-700">{item.notes || template?.description || 'Thank you for making every experience memorable.'}</p><div className="mt-5 flex items-center gap-2"><span className="grid h-10 w-10 place-items-center rounded-full text-white" style={{ background: theme.primary }}><AwardBadgeIcon badgeKey={template?.badgeKey} className="h-6 w-6" /></span><span className="text-xs font-bold">{item.awardTitle}</span></div></article>})}</section> : <EmptyState title="No issued recognitions yet" message="Issued awards will appear here after the approval workflow is complete." />}
      <section><h2 className="mb-4 text-xl font-bold">Ready-made awards</h2>{badgeCards}</section>
      <section><h2 className="mb-4 text-xl font-bold">Business-unit styles</h2><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{businessUnits.map(unit => <div key={unit.id} className="overflow-hidden rounded-xl border bg-white shadow-sm"><MiniCertificate compact unit={unit} preset={presetForUnit(unit)} /><p className="p-3 text-sm font-bold">{unit.name}</p></div>)}</div></section>
    </>}

    <section className="rounded-xl border border-gray-200 bg-white shadow-sm"><div className="border-b px-5 py-4"><h2 className="font-bold">Award activity</h2><p className="text-xs text-gray-500">Approval, issuance, audit, and certificate history remain in the existing workflow.</p></div><div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200 text-sm"><thead className="bg-gray-50 text-left text-xs uppercase text-gray-500"><tr><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Award</th><th className="px-4 py-3">Business unit</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Certificate</th></tr></thead><tbody className="divide-y">{employeeAwards.slice(0, 50).map(item => <tr key={item.id} onClick={() => [ResolutionStatus.PendingApproval, ResolutionStatus.Approved].includes(item.status) && onReviewAward(item)} className="hover:bg-gray-50"><td className="px-4 py-3 font-semibold">{item.employeeName}</td><td className="px-4 py-3">{item.awardTitle}</td><td className="px-4 py-3 text-gray-500">{item.businessUnitName}</td><td className="px-4 py-3 text-gray-500">{new Date(item.dateAwarded).toLocaleDateString()}</td><td className="px-4 py-3"><span className="rounded-full bg-gray-100 px-2 py-1 text-xs">{item.status}</span></td><td className="px-4 py-3">{item.status === ResolutionStatus.Issued && item.certificateSnapshotUrl ? <button onClick={event => { event.stopPropagation(); onDownloadCertificate(item); }} className="font-semibold text-indigo-700">PDF</button> : <span className="text-xs text-gray-400">In workflow</span>}</td></tr>)}{!employeeAwards.length && <tr><td colSpan={6} className="p-8 text-center text-gray-500">No award activity yet.</td></tr>}</tbody></table></div></section>
  </div>;
};

export default AwardsStudioDashboard;
