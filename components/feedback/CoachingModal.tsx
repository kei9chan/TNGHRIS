
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { CoachingSession, CoachingStatus, CoachingTrigger, User } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import { useAuth } from '../../hooks/useAuth';
import SignaturePad, { SignaturePadRef } from '../ui/SignaturePad';

interface CoachingModalProps {
    isOpen: boolean;
    onClose: () => void;
    session: CoachingSession | null;
    onSave: (session: Partial<CoachingSession>) => void;
    initialData?: Partial<CoachingSession>;
    employees: User[];
}

const CoachingModal: React.FC<CoachingModalProps> = ({ isOpen, onClose, session, onSave, initialData, employees }) => {
    const { user } = useAuth();
    const [current, setCurrent] = useState<Partial<CoachingSession>>({});
    
    const coachSignaturePad = useRef<SignaturePadRef>(null);
    const employeeSignaturePadRef = useRef<SignaturePadRef>(null);

    // Search state
    const [employeeSearch, setEmployeeSearch] = useState('');
    const [coachSearch, setCoachSearch] = useState('');
    const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
    const [showCoachDropdown, setShowCoachDropdown] = useState(false);
    
    const employeeWrapperRef = useRef<HTMLDivElement>(null);
    const coachWrapperRef = useRef<HTMLDivElement>(null);

    // Filter active employees for selection
    const eligibleEmployees = useMemo(() => {
        return employees.filter(u => (u as any).status === 'Active' && u.id !== user?.id).sort((a, b) => a.name.localeCompare(b.name));
    }, [user, employees]);

    // Filter potential coaches (Managers, HR, Admins)
    const eligibleCoaches = useMemo(() => {
        return employees.filter(u => (u as any).status === 'Active' && ['Admin', 'HR Manager', 'Manager', 'Business Unit Manager', 'Operations Director'].includes(u.role)).sort((a, b) => a.name.localeCompare(b.name));
    }, [employees]);

    const filteredEmployees = useMemo(() => {
        return eligibleEmployees.filter(u => u.name.toLowerCase().includes(employeeSearch.toLowerCase()));
    }, [eligibleEmployees, employeeSearch]);

    const filteredCoaches = useMemo(() => {
        return eligibleCoaches.filter(u => u.name.toLowerCase().includes(coachSearch.toLowerCase()));
    }, [eligibleCoaches, coachSearch]);

    useEffect(() => {
        if (isOpen) {
            if (session) {
                setCurrent(session);
                setEmployeeSearch(session.employeeName || '');
                setCoachSearch(session.coachName || '');
            } else {
                // Merge initialData (from IR conversion) with defaults
                const newSession = {
                    coachId: user?.id,
                    coachName: user?.name,
                    status: CoachingStatus.Draft,
                    date: new Date(),
                    trigger: CoachingTrigger.Performance,
                    ...initialData
                };
                setCurrent(newSession);
                setEmployeeSearch(newSession.employeeName || '');
                setCoachSearch(newSession.coachName || user?.name || '');
            }
            setShowEmployeeDropdown(false);
            setShowCoachDropdown(false);
        }
    }, [isOpen, session, user, initialData]);

    // Click outside handler to close dropdowns
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (employeeWrapperRef.current && !employeeWrapperRef.current.contains(event.target as Node)) {
                setShowEmployeeDropdown(false);
            }
            if (coachWrapperRef.current && !coachWrapperRef.current.contains(event.target as Node)) {
                setShowCoachDropdown(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setCurrent(prev => ({ ...prev, [name]: value }));
    };

    const handleDateChange = (name: string, value: string) => {
        setCurrent(prev => ({ ...prev, [name]: new Date(value) }));
    }

    const handleSelectEmployee = (u: User) => {
        setCurrent(prev => ({ ...prev, employeeId: u.id, employeeName: u.name }));
        setEmployeeSearch(u.name);
        setShowEmployeeDropdown(false);
    };

    const handleSelectCoach = (u: User) => {
        setCurrent(prev => ({ ...prev, coachId: u.id, coachName: u.name }));
        setCoachSearch(u.name);
        setShowCoachDropdown(false);
    };

    const handleSave = (status: CoachingStatus) => {
        if (!current.employeeId || !current.context || !current.date) {
            alert("Please fill in all required fields (Employee, Date, Context).");
            return;
        }
        
        let coachSig = current.coachSignatureUrl;
        let empSig = current.employeeSignatureUrl;

        // Validation for completing a session
        if (status === CoachingStatus.Completed) {
            if (!current.rootCause || !current.actionPlan || !current.followUpDate) {
                alert("To complete the session, please fill in the Root Cause, Action Plan, and Follow-up Date.");
                return;
            }
            // Require Coach Signature if not already present
            if (!coachSig && coachSignaturePad.current?.isEmpty()) {
                alert("Coach signature is required to complete the session.");
                return;
            }
            if (coachSignaturePad.current && !coachSignaturePad.current.isEmpty()) {
                coachSig = coachSignaturePad.current.getSignatureDataUrl() || undefined;
            }
        }

        // Validation for Acknowledgment
        if (status === CoachingStatus.Acknowledged) {
            if (!empSig && employeeSignaturePadRef.current?.isEmpty()) {
                 alert("Employee signature is required to acknowledge.");
                 return;
            }
             if (employeeSignaturePadRef.current && !employeeSignaturePadRef.current.isEmpty()) {
                empSig = employeeSignaturePadRef.current.getSignatureDataUrl() || undefined;
            }
        }

        // Look up names if IDs changed (though search handlers update names too)
        const employee = employees.find(u => u.id === current.employeeId);
        const coach = employees.find(u => u.id === current.coachId);

        onSave({
            ...current,
            employeeName: employee?.name || current.employeeName || 'Unknown',
            coachName: coach?.name || current.coachName || 'Unknown',
            status,
            coachSignatureUrl: coachSig,
            employeeSignatureUrl: empSig,
            acknowledgedAt: status === CoachingStatus.Acknowledged ? new Date() : current.acknowledgedAt
        });
    };
    
    const isExecutionPhase = current.status === CoachingStatus.Scheduled;
    const isCompleted = current.status === CoachingStatus.Completed;
    const isAcknowledged = current.status === CoachingStatus.Acknowledged;
    const isReadOnly = isCompleted || isAcknowledged;
    const isDraft = current.status === CoachingStatus.Draft || !current.status;

    const isEmployeeUser = user?.id === current.employeeId;
    // Coach user check: Is current user the assigned coach? OR Is admin/HR?
    const isCoachUser = user?.id === current.coachId || ['Admin', 'HR Manager'].includes(user?.role || '');

    const formatDateForInput = (date?: Date) => date ? new Date(date).toISOString().split('T')[0] : '';

    const renderFooter = () => {
        // Employee Acknowledgment View
        if (isEmployeeUser && isCompleted) {
             return (
                <div className="flex justify-end space-x-2">
                     <Button variant="secondary" onClick={onClose}>Close</Button>
                     <Button onClick={() => handleSave(CoachingStatus.Acknowledged)}>Acknowledge & Commit</Button>
                </div>
             );
        }

        // Coach Execution View
        return (
            <div className="flex justify-end space-x-2">
                <Button variant="secondary" onClick={onClose}>Close</Button>
                
                {isDraft && isCoachUser && (
                    <>
                        <Button variant="secondary" onClick={() => handleSave(CoachingStatus.Draft)}>Save Draft</Button>
                        <Button onClick={() => handleSave(CoachingStatus.Scheduled)}>Schedule Session</Button>
                    </>
                )}
                
                {isExecutionPhase && isCoachUser && (
                    <>
                        <Button variant="secondary" onClick={() => handleSave(CoachingStatus.Scheduled)}>Save Progress</Button>
                        <Button onClick={() => handleSave(CoachingStatus.Completed)}>Sign & Complete Session</Button>
                    </>
                )}
            </div>
        );
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={session ? `Coaching Session: ${current.status}` : 'New Coaching Request'}
            footer={renderFooter()}
            size="lg"
        >
            <div className="space-y-6">
                {/* Request / Plan Section */}
                <div className={`space-y-4 ${!isDraft ? 'opacity-90' : ''}`}>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div ref={employeeWrapperRef} className="relative">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Employee</label>
                            <Input 
                                label="" 
                                value={employeeSearch} 
                                onChange={(e) => {
                                    setEmployeeSearch(e.target.value);
                                    setShowEmployeeDropdown(true);
                                    if (e.target.value === '') setCurrent(prev => ({ ...prev, employeeId: '' }));
                                }}
                                onFocus={() => isDraft && setShowEmployeeDropdown(true)}
                                disabled={!isDraft}
                                placeholder="Search Employee..."
                                autoComplete="off"
                            />
                            {showEmployeeDropdown && isDraft && (
                                <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto">
                                    {filteredEmployees.length > 0 ? filteredEmployees.map(u => (
                                        <div 
                                            key={u.id} 
                                            className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-sm text-gray-900 dark:text-gray-200"
                                            onClick={() => handleSelectEmployee(u)}
                                        >
                                            {u.name}
                                        </div>
                                    )) : (
                                        <div className="px-4 py-2 text-sm text-gray-500">No matches found</div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div ref={coachWrapperRef} className="relative">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Coach</label>
                            <Input 
                                label="" 
                                value={coachSearch} 
                                onChange={(e) => {
                                    setCoachSearch(e.target.value);
                                    setShowCoachDropdown(true);
                                    if (e.target.value === '') setCurrent(prev => ({ ...prev, coachId: '' }));
                                }}
                                onFocus={() => isDraft && setShowCoachDropdown(true)}
                                disabled={!isDraft}
                                placeholder="Search Coach..."
                                autoComplete="off"
                            />
                            {showCoachDropdown && isDraft && (
                                <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto">
                                    {filteredCoaches.length > 0 ? filteredCoaches.map(u => (
                                        <div 
                                            key={u.id} 
                                            className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-sm text-gray-900 dark:text-gray-200"
                                            onClick={() => handleSelectCoach(u)}
                                        >
                                            {u.name}
                                        </div>
                                    )) : (
                                        <div className="px-4 py-2 text-sm text-gray-500">No matches found</div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Trigger / Reason</label>
                            <select 
                                name="trigger" 
                                value={current.trigger} 
                                onChange={handleChange}
                                disabled={!isDraft}
                                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-800"
                            >
                                {Object.values(CoachingTrigger).map(t => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                        </div>
                        <Input 
                            label="Scheduled Date" 
                            type="date" 
                            value={formatDateForInput(current.date)} 
                            onChange={(e) => handleDateChange('date', e.target.value)}
                            disabled={!isDraft && !isExecutionPhase}
                        />
                    </div>

                    <Textarea 
                        label="Context / Issue Description" 
                        name="context" 
                        value={current.context || ''} 
                        onChange={handleChange} 
                        rows={3} 
                        placeholder="Describe the situation or behavior that triggered this coaching session..."
                        required
                        disabled={!isDraft}
                    />
                </div>

                {/* Execution Section */}
                {(isExecutionPhase || isReadOnly) && (
                    <div className="pt-6 border-t border-gray-200 dark:border-gray-700 space-y-4 animate-fade-in-up">
                        <h3 className="text-lg font-bold text-indigo-900 dark:text-indigo-100">Session Documentation</h3>
                        
                         <Textarea 
                            label="Root Cause Analysis" 
                            name="rootCause" 
                            value={current.rootCause || ''} 
                            onChange={handleChange} 
                            rows={3} 
                            placeholder="What is the underlying cause? (e.g., Lack of training, personal issues, process gap)"
                            required={isExecutionPhase}
                            disabled={isReadOnly || !isCoachUser} // Prevent employees from editing this section
                        />

                        <Textarea 
                            label="Action Plan / Goals" 
                            name="actionPlan" 
                            value={current.actionPlan || ''} 
                            onChange={handleChange} 
                            rows={3} 
                            placeholder="What specific steps will be taken? Define clear, measurable goals."
                            required={isExecutionPhase}
                            disabled={isReadOnly || !isCoachUser} // Prevent employees from editing this section
                        />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input 
                                label="Follow-up Date" 
                                type="date" 
                                value={formatDateForInput(current.followUpDate)} 
                                onChange={(e) => handleDateChange('followUpDate', e.target.value)} 
                                required={isExecutionPhase}
                                disabled={isReadOnly || !isCoachUser}
                            />
                        </div>

                         {/* Coach Signature */}
                        <div>
                             <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Coach's Signature</label>
                             {current.coachSignatureUrl ? (
                                 <img src={current.coachSignatureUrl} alt="Coach Signature" className="mt-1 h-16 border p-1 rounded bg-white" />
                             ) : isExecutionPhase && isCoachUser ? (
                                 <SignaturePad ref={coachSignaturePad} />
                             ) : (
                                 <p className="text-sm text-gray-500 italic">Pending signature</p>
                             )}
                        </div>
                    </div>
                )}

                {/* Employee Acknowledgment Section */}
                {(isCompleted || isAcknowledged) && (
                     <div className="pt-6 border-t border-gray-200 dark:border-gray-700 space-y-4 animate-fade-in-up">
                        <h3 className="text-lg font-bold text-green-800 dark:text-green-200">Employee Acknowledgment</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            By signing below, I acknowledge that this coaching session has taken place and I commit to the action plan agreed upon.
                        </p>

                         {/* Employee Signature */}
                         <div>
                             <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Employee's Signature</label>
                             {current.employeeSignatureUrl ? (
                                 <div className="space-y-1">
                                    <img src={current.employeeSignatureUrl} alt="Employee Signature" className="mt-1 h-16 border p-1 rounded bg-white" />
                                    {current.acknowledgedAt && <p className="text-xs text-gray-500">Signed on {new Date(current.acknowledgedAt).toLocaleString()}</p>}
                                 </div>
                             ) : isEmployeeUser && isCompleted ? (
                                 <SignaturePad ref={employeeSignaturePadRef} />
                             ) : (
                                 <p className="text-sm text-orange-600 italic font-medium">Pending employee acknowledgment</p>
                             )}
                        </div>
                     </div>
                )}
            </div>
        </Modal>
    );
};

export default CoachingModal;
