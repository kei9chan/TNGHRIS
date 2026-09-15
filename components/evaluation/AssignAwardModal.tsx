
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Award, User, BusinessUnit, Role } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import EmployeeMultiSelect from '../feedback/EmployeeMultiSelect';
import CertificateRenderer from './CertificateRenderer';
import { fetchAwardTemplates } from '../../services/awardService';
import { supabase } from '../../services/supabaseClient';
import { formatEmployeeName } from '../../services/formatEmployeeName';
import { awardRecipients, awardConfirmation, isActiveAwardRecipient } from '../../services/awardRecipients';

interface AssignAwardModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAssign: (employeeId: string, awardId: string, notes: string, businessUnitId: string, departmentId: string, approvers: User[]) => Promise<void> | void;
    employees: User[];
    businessUnits: BusinessUnit[];
    awardTemplates: Award[];
    initialAwardId?: string;
}

const AssignAwardModal: React.FC<AssignAwardModalProps> = ({ isOpen, onClose, onAssign, employees, businessUnits, awardTemplates, initialAwardId }) => {
    const [step, setStep] = useState<'details' | 'preview'>('details');
    const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
    const [employeeSearch, setEmployeeSearch] = useState('');
    const [loadingPeople, setLoadingPeople] = useState(true);
    const [peopleError, setPeopleError] = useState('');
    const [results, setResults] = useState<string[]>([]);
    const submissionStarted = useRef(false);
    const inFlight = useRef(false);
    const [awardId, setAwardId] = useState('');
    const [notes, setNotes] = useState('');
    const [businessUnitId, setBusinessUnitId] = useState('');
    const [departmentId, setDepartmentId] = useState('');
    const [selectedApprovers, setSelectedApprovers] = useState<User[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [templates, setTemplates] = useState<Award[]>(awardTemplates);
    const [people, setPeople] = useState<User[]>(employees);
    const [bus, setBus] = useState<BusinessUnit[]>(businessUnits);
    const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
    const [templateError, setTemplateError] = useState('');

    const userHasRole = (candidate: User, role: Role) => candidate.role === role || candidate.roles?.includes(role);
    const allowedApproverRoles = [Role.BOD, Role.GeneralManager, Role.Manager, Role.BusinessUnitManager];

    useEffect(() => {
        let cancelled = false;
        const loadData = async () => {
            setLoadingPeople(true);
            setPeopleError('');
            setPeople([]);
            let loadedPeople = [...(people.length ? people : employees)].sort((a, b) => a.name.localeCompare(b.name));
            let loadedTemplates = templates.length ? templates : awardTemplates;
            let loadedBus = bus.length ? bus : businessUnits;

            try {
                const [userRows, { data: roleRows, error: roleError }] = await Promise.all([
                    (async () => {
                        const rows: any[] = [];
                        for (let offset = 0; ; offset += 1000) {
                            const { data, error } = await supabase.from('hris_users').select('id, full_name, email, role, position, business_unit, business_unit_id, department, department_id, status, employment_status').order('id').range(offset, offset + 999);
                            if (error) throw error;
                            rows.push(...(data || []));
                            if (!data || data.length < 1000) return rows;
                        }
                    })(),
                    supabase.from('user_roles').select('user_id, role_id').eq('is_active', true),
                ]);
                if (cancelled) return;
                if (roleError) throw roleError;
                if (userRows) {
                    const rolesByUser = new Map<string, Role[]>();
                    (roleRows || []).forEach((assignment: any) => {
                        const roles = rolesByUser.get(assignment.user_id) || [];
                        if (!roles.includes(assignment.role_id as Role)) roles.push(assignment.role_id as Role);
                        rolesByUser.set(assignment.user_id, roles);
                    });
                    loadedPeople = userRows.map((u: any) => ({
                        id: u.id,
                        authUserId: undefined,
                        name: formatEmployeeName(u.full_name || u.email || 'Unknown'),
                        email: u.email,
                        role: u.role,
                        department: u.department || '',
                        businessUnit: u.business_unit || '',
                        departmentId: u.department_id || undefined,
                        businessUnitId: u.business_unit_id || undefined,
                        status: String(u.status || '').trim().toLowerCase() === 'active' ? 'Active' : 'Inactive',
                        employmentStatus: u.employment_status || undefined,
                        roles: rolesByUser.get(u.id) || [u.role as Role],
                        isPhotoEnrolled: false,
                        dateHired: new Date(),
                        position: u.position || '',
                    })).sort((a, b) => a.name.localeCompare(b.name));
                    setPeople(loadedPeople);
                }
            } catch {
                if (cancelled) return;
                loadedPeople = [];
                setPeople([]);
                setPeopleError('Employees could not be loaded. Close this dialog and reopen it to try again.');
            }

            setIsLoadingTemplates(true);
            setTemplateError('');
            try {
                loadedTemplates = await fetchAwardTemplates();
                if (cancelled) return;
                setTemplates(loadedTemplates);
            } catch (error: any) {
                if (cancelled) return;
                loadedTemplates = awardTemplates;
                setTemplates(awardTemplates);
                setTemplateError(error?.message || 'Award templates could not be loaded.');
            } finally {
                if (!cancelled) setIsLoadingTemplates(false);
            }

            try {
                const { data: buRows } = await supabase.from('business_units').select('id, name, code, color');
                if (cancelled) return;
                if (buRows) {
                    loadedBus = buRows.map((b: any) => ({
                        id: b.id,
                        name: b.name,
                        code: b.code,
                        color: b.color || '#4F46E5',
                    }));
                    setBus(loadedBus);
                }
            } catch {
                if (cancelled) return;
                loadedBus = businessUnits;
                setBus(businessUnits);
            }

            return { loadedPeople, loadedTemplates, loadedBus };
        };
        if (isOpen) {
            setExcludedIds(new Set());
            setEmployeeSearch('');
            setResults([]);
            submissionStarted.current = false;
            loadData().then(result => {
                if (cancelled || !result) return;
                const { loadedPeople, loadedTemplates, loadedBus } = result;
                setStep('details');
                const firstEmployee = loadedPeople.find(isActiveAwardRecipient);
                const activeTemplates = loadedTemplates.length ? loadedTemplates : awardTemplates;
                setAwardId(activeTemplates.find(a => a.id === initialAwardId && a.isActive)?.id || activeTemplates.find(a => a.isActive)?.id || activeTemplates[0]?.id || '');
                const buId =
                    loadedBus.find(b => b.id === firstEmployee?.businessUnitId)?.id ||
                    loadedBus.find(b => b.name === firstEmployee?.businessUnit)?.id ||
                    firstEmployee?.businessUnitId ||
                    '';
                setBusinessUnitId(buId || '');
                setDepartmentId('');
                setNotes('');
                setSelectedApprovers([]);
                setLoadingPeople(false);
            });
        }
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    const filteredEmployees = useMemo(() => awardRecipients(people, businessUnitId, departmentId), [people, businessUnitId, departmentId]);
    const selectedEmployees = filteredEmployees.filter(employee => !excludedIds.has(employee.id));
    const employeeId = selectedEmployees[0]?.id || '';
    const visibleEmployees = filteredEmployees.filter(employee =>
        `${employee.name} ${employee.department}`.toLowerCase().includes(employeeSearch.trim().toLowerCase()));

    useEffect(() => {
        const templateBusinessUnitId = businessUnitId;
        if (initialAwardId || !templateBusinessUnitId) return;
        const preferred = (templates.length ? templates : awardTemplates).find(
            template => template.isActive && template.isDefault && template.businessUnitId === templateBusinessUnitId
        );
        if (preferred) setAwardId(preferred.id);
    }, [businessUnitId, employeeId, people, employees, templates, awardTemplates, initialAwardId]);

    const departmentOptions = useMemo(() => {
        const entries = awardRecipients(people, businessUnitId, '')
            .filter(employee => employee.departmentId && employee.department)
            .map(employee => [employee.departmentId!, employee.department] as const);
        return Array.from(new Map<string, string>(entries).entries())
            .sort((a, b) => a[1].localeCompare(b[1], undefined, { sensitivity: 'base' }));
    }, [people, employees, bus, businessUnitId]);

    const selectedEmployee = useMemo(
        () => (people.find(u => u.id === employeeId) || employees.find(u => u.id === employeeId)),
        [employeeId, people, employees]
    );
    const selectedAward = useMemo(
        () => templates.find(a => a.id === awardId) || awardTemplates.find(a => a.id === awardId),
        [awardId, templates, awardTemplates]
    );
    const filteredTemplates = useMemo(() => {
        return (templates.length ? templates : awardTemplates)
            .filter(template => template.isActive && template.status !== 'draft' && template.status !== 'archived')
            .filter(template => !template.businessUnitId || !businessUnitId || template.businessUnitId === businessUnitId)
            .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.title.localeCompare(b.title));
    }, [templates, awardTemplates, businessUnitId]);
    const eligibleApprovers = useMemo(() => (people.length ? people : employees).filter(candidate =>
        candidate.status === 'Active' && allowedApproverRoles.some(role => userHasRole(candidate, role))
    ), [people, employees]);
    const hasBodApprover = selectedApprovers.some(candidate => userHasRole(candidate, Role.BOD));
    const hasAvailableBod = eligibleApprovers.some(candidate => userHasRole(candidate, Role.BOD));

    useEffect(() => {
        if (!awardId || filteredTemplates.some(template => template.id === awardId)) return;
        setAwardId(filteredTemplates.find(template => template.isDefault)?.id || filteredTemplates[0]?.id || '');
    }, [filteredTemplates, awardId]);

    const handleNext = () => {
        if (loadingPeople || peopleError) return;
        if (!employeeId) {
            alert('Please select an employee.');
            return;
        }
        if (!awardId || !selectedAward) {
            alert(templateError || 'Please select an available published award template.');
            return;
        }
        if (!hasAvailableBod) {
            alert('No active Board of Director approver is configured. Ask an administrator to update roles and approval settings.');
            return;
        }
        if (!hasBodApprover) {
            alert('At least one active Board of Director approver is required.');
            return;
        }
        setStep('preview');
    };

    const handleGrant = async () => {
        if (submissionStarted.current || loadingPeople || peopleError) return;
        if (!selectedEmployee || !selectedAward) {
            alert('Please select an employee and award.');
            return;
        }
        if (!hasBodApprover) {
            alert('At least one active Board of Director approver is required.');
            return;
        }
        setIsGenerating(true);
        inFlight.current = true;
        submissionStarted.current = true;
        const messages: string[] = [];
        try {
            // Recheck current eligibility before any writes. Existing RPC checks
            // authorization, scope and mandatory BOD approval for each recipient.
            const { data: freshRows, error } = await supabase.from('hris_users')
                .select('id, status, employment_status, business_unit_id, department_id')
                .in('id', selectedEmployees.map(employee => employee.id));
            if (error) throw new Error('Could not verify current employee eligibility. No nominations submitted.');
            if (selectedEmployees.some(employee => !freshRows?.some(row => row.id === employee.id
                && isActiveAwardRecipient({ status: row.status, employmentStatus: row.employment_status })
                && row.business_unit_id === businessUnitId
                && (!departmentId || row.department_id === departmentId)))) {
                throw new Error('Employee status or assignment changed. No nominations submitted. Reopen this dialog to reload employees.');
            }
            for (const employee of selectedEmployees) {
                try {
                    await onAssign(employee.id, awardId, notes, businessUnitId, departmentId, selectedApprovers);
                    messages.push(`${employee.name}: submitted for approval.`);
                } catch (error) {
                    messages.push(`${employee.name}: submission not confirmed — ${(error as Error).message || 'Request failed'}. Check the Awards list before submitting again.`);
                }
                setResults([...messages]);
            }
        } catch (error) {
            console.error('Failed to submit award nomination', error);
            setResults([(error as Error)?.message || 'Failed to verify recipients. No nominations submitted.']);
        } finally {
            inFlight.current = false;
            setIsGenerating(false);
        }
    };

    const renderDetailsStep = () => (
        <div className="space-y-4">
            {loadingPeople && <p role="status">Loading employees…</p>}
            {peopleError && <p role="alert" className="text-red-600">{peopleError}</p>}
            <div>
                <label htmlFor="businessUnitId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Unit</label>
                <select
                    id="businessUnitId"
                    value={businessUnitId}
                    onChange={e => {
                        const newBuId = e.target.value;
                        setBusinessUnitId(newBuId);
                        setDepartmentId('');
                        setExcludedIds(new Set());
                        setEmployeeSearch('');
                    }}
                    disabled={loadingPeople || !!peopleError}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                    <option value="">Select Business Unit</option>
                    {[...(bus.length ? bus : businessUnits)].sort((a, b) => a.name.localeCompare(b.name)).map(bu => (
                        <option key={bu.id} value={bu.id}>{bu.name}</option>
                    ))}
                </select>
            </div>
            <div>
                <label htmlFor="departmentId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Department</label>
                <select
                    id="departmentId"
                    value={departmentId}
                    onChange={event => {
                        const nextDepartmentId = event.target.value;
                        setDepartmentId(nextDepartmentId);
                        setExcludedIds(new Set());
                        setEmployeeSearch('');
                    }}
                    disabled={loadingPeople || !businessUnitId || !!peopleError}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                    <option value="">All Departments</option>
                    {departmentOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
            </div>
            <div>
                <label htmlFor="award-employee-search" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Employees — search by name or department</label>
                <input id="award-employee-search" type="search" value={employeeSearch}
                    onChange={event => setEmployeeSearch(event.target.value)}
                    placeholder="Search employee name or department…"
                    className="mt-1 w-full rounded-md border p-2 dark:bg-gray-700 dark:text-white" />
                <div className="my-2 flex flex-wrap items-center gap-3 text-sm">
                    <button type="button" className="text-indigo-600 underline" onClick={() => setExcludedIds(new Set())}>Select All</button>
                    <button type="button" className="text-indigo-600 underline" onClick={() => setExcludedIds(new Set(filteredEmployees.map(employee => employee.id)))}>Clear All</button>
                    <span role="status">{selectedEmployees.length} of {filteredEmployees.length} employees selected</span>
                </div>
                <p className="mb-2 text-xs text-gray-500">Select All and Clear All apply to the entire selected business unit/department, including search-hidden employees.</p>
                <fieldset className="max-h-56 overflow-y-auto rounded-md border p-2">
                    <legend className="sr-only">Award recipients</legend>
                    {visibleEmployees.map(employee => <label key={employee.id} className="flex items-center gap-3 rounded p-2 hover:bg-gray-100 dark:hover:bg-gray-700">
                        <input type="checkbox" checked={!excludedIds.has(employee.id)} onChange={event => {
                            const checked = event.target.checked;
                            setExcludedIds(previous => { const next = new Set(previous); checked ? next.delete(employee.id) : next.add(employee.id); return next; });
                        }} />
                        <span>{formatEmployeeName(employee.name)}<span className="block text-xs text-gray-500">{employee.department || 'No department assigned'}</span></span>
                    </label>)}
                    {!visibleEmployees.length && <p className="p-2 text-sm">{loadingPeople ? 'Loading employees…' : 'No active employees match this scope or search.'}</p>}
                </fieldset>
                {!loadingPeople && !selectedEmployees.length && <p className="mt-1 text-sm text-red-600">Select at least one active employee to continue.</p>}
            </div>
            <div>
                <label htmlFor="awardId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Award Template</label>
                <select
                    id="awardId"
                    value={awardId}
                    onChange={e => setAwardId(e.target.value)}
                    disabled={isLoadingTemplates || !!templateError || !employeeId || !businessUnitId}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                    <option value="">{isLoadingTemplates ? 'Loading award templates…' : filteredTemplates.length ? 'Select an award template' : 'No published templates available'}</option>
                    {filteredTemplates.map(award => (
                        <option key={award.id} value={award.id}>{award.title}</option>
                    ))}
                </select>
                {templateError && <p className="mt-1 text-sm text-red-600">Award templates failed to load: {templateError}</p>}
            </div>
            <Textarea
                label="Notes / Reason for Award"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="e.g., For demonstrating exceptional leadership during the project..."
            />
            <EmployeeMultiSelect
                label="Request Approval From (at least one BOD required)"
                allUsers={eligibleApprovers}
                selectedUsers={selectedApprovers}
                onSelectionChange={setSelectedApprovers}
            />
            {!hasAvailableBod && <p className="text-sm font-semibold text-red-600">No active Board of Director approver is configured. Submission is blocked.</p>}
            {hasAvailableBod && !hasBodApprover && <p className="text-sm font-semibold text-amber-600">At least one active Board of Director approver is required. GM, Manager, and Business Unit Manager approvers are optional.</p>}
            {hasBodApprover && <p className="text-sm font-semibold text-emerald-600">✓ Mandatory Board of Director approval included.</p>}
        </div>
    );

    const renderPreviewStep = () => (
        <div className="flex flex-col items-center space-y-4">
            <p className="w-full rounded border border-indigo-200 bg-indigo-50 p-4 text-indigo-950">
                {awardConfirmation(selectedEmployees.length, filteredEmployees.length, bus.find(unit => unit.id === businessUnitId)?.name || '')}
                {departmentId && <span className="block mt-2">Department: {departmentOptions.find(([id]) => id === departmentId)?.[1]}</span>}
                <span className="block mt-2">Each nomination still requires the selected approvers, including BOD approval.</span>
            </p>
            {results.length > 0 && <div role="status" className="w-full max-h-60 overflow-auto rounded border p-3 text-sm">
                {results.map((result, index) => <p key={index} className="mb-2">{result}</p>)}
            </div>}
            <p className="text-sm text-gray-600 dark:text-gray-300 text-center">
                Sample certificate for {selectedEmployee?.name}. Each selected employee will receive their own certificate upon approval.
            </p>

            {/* Certificate Preview Container */}
            <div
                className="border shadow-lg bg-gray-100 dark:bg-gray-900 p-2 w-full overflow-auto"
                style={{ maxWidth: '100%' }}
            >
                <div
                    className="w-full flex justify-center"
                    style={{ minHeight: '760px' }}
                >
                    <div
                        className="inline-block"
                        style={{
                            transform: 'scale(0.6)',
                            transformOrigin: 'top center',
                            margin: '0 auto',
                        }}
                    >
                        {selectedAward?.design && selectedEmployee && (
                            <div id="certificate-preview">
                                <CertificateRenderer
                                    design={selectedAward.design}
                                    data={{
                                        employeeName: selectedEmployee.name,
                                        date: new Date(),
                                        awardTitle: selectedAward.title,
                                        citation: notes,
                                        position: selectedEmployee.position,
                                        department: selectedEmployee.department,
                                        businessUnit: bus.find(unit => unit.id === businessUnitId)?.name || selectedEmployee.businessUnit,
                                        awardValue: selectedAward.awardValueLabel,
                                    }}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

    const renderFooter = () => (
        <div className="flex justify-between w-full">
            {results.length > 0 ? (
                <Button variant="secondary" disabled={isGenerating} onClick={onClose}>Done</Button>
            ) : step === 'preview' ? (
                <Button variant="secondary" disabled={isGenerating} onClick={() => setStep('details')}>Back</Button>
            ) : (
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
            )}

            {step === 'details' ? (
                <Button onClick={handleNext} disabled={loadingPeople || !!peopleError || !employeeId}>Review Recipients & Certificate</Button>
            ) : (
                <Button onClick={handleGrant} isLoading={isGenerating} disabled={isGenerating || results.length > 0}>Confirm & Submit for Approval</Button>
            )}
        </div>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={() => { if (!inFlight.current) onClose(); }}
            title={step === 'details' ? "Assign an Award" : "Preview Certificate"}
            size={step === 'preview' ? '4xl' : 'lg'}
            footer={renderFooter()}
        >
            {step === 'details' ? renderDetailsStep() : renderPreviewStep()}
        </Modal>
    );
};

export default AssignAwardModal;
