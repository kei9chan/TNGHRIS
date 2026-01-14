import React, { useState, useEffect, useMemo } from 'react';
import { JobRequisition, JobRequisitionStatus, User, Role, JobRequisitionRole, JobRequisitionStepStatus, ApplicationStage } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { mockDepartments, mockBusinessUnits, mockUsers, mockApplications } from '../../services/mockData';
import EmployeeMultiSelect from '../feedback/EmployeeMultiSelect';
import { supabase } from '../../services/supabaseClient';

interface RequisitionModalProps {
    isOpen: boolean;
    onClose: () => void;
    requisition: JobRequisition | null;
    onSave: (requisition: JobRequisition) => void;
    onApprove: (requisitionId: string) => void;
    onReject: (requisition: JobRequisition) => void;
    onAddFinalApprovers: (requisitionId: string, finalApproverIds: string[]) => void;
}

const LifecycleTracker: React.FC<{ requisition: JobRequisition }> = ({ requisition }) => {
    const stats = useMemo(() => {
        const apps = mockApplications.filter(app => app.requisitionId === requisition.id);
        const hiredCount = apps.filter(app => app.stage === ApplicationStage.Hired).length;
        const offerCount = apps.filter(app => app.stage === ApplicationStage.Offer).length;
        const interviewCount = apps.filter(app => app.stage === ApplicationStage.Interview).length;
        const candidateCount = apps.filter(app => 
            ![ApplicationStage.New, ApplicationStage.Rejected, ApplicationStage.Withdrawn].includes(app.stage)
        ).length;
        const applicantCount = apps.length;

        return {
            hired: `${hiredCount} of ${requisition.headcount}`,
            offer: offerCount,
            interview: interviewCount,
            candidates: candidateCount,
            applicants: applicantCount,
        };
    }, [requisition]);

    const steps = [
        { name: 'Approved', active: true },
        { name: 'Sourcing', count: `(${stats.applicants})`, active: stats.applicants > 0 },
        { name: 'Screening', count: `(${stats.candidates})`, active: stats.candidates > 0 },
        { name: 'Interviewing', count: `(${stats.interview})`, active: stats.interview > 0 },
        { name: 'Offer', count: `(${stats.offer})`, active: stats.offer > 0 },
        { name: 'Hired', count: `(${stats.hired})`, active: !stats.hired.startsWith('0') },
    ];
    
    return (
        <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">Hiring Pipeline</h3>
            <div className="flex items-center space-x-1 overflow-x-auto pb-2 -ml-2">
                {steps.map((step, index) => (
                    <React.Fragment key={step.name}>
                        <div className={`flex flex-col items-center text-center p-2 rounded-md transition-colors w-24 flex-shrink-0 ${step.active ? 'bg-indigo-100 dark:bg-indigo-900/50' : 'bg-gray-100 dark:bg-gray-800/50'}`}>
                            <span className={`font-bold text-sm ${step.active ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-500 dark:text-gray-400'}`}>{step.name}</span>
                            <span className={`text-xs ${step.active ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-gray-500'}`}>
                                {step.count}
                            </span>
                        </div>
                        {index < steps.length - 1 && <div className="w-4 h-px bg-gray-300 dark:bg-gray-600"></div>}
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
};

const RequisitionModal: React.FC<RequisitionModalProps> = ({ isOpen, onClose, requisition, onSave, onApprove, onReject, onAddFinalApprovers }) => {
    const { user } = useAuth();
    const { getAccessibleBusinessUnits } = usePermissions();
    const [current, setCurrent] = useState<Partial<JobRequisition>>({});
    const [finalApprovers, setFinalApprovers] = useState<User[]>([]);
    const [businessUnits, setBusinessUnits] = useState(mockBusinessUnits);
    const [departments, setDepartments] = useState(mockDepartments);
    const initializedRef = React.useRef(false);

    const accessibleBus = useMemo(() => {
        const allowed = getAccessibleBusinessUnits(businessUnits);
        return allowed.length ? allowed : businessUnits;
    }, [getAccessibleBusinessUnits, businessUnits]);
    // Show full BU list for selection (not just accessible), since creation may target any BU
    const buOptions = businessUnits.length ? businessUnits : accessibleBus;

    useEffect(() => {
        const loadMeta = async () => {
            try {
                const { data: buData, error: buErr } = await supabase.from('business_units').select('id, name, code');
                if (buErr || !buData || buData.length === 0) {
                    setBusinessUnits(mockBusinessUnits);
                } else {
                    setBusinessUnits(buData.map((b: any) => ({ id: b.id, name: b.name, code: b.code || '' })));
                }
                const { data: deptData, error: deptErr } = await supabase.from('departments').select('id, name, business_unit_id');
                if (deptErr || !deptData || deptData.length === 0) {
                    setDepartments(mockDepartments);
                } else {
                    setDepartments(deptData.map((d: any) => ({ id: d.id, name: d.name, businessUnitId: d.business_unit_id })));
                }
            } catch (err) {
                console.warn('Failed to load BU/Departments for requisition', err);
                setBusinessUnits(mockBusinessUnits);
                setDepartments(mockDepartments);
            }
        };
        loadMeta();
    }, []);

    useEffect(() => {
        if (!isOpen) {
            initializedRef.current = false;
            return;
        }
        if (initializedRef.current) return;
        const initialData = requisition || {
            status: JobRequisitionStatus.Draft,
            headcount: 1,
            employmentType: 'Full-Time',
            locationType: 'Onsite',
            isUrgent: false,
            createdByUserId: user?.id,
            createdAt: new Date(),
            updatedAt: new Date(),
            routingSteps: [],
            businessUnitId: !requisition && buOptions.length > 0 ? buOptions[0].id : undefined
        };
        setCurrent(initialData);
        setFinalApprovers([]);
        initializedRef.current = true;
    }, [requisition, isOpen, user, buOptions.length]);

    // If no BU is selected and we have loaded options, set a default
    useEffect(() => {
        if (!isOpen) return;
        if (!current.businessUnitId && buOptions.length > 0) {
            setCurrent(prev => ({ ...prev, businessUnitId: buOptions[0].id }));
        }
        // Auto-select department if only one matches BU
        if (current.businessUnitId && !current.departmentId) {
            const matchingDepts = departments.filter(d => d.businessUnitId === current.businessUnitId);
            if (matchingDepts.length === 1) {
                setCurrent(prev => ({ ...prev, departmentId: matchingDepts[0].id }));
            }
        }
    }, [isOpen, buOptions, current.businessUnitId, current.departmentId, departments]);
    
    const approverPool = useMemo(() => mockUsers.filter(u => u.role === Role.BOD || u.role === Role.GeneralManager), []);

    const generateReqCode = () => {
        const now = new Date();
        const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
        const slug = (crypto?.randomUUID?.() || Math.random().toString(16).slice(2, 10)).replace(/-/g, '').slice(0, 6).toUpperCase();
        return `REQ-${ym}-${slug}`;
    };


    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        
        if (type === 'checkbox') {
            const { checked } = e.target as HTMLInputElement;
            setCurrent(prev => ({...prev, [name]: checked }));
            return;
        }

        // Changing BU should clear department to avoid mismatched options
        if (name === 'businessUnitId') {
            setCurrent(prev => ({
                ...prev,
                businessUnitId: value || undefined,
                departmentId: undefined
            }));
            return;
        }

        setCurrent(prev => ({
            ...prev,
            [name]: type === 'number' ? parseFloat(value) || 0 : value
        }));
    };
    
    const handleSave = (status: JobRequisitionStatus) => {
        if (!current.title || !current.businessUnitId || !current.departmentId || !current.justification) {
            alert('Title, Business Unit, Department, and Justification are required.');
            return;
        }

        let payload: Partial<JobRequisition> = {
            ...current,
            status,
            updatedAt: new Date(),
        };

        if (!payload.reqCode) {
            payload.reqCode = generateReqCode();
        }

        if (status === JobRequisitionStatus.PendingApproval && (!payload.routingSteps || payload.routingSteps.length === 0)) {
            const hrHead = mockUsers.find(u => u.role === Role.HRManager);
            if (hrHead) {
                payload.routingSteps = [{
                    id: `req-step-${payload.id || Date.now()}-1`,
                    userId: hrHead.id,
                    name: hrHead.name,
                    role: JobRequisitionRole.HR,
                    status: JobRequisitionStepStatus.Pending,
                    order: 1
                }]
            }
        }
        
        onSave(payload as JobRequisition);
    };

    const isDraft = !current.id || current.status === JobRequisitionStatus.Draft;
    // Allow edits only while draft; otherwise read-only
    const isReadOnly = !!current.status && current.status !== JobRequisitionStatus.Draft;
    const isSubmitted = !isDraft;

    const currentUserStep = requisition?.routingSteps.find(s => s.userId === user?.id && s.status === JobRequisitionStepStatus.Pending);
    const canApprove = !!currentUserStep;
    
    const allHrApproved = !!requisition?.routingSteps.filter(s => s.role === JobRequisitionRole.HR).every(s => s.status === JobRequisitionStepStatus.Approved);
    const hasFinalApprovers = !!requisition?.routingSteps.some(s => s.role === JobRequisitionRole.Final);
    const showFinalApproverSelection = allHrApproved && !hasFinalApprovers && requisition?.status === JobRequisitionStatus.PendingApproval && (user?.role === Role.HRManager || user?.role === Role.Admin);

    const footer = () => {
        if (showFinalApproverSelection) {
             return (
                <div className="flex justify-end w-full space-x-2">
                    <Button variant="secondary" onClick={onClose}>Close</Button>
                    <Button 
                        onClick={() => onAddFinalApprovers(requisition!.id, finalApprovers.map(u => u.id))} 
                        disabled={finalApprovers.length === 0 || !finalApprovers.some(u => u.role === Role.BOD)}
                    >
                        Submit for Final Approval
                    </Button>
                </div>
            )
        }

        if (canApprove) {
            return (
                <div className="flex justify-end w-full space-x-2">
                    <Button variant="secondary" onClick={onClose}>Close</Button>
                    <Button variant="danger" onClick={() => onReject(requisition!)}>Reject</Button>
                    <Button onClick={() => onApprove(requisition!.id)}>Approve Step</Button>
                </div>
            );
        }

        if (isSubmitted && !canApprove) {
            return (
                <div className="flex justify-end w-full">
                    <Button variant="secondary" onClick={onClose}>Close</Button>
                </div>
            )
        }
        
        if (isDraft) {
            return (
                <div className="flex justify-end w-full space-x-2">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => handleSave(JobRequisitionStatus.Draft)}>Save as Draft</Button>
                    <Button onClick={() => handleSave(JobRequisitionStatus.PendingApproval)}>Submit for Approval</Button>
                </div>
            );
        }
        
        return (
            <div className="flex justify-end w-full">
                <Button variant="secondary" onClick={onClose}>Close</Button>
            </div>
        );
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={current.reqCode ? `Requisition: ${current.reqCode}` : 'New Job Requisition'}
            footer={footer()}
        >
            <div className="space-y-4">
                {current.status && current.status !== JobRequisitionStatus.Draft && current.id && (
                    <div className="mb-4 p-4 border rounded-lg dark:border-gray-700">
                        <LifecycleTracker requisition={current as JobRequisition} />
                    </div>
                )}
                <Input label="Job Title" name="title" value={current.title || ''} onChange={handleChange} disabled={isReadOnly} required />
                 <div className="flex items-center">
                    <input type="checkbox" id="isUrgent" name="isUrgent" checked={current.isUrgent || false} onChange={handleChange} disabled={isReadOnly} className="h-4 w-4 text-red-600 border-gray-300 rounded focus:ring-red-500" />
                    <label htmlFor="isUrgent" className="ml-2 text-sm font-medium text-red-600 dark:text-red-400">Mark as Urgent</label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Unit</label>
                        <select name="businessUnitId" value={current.businessUnitId || ''} onChange={handleChange} disabled={isReadOnly} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            <option value="">Select BU</option>
                            {buOptions.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Department</label>
                        <select name="departmentId" value={current.departmentId || ''} onChange={handleChange} disabled={isReadOnly || !current.businessUnitId} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            <option value="">Select Department</option>
                            {departments.filter(d => d.businessUnitId === current.businessUnitId).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <Input label="Headcount" name="headcount" type="number" min="1" value={current.headcount || 1} onChange={handleChange} disabled={isReadOnly} required />
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Employment Type</label>
                        <select name="employmentType" value={current.employmentType || ''} onChange={handleChange} disabled={isReadOnly} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            <option>Full-Time</option>
                            <option>Part-Time</option>
                            <option>Contract</option>
                        </select>
                    </div>
                </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Location Type</label>
                        <select name="locationType" value={current.locationType || ''} onChange={handleChange} disabled={isReadOnly} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            <option>Onsite</option>
                            <option>Hybrid</option>
                            <option>Remote</option>
                        </select>
                    </div>
                     <Input label="Work Location" name="workLocation" value={current.workLocation || ''} onChange={handleChange} disabled={isReadOnly} />
                </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Budgeted Salary (Min)" name="budgetedSalaryMin" type="number" min="0" value={current.budgetedSalaryMin || ''} onChange={handleChange} disabled={isReadOnly} />
                    <Input label="Budgeted Salary (Max)" name="budgetedSalaryMax" type="number" min="0" value={current.budgetedSalaryMax || ''} onChange={handleChange} disabled={isReadOnly} />
                 </div>
                 <Textarea label="Justification" name="justification" value={current.justification || ''} onChange={handleChange} disabled={isReadOnly} rows={4} required/>

                 {isSubmitted && current.routingSteps && (
                    <div className="pt-4 border-t dark:border-gray-700">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Approval Routing</label>
                        <ul className="mt-2 space-y-2">
                            {current.routingSteps.map(step => (
                                <li key={step.id} className="flex items-center space-x-2 text-sm p-2 bg-gray-100 dark:bg-gray-700/50 rounded-md">
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                        step.status === JobRequisitionStepStatus.Approved ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' :
                                        step.status === JobRequisitionStepStatus.Rejected ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300' :
                                        'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'
                                    }`}>{step.status}</span>
                                    <span className="text-gray-800 dark:text-gray-200">by <strong>{step.name}</strong> ({step.role})</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                 )}

                {showFinalApproverSelection && (
                    <div className="pt-4 mt-4 border-t dark:border-gray-700">
                        <EmployeeMultiSelect 
                            label="Request Approval From (at least one BOD required)"
                            allUsers={approverPool}
                            selectedUsers={finalApprovers}
                            onSelectionChange={setFinalApprovers}
                        />
                         {finalApprovers.length > 0 && !finalApprovers.some(u => u.role === Role.BOD) && (
                            <p className="text-sm text-red-500 mt-1">At least one Board of Director must be selected.</p>
                        )}
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default RequisitionModal;
