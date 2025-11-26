
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { IncidentReport, Resolution, ResolutionType, Permission, Role, User, ResolutionStatus, ApproverStatus } from '../../types';
import Modal from '../ui/Modal';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import Card from '../ui/Card';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import SignaturePad, { SignaturePadRef } from '../ui/SignaturePad';
import { mockUsers } from '../../services/mockData';
import EmployeeMultiSelect from './EmployeeMultiSelect';
import Input from '../ui/Input';
import RejectReasonModal from './RejectReasonModal';

interface ResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  incidentReport: IncidentReport;
  resolution?: Resolution;
  // For HR creating/editing
  onSave?: (resolution: Partial<Resolution> & { decisionMakerSignatureUrl: string }, approverIds: string[]) => void;
  // For BOD/GM approving
  isApproverView?: boolean;
  onApprove?: () => void;
  onReject?: (reason: string) => void;
  // For Employee acknowledging
  isEmployeeAcknowledgeView?: boolean;
  onAcknowledge?: (signatureDataUrl: string, fullName: string) => void;
}

const ResolutionModal: React.FC<ResolutionModalProps> = ({ isOpen, onClose, incidentReport, resolution, onSave, isApproverView = false, onApprove, onReject, isEmployeeAcknowledgeView = false, onAcknowledge }) => {
  const { user } = useAuth();
  const { can } = usePermissions();
  
  // Main Resolution State
  const [currentResolution, setCurrentResolution] = useState<Partial<Resolution>>(resolution || {});
  const [selectedApprovers, setSelectedApprovers] = useState<User[]>([]);
  const [approverError, setApproverError] = useState('');
  const signaturePadRef = useRef<SignaturePadRef>(null);
  const employeeSignaturePadRef = useRef<SignaturePadRef>(null);
  const [employeeTypedName, setEmployeeTypedName] = useState('');
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  
  // Suspension Workflow State
  const [suspensionType, setSuspensionType] = useState<'Consecutive' | 'Non-Consecutive'>('Consecutive');
  const [suspensionDays, setSuspensionDays] = useState<number>(3);
  const [suspensionStartDate, setSuspensionStartDate] = useState<string>('');
  const [suspensionEndDate, setSuspensionEndDate] = useState<string>(''); // Read-only for consecutive
  const [selectedSuspensionDates, setSelectedSuspensionDates] = useState<Date[]>([]); // For non-consecutive
  const [dateToAdd, setDateToAdd] = useState<string>(''); // Temp input for adding a date
  
  const canEditResolution = can('Feedback', Permission.Edit) || can('Feedback', Permission.Manage);
  const isRejectedByApprover = resolution?.status === ResolutionStatus.Rejected;

  const isLocked = isApproverView ||
                 isEmployeeAcknowledgeView ||
                 resolution?.status === ResolutionStatus.Approved ||
                 resolution?.status === ResolutionStatus.Acknowledged ||
                 (resolution?.status === ResolutionStatus.PendingApproval && !isApproverView) ||
                 (resolution?.status === ResolutionStatus.PendingAcknowledgement && !isEmployeeAcknowledgeView) ||
                 (isRejectedByApprover && !canEditResolution);

  const approverPool = useMemo(() => {
    return mockUsers.filter(u => u.role === Role.BOD || u.role === Role.GeneralManager);
  }, []);

  const rejectionReasons = useMemo(() => {
    if (!isRejectedByApprover || !resolution?.approverSteps) return [];
    return resolution.approverSteps
        .filter(step => step.status === ApproverStatus.Rejected && step.rejectionReason)
        .map(step => ({
            name: step.userName,
            reason: step.rejectionReason!,
            timestamp: step.timestamp!,
        }));
  }, [resolution, isRejectedByApprover]);

  // Initialize or Reset State on Open
  useEffect(() => {
    if (!user) return;
    if (isOpen) {
        const initialData = resolution || {
            incidentReportId: incidentReport.id,
            resolutionType: ResolutionType.CaseDismissed,
            decisionDate: new Date(),
            closedByUserId: user.id,
        };
        setCurrentResolution(initialData);
        setEmployeeTypedName(user.name);

        // Initialize Suspension State
        if (initialData.resolutionType === ResolutionType.Suspension) {
            setSuspensionType(initialData.suspensionType || 'Consecutive');
            setSuspensionDays(initialData.suspensionDays || 3);
            if (initialData.suspensionStartDate) {
                setSuspensionStartDate(new Date(initialData.suspensionStartDate).toISOString().split('T')[0]);
            }
            if (initialData.suspensionEndDate) {
                setSuspensionEndDate(new Date(initialData.suspensionEndDate).toISOString().split('T')[0]);
            }
            if (initialData.suspensionDates) {
                 // Ensure dates are Date objects
                 setSelectedSuspensionDates(initialData.suspensionDates.map(d => new Date(d)));
            }
        } else {
            // Defaults
            setSuspensionType('Consecutive');
            setSuspensionDays(3);
            setSuspensionStartDate('');
            setSuspensionEndDate('');
            setSelectedSuspensionDates([]);
        }

        if(resolution?.approverSteps) {
            setSelectedApprovers(mockUsers.filter(u => resolution.approverSteps.some(s => s.userId === u.id)));
        } else {
            setSelectedApprovers([]);
        }

        setApproverError('');
        setDateToAdd('');
    }
  }, [resolution, incidentReport, isOpen, user]);

  // Auto-calculate End Date for Consecutive Suspension
  useEffect(() => {
      if (currentResolution.resolutionType === ResolutionType.Suspension && suspensionType === 'Consecutive') {
          if (suspensionStartDate && suspensionDays > 0) {
              const start = new Date(suspensionStartDate);
              const end = new Date(start);
              end.setDate(start.getDate() + (suspensionDays - 1));
              setSuspensionEndDate(end.toISOString().split('T')[0]);
          } else {
              setSuspensionEndDate('');
          }
      }
  }, [suspensionStartDate, suspensionDays, suspensionType, currentResolution.resolutionType]);


  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setCurrentResolution(prev => ({ ...prev, [name]: value }));
  };
  
  // Non-Consecutive Date Management
  const handleAddDate = () => {
      if (!dateToAdd) return;
      const newDate = new Date(dateToAdd);
      // Simple check to avoid duplicates
      if (!selectedSuspensionDates.some(d => d.toDateString() === newDate.toDateString())) {
           const updatedList = [...selectedSuspensionDates, newDate].sort((a,b) => a.getTime() - b.getTime());
           setSelectedSuspensionDates(updatedList);
      }
      setDateToAdd('');
  };

  const handleRemoveDate = (dateToRemove: Date) => {
      setSelectedSuspensionDates(prev => prev.filter(d => d.getTime() !== dateToRemove.getTime()));
  };


  const handleSaveClick = () => {
    if (!onSave) return;
    setApproverError('');
    if (!currentResolution.details || !currentResolution.resolutionType) {
        alert('Please select a Resolution Type and provide details.');
        return;
    }
    
    // Suspension Validation
    if (currentResolution.resolutionType === ResolutionType.Suspension) {
        if (suspensionDays <= 0) {
            alert('Suspension days must be greater than 0.');
            return;
        }
        
        if (suspensionType === 'Consecutive') {
             if (!suspensionStartDate) {
                 alert('Please select a Start Date for the consecutive suspension.');
                 return;
             }
        } else {
             // Non-Consecutive
             if (selectedSuspensionDates.length !== suspensionDays) {
                 alert(`You have selected ${selectedSuspensionDates.length} dates, but ${suspensionDays} are required.`);
                 return;
             }
        }
    }

    if (!resolution?.decisionMakerSignatureUrl && signaturePadRef.current?.isEmpty()) {
        alert('A signature is required to finalize the resolution.');
        return;
    }

    if (selectedApprovers.length === 0) {
        setApproverError('At least one approver must be selected.');
        return;
    }
    if (!selectedApprovers.some(approver => approver.role === Role.BOD)) {
        setApproverError('At least one selected approver must be a Board of Director.');
        return;
    }

    const signatureDataUrl = resolution?.decisionMakerSignatureUrl || signaturePadRef.current!.getSignatureDataUrl();

    // Prepare Suspension Payload
    const suspensionPayload = currentResolution.resolutionType === ResolutionType.Suspension ? {
        suspensionType,
        suspensionDays,
        suspensionStartDate: suspensionType === 'Consecutive' ? new Date(suspensionStartDate) : undefined,
        suspensionEndDate: suspensionType === 'Consecutive' ? new Date(suspensionEndDate) : undefined,
        suspensionDates: suspensionType === 'Non-Consecutive' ? selectedSuspensionDates : undefined,
    } : {};

    if (signatureDataUrl) {
      onSave(
        { ...currentResolution, decisionMakerSignatureUrl: signatureDataUrl, ...suspensionPayload },
        selectedApprovers.map(a => a.id)
      );
    }
  };
  
  const handleRejectConfirm = (reason: string) => {
    if (onReject) {
        onReject(reason);
    }
    setIsRejectModalOpen(false);
  };
  
  const handleAcknowledgeClick = () => {
    if (!onAcknowledge) return;
    if (!employeeTypedName.trim()) {
        alert("Please type your full name to acknowledge.");
        return;
    }
    if (employeeSignaturePadRef.current?.isEmpty()) {
        alert("Please provide your signature to acknowledge.");
        return;
    }
    const signatureData = employeeSignaturePadRef.current.getSignatureDataUrl();
    if (signatureData) {
        onAcknowledge(signatureData, employeeTypedName);
    }
  };

  const renderFooter = () => {
    if (isEmployeeAcknowledgeView) {
        return (
            <div className="flex justify-end w-full space-x-2">
                <Button variant="secondary" onClick={onClose}>Close</Button>
                <Button onClick={handleAcknowledgeClick}>Acknowledge & Accept Decision</Button>
            </div>
        );
    }

    if (isApproverView) {
      return (
        <div className="flex justify-end w-full space-x-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={() => setIsRejectModalOpen(true)}>Reject</Button>
          <Button onClick={onApprove}>Approve</Button>
        </div>
      );
    }

    if (isLocked) {
        const message = resolution?.status === ResolutionStatus.PendingApproval 
            ? "Pending approval - cannot be edited."
            : resolution?.status === ResolutionStatus.PendingAcknowledgement
            ? "Pending employee acknowledgement."
            : "This resolution is locked.";
        return (
            <div className="flex justify-between items-center w-full">
                <span className="text-yellow-600 dark:text-yellow-400 font-semibold">{message}</span>
                <Button variant="secondary" onClick={onClose}>Close</Button>
            </div>
        )
    }

    const buttonText = isRejectedByApprover ? "Resubmit for Approval" : "Sign & Send for Approval";
    return (
      <div className="flex justify-end w-full space-x-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        {canEditResolution && <Button onClick={handleSaveClick}>{buttonText}</Button>}
      </div>
    );
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={isApproverView ? `Approve Resolution for IR-${incidentReport.id}` : `Case Resolution for IR-${incidentReport.id}`}
        footer={renderFooter()}
        size="2xl"
      >
        {rejectionReasons.length > 0 && (
            <Card title="Rejection Notes" className="mb-4 bg-red-50 dark:bg-red-900/40 border-red-400">
                <ul className="space-y-2">
                    {rejectionReasons.map((rejection, index) => (
                        <li key={index}>
                            <p className="font-semibold text-red-800 dark:text-red-200">{rejection.name}:</p>
                            <p className="text-sm text-red-700 dark:text-red-300 italic">"{rejection.reason}"</p>
                            <p className="text-xs text-red-500 dark:text-red-400">{new Date(rejection.timestamp).toLocaleString()}</p>
                        </li>
                    ))}
                </ul>
                <p className="mt-4 text-sm font-semibold text-red-800 dark:text-red-200">Please revise the resolution details and resubmit for approval.</p>
            </Card>
        )}

        <Card title="Final Incident Summary">
           <p><span className="font-semibold">Employee:</span> {incidentReport.involvedEmployeeNames.join(', ')}</p>
           <p><span className="font-semibold">Category:</span> {incidentReport.category}</p>
           <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{incidentReport.description}</p>
        </Card>
        
        <div className="space-y-4 mt-4">
          <div>
              <label htmlFor="resolutionType" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Resolution Type</label>
              <select id="resolutionType" name="resolutionType" value={currentResolution.resolutionType || ''} onChange={handleChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-800" disabled={isLocked}>
                  {Object.values(ResolutionType).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
          </div>
          
          {/* SECTION A — SUSPENSION WORKFLOW */}
          {currentResolution.resolutionType === ResolutionType.Suspension && (
             <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-md space-y-4">
                <h4 className="font-semibold text-orange-800 dark:text-orange-200">Suspension Details</h4>
                
                {/* A1 — Suspension Type Selector */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Suspension Type</label>
                    <div className="mt-2 flex space-x-4">
                        <label className="inline-flex items-center">
                            <input 
                                type="radio" 
                                value="Consecutive" 
                                checked={suspensionType === 'Consecutive'} 
                                onChange={() => setSuspensionType('Consecutive')}
                                disabled={isLocked}
                                className="form-radio h-4 w-4 text-orange-600"
                            />
                            <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Consecutive Days</span>
                        </label>
                        <label className="inline-flex items-center">
                            <input 
                                type="radio" 
                                value="Non-Consecutive" 
                                checked={suspensionType === 'Non-Consecutive'} 
                                onChange={() => setSuspensionType('Non-Consecutive')}
                                disabled={isLocked}
                                className="form-radio h-4 w-4 text-orange-600"
                            />
                            <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Selected Dates (Non-Consecutive)</span>
                        </label>
                    </div>
                </div>

                {/* A2 — Suspension Days Input */}
                <div className="w-1/2">
                    <Input 
                        label="Number of Suspension Days" 
                        type="number" 
                        min="1"
                        value={suspensionDays} 
                        onChange={(e) => setSuspensionDays(parseInt(e.target.value) || 0)} 
                        disabled={isLocked}
                        required
                    />
                </div>

                {/* A3 — Consecutive Days View */}
                {suspensionType === 'Consecutive' && (
                    <div className="grid grid-cols-2 gap-4">
                        <Input 
                            label="Start Date" 
                            type="date" 
                            value={suspensionStartDate} 
                            onChange={(e) => setSuspensionStartDate(e.target.value)} 
                            disabled={isLocked}
                            required
                        />
                        <Input 
                            label="End Date (Auto-calculated)" 
                            type="date" 
                            value={suspensionEndDate} 
                            onChange={() => {}} // Read-only
                            disabled={true}
                        />
                    </div>
                )}

                {/* A4 — Selected Dates View */}
                {suspensionType === 'Non-Consecutive' && (
                     <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Select Dates</label>
                        {!isLocked && (
                            <div className="flex space-x-2">
                                <input 
                                    type="date" 
                                    value={dateToAdd} 
                                    onChange={(e) => setDateToAdd(e.target.value)}
                                    className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-orange-500 focus:border-orange-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                />
                                <Button onClick={handleAddDate} variant="secondary" disabled={!dateToAdd}>Add</Button>
                            </div>
                        )}
                        
                        <div className="flex flex-wrap gap-2 mt-2">
                            {selectedSuspensionDates.map((d, idx) => (
                                <span key={idx} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                                    {d.toLocaleDateString()}
                                    {!isLocked && (
                                        <button onClick={() => handleRemoveDate(d)} className="ml-1.5 inline-flex items-center justify-center text-orange-400 hover:text-orange-600">
                                            <span className="sr-only">Remove date</span>
                                            &times;
                                        </button>
                                    )}
                                </span>
                            ))}
                        </div>
                        
                        <p className={`text-xs ${selectedSuspensionDates.length === suspensionDays ? 'text-green-600 font-bold' : 'text-red-600'}`}>
                            Selected {selectedSuspensionDates.length} of {suspensionDays} required days
                        </p>
                     </div>
                )}

             </div>
          )}

          <Textarea label="Resolution Details / Notice of Decision" id="details" name="details" value={currentResolution.details || ''} onChange={handleChange} rows={6} required disabled={isLocked} />
          
          <Input 
              label="Supporting Document Link (Optional)"
              id="supportingDocumentUrl"
              name="supportingDocumentUrl"
              type="url"
              placeholder="https://example.com/evidence.pdf"
              value={currentResolution.supportingDocumentUrl || ''}
              onChange={handleChange}
              disabled={isLocked}
          />
          
          <div className="space-y-4 pt-4 border-t dark:border-gray-600">
              <div className={isLocked ? 'pointer-events-none opacity-60' : ''}>
                <EmployeeMultiSelect
                    label={isApproverView ? "Approval Routing" : "Request Approval From (at least one BOD required)"}
                    allUsers={approverPool}
                    selectedUsers={selectedApprovers}
                    onSelectionChange={setSelectedApprovers}
                    disabled={isLocked}
                />
              </div>
              {approverError && <p className="text-sm text-red-500">{approverError}</p>}
           </div>

          <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Decision Maker's Signature</label>
              {resolution?.decisionMakerSignatureUrl && !isRejectedByApprover ? (
                  <img src={resolution.decisionMakerSignatureUrl} alt="Signature" className="mt-1 border rounded-md p-2 bg-gray-100 dark:bg-gray-700 max-h-24" />
              ) : (
                <div className={isLocked ? 'pointer-events-none opacity-50' : ''}>
                  <SignaturePad ref={signaturePadRef} />
                </div>
              )}
          </div>
        </div>

        {isEmployeeAcknowledgeView && (
            <Card title="Your Acknowledgement" className="mt-6">
                <div className="space-y-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400">By signing below, you acknowledge that you have read and understood the Notice of Decision detailed above.</p>
                    <Input 
                        label="Type Your Full Name"
                        id="employee-typed-name"
                        value={employeeTypedName}
                        onChange={(e) => setEmployeeTypedName(e.target.value)}
                        required
                    />
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Signature</label>
                        <SignaturePad ref={employeeSignaturePadRef} />
                    </div>
                </div>
            </Card>
        )}

      </Modal>
      <RejectReasonModal
        isOpen={isRejectModalOpen}
        onClose={() => setIsRejectModalOpen(false)}
        onSubmit={handleRejectConfirm}
      />
    </>
  );
};

export default ResolutionModal;
