import React, { useState, useEffect, useMemo, useRef } from 'react';
import { PAN, User, SalaryBreakdown, PANActionTaken, PANStatus, PANTemplate, Role, PANRoutingStep, PANStepStatus, PANRole } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
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
  employees: User[];
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

const PANModal: React.FC<PANModalProps> = ({ isOpen, onClose, pan, templates, employees, onSaveDraft, onSendForAcknowledgement, onAcknowledge, onDownloadPdf, onApprove, onReject }) => {
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

  const isNew = !pan;
  const isDraft = pan?.status === PANStatus.Draft;
  const isApproved = pan?.status === PANStatus.Completed;
  
  const canEdit = useMemo(() => {
    if (isNew || isDraft) return true;
    if (!pan || !user) return false;
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
    return employees.filter(u => u.role !== Role.Employee && u.status === 'Active');
  }, [employees]);

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
        const employee = employees.find(u => u.id === pan.employeeId);
        setSelectedEmployee(employee || null);
        if (pan.routingSteps) {
            const approverUsers = pan.routingSteps
                .map(step => employees.find(u => u.id === step.userId))
                .filter((u): u is User => !!u);
            setSelectedApprovers(approverUsers);
        } else {
             setSelectedApprovers([]);
        }
      } else {
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
  }, [pan, isOpen, user, isForAcknowledgement, employees]);

  useEffect(() => {
    if (selectedEmployee) {
      setEmployeeSearch(selectedEmployee.name);
      const fromParticulars = {
        employmentStatus: 'Regular',
        position: selectedEmployee.position,
        department: selectedEmployee.department,
        salary: selectedEmployee.salary || { ...emptySalary },
      };
      setCurrent(prev => ({
        ...prev,
        tenure: calculateTenure(selectedEmployee.dateHired),
        particulars: {
          from: fromParticulars,
          to: prev.particulars?.to && Object.keys(prev.particulars.to).length > 1 ? prev.particulars.to : fromParticulars,
        },
      }));
    }
  }, [selectedEmployee]);

  const availableEmployees = useMemo(() => {
    if (!employeeSearch || employeeSearch === selectedEmployee?.name) return [];
    const lowerSearch = employeeSearch.toLowerCase();
    return employees.filter(u => 
        u.status === 'Active' && 
        u.name.toLowerCase().includes(lowerSearch)
    ).slice(0, 5);
  }, [employeeSearch, selectedEmployee, employees]);

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
            notes = notes.replace(/\{\{effective_date\}\}/g, new Date(effectiveDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
            setCurrent(prev => ({
              ...prev,
              actionTaken: { ...emptyActions, ...selectedTemplate.actionTaken },
              notes,
            }));
        }
    }
  };

  const handleApproverSelect = (users: User[]) => {
    setSelectedApprovers(users);
    const routingSteps: PANRoutingStep[] = users.map((u, idx) => ({
        id: `step-${u.id}-${idx}`,
        userId: u.id,
        name: u.name,
        role: PANRole.Approver,
        status: PANStepStatus.Pending,
        order: idx,
    }));
    setCurrent(prev => ({ ...prev, routingSteps }));
  };

  const handleSignatureSubmit = () => {
    if (!pan || !signaturePadRef.current || !typedName) return;
    const dataUrl = signaturePadRef.current.getTrimmedCanvas().toDataURL('image/png');
    onAcknowledge(pan.id, dataUrl, typedName);
  };

  const handleApproveClick = () => {
    if (pan && onApprove) {
      onApprove(pan.id);
      onClose();
    }
  };

  const handleRejectClick = () => {
    if (pan && onReject) {
      onReject(pan);
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={pan ? `Editing PAN for ${pan.employeeName}` : 'Create New PAN'}
      size="lg"
      footer={
        <div className="flex justify-between items-center w-full">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <div className="flex space-x-2">
            {canEdit && (
              <>
                <Button variant="secondary" onClick={() => onSaveDraft(current)}>Save Draft</Button>
                <Button onClick={() => onSendForAcknowledgement(current)}>Send</Button>
              </>
            )}
            {canTakeAction && (
              <>
                <Button variant="secondary" onClick={handleRejectClick}>Reject</Button>
                <Button onClick={handleApproveClick}>Approve</Button>
              </>
            )}
            {isForAcknowledgement && (
              <Button onClick={handleSignatureSubmit}>Acknowledge</Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" ref={searchWrapperRef}>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Employee</label>
            <Input
              value={employeeSearch}
              onChange={e => { setEmployeeSearch(e.target.value); setIsEmployeeSearchOpen(true); }}
              onFocus={() => setIsEmployeeSearchOpen(true)}
              placeholder="Search employee"
            />
            {isEmployeeSearchOpen && availableEmployees.length > 0 && (
              <div className="mt-1 border rounded shadow bg-white dark:bg-slate-700 max-h-48 overflow-y-auto">
                {availableEmployees.map(emp => (
                  <div
                    key={emp.id}
                    onClick={() => handleSelectEmployee(emp)}
                    className="px-3 py-2 cursor-pointer hover:bg-indigo-50 dark:hover:bg-slate-600"
                  >
                    {emp.name} <span className="text-xs text-gray-500">({emp.position})</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Effective Date</label>
            <Input
              type="date"
              value={current.effectiveDate ? new Date(current.effectiveDate).toISOString().split('T')[0] : ''}
              onChange={e => setCurrent(prev => ({ ...prev, effectiveDate: new Date(e.target.value) }))}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Template</label>
            <select
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
              value={selectedTemplateId}
              onChange={handleTemplateSelect}
            >
              <option value="">Select template</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <EmployeeMultiSelect
              label="Routing Steps"
              allUsers={approverPool}
              selectedUsers={selectedApprovers}
              onSelectionChange={handleApproverSelect}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Action Taken</label>
            <Textarea
              value={Object.entries(current.actionTaken || {}).filter(([_, v]) => v).map(([k]) => k).join(', ')}
              onChange={() => {}}
              disabled
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Notes</label>
            <Textarea
              value={current.notes || ''}
              onChange={e => setCurrent(prev => ({ ...prev, notes: e.target.value }))}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <h4 className="font-semibold text-sm">From</h4>
            <div className="space-y-2">
              <Input label="Position" value={current.particulars?.from?.position || ''} onChange={e => setCurrent(prev => ({ ...prev, particulars: { ...prev.particulars, from: { ...(prev.particulars?.from || {}), position: e.target.value } } }))} />
              <Input label="Department" value={current.particulars?.from?.department || ''} onChange={e => setCurrent(prev => ({ ...prev, particulars: { ...prev.particulars, from: { ...(prev.particulars?.from || {}), department: e.target.value } } }))} />
            </div>
          </div>
          <div>
            <h4 className="font-semibold text-sm">To</h4>
            <div className="space-y-2">
              <Input label="Position" value={current.particulars?.to?.position || ''} onChange={e => setCurrent(prev => ({ ...prev, particulars: { ...prev.particulars, to: { ...(prev.particulars?.to || {}), position: e.target.value } } }))} />
              <Input label="Department" value={current.particulars?.to?.department || ''} onChange={e => setCurrent(prev => ({ ...prev, particulars: { ...prev.particulars, to: { ...(prev.particulars?.to || {}), department: e.target.value } } }))} />
            </div>
          </div>
        </div>

        <div>
          <h4 className="font-semibold text-sm mb-2">Salary (To)</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="Basic" type="number" value={current.particulars?.to?.salary?.basic ?? ''} onChange={e => setCurrent(prev => ({ ...prev, particulars: { ...prev.particulars, to: { ...(prev.particulars?.to || {}), salary: { ...(prev.particulars?.to?.salary || {}), basic: Number(e.target.value) || 0 } } } }))} />
            <Input label="Deminimis" type="number" value={current.particulars?.to?.salary?.deminimis ?? ''} onChange={e => setCurrent(prev => ({ ...prev, particulars: { ...prev.particulars, to: { ...(prev.particulars?.to || {}), salary: { ...(prev.particulars?.to?.salary || {}), deminimis: Number(e.target.value) || 0 } } } }))} />
            <Input label="Reimbursable" type="number" value={current.particulars?.to?.salary?.reimbursable ?? ''} onChange={e => setCurrent(prev => ({ ...prev, particulars: { ...prev.particulars, to: { ...(prev.particulars?.to || {}), salary: { ...(prev.particulars?.to?.salary || {}), reimbursable: Number(e.target.value) || 0 } } } }))} />
          </div>
        </div>

        {isForAcknowledgement && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Type your name and sign</label>
            <Input value={typedName} onChange={e => setTypedName(e.target.value)} placeholder="Full name" />
            <SignaturePad ref={signaturePadRef} />
          </div>
        )}
      </div>
    </Modal>
  );
};

export default PANModal;
