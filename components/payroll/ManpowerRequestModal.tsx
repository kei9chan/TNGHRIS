import React, { useEffect, useMemo, useState } from 'react';
import { BusinessUnit, Department, ManpowerRequest, ManpowerRequestItem } from '../../types';
import { supabase } from '../../services/supabaseClient';
import { createManpowerRequest } from '../../services/manpowerService';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { toLocalCalendarDate } from '../../utils/calendarDate';

interface ManpowerRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (request: ManpowerRequest) => void;
}

const FALLBACK_RATE = 610;
const REASONS = [
  'Sick call / absence',
  'No-show',
  'Approved leave',
  'Sudden increase in bookings / PAX',
  'Special event / group booking',
  'Additional coverage required',
  'Other',
];

const SHIFT_PRESETS: Record<string, { label: string; time: string }> = {
  Opening: { label: 'Opening Shift · 7:00 AM – 4:00 PM', time: '7:00 AM – 4:00 PM' },
  Mid: { label: 'Mid Shift · 10:00 AM – 7:00 PM', time: '10:00 AM – 7:00 PM' },
  Closing: { label: 'Closing Shift · 1:00 PM – 10:00 PM', time: '1:00 PM – 10:00 PM' },
  Custom: { label: 'Custom shift', time: '' },
};

const controlClasses = 'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:focus:border-indigo-400 dark:focus:ring-indigo-900';
const labelClasses = 'mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300';

const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m6-6H6" />
  </svg>
);

const InfoIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="mt-0.5 h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <circle cx="12" cy="12" r="9" strokeWidth={1.8} />
    <path strokeLinecap="round" strokeWidth={1.8} d="M12 10.5v5m0-8h.01" />
  </svg>
);

const emptyItem = (id: string, rate = FALLBACK_RATE): ManpowerRequestItem => ({
  id,
  role: '',
  departmentId: '',
  departmentName: '',
  requiredFte: 0,
  reportingFte: 0,
  onCallNeeded: 0,
  currentFte: 0,
  requestedCount: 0,
  costPerHead: rate,
  ratePerDay: rate,
  totalItemCost: 0,
  shiftPreset: 'Mid',
  shiftTime: SHIFT_PRESETS.Mid.time,
  reason: '',
  departmentNote: '',
  otherReason: '',
  justification: '',
});

const itemWithDerivedValues = (item: ManpowerRequestItem, patch: Partial<ManpowerRequestItem>): ManpowerRequestItem => {
  const next = { ...item, ...patch };
  const requiredFte = Math.max(0, Number(next.requiredFte ?? next.currentFte ?? 0) || 0);
  const reportingFte = Math.max(0, Number(next.reportingFte ?? next.currentFte ?? 0) || 0);
  const ratePerDay = Math.max(0, Number(next.ratePerDay ?? next.costPerHead ?? FALLBACK_RATE) || 0);
  const onCallNeeded = Math.max(requiredFte - reportingFte, 0);
  return {
    ...next,
    requiredFte,
    reportingFte,
    onCallNeeded,
    currentFte: reportingFte,
    requestedCount: onCallNeeded,
    ratePerDay,
    costPerHead: ratePerDay,
    totalItemCost: onCallNeeded * ratePerDay,
    justification: next.reason || next.justification || '',
  };
};

