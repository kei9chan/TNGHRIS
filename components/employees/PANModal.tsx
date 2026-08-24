import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PAN, User, SalaryBreakdown, PANActionTaken, PANStatus, PANTemplate, Role, PANRoutingStep, PANStepStatus, PANRole } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import Input from '../ui/Input';
import EmployeeMultiSelect from '../feedback/EmployeeMultiSelect';
import { useAuth } from '../../hooks/useAuth';
import SignaturePad, { SignaturePadRef } from '../ui/SignaturePad';
import { createTemplateSnapshot, getPANActionType, selectPANTemplate, shouldShowSalary } from '../../services/panTemplateUtils';

interface PANModalProps {
  isOpen: boolean; onClose: () => void; pan: PAN | null; templates: PANTemplate[]; employees: User[];
  approvers: User[]; directoryError?: string;
  businessUnits: Array<{ id: string; name: string }>;
  onSaveDraft: (pan: Partial<PAN>) => void; onSendForAcknowledgement: (pan: Partial<PAN>) => void;
  onAcknowledge: (panId: string, signatureDataUrl: string, signatureName: string) => void;
  onDownloadPdf: (pan: PAN) => void; onApprove?: (pan: PAN) => void; onReject?: (pan: PAN) => void; onCancel?: (pan: PAN) => void;
}

const emptySalary: SalaryBreakdown = { basic: 0, deminimis: 0, reimbursable: 0 };
const emptyActions: PANActionTaken = { changeOfStatus: false, promotion: false, transfer: false, salaryIncrease: false, changeOfJobTitle: false, others: '' };
const actionLabels: Array<[keyof PANActionTaken, string]> = [
  ['changeOfStatus', 'Change of employment status'], ['promotion', 'Promotion'], ['transfer', 'Transfer'],
  ['salaryIncrease', 'Salary increase'], ['changeOfJobTitle', 'Change of job title'],
];

const calculateTenure = (dateHired?: Date): string => {
  if (!dateHired) return 'N/A';
  const now = new Date(); const hired = new Date(dateHired);
  let years = now.getFullYear() - hired.getFullYear(); let months = now.getMonth() - hired.getMonth();
  if (months < 0 || (months === 0 && now.getDate() < hired.getDate())) { years--; months = (months + 12) % 12; }
  return `${Math.max(0, years)} Years & ${Math.max(0, months)} Months`;
};

const isActiveUser = (candidate: User): boolean => String(candidate.status || '').toLowerCase() === 'active';
const parseBusinessUnitList = (value: string): string[] => value
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);

