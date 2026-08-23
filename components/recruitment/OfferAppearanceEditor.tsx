import React from 'react';
import { BusinessUnit, OfferAppearance } from '../../types';
import { appearanceForBusinessUnit, mergeAppearance } from './offerBranding';

const inputClass = 'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100';

interface Props {
  businessUnit: string;
  businessUnits: BusinessUnit[];
  appearance?: OfferAppearance;
  logoUrl?: string;
  backgroundBusy?: boolean;
  onBusinessUnitChange: (name: string, appearance: OfferAppearance) => void;
  onChange: (appearance: OfferAppearance) => void;
  onBackgroundUpload: (file?: File) => void;
  onRemoveBackground: () => void;
}

const ColorField: React.FC<{ label: string; value: string; onChange: (value: string) => void }> = ({ label, value, onChange }) => <label className="text-sm font-semibold text-slate-700"><span>{label}</span><span className="mt-1 flex items-center gap-2 rounded-xl border border-slate-300 bg-white p-2"><input type="color" value={value} onChange={event => onChange(event.target.value)} className="h-8 w-10 cursor-pointer border-0 bg-transparent"/><input value={value.toUpperCase()} onChange={event => /^#[0-9a-f]{0,6}$/i.test(event.target.value) && onChange(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm uppercase outline-none"/></span></label>;

const OfferAppearanceEditor: React.FC<Props> = ({ businessUnit, businessUnits, appearance, logoUrl, backgroundBusy, onBusinessUnitChange, onChange, onBackgroundUpload, onRemoveBackground }) => {
  const value = mergeAppearance(businessUnit, appearance);
  const patch = (changes: Partial<OfferAppearance>) => onChange({ ...value, ...changes, customized: true });
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="mb-5"><h3 className="text-lg font-bold">Appearance & Branding</h3><p className="mt-1 text-sm text-slate-500">Start with the business-unit theme, then customize every visual setting.</p></div>
    <div className="grid gap-5 lg:grid-cols-2">
      <label className="text-sm font-semibold">Business Unit / Brand<select className={inputClass} value={businessUnit} onChange={event => { const name = event.target.value; onBusinessUnitChange(name, appearanceForBusinessUnit(name)); }}><option value="">Select business unit</option>{businessUnits.map(unit => <option key={unit.id}>{unit.name}</option>)}</select></label>
      <label className="text-sm font-semibold">Theme preset<select className={inputClass} value={value.preset || 'TNG'} onChange={event => onChange({ ...appearanceForBusinessUnit(event.target.value), customized: true })}><option>TNG</option><option>Inflatable Island</option><option>The Dessert Museum</option><option>Gootopia</option><option>Bakebe</option><option>The Fun Roof</option></select></label>
      <label className="text-sm font-semibold">Offer title<input className={inputClass} value={value.offerTitle || ''} onChange={event => patch({ offerTitle: event.target.value })}/></label>
      <label className="text-sm font-semibold">Header content<input className={inputClass} value={value.headerContent || ''} onChange={event => patch({ headerContent: event.target.value })}/></label>
      <label className="text-sm font-semibold lg:col-span-2">Footer content<textarea className={`${inputClass} min-h-[72px] resize-y`} value={value.footerContent || ''} onChange={event => patch({ footerContent: event.target.value })}/></label>
      <ColorField label="Primary color" value={value.primaryColor || '#6D28D9'} onChange={primaryColor => patch({ primaryColor })}/>
      <ColorField label="Accent color" value={value.accentColor || '#F59E0B'} onChange={accentColor => patch({ accentColor })}/>
      <ColorField label="Text color" value={value.textColor || '#0F172A'} onChange={textColor => patch({ textColor })}/>
      <ColorField label="Page background" value={value.pageBackgroundColor || '#FFFFFF'} onChange={pageBackgroundColor => patch({ pageBackgroundColor })}/>
      <label className="text-sm font-semibold">Font family<select className={inputClass} value={value.fontFamily || 'Inter'} onChange={event => patch({ fontFamily: event.target.value as OfferAppearance['fontFamily'] })}><option>Inter</option><option>Georgia</option><option>Arial</option><option>Poppins</option></select></label>
      <label className="text-sm font-semibold">Button style<select className={inputClass} value={value.buttonStyle || 'Rounded'} onChange={event => patch({ buttonStyle: event.target.value as OfferAppearance['buttonStyle'] })}><option>Rounded</option><option>Pill</option><option>Square</option></select></label>
      <label className="text-sm font-semibold">Card style<select className={inputClass} value={value.cardStyle || 'Soft'} onChange={event => patch({ cardStyle: event.target.value as OfferAppearance['cardStyle'] })}><option>Soft</option><option>Outlined</option><option>Flat</option></select></label>
      <label className="text-sm font-semibold">Section layout<select className={inputClass} value={value.sectionLayout || 'Cards'} onChange={event => patch({ sectionLayout: event.target.value as OfferAppearance['sectionLayout'] })}><option>Cards</option><option>Classic</option><option>Compact</option></select></label>
      <div className="lg:col-span-2"><p className="text-sm font-semibold">Background image</p><div className="mt-2 flex flex-wrap items-center gap-3">{value.backgroundImageUrl && <img src={value.backgroundImageUrl} alt="Offer background" className="h-20 w-36 rounded-xl border object-cover"/>}<label className="cursor-pointer rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">{backgroundBusy ? 'Uploading…' : value.backgroundImageUrl ? 'Replace image' : 'Upload image'}<input type="file" className="hidden" accept=".png,.jpg,.jpeg,image/png,image/jpeg" onChange={event => onBackgroundUpload(event.target.files?.[0])}/></label>{value.backgroundImageUrl && <button type="button" onClick={onRemoveBackground} className="text-sm font-semibold text-rose-600">Remove</button>}<span className="text-xs text-slate-500">PNG or JPG, maximum 5MB</span></div></div>
      <div className="lg:col-span-2 flex items-center justify-between rounded-xl bg-slate-50 p-4"><div className="flex items-center gap-3">{logoUrl ? <img src={logoUrl} alt="Current logo" className="h-10 w-24 object-contain"/> : null}<span className="text-sm text-slate-600">The selected business-unit logo remains editable in Role & Job Details.</span></div><button type="button" onClick={() => onChange(appearanceForBusinessUnit(businessUnit))} className="text-sm font-bold" style={{ color: value.primaryColor }}>Reset to business-unit theme</button></div>
    </div>
  </section>;
};

export default OfferAppearanceEditor;
