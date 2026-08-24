import React, { useMemo, useState } from 'react';
import { PANActionType, PANTemplate } from '../../types';
import Button from '../ui/Button';
import { useUsers } from '../../hooks/useHRData';
import { PAN_ACTION_TYPE_LABELS } from '../../services/panTemplateUtils';

interface PANTemplateTableProps {
  templates: PANTemplate[];
  businessUnits: Array<{ id: string; name: string }>;
  canManage: boolean;
  onEdit: (template: PANTemplate) => void;
  onDuplicate: (template: PANTemplate) => void;
  onArchive: (template: PANTemplate) => void;
  onSetDefault: (template: PANTemplate) => void;
}

const statusClass: Record<PANTemplate['status'], string> = {
  published: 'bg-emerald-100 text-emerald-700',
  draft: 'bg-amber-100 text-amber-700',
  archived: 'bg-slate-200 text-slate-700',
};

const MiniPreview = ({ template }: { template: PANTemplate }) => <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 xl:sticky xl:top-28">
  <div className="flex items-start justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Template preview</p><h3 className="mt-1 font-bold text-slate-900 dark:text-white">{template.name}</h3><p className="text-xs text-slate-500">v{template.version} · {PAN_ACTION_TYPE_LABELS[template.actionType]}</p></div><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass[template.status]}`}>{template.status}</span></div>
  <div className="mt-4 rounded border border-slate-300 bg-white p-3 text-[8px] text-slate-800 shadow-inner">
    <div className="text-center">{template.logoUrl && <img src={template.logoUrl} alt="" className="mx-auto mb-1 h-6 max-w-20 object-contain" />}<b>{template.documentTitle}</b><div className="text-[6px] text-slate-500">{template.documentCode}</div></div>
    <div className="mt-2 grid grid-cols-2 border border-slate-400"><b className="border-b border-r p-1">Employee</b><span className="border-b p-1">Employee name</span><b className="border-r p-1">Effectivity</b><span className="p-1">Date</span></div>
    <div className="mt-2 border border-slate-400"><div className="bg-slate-900 p-1 text-center font-bold text-white">ACTION TAKEN</div><div className="grid grid-cols-3"><span className="p-1">☐ Status</span><span className="p-1">☐ Transfer</span><span className="p-1">☐ Promotion</span></div></div>
    <div className="mt-2 grid grid-cols-3 border border-slate-400"><b className="p-1">PARTICULARS</b><b className="border-x p-1 text-center">FROM</b><b className="p-1 text-center">TO</b>{['Employment status', 'Department', 'Position', 'Business unit', 'Salary package'].map(label => <React.Fragment key={label}><span className="border-t p-1">{label}</span><span className="border-l border-t p-1">Current</span><span className="border-l border-t p-1">New / Same</span></React.Fragment>)}</div>
    <div className="mt-2 grid grid-cols-3 border border-slate-400 text-center"><span className="p-2">Prepared by</span><span className="border-x p-2">Endorsed / Approved by</span><span className="p-2">Received by</span></div>
  </div>
  <div className="mt-4 space-y-2"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Template fields</p>{[...(template.sections || [])].sort((a, b) => a.order - b.order).map(section => <div key={section.key} className="flex items-center justify-between rounded border border-slate-200 px-3 py-2 text-xs dark:border-slate-700"><span>{section.label}</span><span className={section.visible ? 'text-emerald-600' : 'text-slate-400'}>{section.visible ? 'Shown' : 'Hidden'}</span></div>)}</div>
</aside>;

const PANTemplateTable: React.FC<PANTemplateTableProps> = ({ templates, businessUnits, canManage, onEdit, onDuplicate, onArchive, onSetDefault }) => {
  const { users } = useUsers();
  const [businessUnit, setBusinessUnit] = useState('all');
  const [actionType, setActionType] = useState('all');
  const [status, setStatus] = useState('active');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(templates[0]?.id || '');

  const filtered = useMemo(() => templates.filter(template => {
    const unitMatch = businessUnit === 'all' || (businessUnit === 'global' ? !template.businessUnitId : template.businessUnitId === businessUnit);
    const actionMatch = actionType === 'all' || template.actionType === actionType;
    const statusMatch = status === 'all' || (status === 'active' ? template.status !== 'archived' : template.status === status);
    const searchMatch = !search || template.name.toLowerCase().includes(search.toLowerCase());
    return unitMatch && actionMatch && statusMatch && searchMatch;
  }), [templates, businessUnit, actionType, status, search]);
  const selected = templates.find(template => template.id === selectedId) || filtered[0] || templates[0];

  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
    <div className="space-y-4">
      <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-200"><b>Templates can be customized per business unit.</b> One published template can be the default for each business-unit and action-type combination. Existing PANs keep their original version snapshot.</div>
      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4 dark:border-slate-700 dark:bg-slate-900">
        <input aria-label="Search templates" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search templates..." className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" />
        <select aria-label="Business unit" value={businessUnit} onChange={event => setBusinessUnit(event.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"><option value="all">All business units</option><option value="global">Global templates</option>{businessUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select>
        <select aria-label="Action type" value={actionType} onChange={event => setActionType(event.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"><option value="all">All action types</option>{Object.entries(PAN_ACTION_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select aria-label="Template status" value={status} onChange={event => setStatus(event.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"><option value="active">Published and drafts</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option><option value="all">All statuses</option></select>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"><div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700"><thead className="bg-slate-50 dark:bg-slate-800"><tr>{['Template', 'Scope', 'Status', 'Last updated', 'Actions'].map(heading => <th key={heading} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{heading}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{filtered.map(template => <tr key={template.id} onClick={() => setSelectedId(template.id)} className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 ${selected?.id === template.id ? 'bg-indigo-50/70 dark:bg-indigo-950/20' : ''}`}><td className="px-4 py-4 text-sm"><div className="font-semibold text-slate-900 dark:text-white">{template.name}{template.isDefault && <span className="ml-2 rounded-full bg-indigo-100 px-2 py-1 text-xs text-indigo-700">Default</span>}</div><div className="mt-1 text-xs text-slate-500">{PAN_ACTION_TYPE_LABELS[template.actionType]} · v{template.version}</div></td><td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">{template.businessUnitName || 'Global'}</td><td className="px-4 py-4"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass[template.status]}`}>{template.status}</span></td><td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300"><div>{new Date(template.updatedAt).toLocaleDateString()}</div><div className="text-xs text-slate-400">{users.find(user => user.id === (template.updatedByUserId || template.createdByUserId))?.name || 'N/A'}</div></td><td className="px-4 py-4"><div className="flex flex-wrap gap-1"><Button size="sm" variant="secondary" onClick={event => { event.stopPropagation(); setSelectedId(template.id); }}>Preview</Button>{canManage && <><Button size="sm" variant="secondary" onClick={event => { event.stopPropagation(); onEdit(template); }}>Edit</Button><Button size="sm" variant="secondary" onClick={event => { event.stopPropagation(); onDuplicate(template); }}>Duplicate</Button>{!template.isDefault && template.status === 'published' && <Button size="sm" variant="secondary" onClick={event => { event.stopPropagation(); onSetDefault(template); }}>Set default</Button>}{template.status !== 'archived' && <Button size="sm" variant="danger" onClick={event => { event.stopPropagation(); onArchive(template); }}>Archive</Button>}</>}</div></td></tr>)}{!filtered.length && <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-500">No templates match these filters.</td></tr>}</tbody></table></div></div>
    </div>
    {selected && <MiniPreview template={selected} />}
  </div>;
};

export default PANTemplateTable;
