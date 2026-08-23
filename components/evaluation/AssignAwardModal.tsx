
import React, { useState, useEffect, useMemo } from 'react';
import { Award, User, BusinessUnit } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import EmployeeMultiSelect from '../feedback/EmployeeMultiSelect';
import CertificateRenderer from './CertificateRenderer';
import { fetchAwardTemplates } from '../../services/awardService';
import { supabase } from '../../services/supabaseClient';
import { formatEmployeeName } from '../../services/formatEmployeeName';

interface AssignAwardModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAssign: (employeeId: string, awardId: string, notes: string, businessUnitId: string, departmentId: string, approvers: User[]) => Promise<void> | void;
    employees: User[];
    businessUnits: BusinessUnit[];
    awardTemplates: Award[];
}

const AssignAwardModal: React.FC<AssignAwardModalProps> = ({ isOpen, onClose, onAssign, employees, businessUnits, awardTemplates }) => {
    const [step, setStep] = useState<'details' | 'preview'>('details');
    const [employeeId, setEmployeeId] = useState('');
    const [awardId, setAwardId] = useState('');
    const [notes, setNotes] = useState('');
    const [businessUnitId, setBusinessUnitId] = useState('');
    const [departmentId, setDepartmentId] = useState('');
    const [selectedApprovers, setSelectedApprovers] = useState<User[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [templates, setTemplates] = useState<Award[]>(awardTemplates);
    const [people, setPeople] = useState<User[]>(employees);
    const [bus, setBus] = useState<BusinessUnit[]>(businessUnits);

    useEffect(() => {
        const loadData = async () => {
            let loadedPeople = [...(people.length ? people : employees)].sort((a, b) => a.name.localeCompare(b.name));
            let loadedTemplates = templates.length ? templates : awardTemplates;
            let loadedBus = bus.length ? bus : businessUnits;

            try {
                const { data: userRows } = await supabase
                    .from('hris_users')
                    .select('id, full_name, email, role, position, business_unit, business_unit_id, department, department_id, status');
                if (userRows) {
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
                        status: (u.status as 'Active' | 'Inactive') || 'Active',
                        isPhotoEnrolled: false,
                        dateHired: new Date(),
                        position: u.position || '',
                    })).sort((a, b) => a.name.localeCompare(b.name));
                    setPeople(loadedPeople);
                }
            } catch {
                loadedPeople = [...employees].sort((a, b) => a.name.localeCompare(b.name));
                setPeople(loadedPeople);
            }

            try {
                loadedTemplates = await fetchAwardTemplates();
                setTemplates(loadedTemplates);
            } catch {
                loadedTemplates = awardTemplates;
                setTemplates(awardTemplates);
            }

            try {
                const { data: buRows } = await supabase.from('business_units').select('id, name, code, color');
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
                loadedBus = businessUnits;
                setBus(businessUnits);
            }

            return { loadedPeople, loadedTemplates, loadedBus };
        };
        if (isOpen) {
            loadData().then(({ loadedPeople, loadedTemplates, loadedBus }) => {
                setStep('details');
                const activeEmployees = loadedPeople.length ? loadedPeople : employees;
                const firstEmployee = (activeEmployees.find(u => u.status === 'Active') || activeEmployees[0]);
                setEmployeeId(firstEmployee?.id || '');
                const activeTemplates = loadedTemplates.length ? loadedTemplates : awardTemplates;
                setAwardId(activeTemplates.find(a => a.isActive)?.id || activeTemplates[0]?.id || '');
                const buId =
                    loadedBus.find(b => b.id === firstEmployee?.businessUnitId)?.id ||
                    loadedBus.find(b => b.name === firstEmployee?.businessUnit)?.id ||
                    firstEmployee?.businessUnitId ||
                    '';
                setBusinessUnitId(buId || '');
                setDepartmentId(firstEmployee?.departmentId || '');
                setNotes('');
                setSelectedApprovers([]);
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    useEffect(() => {
        const selectedEmployeeRecord = people.find(candidate => candidate.id === employeeId) || employees.find(candidate => candidate.id === employeeId);
        const templateBusinessUnitId = businessUnitId || selectedEmployeeRecord?.businessUnitId;
        if (!templateBusinessUnitId) return;
        const preferred = (templates.length ? templates : awardTemplates).find(
            template => template.isActive && template.isDefault && template.businessUnitId === templateBusinessUnitId
        );
        if (preferred) setAwardId(preferred.id);
    }, [businessUnitId, employeeId, people, employees, templates, awardTemplates]);

    const filteredEmployees = useMemo(() => {
        const selectedBu = bus.find(b => b.id === businessUnitId);
        return (people.length ? people : employees)
            .filter(employee => {
                if (employee.status !== 'Active') return false;
                const matchesBusinessUnit = !businessUnitId
                    || employee.businessUnitId === businessUnitId
                    || (!!selectedBu && employee.businessUnit === selectedBu.name);
                const matchesDepartment = !departmentId || employee.departmentId === departmentId;
                return matchesBusinessUnit && matchesDepartment;
            })
            .sort((a, b) => formatEmployeeName(a.name).localeCompare(formatEmployeeName(b.name), undefined, { sensitivity: 'base' }));
    }, [people, employees, bus, businessUnitId, departmentId]);

    const departmentOptions = useMemo(() => {
        const selectedBu = bus.find(b => b.id === businessUnitId);
        const entries = (people.length ? people : employees)
            .filter(employee => !businessUnitId
                || employee.businessUnitId === businessUnitId
                || (!!selectedBu && employee.businessUnit === selectedBu.name))
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

    const handleNext = () => {
        if (!employeeId || !awardId || selectedApprovers.length === 0) {
            alert("Please select an employee, award, and at least one approver.");
            return;
        }
        setStep('preview');
    };

    const handleGrant = async () => {
        if (!selectedEmployee || !selectedAward) {
            alert('Please select an employee and award.');
            return;
        }
        setIsGenerating(true);
        try {
            await Promise.resolve(onAssign(employeeId, awardId, notes, businessUnitId, departmentId, selectedApprovers));
        } catch (error) {
            console.error('Failed to submit award nomination', error);
            alert((error as Error)?.message || 'Failed to submit award nomination. Please try again.');
        } finally {
            setIsGenerating(false);
        }
    };

    const renderDetailsStep = () => (
        <div className="space-y-4">
            <div>
                <label htmlFor="businessUnitId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Unit</label>
                <select
                    id="businessUnitId"
                    value={businessUnitId}
                    onChange={e => {
                        const newBuId = e.target.value;
                        setBusinessUnitId(newBuId);
                        setDepartmentId('');
                        const selectedBu = bus.find(b => b.id === newBuId);
                        const buEmps = (people.length ? people : employees).filter(u => {
                            return u.status === 'Active' && (!newBuId || u.businessUnitId === newBuId || (selectedBu && u.businessUnit === selectedBu.name));
                        }).sort((a, b) => formatEmployeeName(a.name).toLowerCase().localeCompare(formatEmployeeName(b.name).toLowerCase()));
                        if (buEmps.length > 0) {
                            setEmployeeId(buEmps[0].id);
                        } else {
                            setEmployeeId('');
                        }
                    }}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                    <option value="">All Business Units</option>
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
                        const selectedBu = bus.find(b => b.id === businessUnitId);
                        const nextEmployee = (people.length ? people : employees).find(employee =>
                            employee.status === 'Active'
                            && (!businessUnitId || employee.businessUnitId === businessUnitId || (!!selectedBu && employee.businessUnit === selectedBu.name))
                            && (!nextDepartmentId || employee.departmentId === nextDepartmentId)
                        );
                        setEmployeeId(nextEmployee?.id || '');
                    }}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                    <option value="">All Departments</option>
                    {departmentOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
            </div>
            <div>
                <label htmlFor="employeeId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Employee</label>
                <select
                    id="employeeId"
                    value={employeeId}
                    onChange={e => setEmployeeId(e.target.value)}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                    {filteredEmployees.map(employee => (
                        <option key={employee.id} value={employee.id}>{formatEmployeeName(employee.name)}</option>
                    ))}
                </select>
            </div>
            <div>
                <label htmlFor="awardId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Award Template</label>
                <select
                    id="awardId"
                    value={awardId}
                    onChange={e => setAwardId(e.target.value)}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                    {(templates.length ? templates : awardTemplates).filter(a => a.isActive).sort((a, b) => a.title.localeCompare(b.title)).map(award => (
                        <option key={award.id} value={award.id}>{award.title}</option>
                    ))}
                </select>
            </div>
            <Textarea
                label="Notes / Reason for Award"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="e.g., For demonstrating exceptional leadership during the project..."
            />
            <EmployeeMultiSelect
                label="Request Approval From"
                allUsers={(people.length ? people : employees).filter(u => u.role !== 'Employee')}
                selectedUsers={selectedApprovers}
                onSelectionChange={setSelectedApprovers}
            />
        </div>
    );

    const renderPreviewStep = () => (
        <div className="flex flex-col items-center space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300 text-center">
                Review the certificate below. This image will be generated and emailed to the employee upon approval.
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
            {step === 'preview' ? (
                <Button variant="secondary" onClick={() => setStep('details')}>Back</Button>
            ) : (
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
            )}

            {step === 'details' ? (
                <Button onClick={handleNext}>Preview Certificate</Button>
            ) : (
                <Button onClick={handleGrant} isLoading={isGenerating}>Submit for Approval</Button>
            )}
        </div>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={step === 'details' ? "Assign an Award" : "Preview Certificate"}
            size={step === 'preview' ? '4xl' : 'lg'}
            footer={renderFooter()}
        >
            {step === 'details' ? renderDetailsStep() : renderPreviewStep()}
        </Modal>
    );
};

export default AssignAwardModal;
