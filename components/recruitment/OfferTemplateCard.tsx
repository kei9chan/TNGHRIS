import React from 'react';
import { OfferTemplate } from '../../types';
import Button from '../ui/Button';
import { mergeAppearance } from './offerBranding';

interface Props {
  template: OfferTemplate;
  selected?: boolean;
  canManage?: boolean;
  onEdit?: () => void;
  onUse?: () => void;
  onDuplicate?: () => void;
  onArchive?: () => void;
}

const OfferTemplateCard: React.FC<Props> = ({ template, selected, canManage, onEdit, onUse, onDuplicate, onArchive }) => {
  const theme = mergeAppearance(template.businessUnit, template.templateData.appearance);
  return <article className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:bg-slate-900 ${selected ? 'ring-2 ring-violet-600' : 'border-slate-200 dark:border-slate-700'}`}>
    <div className="relative h-44 overflow-hidden p-6" style={{ background: template.headerImageUrl ? `linear-gradient(90deg,${theme.primaryColor}E6,${theme.primaryColor}B0),url(${template.headerImageUrl}) center/cover` : theme.pageBackgroundColor, color: theme.textColor }}>
      <div className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundColor: theme.accentColor }}/>
      {template.logoUrl ? <img src={template.logoUrl} alt="" className="h-10 max-w-[150px] object-contain object-left"/> : <p className="text-xs font-black uppercase tracking-[.18em]" style={{ color: theme.primaryColor }}>{template.businessUnit}</p>}
      <p className="mt-5 text-xs font-bold uppercase tracking-widest" style={{ color: theme.accentColor }}>Employment Offer</p>
      <h3 className="mt-1 line-clamp-2 text-2xl font-black" style={{ color: theme.primaryColor }}>{template.templateData.jobTitle || template.category}</h3>
      <div className="mt-4 h-1 w-24 rounded-full" style={{ backgroundColor: theme.accentColor }}/>
    </div>
    <div className="p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-slate-900 dark:text-white">{template.name}</h3><p className="mt-1 text-sm text-slate-500">{template.businessUnit} · {template.category}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${template.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : template.status === 'Archived' ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-700'}`}>{template.status}</span></div>
      <p className="mt-3 text-xs text-slate-400">Updated {template.updatedAt.getTime() ? template.updatedAt.toLocaleDateString('en-PH') : 'Starter template'}</p>
      <div className="mt-5 grid grid-cols-2 gap-2">{canManage && onEdit && <Button variant="secondary" onClick={onEdit}>Edit</Button>}{onUse && <Button onClick={onUse}>Use Template</Button>}{canManage && onDuplicate && <button onClick={onDuplicate} className="rounded-xl border px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Duplicate</button>}{canManage && onArchive && template.status !== 'Archived' && <button onClick={onArchive} className="rounded-xl border border-amber-300 px-3 py-2 text-sm font-semibold text-amber-700">Archive</button>}</div>
    </div>
  </article>;
};

export default OfferTemplateCard;