const ManpowerRequestModal: React.FC<ManpowerRequestModalProps> = ({ isOpen, onClose, onSave }) => {
  const { user } = useAuth();
  const { getAccessibleBusinessUnits } = usePermissions();
  const [date, setDate] = useState(toLocalCalendarDate());
  const [forecastedPax, setForecastedPax] = useState(0);
  const [generalNote, setGeneralNote] = useState('');
  const [items, setItems] = useState<ManpowerRequestItem[]>([]);
  const [selectedBuId, setSelectedBuId] = useState('');
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentRates, setDepartmentRates] = useState<Record<string, number>>({});
  const [scheduleLoading, setScheduleLoading] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [invalidItemId, setInvalidItemId] = useState('');

  const accessibleBusinessUnits = getAccessibleBusinessUnits(businessUnits);
  const accessibleBuKey = accessibleBusinessUnits.map(unit => unit.id).join(',');

  useEffect(() => {
    if (!isOpen) return;
    const loadBusinessUnits = async () => {
      const { data, error } = await supabase.from('business_units').select('id, name, code').order('name');
      setBusinessUnits(error || !data ? [] : data.map(row => ({ id: row.id, name: row.name, code: row.code || undefined })));
    };
    loadBusinessUnits();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !user) return;
    setDate(toLocalCalendarDate());
    setForecastedPax(0);
    setGeneralNote('');
    setDepartments([]);
    setDepartmentRates({});
    setFormError('');
    setInvalidItemId('');
    setItems([emptyItem(`item-${Date.now()}`)]);
    const home = accessibleBusinessUnits.find(unit => unit.id === user.businessUnitId || unit.name === user.businessUnit);
    setSelectedBuId(home?.id || accessibleBusinessUnits[0]?.id || '');
  }, [isOpen, user?.id, accessibleBuKey]);

  useEffect(() => {
    if (!isOpen || !selectedBuId) {
      setDepartments([]);
      setDepartmentRates({});
      return;
    }
    let cancelled = false;
    const loadDepartments = async () => {
      const { data, error } = await supabase
        .from('departments')
        .select('id, name, business_unit_id')
        .eq('business_unit_id', selectedBuId)
        .order('name');
      if (cancelled) return;
      const nextDepartments: Department[] = error || !data
        ? []
        : data.map(row => ({ id: row.id, name: row.name, businessUnitId: row.business_unit_id }));
      setDepartments(nextDepartments);

      if (nextDepartments.length) {
        const { data: rates } = await supabase
          .from('manpower_department_rates')
          .select('department_id, default_rate')
          .in('department_id', nextDepartments.map(department => department.id));
        if (!cancelled) {
          setDepartmentRates(Object.fromEntries((rates || []).map(rate => [rate.department_id, Number(rate.default_rate) || FALLBACK_RATE])));
        }
      } else {
        setDepartmentRates({});
      }

      setItems(previous => previous.map(item => {
        if (!item.departmentId || nextDepartments.some(department => department.id === item.departmentId)) return item;
        return itemWithDerivedValues(emptyItem(item.id), { shiftPreset: item.shiftPreset, shiftTime: item.shiftTime });
      }));
    };
    loadDepartments();
    return () => { cancelled = true; };
  }, [isOpen, selectedBuId]);

  const updateItem = (index: number, patch: Partial<ManpowerRequestItem>) => {
    if (items[index]?.id === invalidItemId) {
      setInvalidItemId('');
      setFormError('');
    }
    setItems(previous => previous.map((item, itemIndex) => itemIndex === index ? itemWithDerivedValues(item, patch) : item));
  };

  const loadReportingFte = async (index: number, departmentId: string, dateValue = date) => {
    if (!selectedBuId || !departmentId) return;
    setScheduleLoading(previous => ({ ...previous, [departmentId]: true }));
    const { data, error } = await supabase.rpc('get_department_reporting_fte', {
      p_business_unit_id: selectedBuId,
      p_department_id: departmentId,
      p_date: dateValue,
    });
    setScheduleLoading(previous => ({ ...previous, [departmentId]: false }));
    if (!error && data !== null && data !== undefined) updateItem(index, { reportingFte: Number(data) || 0 });
  };

  useEffect(() => {
    if (!isOpen || !date || !selectedBuId) return;
    items.forEach((item, index) => {
      if (item.departmentId) loadReportingFte(index, item.departmentId, date);
    });
    // Date changes refresh only the schedule-derived value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const handleDepartmentChange = (index: number, departmentId: string) => {
    const department = departments.find(candidate => candidate.id === departmentId);
    const rate = departmentRates[departmentId] || FALLBACK_RATE;
    updateItem(index, {
      departmentId,
      departmentName: department?.name || '',
      role: department?.name || '',
      ratePerDay: rate,
      costPerHead: rate,
    });
    if (departmentId) loadReportingFte(index, departmentId);
  };

  const handleShiftChange = (index: number, shiftPreset: string) => {
    updateItem(index, {
      shiftPreset,
      shiftTime: shiftPreset === 'Custom' ? items[index]?.shiftTime || '' : SHIFT_PRESETS[shiftPreset]?.time || '',
    });
  };

  const handleAddDepartment = () => setItems(previous => [...previous, emptyItem(`item-${Date.now()}-${previous.length}`)]);

  const handleRemoveDepartment = (index: number) => {
    setItems(previous => previous.length === 1 ? previous : previous.filter((_, itemIndex) => itemIndex !== index));
  };

  const totals = useMemo(() => items.reduce((summary, item) => ({
    needed: summary.needed + (Number(item.onCallNeeded ?? item.requestedCount) || 0),
    cost: summary.cost + (Number(item.totalItemCost) || 0),
  }), { needed: 0, cost: 0 }), [items]);

  const scheduleIsLoading = Object.values(scheduleLoading).some(Boolean);

  const failValidation = (message: string, itemId = '') => {
    setInvalidItemId(itemId);
    setFormError(message);
  };

  const handleSubmit = async () => {
    if (!user) {
      setFormError('You must be signed in to submit a request.');
      return;
    }
    const selectedBusinessUnit = accessibleBusinessUnits.find(unit => unit.id === selectedBuId);
    const duplicateDepartments = new Set<string>();
    const duplicateFound = items.some(item => {
      if (!item.departmentId || duplicateDepartments.has(item.departmentId)) return Boolean(item.departmentId);
      duplicateDepartments.add(item.departmentId);
      return false;
    });
    const invalidItemIndex = items.findIndex(item => {
      const needed = Number(item.onCallNeeded) || 0;
      return !item.departmentId
        || item.requiredFte === undefined || item.requiredFte < 0
        || item.reportingFte === undefined || item.reportingFte < 0
        || item.ratePerDay === undefined || item.ratePerDay < 0
        || (needed > 0 && !item.reason?.trim())
        || (needed > 0 && item.reason === 'Other' && !item.otherReason?.trim());
    });
    if (!selectedBuId || !selectedBusinessUnit) return failValidation('Select a valid Business Unit.');
    if (!date) return failValidation('Select the date coverage is needed.');
    if (scheduleIsLoading) return failValidation('Please wait while the reporting FTE finishes loading.');
    if (!items.length || duplicateFound) return failValidation('Choose a different department for each coverage row.');
    if (invalidItemIndex >= 0) {
      const invalidItem = items[invalidItemIndex];
      const row = `Coverage row ${invalidItemIndex + 1}`;
      const needed = Number(invalidItem.onCallNeeded) || 0;
      if (!invalidItem.departmentId) return failValidation(`${row}: select a department.`, invalidItem.id);
      if (invalidItem.requiredFte === undefined || invalidItem.requiredFte < 0) return failValidation(`${row}: enter a valid Required FTE.`, invalidItem.id);
      if (invalidItem.reportingFte === undefined || invalidItem.reportingFte < 0) return failValidation(`${row}: enter a valid Reporting FTE.`, invalidItem.id);
      if (invalidItem.ratePerDay === undefined || invalidItem.ratePerDay < 0) return failValidation(`${row}: enter a valid Rate / Day.`, invalidItem.id);
      if (needed > 0 && !invalidItem.reason?.trim()) return failValidation(`${row}: select a reason for the ${needed} on-call staff needed.`, invalidItem.id);
      return failValidation(`${row}: explain the “Other” reason.`, invalidItem.id);
    }

    setFormError('');
    setInvalidItemId('');
    setIsSubmitting(true);
    try {
      const saved = await createManpowerRequest({
        businessUnitId: selectedBuId,
        businessUnitName: selectedBusinessUnit.name,
        departmentId: items[0]?.departmentId,
        dateNeeded: date,
        forecastedPax: Number(forecastedPax) || 0,
        generalNote: generalNote.trim() || undefined,
        items,
        grandTotal: totals.cost,
      }, user);
      onSave(saved);
      onClose();
    } catch (error: any) {
      setFormError(error?.message || 'Failed to submit the on-call request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Request On-Call Coverage"
      size="5xl"
      footer={(
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p role="alert" aria-live="polite" className="text-sm font-semibold text-red-700 dark:text-red-300">{formError}</p>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isSubmitting || scheduleIsLoading || !accessibleBusinessUnits.length}>
              {isSubmitting ? 'Submitting…' : scheduleIsLoading ? 'Loading staffing…' : 'Submit Request'}
            </Button>
          </div>
        </div>
      )}
    >
      <div className="space-y-6 text-slate-900 dark:text-slate-100">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-300">Request temporary coverage when the reporting team cannot meet the required staffing level.</p>
        </div>

        <section className="space-y-4">
          <h3 className="text-lg font-bold">Request details</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <label>
              <span className={labelClasses}>Business Unit</span>
              <select aria-label="Business Unit" value={selectedBuId} onChange={event => setSelectedBuId(event.target.value)} className={controlClasses}>
                <option value="">Select Business Unit</option>
                {accessibleBusinessUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
              </select>
            </label>
            <label>
              <span className={labelClasses}>Date Needed</span>
              <input aria-label="Date Needed" type="date" value={date} onChange={event => setDate(event.target.value)} className={controlClasses} />
            </label>
            <label>
              <span className={labelClasses}>Forecasted PAX</span>
              <input aria-label="Forecasted PAX" type="number" min="0" value={forecastedPax} onChange={event => setForecastedPax(Number(event.target.value) || 0)} className={controlClasses} />
            </label>
            <label>
              <span className={labelClasses}>Event / Operational Context</span>
              <input aria-label="Event / Operational Context" value={generalNote} onChange={event => setGeneralNote(event.target.value)} placeholder="e.g. Saturday group booking" className={controlClasses} />
            </label>
          </div>
          <div className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
            <InfoIcon />
            <p>Reporting FTE starts from the published schedule for the selected date. Edit it for sick calls, absences, or last-minute manpower changes. Each department with on-call coverage has its own reason.</p>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold">Coverage by Department</h3>
              <p className="text-sm text-slate-500 dark:text-slate-300">Reason is required only for departments with on-call coverage.</p>
            </div>
            <Button size="sm" variant="secondary" onClick={handleAddDepartment}><PlusIcon /> Add Department</Button>
          </div>

          {!departments.length && selectedBuId && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">No departments are configured for this Business Unit yet.</div>
          )}

          <div className="space-y-3">
            {items.map((item, index) => {
              const needed = Number(item.onCallNeeded) || 0;
              const selectedReason = item.reason || '';
              return (
                <div key={item.id} className={`rounded-xl border bg-slate-50 p-4 dark:bg-slate-900/40 ${invalidItemId === item.id ? 'border-red-400 ring-2 ring-red-100 dark:border-red-500 dark:ring-red-950' : 'border-slate-200 dark:border-slate-600'}`}>
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                    <label className="lg:col-span-3">
                      <span className={labelClasses}>Department / Area</span>
                      <select aria-label={`Department / Area ${index + 1}`} value={item.departmentId || ''} onChange={event => handleDepartmentChange(index, event.target.value)} className={controlClasses}>
                        <option value="">Select department</option>
                        {departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
                      </select>
                    </label>
                    <label className="lg:col-span-1">
                      <span className={labelClasses}>Required FTE</span>
                      <input aria-label={`Required FTE ${index + 1}`} type="number" min="0" step="1" value={item.requiredFte ?? 0} onChange={event => updateItem(index, { requiredFte: Number(event.target.value) || 0 })} className={controlClasses} />
                    </label>
                    <label className="lg:col-span-2">
                      <span className={labelClasses}>Reporting FTE</span>
                      <input aria-label={`Reporting FTE ${index + 1}`} type="number" min="0" step="1" value={item.reportingFte ?? 0} onChange={event => updateItem(index, { reportingFte: Number(event.target.value) || 0 })} className={`${controlClasses} border-indigo-300 dark:border-indigo-500`} />
                      <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">{item.departmentId && scheduleLoading[item.departmentId] ? 'Loading schedule…' : `${item.reportingFte ?? 0} scheduled · editable`}</span>
                    </label>
                    <div className="lg:col-span-2">
                      <span className={labelClasses}>On-call needed</span>
                      <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2.5 dark:border-orange-900 dark:bg-orange-950/40">
                        <p className="text-sm font-bold text-orange-700 dark:text-orange-200">On-call needed: {needed}</p>
                        <p className="text-[11px] text-orange-600 dark:text-orange-300">Required − Reporting</p>
                      </div>
                    </div>
                    <label className="lg:col-span-3">
                      <span className={labelClasses}>Shift / Coverage</span>
                      <select aria-label={`Shift / Coverage ${index + 1}`} value={item.shiftPreset || 'Custom'} onChange={event => handleShiftChange(index, event.target.value)} className={controlClasses}>
                        {Object.entries(SHIFT_PRESETS).map(([value, preset]) => <option key={value} value={value}>{preset.label}</option>)}
                      </select>
                      <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">Presets: Opening · Mid · Closing · Custom</span>
                    </label>
                    <button type="button" aria-label={`Remove department ${index + 1}`} onClick={() => handleRemoveDepartment(index)} disabled={items.length === 1} className="hidden text-red-500 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40 lg:block lg:col-span-1 lg:self-start lg:justify-self-end" title="Remove department">
                      <TrashIcon />
                    </button>
                  </div>

                  {item.shiftPreset === 'Custom' && (
                    <label className="mt-3 block max-w-sm">
                      <span className={labelClasses}>Custom shift time</span>
                      <input aria-label={`Custom shift time ${index + 1}`} value={item.shiftTime} onChange={event => updateItem(index, { shiftTime: event.target.value })} placeholder="e.g. 6:30 AM – 3:30 PM" className={controlClasses} />
                    </label>
                  )}

                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-12">
                    <label className="md:col-span-3">
                      <span className={labelClasses}>Rate / Day</span>
                      <div className="relative">
                        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">₱</span>
                        <input aria-label={`Rate / Day ${index + 1}`} type="number" min="0" step="0.01" value={item.ratePerDay ?? FALLBACK_RATE} onChange={event => updateItem(index, { ratePerDay: Number(event.target.value) || 0 })} className={`${controlClasses} pl-8`} />
                      </div>
                      <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">Prefilled from department default · editable</span>
                    </label>
                    <label className="md:col-span-4">
                      <span className={labelClasses}>Reason for on-call {needed > 0 && <span className="text-red-500">*</span>}</span>
                      <select aria-label={`Reason for on-call ${index + 1}`} value={selectedReason} onChange={event => updateItem(index, { reason: event.target.value, justification: event.target.value })} className={controlClasses}>
                        <option value="">{needed > 0 ? 'Select a reason' : 'No reason needed when count is zero'}</option>
                        {REASONS.map(reason => <option key={reason} value={reason}>{reason}</option>)}
                      </select>
                    </label>
                    <label className="md:col-span-5">
                      <span className={labelClasses}>Department note <span className="font-normal normal-case tracking-normal text-slate-400">(optional)</span></span>
                      <input aria-label={`Department note ${index + 1}`} value={item.departmentNote || ''} onChange={event => updateItem(index, { departmentNote: event.target.value })} placeholder="Add context for this department" className={controlClasses} />
                    </label>
                  </div>

                  {selectedReason === 'Other' && (
                    <label className="mt-3 block">
                      <span className={labelClasses}>Explain other reason {needed > 0 && <span className="text-red-500">*</span>}</span>
                      <input aria-label={`Explain other reason ${index + 1}`} value={item.otherReason || ''} onChange={event => updateItem(index, { otherReason: event.target.value })} placeholder="Describe why on-call coverage is needed" className={controlClasses} />
                    </label>
                  )}

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-sm dark:border-slate-700">
                    <span className="text-slate-500 dark:text-slate-400">{needed} × ₱{(item.ratePerDay || 0).toLocaleString()} = <strong className="text-slate-800 dark:text-slate-100">₱{(item.totalItemCost || 0).toLocaleString()}</strong></span>
                    <button type="button" onClick={() => handleRemoveDepartment(index)} disabled={items.length === 1} className="inline-flex items-center gap-1 text-sm font-semibold text-red-600 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40 lg:hidden"><TrashIcon /> Remove</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:max-w-2xl">
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 dark:border-indigo-900 dark:bg-indigo-950/40">
            <p className="text-xs font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">Total on-call FTE</p>
            <p className="mt-1 text-2xl font-bold text-indigo-700 dark:text-indigo-200">{totals.needed}</p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">Estimated total cost</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-200">₱{totals.cost.toLocaleString()}</p>
          </div>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">On-call needed = max(Required FTE − Reporting FTE, 0). Reporting FTE is schedule-based and can be adjusted for actual absences.</p>

      </div>
    </Modal>
  );
};

export default ManpowerRequestModal;
