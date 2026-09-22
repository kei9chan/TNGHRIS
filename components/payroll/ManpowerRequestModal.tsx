import React, { useEffect, useMemo, useState } from 'react';
import { BusinessUnit, Department, ManpowerCoverageDay, ManpowerRequest, ManpowerRequestItem } from '../../types';
import { supabase } from '../../services/supabaseClient';
import { createManpowerRequest, respondToManpowerClarification } from '../../services/manpowerService';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { toLocalCalendarDate } from '../../utils/calendarDate';
import {
  coverageTotals,
  DEFAULT_ON_CALL_RATE,
  deriveCoverageDay,
  deriveManpowerItem,
  enumerateCoverageDates,
  formatCoverageDate,
} from '../../modules/payroll/onCallRequestModel';

interface ManpowerRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (request: ManpowerRequest) => void;
  requestToEdit?: ManpowerRequest | null;
}

const SHIFT_PRESETS: Record<string, string> = {
  Opening: '7:00 AM – 4:00 PM',
  Mid: '10:00 AM – 7:00 PM',
  Closing: '1:00 PM – 10:00 PM',
  Custom: '',
};

const controlClasses = 'block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white';
const labelClasses = 'mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300';

const emptyItem = (id: string, rate = DEFAULT_ON_CALL_RATE): ManpowerRequestItem => deriveManpowerItem({
  id, role: '', departmentId: '', departmentName: '', requiredFte: 0, reportingFte: 0,
  onCallNeeded: 0, currentFte: 0, requestedCount: 0, costPerHead: rate,
  ratePerDay: rate, totalItemCost: 0, shiftPreset: 'Mid', shiftTime: SHIFT_PRESETS.Mid,
  reason: '', departmentNote: '', otherReason: '', justification: '',
});

const newDay = (date: string, template?: ManpowerCoverageDay): ManpowerCoverageDay => deriveCoverageDay({
  date,
  coverageRequired: true,
  forecastedPax: template?.forecastedPax || 0,
  operationalContext: template?.operationalContext || '',
  reason: template?.reason || '',
  items: template?.items.length
    ? template.items.map((item, index) => ({ ...item, id: `${date}-${index}-${Date.now()}` }))
    : [emptyItem(`${date}-${Date.now()}`)],
  totalStaff: 0,
  totalCost: 0,
});

