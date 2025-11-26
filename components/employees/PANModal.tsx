import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { PAN, User, SalaryBreakdown, PANActionTaken, PANStatus, PANTemplate, Role, PANRoutingStep, PANStepStatus, PANRole } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import { mockUsers } from '../../services/mockData';
import Input from '../ui/Input';
import EmployeeMultiSelect from '../feedback/EmployeeMultiSelect';
import { useAuth } from '../../hooks/useAuth';
import { useSettings } from '../../context/SettingsContext';
import SignaturePad, { SignaturePadRef } from '../ui/SignaturePad';
import { logActivity } from '../../services/auditService';

interface PANModalProps {
  isOpen: boolean;
  onClose: () => void;
  pan: PAN | null;
  templates: PANTemplate[];
  onSaveDraft: (pan: Partial<PAN>) => void;
  onSendForAcknowledgement: (pan: Partial<PAN>) => void;
  onAcknowledge: (panId: string, signatureDataUrl: string, signatureName: string) => void;
  onDownloadPdf: (pan: PAN) => void;
  onApprove?: (panId: string) => void;
  onReject?: (pan: PAN) => void;
}

const calculateTenure = (dateHired?: Date): string => {
    if (!dateHired) return 'N/A';
    const now = new Date();
    const hired = new Date(dateHired);
    let years = now.getFullYear() - hired.getFullYear();
    let months = now.getMonth() - hired.getMonth();
    if (months < 0 || (months === 0 && now.getDate() < hired.getDate())) {
        years--;
        months = (months + 12) % 12;
    }
    return `${years} Years & ${months} Months`;
};

const emptySalary: SalaryBreakdown = { basic: 0, deminimis: 0, reimbursable: 0 };
const emptyActions: PANActionTaken = { changeOfStatus: false, promotion: false, transfer: false, salaryIncrease: false, changeOfJobTitle: false, others: '' };