const PANModal: React.FC<PANModalProps> = (props) => {
  const { isOpen, onClose, pan, templates, employees, approvers, directoryError, businessUnits, onSaveDraft, onSendForAcknowledgement, onAcknowledge, onDownloadPdf, onApprove, onReject, onCancel } = props;
  const { user } = useAuth();
  const [current, setCurrent] = useState<Partial<PAN>>(pan || {});
  const [selectedEmployee, setSelectedEmployee] = useState<User | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateWasChosenManually, setTemplateWasChosenManually] = useState(false);
  const [selectedApprovers, setSelectedApprovers] = useState<User[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [otherBusinessUnitText, setOtherBusinessUnitText] = useState<Record<'from' | 'to', string>>({ from: '', to: '' });
  const [isEmployeeSearchOpen, setIsEmployeeSearchOpen] = useState(false);
  const searchWrapperRef = useRef<HTMLDivElement>(null);
  const signaturePadRef = useRef<SignaturePadRef>(null);
  const [typedName, setTypedName] = useState('');
  const isNew = !pan;

  const resolvedUserId = useMemo(() => {
    if (!user) return null;
    return employees.find(item => item.email?.toLowerCase() === user.email?.toLowerCase())?.id || user.id;
  }, [user, employees]);
  const isForAcknowledgement = !!pan && pan.employeeId === resolvedUserId && pan.status === PANStatus.PendingEmployee;
  const approverPool = useMemo(() => approvers.filter(isActiveUser), [approvers]);
  const isAuthorizedHr = useMemo(() => {
    const roles = new Set(user?.roles?.length ? user.roles : user ? [user.role] : []);
    return roles.has(Role.Admin) || roles.has(Role.HRManager) || roles.has(Role.HRStaff);
  }, [user]);
  const canEdit = useMemo(() => {
    if (isNew) return true;
    if (!pan || !resolvedUserId) return false;
    return [PANStatus.Draft, PANStatus.Declined, PANStatus.ReturnedForEdits].includes(pan.status)
      && (pan.createdByUserId === resolvedUserId || isAuthorizedHr);
  }, [pan, resolvedUserId, isAuthorizedHr, isNew]);
  const canCancel = !!pan && [PANStatus.Draft, PANStatus.PendingApproval, PANStatus.PendingEmployee].includes(pan.status)
    && (pan.createdByUserId === resolvedUserId || isAuthorizedHr);
  const currentUserStep = pan && resolvedUserId ? pan.routingSteps.find(step => step.userId === resolvedUserId && step.status === PANStepStatus.Pending) : null;
  const rejectionInfo = pan?.status === PANStatus.Declined ? pan.routingSteps.find(step => step.status === PANStepStatus.Declined) : null;
  const cancelledByName = pan?.cancelledBy ? employees.find(item => item.id === pan.cancelledBy)?.name || pan.cancelledBy : null;

  const templateOptions = useMemo(() => {
    const buId = selectedEmployee?.businessUnitId || current.particulars?.from?.businessUnitId;
    return templates.filter(item => item.status === 'published' && (!item.businessUnitId || !buId || item.businessUnitId === buId)).sort((a, b) => a.name.localeCompare(b.name));
  }, [templates, selectedEmployee, current.particulars]);

  const selectedTemplate = useMemo(
    () => templates.find(item => item.id === selectedTemplateId),
    [templates, selectedTemplateId],
  );
  const actionType = getPANActionType(current.actionTaken);
  const showSalary = shouldShowSalary(current, selectedTemplate || current.templateSnapshot);

  useEffect(() => {
    const onOutside = (event: MouseEvent) => { if (searchWrapperRef.current && !searchWrapperRef.current.contains(event.target as Node)) setIsEmployeeSearchOpen(false); };
    document.addEventListener('mousedown', onOutside); return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    if (pan) {
      setCurrent(pan); setSelectedEmployee(employees.find(item => item.id === pan.employeeId) || null);
      setSelectedTemplateId(pan.templateId || ''); setTemplateWasChosenManually(!!pan.templateId); setEmployeeSearch(pan.employeeName || '');
      setSelectedApprovers(pan.routingSteps.map(step => employees.find(item => item.id === step.userId)).filter((item): item is User => !!item));
      setOtherBusinessUnitText({
        from: (pan.particulars?.from?.otherBusinessUnits || []).join(', '),
        to: (pan.particulars?.to?.otherBusinessUnits || []).join(', '),
      });
    } else {
      setCurrent({ status: PANStatus.Draft, effectiveDate: new Date(), actionTaken: { ...emptyActions }, particulars: { from: { salary: { ...emptySalary } }, to: { salary: { ...emptySalary } } }, notes: '' });
      setSelectedEmployee(null); setSelectedTemplateId(''); setTemplateWasChosenManually(false); setSelectedApprovers([]); setEmployeeSearch('');
      setOtherBusinessUnitText({ from: '', to: '' });
    }
    setTypedName(isForAcknowledgement ? user?.name || '' : '');
  }, [pan, isOpen, employees, user, isForAcknowledgement]);

  useEffect(() => {
    if (!selectedEmployee || !isNew) return;
    const from = { businessUnit: selectedEmployee.businessUnit, businessUnitId: selectedEmployee.businessUnitId, employmentStatus: selectedEmployee.employmentStatus, position: selectedEmployee.position, department: selectedEmployee.department, salary: selectedEmployee.salary || { ...emptySalary } };
    setEmployeeSearch(selectedEmployee.name);
    setCurrent(previous => ({ ...previous, employeeId: selectedEmployee.id, employeeName: selectedEmployee.name, businessUnitId: selectedEmployee.businessUnitId, tenure: calculateTenure(selectedEmployee.dateHired), particulars: { from, to: previous.particulars?.to && Object.keys(previous.particulars.to).length > 1 ? previous.particulars.to : from } }));
  }, [selectedEmployee, isNew]);

  useEffect(() => {
    if (!isNew || !selectedEmployee || templateWasChosenManually) return;
    const fallback = selectPANTemplate(templates, selectedEmployee.businessUnitId, actionType);
    if (!fallback) return;
    if (fallback.id === selectedTemplateId) return;
    const date = current.effectiveDate || new Date();
    setSelectedTemplateId(fallback.id);
    setCurrent(previous => ({
      ...previous,
      templateId: fallback.id,
      templateVersion: fallback.version,
      templateName: fallback.name,
      templateSnapshot: createTemplateSnapshot(fallback),
      businessUnitId: selectedEmployee.businessUnitId,
      actionType,
      actionTaken: { ...emptyActions, ...fallback.actionTaken, ...previous.actionTaken },
      notes: previous.notes || (fallback.notes || '').replace(/\{\{effective_date\}\}/g, new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })),
      logoUrl: fallback.logoUrl || previous.logoUrl,
      preparerName: fallback.preparerName || previous.preparerName,
      preparerSignatureUrl: fallback.preparerSignatureUrl || previous.preparerSignatureUrl,
    }));
  }, [isNew, selectedEmployee, selectedTemplateId, templateWasChosenManually, templates, actionType, current.effectiveDate]);

  const availableEmployees = useMemo(() => {
    if (!employeeSearch || employeeSearch === selectedEmployee?.name) return [];
    const search = employeeSearch.trim().toLowerCase();
    if (!search) return [];
    return employees.filter(item => {
      if (!isActiveUser(item)) return false;
      return [item.name, item.employeeId, item.email, item.position, item.department, item.businessUnit]
        .some(value => String(value || '').toLowerCase().includes(search));
    }).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 20);
  }, [employeeSearch, selectedEmployee, employees]);

  const updateParticular = (side: 'from' | 'to', field: string, value: unknown) => setCurrent(previous => ({
    ...previous, particulars: { ...(previous.particulars || { from: {}, to: {} }), [side]: { ...(previous.particulars?.[side] || {}), [field]: value } },
  }));
  const updateSalary = (side: 'from' | 'to', field: keyof SalaryBreakdown, value: string) => updateParticular(side, 'salary', { ...(current.particulars?.[side]?.salary || emptySalary), [field]: Number(value) || 0 });

  const handleTemplateSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const templateId = event.target.value; const template = templates.find(item => item.id === templateId);
    setSelectedTemplateId(templateId); setTemplateWasChosenManually(true); if (!template) return;
    const date = current.effectiveDate || new Date();
    setCurrent(previous => ({ ...previous, templateId, templateVersion: template.version, templateName: template.name, templateSnapshot: createTemplateSnapshot(template), businessUnitId: selectedEmployee?.businessUnitId || previous.businessUnitId, actionType: template.actionType, actionTaken: { ...emptyActions, ...template.actionTaken }, notes: (template.notes || '').replace(/\{\{effective_date\}\}/g, new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })), logoUrl: template.logoUrl || previous.logoUrl, preparerName: template.preparerName || previous.preparerName, preparerSignatureUrl: template.preparerSignatureUrl || previous.preparerSignatureUrl }));
  };
  const handleBusinessUnitChange = (side: 'from' | 'to', businessUnitId: string) => {
    const selected = businessUnits.find(unit => unit.id === businessUnitId);
    updateParticular(side, 'businessUnitId', selected?.id || undefined); updateParticular(side, 'businessUnit', selected?.name || '');
    if (side === 'from') setCurrent(previous => ({ ...previous, businessUnitId: selected?.id || undefined }));
  };
  const handleApproverSelect = (users: User[]) => {
    setSelectedApprovers(users);
    setCurrent(previous => ({ ...previous, routingSteps: users.map((item, index): PANRoutingStep => ({ id: `step-${item.id}-${index}`, userId: item.id, name: item.name, role: item.role === Role.BOD || item.roles?.includes(Role.BOD) ? PANRole.BOD : PANRole.Approver, status: PANStepStatus.Pending, order: index })) }));
  };
  const hasBodApprover = selectedApprovers.some(item => item.role === Role.BOD || item.roles?.includes(Role.BOD));
  const selectEmployee = (employee: User) => { setSelectedEmployee(employee); setSelectedTemplateId(''); setTemplateWasChosenManually(false); setCurrent(previous => ({ ...previous, employeeId: employee.id, employeeName: employee.name, templateId: undefined, templateSnapshot: undefined })); setEmployeeSearch(employee.name); setIsEmployeeSearchOpen(false); };
  const handleEmployeeSearchChange = (value: string) => {
    setEmployeeSearch(value);
    setIsEmployeeSearchOpen(true);
    if (selectedEmployee && value !== selectedEmployee.name) {
      setSelectedEmployee(null);
      setSelectedTemplateId('');
      setTemplateWasChosenManually(false);
      setCurrent(previous => ({
        ...previous,
        employeeId: undefined,
        employeeName: undefined,
        templateId: undefined,
        templateName: undefined,
        templateSnapshot: undefined,
        routingSteps: [],
      }));
      setSelectedApprovers([]);
    }
  };
  const clearEmployee = () => handleEmployeeSearchChange('');
  const handleOtherBusinessUnitsChange = (side: 'from' | 'to', value: string) => {
    setOtherBusinessUnitText(previous => ({ ...previous, [side]: value }));
    updateParticular(side, 'otherBusinessUnits', parseBusinessUnitList(value));
  };
  const signatureSubmit = () => {
    if (!pan || !signaturePadRef.current) return;
    if (!typedName.trim()) return alert('Please type your name before acknowledging.');
    const dataUrl = signaturePadRef.current.getSignatureDataUrl(); if (!dataUrl) return alert('Please provide a signature before acknowledging.');
    onAcknowledge(pan.id, dataUrl, typedName.trim());
  };
  const statusLabel = pan?.status === PANStatus.Completed ? 'Accepted' : pan?.status === PANStatus.Declined ? 'Rejected' : pan?.status;
  const statusClass = pan?.status === PANStatus.Completed ? 'bg-emerald-100 text-emerald-800' : pan?.status === PANStatus.Declined || pan?.status === PANStatus.Cancelled ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800';

  const valueField = (side: 'from' | 'to', label: string, field: 'businessUnit' | 'department' | 'position' | 'employmentStatus') => (
    <div className="space-y-1">
      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label>
      {field === 'businessUnit' ? <select value={current.particulars?.[side]?.businessUnitId || ''} onChange={event => handleBusinessUnitChange(side, event.target.value)} disabled={!canEdit} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"><option value="">{current.particulars?.[side]?.businessUnit || 'Not Applicable'}</option>{businessUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select> : <Input value={current.particulars?.[side]?.[field] || ''} onChange={event => updateParticular(side, field, event.target.value)} disabled={!canEdit} />}
    </div>
  );

  return <Modal isOpen={isOpen} onClose={onClose} title={pan ? `${canEdit ? 'Edit' : 'PAN Details'} — ${pan.employeeName}` : 'Create New PAN'} size="full" centered={false} footer={
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={onClose}>Close</Button>{pan && <Button variant="secondary" onClick={() => onDownloadPdf(pan)}>Preview / Print / PDF</Button>}{canCancel && onCancel && <Button variant="danger" onClick={() => onCancel(pan!)}>Cancel PAN</Button>}</div>
      <div className="flex flex-wrap gap-2 sm:justify-end">{canEdit && <Button variant="secondary" onClick={() => onSaveDraft(current)}>Save Draft</Button>}{canEdit && <Button onClick={() => onSendForAcknowledgement(current)}>Send for Approval</Button>}{currentUserStep && <><Button variant="secondary" onClick={() => { onReject?.(pan!); onClose(); }}>Reject</Button><Button onClick={() => { onApprove?.(pan!); onClose(); }}>Approve</Button></>}{isForAcknowledgement && <Button onClick={signatureSubmit}>Acknowledge</Button>}</div>
    </div>
  }>
    <div className="space-y-6">
      {pan && <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Personnel Action Notice</p><p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">PAN-{pan.id.slice(0, 8).toUpperCase()}</p><p className="mt-1 text-xs text-slate-500">Template: {pan.templateName || selectedTemplate?.name || 'Standard PAN layout'}{pan.templateVersion ? ` · v${pan.templateVersion}` : ''}</p></div><span className={`rounded-full px-3 py-1 text-sm font-semibold ${statusClass}`}>{statusLabel}</span></div><div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-700"><div><span className="text-xs text-slate-500">Employee</span><div className="font-semibold">{pan.employeeName}</div></div><div><span className="text-xs text-slate-500">Business unit</span><div className="font-semibold">{pan.particulars?.from?.businessUnit || 'Not applicable'}</div></div><div><span className="text-xs text-slate-500">Department</span><div className="font-semibold">{pan.particulars?.from?.department || 'Not applicable'}</div></div><div><span className="text-xs text-slate-500">Position</span><div className="font-semibold">{pan.particulars?.from?.position || 'Not applicable'}</div></div></div></div>}

      <section><div className="mb-3 flex items-center gap-2"><b className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-xs text-white">1</b><div><h3 className="font-semibold">Document setup</h3><p className="text-xs text-slate-500">Choose the employee, effectivity date, and business-unit template.</p></div></div><div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="relative sm:col-span-2" ref={searchWrapperRef}><label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Employee</label><Input value={employeeSearch} onChange={event => handleEmployeeSearchChange(event.target.value)} onFocus={() => setIsEmployeeSearchOpen(true)} placeholder="Search name, employee ID, email, position, department, or business unit" disabled={!canEdit} />{directoryError && <p role="alert" className="mt-2 text-sm font-semibold text-red-600">Employee directory unavailable: {directoryError}</p>}{selectedEmployee && <div className="mt-2 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm dark:border-emerald-800 dark:bg-emerald-950/30"><div><span className="font-semibold text-emerald-800 dark:text-emerald-200">Selected: {selectedEmployee.name}</span><span className="ml-2 text-xs text-emerald-700 dark:text-emerald-300">{[selectedEmployee.employeeId, selectedEmployee.position, selectedEmployee.department, selectedEmployee.businessUnit].filter(Boolean).join(' · ')}</span></div>{canEdit && <button type="button" onClick={clearEmployee} className="font-semibold text-emerald-800 hover:underline dark:text-emerald-200">Clear</button>}</div>}{isEmployeeSearchOpen && employeeSearch.trim() && employeeSearch !== selectedEmployee?.name && <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">{availableEmployees.length > 0 ? availableEmployees.map(employee => <button type="button" key={employee.id} onClick={() => selectEmployee(employee)} className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-indigo-50 dark:border-slate-700 dark:hover:bg-slate-700"><span className="block font-medium">{employee.name}</span><span className="block text-xs text-slate-500 dark:text-slate-400">{[employee.employeeId, employee.position || employee.role, employee.department, employee.businessUnit, employee.email].filter(Boolean).join(' · ')}</span></button>) : <div className="px-3 py-3 text-sm text-slate-500">{directoryError ? 'The employee directory failed to load. Refresh after the configuration error is resolved.' : 'No active employee matches this search in your authorized business-unit scope.'}</div>}</div>}</div>
        <Input label="Effectivity date" type="date" value={current.effectiveDate ? new Date(current.effectiveDate).toISOString().split('T')[0] : ''} onChange={event => setCurrent(previous => ({ ...previous, effectiveDate: new Date(event.target.value) }))} disabled={!canEdit} />
        <div className="sm:col-span-3"><label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">PAN template</label><select value={selectedTemplateId} onChange={handleTemplateSelect} disabled={!canEdit} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"><option value="">Use standard PAN layout</option>{templateOptions.map(template => <option key={template.id} value={template.id}>{template.name}{template.businessUnitName ? ` — ${template.businessUnitName}` : ' — Global'}</option>)}</select><p className="mt-1 text-xs text-slate-500">{selectedEmployee?.businessUnit ? `Showing ${selectedEmployee.businessUnit} and Global templates.` : 'Select an employee to prioritize its business-unit templates.'}</p></div>
      </div></section>

      <section><div className="mb-3 flex items-center gap-2"><b className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-xs text-white">2</b><div><h3 className="font-semibold">Action taken</h3><p className="text-xs text-slate-500">Select every change that applies.</p></div></div><div className="grid gap-2 rounded-xl border bg-slate-50 p-4 sm:grid-cols-2 dark:bg-slate-800">{actionLabels.map(([key, label]) => <label key={key} className="flex items-center gap-3 rounded-lg border bg-white px-3 py-2 text-sm dark:bg-slate-900"><input type="checkbox" checked={!!current.actionTaken?.[key]} disabled={!canEdit} onChange={event => setCurrent(previous => ({ ...previous, actionTaken: { ...emptyActions, ...previous.actionTaken, [key]: event.target.checked } }))} className="h-4 w-4 text-indigo-600" /><span>{label}</span></label>)}<div className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 dark:bg-slate-900"><input type="checkbox" checked={!!current.actionTaken?.others} disabled={!canEdit} onChange={event => setCurrent(previous => ({ ...previous, actionTaken: { ...emptyActions, ...previous.actionTaken, others: event.target.checked ? previous.actionTaken?.others || 'Other action' : '' } }))} className="h-4 w-4 text-indigo-600" /><Input value={current.actionTaken?.others || ''} onChange={event => setCurrent(previous => ({ ...previous, actionTaken: { ...emptyActions, ...previous.actionTaken, others: event.target.value } }))} placeholder="Other action" disabled={!canEdit} /></div></div></section>

      <section><div className="mb-3 flex items-center gap-2"><b className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-xs text-white">3</b><div><h3 className="font-semibold">From vs To details</h3><p className="text-xs text-slate-500">The complete transfer and employment comparison used by the printable form.</p></div></div><div className="grid gap-4 lg:grid-cols-2">{(['from', 'to'] as const).map(side => <div key={side} className="rounded-xl border bg-white p-4 dark:bg-slate-900"><div className="mb-4 flex items-center justify-between"><h4 className="font-semibold">{side === 'from' ? 'From / Current' : 'To / New'}</h4><span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">{side === 'from' ? 'Existing' : 'Proposed'}</span></div><div className="space-y-3">{valueField(side, 'Business Unit / Company', 'businessUnit')}{valueField(side, 'Department', 'department')}{valueField(side, 'Position', 'position')}{valueField(side, 'Employment status', 'employmentStatus')}<Input label="Other business units / affiliates" value={otherBusinessUnitText[side]} onChange={event => handleOtherBusinessUnitsChange(side, event.target.value)} placeholder="Separate multiple companies with commas" disabled={!canEdit} /></div></div>)}</div></section>

      {showSalary && <section><div className="mb-3 flex items-center gap-2"><b className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-xs text-white">4</b><div><h3 className="font-semibold">Salary package</h3><p className="text-xs text-slate-500">Amounts are shown in PHP in the printed From / To table.</p></div></div><div className="grid gap-4 lg:grid-cols-2">{(['from', 'to'] as const).map(side => <div key={side} className="rounded-xl border bg-white p-4 dark:bg-slate-900"><h4 className="mb-3 font-semibold">{side === 'from' ? 'From / Current' : 'To / New'}</h4><div className="grid gap-3 sm:grid-cols-3">{(['basic', 'deminimis', 'reimbursable'] as const).map(field => <Input key={field} label={field === 'deminimis' ? 'De minimis' : field[0].toUpperCase() + field.slice(1)} type="number" unit="PHP" value={current.particulars?.[side]?.salary?.[field] ?? 0} onChange={event => updateSalary(side, field, event.target.value)} disabled={!canEdit} />)}</div></div>)}</div></section>}

      <section className="grid gap-4 lg:grid-cols-2"><div><label className="mb-1 block text-sm font-semibold">Remarks / Justifications</label><Textarea value={current.notes || ''} onChange={event => setCurrent(previous => ({ ...previous, notes: event.target.value }))} rows={5} placeholder="Explain the reason for this personnel action." disabled={!canEdit} /></div><div><label className="mb-1 block text-sm font-semibold">Approval routing</label><EmployeeMultiSelect label="" allUsers={approverPool} selectedUsers={selectedApprovers} onSelectionChange={handleApproverSelect} disabled={!canEdit} /><p className={`mt-2 text-xs ${hasBodApprover ? 'text-emerald-600' : 'font-semibold text-amber-600'}`}>{hasBodApprover ? '✓ Board of Director approval included' : 'Add at least one Board of Director approver.'}</p></div></section>

      {pan && <section className="rounded-xl border bg-slate-50 p-4 dark:bg-slate-800"><h3 className="mb-3 font-semibold">Approval history</h3><div className="grid gap-2 sm:grid-cols-2">{[...pan.routingSteps].sort((a, b) => a.order - b.order).map(step => <div key={step.id} className="rounded-lg border bg-white p-3 text-sm dark:bg-slate-900"><div className="font-medium">{step.order + 1}. {step.name}</div><div className="text-xs text-slate-500">{step.role} · {step.status}{step.timestamp ? ` · ${new Date(step.timestamp).toLocaleString()}` : ''}</div>{step.notes && <div className="mt-1 text-xs text-red-600">{step.notes}</div>}</div>)}</div>{rejectionInfo && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700"><strong>Rejected by {rejectionInfo.name}:</strong> {pan.rejectionReason || rejectionInfo.notes || 'No reason recorded.'}</p>}{pan.status === PANStatus.Cancelled && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700"><strong>Cancelled{cancelledByName ? ` by ${cancelledByName}` : ''}:</strong> {pan.cancellationReason || 'No reason recorded.'}</p>}</section>}

      {isForAcknowledgement && <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:bg-indigo-950/30"><h3 className="font-semibold text-indigo-900 dark:text-indigo-200">Employee acknowledgement</h3><p className="mt-1 text-sm text-indigo-800 dark:text-indigo-300">Review the details, then type your name and sign below.</p><div className="mt-3 sm:w-1/2"><Input label="Typed name" value={typedName} onChange={event => setTypedName(event.target.value)} placeholder="Full name" /></div><SignaturePad ref={signaturePadRef} /></section>}
    </div>
  </Modal>;
};

export default PANModal;