const ManpowerRequestModal: React.FC<ManpowerRequestModalProps> = ({ isOpen, onClose, onSave, requestToEdit = null }) => {
  const { user } = useAuth();
  const { getAccessibleBusinessUnits } = usePermissions();
  const today = toLocalCalendarDate();
  const [dateMode, setDateMode] = useState<'single' | 'range'>('single');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [generalNote, setGeneralNote] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [reasonMode, setReasonMode] = useState<'shared' | 'daily'>('shared');
  const [sharedReason, setSharedReason] = useState('');
  const [clarificationResponse, setClarificationResponse] = useState('');
  const [coverageDays, setCoverageDays] = useState<ManpowerCoverageDay[]>([newDay(today)]);
  const [selectedBuId, setSelectedBuId] = useState('');
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentRates, setDepartmentRates] = useState<Record<string, number>>({});
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const accessibleBusinessUnits = getAccessibleBusinessUnits(businessUnits);
  const accessibleBuKey = accessibleBusinessUnits.map(unit => unit.id).join(',');
  const isClarificationResponse = Boolean(requestToEdit && requestToEdit.clarificationStatus === 'requested');

  useEffect(() => {
    if (!isOpen) return;
    void supabase.from('business_units').select('id, name, code').order('name').then(({ data }) => {
      setBusinessUnits((data || []).map(row => ({ id: row.id, name: row.name, code: row.code || undefined })));
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !user) return;
    if (requestToEdit) {
      const days = requestToEdit.coverageDays?.length
        ? requestToEdit.coverageDays.map(deriveCoverageDay)
        : [newDay(requestToEdit.startDate || toLocalCalendarDate(requestToEdit.date))];
      setDateMode(requestToEdit.dateMode || (days.length > 1 ? 'range' : 'single'));
      setStartDate(requestToEdit.startDate || days[0].date);
      setEndDate(requestToEdit.endDate || days[days.length - 1].date);
      setGeneralNote(requestToEdit.generalNote || '');
      setAttachmentUrl(requestToEdit.attachmentUrl || '');
      setCoverageDays(days);
      setSelectedBuId(requestToEdit.businessUnitId);
      setSharedReason('');
      setReasonMode('daily');
      setClarificationResponse('');
    } else {
      const home = accessibleBusinessUnits.find(unit => unit.id === user.businessUnitId || unit.name === user.businessUnit);
      setDateMode('single'); setStartDate(today); setEndDate(today); setGeneralNote(''); setAttachmentUrl('');
      setSharedReason(''); setReasonMode('shared'); setCoverageDays([newDay(today)]);
      setSelectedBuId(home?.id || accessibleBusinessUnits[0]?.id || '');
    }
    setFormError('');
  }, [isOpen, user?.id, accessibleBuKey, requestToEdit?.id]);

  useEffect(() => {
    if (!isOpen || !selectedBuId) return;
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.from('departments').select('id, name, business_unit_id').eq('business_unit_id', selectedBuId).order('name');
      if (cancelled) return;
      const next = (data || []).map(row => ({ id: row.id, name: row.name, businessUnitId: row.business_unit_id }));
      setDepartments(next);
      if (!next.length) return setDepartmentRates({});
      const { data: rates } = await supabase.from('manpower_department_rates').select('department_id, default_rate').in('department_id', next.map(department => department.id));
      if (!cancelled) setDepartmentRates(Object.fromEntries((rates || []).map(row => [row.department_id, Number(row.default_rate) || DEFAULT_ON_CALL_RATE])));
    };
    void load();
    return () => { cancelled = true; };
  }, [isOpen, selectedBuId]);

  useEffect(() => {
    const dates = enumerateCoverageDates(startDate, dateMode === 'single' ? startDate : endDate);
    if (!dates.length) return;
    setCoverageDays(previous => {
      const byDate = new Map(previous.map(day => [day.date, day]));
      const template = previous[0];
      return dates.map(date => byDate.get(date) || newDay(date, template));
    });
  }, [dateMode, startDate, endDate]);

  const setDay = (dayIndex: number, updater: (day: ManpowerCoverageDay) => ManpowerCoverageDay) => {
    setCoverageDays(previous => previous.map((day, index) => index === dayIndex ? deriveCoverageDay(updater(day)) : day));
    setFormError('');
  };
  const updateItem = (dayIndex: number, itemIndex: number, patch: Partial<ManpowerRequestItem>) => setDay(dayIndex, day => ({
    ...day,
    items: day.items.map((item, index) => index === itemIndex ? deriveManpowerItem({ ...item, ...patch }) : item),
  }));

  const loadReportingFte = async (dayIndex: number, itemIndex: number, departmentId: string) => {
    if (!departmentId || !selectedBuId) return;
    const day = coverageDays[dayIndex];
    const key = `${day.date}:${departmentId}`;
    setLoadingKeys(previous => new Set(previous).add(key));
    const { data } = await supabase.rpc('get_department_reporting_fte', { p_business_unit_id: selectedBuId, p_department_id: departmentId, p_date: day.date });
    setLoadingKeys(previous => { const next = new Set(previous); next.delete(key); return next; });
    if (data !== null && data !== undefined) updateItem(dayIndex, itemIndex, { reportingFte: Number(data) || 0 });
  };
  const handleDepartmentChange = (dayIndex: number, itemIndex: number, departmentId: string) => {
    const department = departments.find(candidate => candidate.id === departmentId);
    const rate = departmentRates[departmentId] || DEFAULT_ON_CALL_RATE;
    updateItem(dayIndex, itemIndex, { departmentId, departmentName: department?.name || '', role: department?.name || '', ratePerDay: rate, costPerHead: rate });
    void loadReportingFte(dayIndex, itemIndex, departmentId);
  };

  const preparedDays = useMemo(() => coverageDays.map(day => deriveCoverageDay({
    ...day,
    reason: reasonMode === 'shared' ? sharedReason : day.reason,
    items: day.items.map(item => reasonMode === 'shared' && Number(item.onCallNeeded || 0) > 0
      ? deriveManpowerItem({ ...item, reason: sharedReason, justification: sharedReason }) : item),
  })), [coverageDays, reasonMode, sharedReason]);
  const totals = useMemo(() => coverageTotals(preparedDays), [preparedDays]);

  const validate = () => {
    if (!selectedBuId) return 'Select a Business Unit.';
    if (!startDate || !endDate || endDate < startDate) return 'The end date must be on or after the start date.';
    if (!preparedDays.some(day => day.coverageRequired)) return 'Mark at least one date as Coverage required.';
    if (reasonMode === 'shared' && !sharedReason.trim()) return 'Explain the operational reason for this request.';
    for (const day of preparedDays) {
      if (!day.coverageRequired) continue;
      if (!day.items.length) return `${formatCoverageDate(day.date)} needs at least one department.`;
      const seen = new Set<string>();
      for (const item of day.items) {
        if (!item.departmentId) return `${formatCoverageDate(day.date)}: select a department.`;
        if (seen.has(item.departmentId)) return `${formatCoverageDate(day.date)}: each department may appear only once.`;
        seen.add(item.departmentId);
        if (!item.shiftTime?.trim()) return `${formatCoverageDate(day.date)}: enter the shift coverage.`;
        if (item.requiredFte === undefined || item.requiredFte < 0) return `${formatCoverageDate(day.date)}: enter Required FTE.`;
        if (item.ratePerDay === undefined || item.ratePerDay <= 0) return `${formatCoverageDate(day.date)}: enter a valid daily rate.`;
        if (Number(item.onCallNeeded || 0) > 0 && !item.reason?.trim()) return `${formatCoverageDate(day.date)}: explain why coverage is needed.`;
      }
    }
    if (isClarificationResponse && !clarificationResponse.trim()) return 'Answer the approver’s clarification question.';
    return '';
  };

  const handleSubmit = async () => {
    if (!user) return setFormError('You must be signed in to submit a request.');
    const error = validate();
    if (error) return setFormError(error);
    const businessUnit = accessibleBusinessUnits.find(unit => unit.id === selectedBuId) || businessUnits.find(unit => unit.id === selectedBuId);
    if (!businessUnit) return setFormError('Select a valid Business Unit.');
    setIsSubmitting(true); setFormError('');
    try {
      const payload = {
        businessUnitId: selectedBuId, businessUnitName: businessUnit.name,
        departmentId: preparedDays.find(day => day.coverageRequired)?.items[0]?.departmentId,
        dateMode, startDate, endDate: dateMode === 'single' ? startDate : endDate,
        forecastedPax: preparedDays[0]?.forecastedPax || 0, generalNote: generalNote.trim() || undefined,
        attachmentUrl: attachmentUrl.trim() || undefined, coverageDays: preparedDays,
        items: preparedDays.find(day => day.coverageRequired)?.items || [], grandTotal: totals.cost,
        totalStaffDays: totals.staffDays,
      };
      const saved = isClarificationResponse && requestToEdit
        ? await respondToManpowerClarification(requestToEdit.id, clarificationResponse, payload)
        : await createManpowerRequest(payload, user);
      onSave(saved); onClose();
    } catch (submitError: any) {
      setFormError(submitError?.message || 'Failed to submit the on-call request.');
    } finally { setIsSubmitting(false); }
  };

  return (
    <Modal acknowledgmentRequestType="Manpower" isOpen={isOpen} onClose={onClose} title={isClarificationResponse ? 'Update On-Call Request' : 'Request On-Call Coverage'} size="5xl" footer={(
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p role="alert" aria-live="polite" className="text-sm font-semibold text-red-700 dark:text-red-300">{formError}</p>
        <div className="flex flex-col-reverse gap-3 sm:flex-row"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={handleSubmit} disabled={isSubmitting || loadingKeys.size > 0}>{isSubmitting ? 'Submitting…' : isClarificationResponse ? 'Send response' : 'Submit request'}</Button></div>
      </div>
    )}>
      <div className="space-y-6 text-slate-900 dark:text-slate-100">
        {isClarificationResponse && <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30"><p className="text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">Clarification requested</p><p className="mt-2 text-lg font-bold">{requestToEdit?.clarificationQuestion}</p><label className="mt-4 block"><span className={labelClasses}>Your response</span><textarea value={clarificationResponse} onChange={event => setClarificationResponse(event.target.value)} rows={3} className={controlClasses} placeholder="Answer the reviewer and describe what you changed." /></label></section>}

        <section className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 dark:border-indigo-900 dark:bg-indigo-950/20">
          <div className="grid gap-4 lg:grid-cols-4">
            <label><span className={labelClasses}>Business Unit</span><select value={selectedBuId} disabled={isClarificationResponse} onChange={event => setSelectedBuId(event.target.value)} className={controlClasses}><option value="">Select Business Unit</option>{accessibleBusinessUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
            <div><span className={labelClasses}>Coverage type</span><div className="grid grid-cols-2 rounded-xl bg-white p-1 shadow-sm dark:bg-slate-800">{(['single', 'range'] as const).map(mode => <button key={mode} type="button" onClick={() => { setDateMode(mode); if (mode === 'single') setEndDate(startDate); }} className={`rounded-lg px-3 py-2 text-sm font-bold ${dateMode === mode ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-300'}`}>{mode === 'single' ? 'Single date' : 'Date range'}</button>)}</div></div>
            <label><span className={labelClasses}>{dateMode === 'single' ? 'Coverage date' : 'Start date'}</span><input type="date" value={startDate} onChange={event => { setStartDate(event.target.value); if (dateMode === 'single') setEndDate(event.target.value); }} className={controlClasses} /></label>
            {dateMode === 'range' && <label><span className={labelClasses}>End date</span><input type="date" min={startDate} value={endDate} onChange={event => setEndDate(event.target.value)} className={controlClasses} /></label>}
          </div>
          <div className="mt-4 flex flex-wrap gap-2" aria-label="Every included coverage date">{coverageDays.map(day => <span key={day.date} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${day.coverageRequired ? 'border-indigo-300 bg-white text-indigo-800 dark:bg-slate-800 dark:text-indigo-200' : 'border-slate-300 bg-slate-100 text-slate-500 line-through dark:bg-slate-800'}`}>{formatCoverageDate(day.date)}</span>)}</div>
          <p className="mt-3 text-sm font-semibold text-indigo-800 dark:text-indigo-200">{coverageDays.length} calendar {coverageDays.length === 1 ? 'day' : 'days'} · {totals.coverageDays} coverage {totals.coverageDays === 1 ? 'day' : 'days'}</p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <label><span className={labelClasses}>Event / Operational Context</span><input value={generalNote} onChange={event => setGeneralNote(event.target.value)} placeholder="e.g. Scheduled equipment repair" className={controlClasses} /></label>
          <label><span className={labelClasses}>Attachment or supporting link</span><input type="url" value={attachmentUrl} onChange={event => setAttachmentUrl(event.target.value)} placeholder="https://…" className={controlClasses} /></label>
          <div className="sm:col-span-2"><span className={labelClasses}>Operational reason</span><div className="mb-3 flex gap-2">{(['shared', 'daily'] as const).map(mode => <button type="button" key={mode} onClick={() => setReasonMode(mode)} className={`rounded-full px-3 py-1.5 text-sm font-bold ${reasonMode === mode ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{mode === 'shared' ? 'One reason for all dates' : 'Different reason per date'}</button>)}</div>{reasonMode === 'shared' && <textarea value={sharedReason} onChange={event => setSharedReason(event.target.value)} rows={3} placeholder="Explain the specific operational need, not only ‘maintenance’ or ‘other’." className={controlClasses} />}</div>
        </section>

        <section className="space-y-4">
          {coverageDays.map((day, dayIndex) => <article key={day.date} className={`overflow-hidden rounded-2xl border-2 ${day.coverageRequired ? 'border-indigo-200 bg-white dark:border-indigo-900 dark:bg-slate-900' : 'border-slate-200 bg-slate-50 opacity-80 dark:border-slate-700 dark:bg-slate-900'}`}>
            <header className="flex flex-col gap-3 border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-white p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700 dark:from-indigo-950/50 dark:to-slate-900"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Coverage day {dayIndex + 1}</p><h3 className="mt-1 text-xl font-black">{formatCoverageDate(day.date)}</h3></div><div className="flex rounded-xl bg-white p-1 shadow-sm dark:bg-slate-800"><button type="button" onClick={() => setDay(dayIndex, current => ({ ...current, coverageRequired: true }))} className={`rounded-lg px-3 py-2 text-sm font-bold ${day.coverageRequired ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>Coverage required</button><button type="button" onClick={() => setDay(dayIndex, current => ({ ...current, coverageRequired: false }))} className={`rounded-lg px-3 py-2 text-sm font-bold ${!day.coverageRequired ? 'bg-slate-700 text-white' : 'text-slate-500'}`}>No coverage needed</button></div></header>
            {day.coverageRequired && <div className="space-y-4 p-4">
              <div className="grid gap-4 sm:grid-cols-2"><label><span className={labelClasses}>Forecasted guests / demand</span><input type="number" min="0" value={day.forecastedPax} onChange={event => setDay(dayIndex, current => ({ ...current, forecastedPax: Number(event.target.value) || 0 }))} className={controlClasses} /></label>{reasonMode === 'daily' && <label><span className={labelClasses}>Reason for this date</span><input value={day.reason || ''} onChange={event => setDay(dayIndex, current => ({ ...current, reason: event.target.value, items: current.items.map(item => ({ ...item, reason: event.target.value, justification: event.target.value })) }))} placeholder="Specific operational need" className={controlClasses} /></label>}</div>
              {day.items.map((item, itemIndex) => <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70">
                <div className="grid gap-3 md:grid-cols-12"><label className="md:col-span-3"><span className={labelClasses}>Department / Area</span><select value={item.departmentId || ''} onChange={event => handleDepartmentChange(dayIndex, itemIndex, event.target.value)} className={controlClasses}><option value="">Select department</option>{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label><label className="md:col-span-2"><span className={labelClasses}>Required FTE</span><input type="number" min="0" value={item.requiredFte || 0} onChange={event => updateItem(dayIndex, itemIndex, { requiredFte: Number(event.target.value) || 0 })} className={controlClasses} /></label><label className="md:col-span-2"><span className={labelClasses}>Reporting FTE</span><input type="number" min="0" value={item.reportingFte || 0} onChange={event => updateItem(dayIndex, itemIndex, { reportingFte: Number(event.target.value) || 0 })} className={controlClasses} /><span className="mt-1 block text-[11px] text-slate-500">{loadingKeys.has(`${day.date}:${item.departmentId}`) ? 'Loading schedule…' : 'Schedule-based · editable'}</span></label><div className="md:col-span-2"><span className={labelClasses}>On-call needed</span><div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5 text-center dark:border-orange-900 dark:bg-orange-950/30"><strong className="text-xl text-orange-700 dark:text-orange-300">{item.onCallNeeded || 0}</strong><p className="text-[10px] text-orange-600">Required − Reporting</p></div></div><label className="md:col-span-3"><span className={labelClasses}>Shift coverage</span><select value={item.shiftPreset || 'Mid'} onChange={event => updateItem(dayIndex, itemIndex, { shiftPreset: event.target.value, shiftTime: event.target.value === 'Custom' ? '' : SHIFT_PRESETS[event.target.value] })} className={controlClasses}>{Object.keys(SHIFT_PRESETS).map(name => <option key={name} value={name}>{name}{name === 'Custom' ? '' : ` · ${SHIFT_PRESETS[name]}`}</option>)}</select></label></div>
                <div className="mt-3 grid gap-3 md:grid-cols-12">{item.shiftPreset === 'Custom' && <label className="md:col-span-3"><span className={labelClasses}>Custom shift</span><input value={item.shiftTime} onChange={event => updateItem(dayIndex, itemIndex, { shiftTime: event.target.value })} placeholder="10:00 AM – 7:00 PM" className={controlClasses} /></label>}<label className="md:col-span-3"><span className={labelClasses}>Rate per staff / day</span><div className="relative"><span className="absolute inset-y-0 left-3 flex items-center text-slate-500">₱</span><input type="number" min="0" value={item.ratePerDay || 0} onChange={event => updateItem(dayIndex, itemIndex, { ratePerDay: Number(event.target.value) || 0 })} className={`${controlClasses} pl-8`} /></div></label><label className="md:col-span-5"><span className={labelClasses}>Department note</span><input value={item.departmentNote || ''} onChange={event => updateItem(dayIndex, itemIndex, { departmentNote: event.target.value })} placeholder="Optional detail for this team" className={controlClasses} /></label><div className="md:col-span-4 md:text-right"><span className={labelClasses}>Daily subtotal</span><p className="text-xl font-black text-emerald-700 dark:text-emerald-300">{item.onCallNeeded || 0} × ₱{(item.ratePerDay || 0).toLocaleString()} = ₱{(item.totalItemCost || 0).toLocaleString()}</p></div></div>
                <div className="mt-3 flex justify-end"><button type="button" disabled={day.items.length === 1} onClick={() => setDay(dayIndex, current => ({ ...current, items: current.items.filter((_, index) => index !== itemIndex) }))} className="text-sm font-bold text-red-600 disabled:opacity-30">Remove department</button></div>
              </div>)}
              <div className="flex flex-wrap items-center justify-between gap-3"><Button size="sm" variant="secondary" onClick={() => setDay(dayIndex, current => ({ ...current, items: [...current.items, emptyItem(`${day.date}-${Date.now()}`)] }))}>+ Add department</Button><div className="text-right"><p className="text-xs font-bold uppercase text-slate-500">{deriveCoverageDay(day).totalStaff} staff · daily estimated cost</p><p className="text-2xl font-black text-emerald-700 dark:text-emerald-300">₱{deriveCoverageDay(day).totalCost.toLocaleString()}</p></div></div>
            </div>}
          </article>)}
        </section>

        <section className="grid gap-3 rounded-2xl bg-slate-950 p-5 text-white sm:grid-cols-3"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Coverage days</p><p className="mt-1 text-3xl font-black">{totals.coverageDays}</p></div><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Total staff-days</p><p className="mt-1 text-3xl font-black text-orange-300">{totals.staffDays}</p></div><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Total request cost</p><p className="mt-1 text-3xl font-black text-emerald-300">₱{totals.cost.toLocaleString()}</p></div><p className="sm:col-span-3 text-xs text-slate-300">On-call staff needed = max(Required FTE − Reporting FTE, 0). Daily cost = On-call needed × Rate per staff per day.</p></section>
      </div>
    </Modal>
  );
};

export default ManpowerRequestModal;