const PANModal: React.FC<PANModalProps> = ({ isOpen, onClose, pan, templates, onSaveDraft, onSendForAcknowledgement, onAcknowledge, onDownloadPdf, onApprove, onReject }) => {
  const { user } = useAuth();
  const { settings } = useSettings();
  const [current, setCurrent] = useState<Partial<PAN>>(pan || {});
  const [selectedEmployee, setSelectedEmployee] = useState<User | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedApprovers, setSelectedApprovers] = useState<User[]>([]);

  const [employeeSearch, setEmployeeSearch] = useState('');
  const [isEmployeeSearchOpen, setIsEmployeeSearchOpen] = useState(false);
  const searchWrapperRef = useRef<HTMLDivElement>(null);
  
  const signaturePadRef = useRef<SignaturePadRef>(null);
  const [typedName, setTypedName] = useState('');

  // State for email modal
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState('');


  const isNew = !pan;
  const isDraft = pan?.status === PANStatus.Draft;
  const isApproved = pan?.status === PANStatus.Completed;
  
  const canEdit = useMemo(() => {
    if (isNew || isDraft) return true;
    if (!pan || !user) return false;
    // Allow editing a rejected PAN if the current user is an admin/HR
    const isHR = user.role === Role.Admin || user.role === Role.HRManager || user.role === Role.HRStaff;
    return pan.status === PANStatus.Declined && isHR;
  }, [pan, user, isNew, isDraft]);

  const isSubjectOfPAN = useMemo(() => user?.id === pan?.employeeId, [user, pan]);
  
  const isForAcknowledgement = useMemo(() => {
    if (!pan || !user) return false;
    const isEmployee = pan.employeeId === user.id;
    return isEmployee && pan.status === PANStatus.PendingEmployee;
  }, [pan, user]);


  const approverPool = useMemo(() => {
    return mockUsers.filter(u => u.role !== Role.Employee && u.status === 'Active');
  }, []);

  const currentUserStep = useMemo(() => {
    if (!pan || !user) return null;
    return pan.routingSteps.find(s => s.userId === user.id && s.status === PANStepStatus.Pending);
  }, [pan, user]);

  const canTakeAction = !!currentUserStep;

  const rejectionInfo = useMemo(() => {
    if (!pan || pan.status !== PANStatus.Declined) return null;
    return pan.routingSteps.find(s => s.status === PANStepStatus.Declined);
  }, [pan]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(event.target as Node)) {
        setIsEmployeeSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [searchWrapperRef]);

  useEffect(() => {
    if (isOpen) {
      if (pan) {
        setCurrent(pan);
        const employee = mockUsers.find(u => u.id === pan.employeeId);
        setSelectedEmployee(employee || null);
        if (pan.routingSteps) {
            const approverUsers = pan.routingSteps
                .map(step => mockUsers.find(u => u.id === step.userId))
                .filter((u): u is User => !!u);
            setSelectedApprovers(approverUsers);
        } else {
             setSelectedApprovers([]);
        }
      } else {
        // Reset for new PAN
        setCurrent({
          status: PANStatus.Draft,
          effectiveDate: new Date(),
          actionTaken: { ...emptyActions },
          particulars: {
            from: { salary: { ...emptySalary } },
            to: { salary: { ...emptySalary } },
          },
          notes: '',
        });
        setSelectedEmployee(null);
        setEmployeeSearch('');
        setSelectedApprovers([]);
      }
      setSelectedTemplateId('');
      if (user && isForAcknowledgement) {
          setTypedName(user.name);
      } else {
          setTypedName('');
      }
    }
  }, [pan, isOpen, user, isForAcknowledgement]);

  useEffect(() => {
    if (selectedEmployee) {
      setEmployeeSearch(selectedEmployee.name);
      const fromParticulars = {
        employmentStatus: 'Regular', // Assuming, could be from user object
        position: selectedEmployee.position,
        department: selectedEmployee.department,
        salary: selectedEmployee.salary || { ...emptySalary },
      };
      setCurrent(prev => ({
        ...prev,
        tenure: calculateTenure(selectedEmployee.dateHired),
        particulars: {
          from: fromParticulars,
          // If we are creating a new PAN, initialize 'to' with 'from'. If editing, keep existing 'to'.
          to: prev.particulars?.to && Object.keys(prev.particulars.to).length > 1 ? prev.particulars.to : fromParticulars,
        },
      }));
    }
  }, [selectedEmployee]);

  const availableEmployees = useMemo(() => {
    if (!employeeSearch || employeeSearch === selectedEmployee?.name) return [];
    const lowerSearch = employeeSearch.toLowerCase();
    return mockUsers.filter(u => 
        u.status === 'Active' && 
        u.name.toLowerCase().includes(lowerSearch)
    ).slice(0, 5); // Limit results
  }, [employeeSearch, selectedEmployee]);

  const handleSelectEmployee = (employee: User) => {
      setSelectedEmployee(employee);
      setCurrent(prev => ({ ...prev, employeeId: employee.id, employeeName: employee.name }));
      setEmployeeSearch(employee.name);
      setIsEmployeeSearchOpen(false);
  };
  
  const handleTemplateSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const templateId = e.target.value;
    setSelectedTemplateId(templateId);

    if (templateId) {
        const selectedTemplate = templates.find(t => t.id === templateId);
        if (selectedTemplate) {
            let notes = selectedTemplate.notes || '';
            const effectiveDate = current.effectiveDate || new Date();
            // Replace placeholder with formatted date
            notes = notes.replace(/\{\{effective_date\}\}/g, new Date(effectiveDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));

            
            setCurrent(prev => ({
                ...prev,
                actionTaken: { ...emptyActions, ...selectedTemplate.actionTaken },
                notes: notes,
                logoUrl: selectedTemplate.logoUrl,
                preparerName: selectedTemplate.preparerName,
                preparerSignatureUrl: selectedTemplate.preparerSignatureUrl,
            }));
        }
    } else { // Reset if default option is selected
        setCurrent(prev => ({
            ...prev,
            actionTaken: { ...emptyActions },
            notes: '',
            logoUrl: '',
            preparerName: '',
            preparerSignatureUrl: '',
        }));
    }
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = new Date(e.target.value);
    setCurrent(prev => {
      let notes = prev.notes;
      if (selectedTemplateId) {
        const selectedTemplate = templates.find(t => t.id === selectedTemplateId);
        if (selectedTemplate && selectedTemplate.notes) {
          notes = selectedTemplate.notes.replace(/\{\{effective_date\}\}/g, newDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
        }
      }
      return { ...prev, effectiveDate: newDate, notes };
    });
  };

  const handleActionTakenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked, type, value } = e.target;
    setCurrent(prev => ({
        ...prev,
        actionTaken: {
            ...(prev.actionTaken || emptyActions),
            [name]: type === 'checkbox' ? checked : value,
        }
    }));
  };

  const handleParticularsChange = (field: string, value: string | SalaryBreakdown) => {
    setCurrent(prev => ({
      ...prev,
      particulars: {
        from: prev.particulars?.from || {},
        to: {
          ...(prev.particulars?.to || {}),
          [field]: value,
        },
      },
    }));
  };
  
  const handleSalaryChange = (field: keyof SalaryBreakdown, value: string) => {
      const numericValue = parseFloat(value) || 0;
      const newSalary = {
          ...(current.particulars?.to?.salary || emptySalary),
          [field]: numericValue,
      };
      handleParticularsChange('salary', newSalary);
  }

  const handleAcknowledgeAndSign = () => {
    if (!pan) return;
    if (!typedName.trim() || signaturePadRef.current?.isEmpty()) {
        alert("Please provide your full name and signature.");
        return;
    }
    const signatureDataUrl = signaturePadRef.current.getSignatureDataUrl();
    if (signatureDataUrl) {
        onAcknowledge(pan.id, signatureDataUrl, typedName);
    }
  };
  
  const createPayload = (): Partial<PAN> => {
    const routingSteps: PANRoutingStep[] = selectedApprovers.map((approver, index) => ({
      id: `step-${current.id || Date.now()}-${index}`,
      userId: approver.id,
      name: approver.name,
      role: PANRole.Approver, // Simplified role
      status: PANStepStatus.Pending,
      order: index + 1,
    }));
    return { ...current, routingSteps };
  };

  const handleSend = () => {
    if (selectedApprovers.length === 0 || !selectedApprovers.some(a => a.role === Role.BOD)) {
        alert("Please select at least one approver, including at least one Board of Director.");
        return;
    }
    const payload = createPayload();
    onSendForAcknowledgement(payload);
  };

  const handleDraft = () => {
    const payload = createPayload();
    onSaveDraft(payload);
  };

  const fromSalaryTotal = useMemo(() => {
      const s = current.particulars?.from?.salary;
      return (s?.basic || 0) + (s?.deminimis || 0) + (s?.reimbursable || 0);
  }, [current.particulars?.from?.salary]);

  const toSalaryTotal = useMemo(() => {
      const s = current.particulars?.to?.salary;
      return (s?.basic || 0) + (s?.deminimis || 0) + (s?.reimbursable || 0);
  }, [current.particulars?.to?.salary]);

  const handleOpenEmailModal = () => {
    if (!pan) return;
    const employee = mockUsers.find(u => u.id === pan.employeeId);
    setEmailRecipient(employee?.email || user?.email || '');
    setIsEmailModalOpen(true);
  };

  const handleSendEmail = () => {
    if (!emailRecipient.includes('@')) {
      alert('Please enter a valid email address.');
      return;
    }
    alert(`(Simulation) PAN PDF has been sent to ${emailRecipient}.`);
    if (user && pan) {
        logActivity(user, 'EXPORT', 'PAN', pan.id, `Emailed PAN PDF to ${emailRecipient}.`);
    }
    setIsEmailModalOpen(false);
  };


  const renderFooter = () => {
    if (canTakeAction && onApprove && onReject) {
        return (
            <div className="flex justify-end w-full space-x-2">
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button variant="danger" onClick={() => onReject(pan!)}>Reject</Button>
                <Button onClick={() => onApprove(pan!.id)}>Approve</Button>
            </div>
        );
    }
    if (isForAcknowledgement) {
        return (
            <div className="flex justify-end w-full">
                <Button onClick={handleAcknowledgeAndSign}>Acknowledge &amp; Accept</Button>
            </div>
        );
    }

    if (canEdit) {
        return (
             <div className="flex justify-end w-full space-x-2">
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button variant="secondary" onClick={handleDraft}>Save Draft</Button>
                <Button onClick={handleSend}>Send for Approval</Button>
            </div>
        );
    }

    return (
        <div className="flex justify-end w-full">
            <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
    );
  };
  
  const AcknowledgmentSection = () => (
    <div className="mt-4 pt-4 border-t dark:border-gray-600 space-y-4">
        <h3 className="font-semibold text-lg">Acknowledgement</h3>
        <p className="text-sm text-gray-500">By clicking "Acknowledge &amp; Accept", you confirm that you have received this notice and understand the changes detailed above.</p>
        <Input 
            label="Type Your Full Name"
            id="typed-name"
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            required
        />
        <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Digital Signature</label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Type your name or draw your signature below.</p>
            <SignaturePad ref={signaturePadRef} />
        </div>
    </div>
  );
  
  const SignedDetails = () => (
    <div className="mt-4 pt-4 border-t dark:border-gray-600 space-y-2">
        <h3 className="font-semibold text-lg">Employee Acknowledgement</h3>
        <p><span className="font-medium">Acknowledged By:</span> {pan?.signatureName}</p>
        <p><span className="font-medium">Date Acknowledged:</span> {pan?.signedAt ? new Date(pan.signedAt).toLocaleString() : 'N/A'}</p>
        <div className="pt-2 flex space-x-2">
            <Button onClick={() => onDownloadPdf(pan!)}>Download as PDF</Button>
            <Button variant="secondary" onClick={handleOpenEmailModal}>Email as PDF</Button>
        </div>
    </div>
  );

  return (
    <>
        <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={isApproved ? `PAN (Approved): ${pan?.id}` : (pan ? `PAN: ${pan.id}` : 'New Personnel Action Notice')}
        footer={renderFooter()}
        >
        <div className="space-y-4 text-sm">
            {rejectionInfo && (
                <div className="p-4 mb-4 rounded-md bg-red-50 dark:bg-red-900/40 border border-red-400 dark:border-red-800">
                    <h4 className="font-bold text-red-800 dark:text-red-200">PAN Declined</h4>
                    <p className="text-sm text-red-700 dark:text-red-300">
                        Declined by: <strong>{rejectionInfo.name}</strong> on {new Date(rejectionInfo.timestamp!).toLocaleString()}
                    </p>
                    <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                        Reason: <em>"{rejectionInfo.notes}"</em>
                    </p>
                </div>
            )}
            {current.logoUrl && (
                <div className="flex justify-center mb-4">
                    <img src={current.logoUrl} alt="Company Logo" className="max-h-20" />
                </div>
            )}
            {isNew && (
                <div className="mb-4">
                    <label htmlFor="template-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Use Template (Optional)
                    </label>
                    <select
                        id="template-select"
                        value={selectedTemplateId}
                        onChange={handleTemplateSelect}
                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    >
                        <option value="">-- Start from scratch --</option>
                        {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                </div>
            )}
            {/* Employee Details Header */}
            <div className="p-4 border rounded-md dark:border-gray-600">
                <div className="space-y-4">
                    <div ref={searchWrapperRef} className="relative">
                        <Input
                            label="Employee"
                            id="employee-search"
                            value={employeeSearch}
                            onChange={(e) => { setEmployeeSearch(e.target.value); setIsEmployeeSearchOpen(true); }}
                            onFocus={() => setIsEmployeeSearchOpen(true)}
                            disabled={!canEdit}
                            autoComplete="off"
                            placeholder="Search by name..."
                        />
                        {isEmployeeSearchOpen && availableEmployees.length > 0 && (
                            <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-md shadow-lg max-h-60 overflow-auto">
                                {availableEmployees.map(user => (
                                    <div key={user.id} onClick={() => handleSelectEmployee(user)} className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer">
                                        <p className="text-sm font-medium">{user.name}</p>
                                        <p className="text-xs text-gray-500">{user.position}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Position</label>
                            <p className="font-semibold mt-1 py-2">{selectedEmployee?.position || 'N/A'}</p>
                        </div>
                        <div>
                            <label htmlFor="effectiveDate" className="block text-xs font-medium text-gray-500 dark:text-gray-400">Effectivity Date</label>
                            <input id="effectiveDate" type="date" value={current.effectiveDate ? new Date(current.effectiveDate).toISOString().split('T')[0] : ''} onChange={handleDateChange} disabled={!canEdit} className="mt-1 block w-full pl-3 pr-2 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:text-white disabled:bg-gray-200 dark:disabled:bg-gray-800"/>
                        </div>
                    </div>
                    
                    <div className="pt-4 border-t dark:border-gray-600">
                        {canEdit ? (
                            <EmployeeMultiSelect
                                label="Request Approval From (at least one BOD required)"
                                allUsers={approverPool}
                                selectedUsers={selectedApprovers}
                                onSelectionChange={setSelectedApprovers}
                                disabled={!canEdit}
                            />
                        ) : (
                            <div>
                                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Approval Routing</label>
                                {current.routingSteps && current.routingSteps.length > 0 ? (
                                    <ul className="mt-2 space-y-2">
                                        {current.routingSteps.map(step => (
                                            <li key={step.id} className="flex items-center space-x-2 text-sm p-2 bg-gray-100 dark:bg-gray-700/50 rounded-md">
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                    step.status === PANStepStatus.Approved ? 'bg-green-100 text-green-800' :
                                                    step.status === PANStepStatus.Declined ? 'bg-red-100 text-red-800' :
                                                    'bg-yellow-100 text-yellow-800'
                                                }`}>{step.status}</span>
                                                <span className="text-gray-800 dark:text-gray-200">by <strong>{step.name}</strong> ({step.role})</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="mt-1 font-semibold py-2">N/A</p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
            <div className="p-4 border rounded-md dark:border-gray-600">
                <h3 className="font-semibold mb-2">Action Taken:</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {Object.keys(emptyActions).filter(k => k !== 'others').map(actionKey => (
                        <div key={actionKey} className="flex items-center">
                            <input type="checkbox" id={actionKey} name={actionKey} checked={current.actionTaken?.[actionKey as keyof PANActionTaken] as boolean || false} onChange={handleActionTakenChange} disabled={!canEdit} className="h-4 w-4 text-indigo-600 border-gray-300 rounded"/>
                            <label htmlFor={actionKey} className="ml-2 text-gray-700 dark:text-gray-300 capitalize">{actionKey.replace(/([A-Z])/g, ' $1')}</label>
                        </div>
                    ))}
                    <div className="flex items-center col-span-2 md:col-span-1">
                        <input type="checkbox" id="others-check" name="others" checked={!!current.actionTaken?.others} readOnly className="h-4 w-4 text-indigo-600 border-gray-300 rounded"/>
                        <label htmlFor="others-check" className="ml-2 text-gray-700 dark:text-gray-300">Others:</label>
                        <input type="text" name="others" value={current.actionTaken?.others || ''} onChange={handleActionTakenChange} disabled={!canEdit} className="ml-2 flex-grow bg-transparent border-b border-gray-400 dark:border-gray-500 focus:outline-none focus:ring-0 focus:border-indigo-500"/>
                    </div>
                </div>
            </div>
            
            <div className="border rounded-md dark:border-gray-600">
                <div className="hidden md:grid grid-cols-12 p-2 bg-gray-50 dark:bg-gray-700 font-semibold">
                    <div className="col-span-3">Particulars</div>
                    <div className="col-span-4">From</div>
                    <div className="col-span-5">To</div>
                </div>
                <div className="divide-y dark:divide-gray-600">
                    <div className="grid grid-cols-1 md:grid-cols-12 p-2 gap-y-1 md:gap-x-2 md:items-center">
                        <div className="md:col-span-3 font-semibold">Employment Status</div>
                        <div className="text-xs text-gray-500 md:hidden">From</div>
                        <div className="md:col-span-4 text-gray-500 dark:text-gray-400">{current.particulars?.from?.employmentStatus || 'N/A'}</div>
                        <div className="text-xs text-gray-500 md:hidden mt-1">To</div>
                        <div className="md:col-span-5"><input type="text" value={current.particulars?.to?.employmentStatus || ''} onChange={e => handleParticularsChange('employmentStatus', e.target.value)} disabled={!canEdit} className="w-full bg-transparent border rounded-md p-1 dark:border-gray-500 disabled:bg-gray-100 dark:disabled:bg-gray-700/50"/></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-12 p-2 gap-y-1 md:gap-x-2 md:items-center">
                        <div className="md:col-span-3 font-semibold">Position</div>
                        <div className="text-xs text-gray-500 md:hidden">From</div>
                        <div className="md:col-span-4 text-gray-500 dark:text-gray-400">{current.particulars?.from?.position || 'N/A'}</div>
                        <div className="text-xs text-gray-500 md:hidden mt-1">To</div>
                        <div className="md:col-span-5"><input type="text" value={current.particulars?.to?.position || ''} onChange={e => handleParticularsChange('position', e.target.value)} disabled={!canEdit} className="w-full bg-transparent border rounded-md p-1 dark:border-gray-500 disabled:bg-gray-100 dark:disabled:bg-gray-700/50"/></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-12 p-2 gap-y-1 md:gap-x-2 md:items-center">
                        <div className="md:col-span-3 font-semibold">Tenure</div>
                        <div className="text-xs text-gray-500 md:hidden">From</div>
                        <div className="md:col-span-4 text-gray-500 dark:text-gray-400">{current.tenure || 'N/A'}</div>
                        <div className="text-xs text-gray-500 md:hidden mt-1">To</div>
                        <div className="md:col-span-5 text-gray-500 dark:text-gray-400">SAME</div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-12 p-2 gap-y-1 md:gap-x-2 md:items-center">
                        <div className="md:col-span-3 font-semibold">Department</div>
                        <div className="text-xs text-gray-500 md:hidden">From</div>
                        <div className="md:col-span-4 text-gray-500 dark:text-gray-400">{current.particulars?.from?.department || 'N/A'}</div>
                        <div className="text-xs text-gray-500 md:hidden mt-1">To</div>
                        <div className="md:col-span-5"><input type="text" value={current.particulars?.to?.department || ''} onChange={e => handleParticularsChange('department', e.target.value)} disabled={!canEdit} className="w-full bg-transparent border rounded-md p-1 dark:border-gray-500 disabled:bg-gray-100 dark:disabled:bg-gray-700/50"/></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-12 p-2 gap-y-1 md:gap-x-2">
                        <div className="md:col-span-3 font-semibold self-center">Salary</div>
                        <div className="md:col-span-4 text-gray-500 dark:text-gray-400 space-y-1">
                            <p className="font-bold text-gray-700 dark:text-gray-300">From Total: {settings.currency} {fromSalaryTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            <p className="text-xs">Basic: {settings.currency} {(current.particulars?.from?.salary?.basic || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            <p className="text-xs">Deminimis: {settings.currency} {(current.particulars?.from?.salary?.deminimis || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            <p className="text-xs">Reimbursable: {settings.currency} {(current.particulars?.from?.salary?.reimbursable || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                        <div className="md:col-span-5 space-y-1 mt-2 md:mt-0">
                            <p className="font-bold text-gray-700 dark:text-gray-300">To Total: {settings.currency} {toSalaryTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            {canEdit ? (
                                <>
                                    <div className="flex items-center text-xs"><span className="w-24 shrink-0">Basic:</span><Input unit={settings.currency} label="" id="salary-basic" type="number" value={current.particulars?.to?.salary?.basic || ''} onChange={e => handleSalaryChange('basic', e.target.value)} /></div>
                                    <div className="flex items-center text-xs"><span className="w-24 shrink-0">Deminimis:</span><Input unit={settings.currency} label="" id="salary-deminimis" type="number" value={current.particulars?.to?.salary?.deminimis || ''} onChange={e => handleSalaryChange('deminimis', e.target.value)} /></div>
                                    <div className="flex items-center text-xs"><span className="w-24 shrink-0">Reimbursable:</span><Input unit={settings.currency} label="" id="salary-reimbursable" type="number" value={current.particulars?.to?.salary?.reimbursable || ''} onChange={e => handleSalaryChange('reimbursable', e.target.value)} /></div>
                                </>
                            ) : (
                                <>
                                    <p className="text-xs pl-4">Basic: {settings.currency} {(current.particulars?.to?.salary?.basic || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                    <p className="text-xs pl-4">Deminimis: {settings.currency} {(current.particulars?.to?.salary?.deminimis || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                    <p className="text-xs pl-4">Reimbursable: {settings.currency} {(current.particulars?.to?.salary?.reimbursable || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {canEdit ? (
                <Textarea 
                label="Remarks / Justifications" 
                name="notes" 
                value={current.notes || ''} 
                onChange={(e) => setCurrent(prev => ({...prev, notes: e.target.value}))}
                />
            ) : (
                <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Remarks / Justifications
                </label>
                <div className="mt-1 w-full p-3 bg-gray-100 dark:bg-slate-700/50 border border-gray-300 dark:border-slate-600 rounded-md min-h-[100px] whitespace-pre-wrap text-gray-800 dark:text-gray-200">
                    {current.notes || 'No remarks provided.'}
                </div>
                </div>
            )}

            {current.preparerName && (
                <div className="mt-4 pt-4 border-t dark:border-gray-600">
                    <h3 className="font-semibold text-lg">Prepared By</h3>
                    <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-700/50 rounded-md inline-block">
                        {current.preparerSignatureUrl && <img src={current.preparerSignatureUrl} alt="Preparer Signature" className="h-16" />}
                        <p className="font-semibold border-t dark:border-gray-600 mt-1 pt-1">{current.preparerName}</p>
                        <p className="text-xs">HR Manager</p>
                    </div>
                </div>
            )}

            {isForAcknowledgement && <AcknowledgmentSection />}
            {isApproved && <SignedDetails />}

        </div>
        </Modal>

        {isApproved && (
            <Modal
                isOpen={isEmailModalOpen}
                onClose={() => setIsEmailModalOpen(false)}
                title="Email PAN as PDF"
                footer={
                    <div className="flex justify-end w-full space-x-2">
                        <Button variant="secondary" onClick={() => setIsEmailModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleSendEmail}>Send Email</Button>
                    </div>
                }
            >
                <Input
                    label="Recipient Email Address"
                    type="email"
                    value={emailRecipient}
                    onChange={(e) => setEmailRecipient(e.target.value)}
                    required
                />
            </Modal>
        )}
    </>
  );
};

export default PANModal;