import React, { useState, useEffect, useMemo, useRef } from 'react';
import { IncidentReport, NTE, NTEStatus, User, FeedbackTemplate, Role, ApproverStep, ApproverStatus } from '../../types';
import Modal from '../ui/Modal';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import { mockMemos, mockCodeOfDiscipline, mockUsers, mockFeedbackTemplates, mockNTEs, mockBusinessUnits } from '../../services/mockData';
import SearchableMultiSelect, { SearchableItem } from '../ui/SearchableMultiSelect';
import Input from '../ui/Input';
import NTEPreview from './NTEPreview';
import { useAuth } from '../../hooks/useAuth';
import EmployeeMultiSelect from './EmployeeMultiSelect';
import { supabase } from '../../services/supabaseClient';

interface NTEModalProps {
  isOpen: boolean;
  onClose: () => void;
  incidentReport: IncidentReport;
  nte: NTE | undefined;
  onSave: (data: NTE | NTE[]) => void;
}

const XCircleIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);


const NTEModal: React.FC<NTEModalProps> = ({ isOpen, onClose, incidentReport, nte, onSave }) => {
  const { user } = useAuth();
  const isNewNTE = !nte;
  
  // State for new NTE
  const [recipientList, setRecipientList] = useState<User[]>([]);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [deadline, setDeadline] = useState('');
  const [memoIds, setMemoIds] = useState<string[]>([]);
  const [disciplineCodeIds, setDisciplineCodeIds] = useState<string[]>([]);
  const [allegations, setAllegations] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(mockFeedbackTemplates[0]?.id || '');
  const [selectedApprovers, setSelectedApprovers] = useState<User[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);

  // State for adding new recipients
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchWrapperRef = useRef<HTMLDivElement>(null);

  // State for existing NTE
  const [currentNTE, setCurrentNTE] = useState<Partial<NTE>>(nte || {});

  const selectedTemplate = useMemo(() => {
    return mockFeedbackTemplates.find(t => t.id === selectedTemplateId);
  }, [selectedTemplateId]);

  // Show all users to allow search; validation still enforces at least one BOD
  const approverPool = useMemo(() => {
        return allUsers.length ? allUsers : mockUsers;
    }, [allUsers]);
  const approverDisplay = useMemo(() => {
        return approverPool.map(u => ({
            ...u,
            name: `${u.name} (${u.role})`,
        }));
    }, [approverPool]);

  // Load users from Supabase for recipients/approvers
  useEffect(() => {
    if (!isOpen) return;
    supabase
      .from('hris_users')
      .select('id, full_name, email, role, department, business_unit, business_unit_id, department_id, position, status')
      .order('full_name', { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.warn('Failed to load users for NTE', error);
          return;
        }
        if (data) {
          const mapped = data.map((u: any) => ({
            id: u.id,
            name: u.full_name || 'User',
            email: u.email || '',
            role: u.role,
            department: u.department || '',
            businessUnit: u.business_unit || '',
            businessUnitId: u.business_unit_id || undefined,
            departmentId: u.department_id || undefined,
            status: u.status || 'Active',
            isPhotoEnrolled: false,
            dateHired: new Date(),
            position: u.position || '',
          })) as User[];
          setAllUsers(mapped);
        }
      })
      .catch(err => console.warn('NTE user fetch error', err));
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
        const pool = allUsers.length ? allUsers : mockUsers;
        if (isNewNTE) {
            const involved = pool.filter(u => incidentReport.involvedEmployeeIds.includes(u.id));
            setRecipientList(involved);
            setSelectedEmployeeIds(involved.map(u => u.id));
            
            const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
            setDeadline(threeDaysFromNow.toISOString().slice(0, 16));
            
            setAllegations(incidentReport.description);
            setMemoIds([]);
            setDisciplineCodeIds([]);
            setEvidenceUrl('');
            setSelectedTemplateId(mockFeedbackTemplates[0]?.id || '');
            setSelectedApprovers([]);
        } else {
            setCurrentNTE(nte);
            if (nte?.approverSteps) {
                const approverUsers = nte.approverSteps
                    .map(step => pool.find(u => u.id === step.userId))
                    .filter((u): u is User => !!u);
                setSelectedApprovers(approverUsers);
            }
        }
    }
  }, [nte, incidentReport, isOpen, isNewNTE, allUsers]);
  
  const memoItems: SearchableItem[] = useMemo(() => mockMemos.map(memo => ({ id: memo.id, label: memo.title })), []);
  const disciplineItems: SearchableItem[] = useMemo(() => mockCodeOfDiscipline.entries.map(entry => ({ id: entry.id, label: entry.description, subLabel: entry.category, tag: entry.code })), []);
  
  const citedMemos = useMemo(() => mockMemos.filter(m => memoIds.includes(m.id)), [memoIds]);
  const citedDiscipline = useMemo(() => mockCodeOfDiscipline.entries.filter(e => disciplineCodeIds.includes(e.id)), [disciplineCodeIds]);

  const handleSelectEmployee = (employeeId: string) => {
    setSelectedEmployeeIds(prev =>
      prev.includes(employeeId)
        ? prev.filter(id => id !== employeeId)
        : [...prev, employeeId]
    );
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedEmployeeIds(recipientList.map(u => u.id));
    } else {
      setSelectedEmployeeIds([]);
    }
  };

  const handleIssueNTE = () => {
    if (!user) return;

    const errors: string[] = [];
    if (selectedEmployeeIds.length === 0) {
        errors.push('Select at least one employee recipient.');
    }
    if (!deadline) {
        errors.push('Set a response deadline.');
    }
    if (memoIds.length === 0 && disciplineCodeIds.length === 0) {
        errors.push('Cite at least one Memo or Code of Discipline entry.');
    }
     if (selectedApprovers.length === 0 || !selectedApprovers.some(a => a.role === Role.BOD)) {
        errors.push('Select at least one approver, including at least one Board of Director.');
    }


    if (errors.length > 0) {
        alert(`Please address the following issues before submitting the NTE for approval:\n\n- ${errors.join('\n- ')}`);
        return;
    }
    
    const bodyContent = "Rendered content of the NTE would be saved here.";
    
    const approverSteps: ApproverStep[] = selectedApprovers.map(approver => ({
        userId: approver.id,
        userName: approver.name,
        status: ApproverStatus.Pending,
    }));
    
    // Determine Business Unit Code for NTE Number
    // Priority: IncidentReport BU -> Employee BU -> GEN
    const irBu = mockBusinessUnits.find(b => b.id === incidentReport.businessUnitId);

    const newNTEs: Partial<NTE>[] = selectedEmployeeIds.map((employeeId, index) => {
        const employee = recipientList.find(u => u.id === employeeId)!;
        const employeeBu = mockBusinessUnits.find(b => b.name === employee.businessUnit);
        const buCode = irBu?.code || employeeBu?.code || 'GEN';

        return {
            incidentReportId: incidentReport.id,
            employeeId: employee.id,
            employeeName: employee.name,
            status: NTEStatus.PendingApproval,
            issuedDate: new Date(),
            deadline: new Date(deadline),
            details: allegations,
            body: bodyContent,
            employeeResponse: '',
            memoIds,
            disciplineCodeIds,
            evidenceUrl,
            issuedByUserId: user.id,
            approverSteps,
        };
    });
    
    onSave(newNTEs);
  };

  const previewEmployee = useMemo(() => {
    if (selectedEmployeeIds.length === 0) return null;
    return recipientList.find(u => u.id === selectedEmployeeIds[0]);
  }, [selectedEmployeeIds, recipientList]);

  const buttonText = useMemo(() => {
    const count = selectedEmployeeIds.length;
    if (count === 0) return 'Submit for Approval';
    if (count === 1) {
      const name = recipientList.find(u => u.id === selectedEmployeeIds[0])?.name;
      return `Submit for ${name}`;
    }
    return `Submit for ${count} Employees`;
  }, [selectedEmployeeIds, recipientList]);

  const handleUpdateNTE = () => {
    if (user?.id === currentNTE.employeeId && currentNTE.status === NTEStatus.Issued) {
        const updatedNTE = { ...currentNTE, status: NTEStatus.ResponseSubmitted };
        onSave(updatedNTE as NTE);
    } else {
        onSave(currentNTE as NTE);
    }
  }
  
  // --- Additional Recipient Logic ---
  const availableUsers = useMemo(() => {
    if (!searchTerm) return [];
    const lowerSearch = searchTerm.toLowerCase();
    const recipientIds = new Set(recipientList.map(u => u.id));
    const pool = allUsers.length ? allUsers : mockUsers;
    return pool.filter(u => 
        !recipientIds.has(u.id) &&
        u.name.toLowerCase().includes(lowerSearch)
    );
  }, [searchTerm, recipientList, allUsers]);

  const handleAddRecipient = (user: User) => {
    setRecipientList(prev => [...prev, user]);
    setSelectedEmployeeIds(prev => [...prev, user.id]);
    setSearchTerm('');
    setIsSearchOpen(false);
  };
  
  const handleRemoveRecipient = (userId: string) => {
      setRecipientList(prev => prev.filter(u => u.id !== userId));
      setSelectedEmployeeIds(prev => prev.filter(id => id !== userId));
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [searchWrapperRef]);


  // === RENDER LOGIC ===

  if (isNewNTE) {
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Issue New NTE"
            size="4xl"
            footer={
                <div className="flex justify-end w-full space-x-2">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleIssueNTE} disabled={selectedEmployeeIds.length === 0}>{buttonText}</Button>
                </div>
            }
        >
            <div className="space-y-8">
                {/* Form Fields */}
                <div className="space-y-4">
                     <div className="p-3 border rounded-md dark:border-gray-600">
                        <h4 className="font-semibold text-gray-800 dark:text-gray-200">Issue To:</h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Select which employees will receive this notice.</p>
                         <div className="flex items-center mb-2 p-2 border-b dark:border-gray-600">
                            <input
                                type="checkbox"
                                id="select-all"
                                checked={recipientList.length > 0 && selectedEmployeeIds.length === recipientList.length}
                                onChange={handleSelectAll}
                                className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                            />
                            <label htmlFor="select-all" className="ml-2 text-sm font-medium">Select All</label>
                        </div>
                        <div className="max-h-40 overflow-y-auto space-y-1">
                            {recipientList.map(employee => (
                                <div key={employee.id} className="flex items-center justify-between p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700/50">
                                    <div className="flex items-center">
                                        <input
                                            type="checkbox"
                                            id={`emp-${employee.id}`}
                                            checked={selectedEmployeeIds.includes(employee.id)}
                                            onChange={() => handleSelectEmployee(employee.id)}
                                            className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                                        />
                                        <label htmlFor={`emp-${employee.id}`} className="ml-2 text-sm">{employee.name}</label>
                                    </div>
                                    <button type="button" onClick={() => handleRemoveRecipient(employee.id)} className="text-gray-400 hover:text-red-500">
                                        <XCircleIcon />
                                    </button>
                                </div>
                            ))}
                        </div>
                         <div className="relative mt-2" ref={searchWrapperRef}>
                            <Input
                                label=""
                                id="add-recipient-search"
                                placeholder="Add another employee..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                onFocus={() => setIsSearchOpen(true)}
                            />
                            {isSearchOpen && searchTerm && (
                                <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-40 overflow-auto">
                                {availableUsers.length > 0 ? (
                                    availableUsers.map(user => (
                                        <div key={user.id} onClick={() => handleAddRecipient(user)} className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                                            <p className="text-sm font-medium">{user.name}</p>
                                        </div>
                                    ))
                                ) : (
                                    <div className="px-4 py-2 text-sm text-gray-500">No matching employees found</div>
                                )}
                                </div>
                            )}
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium">Template</label>
                        <select value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                            {mockFeedbackTemplates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                        </select>
                    </div>
                     <Input label="Response Deadline" id="deadline" type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} />
                     <Textarea label="NTE Details / Allegations" value={allegations} onChange={e => setAllegations(e.target.value)} rows={5} />
                    <Input 
                        label="Additional Evidence/Support Link" 
                        id="evidenceUrl" 
                        placeholder="https://example.com/document.pdf"
                        value={evidenceUrl} 
                        onChange={e => setEvidenceUrl(e.target.value)} 
                    />
                    <SearchableMultiSelect
                        label="Cite Memos"
                        placeholder="Search for policy titles..."
                        items={memoItems}
                        selectedItemIds={memoIds}
                        onSelectionChange={setMemoIds}
                        variant="primary"
                    />
                    <SearchableMultiSelect
                        label="Cite Code of Discipline"
                        placeholder="Search by code or description..."
                        items={disciplineItems}
                        selectedItemIds={disciplineCodeIds}
                        onSelectionChange={setDisciplineCodeIds}
                        variant="danger"
                    />
                    <EmployeeMultiSelect
                        label="Request Approval From (at least one BOD required)"
                        allUsers={approverDisplay}
                        selectedUsers={selectedApprovers}
                        onSelectionChange={setSelectedApprovers}
                    />
                </div>

                {/* Preview */}
                <div className="bg-gray-200 dark:bg-slate-900 p-4 rounded-lg">
                    <h3 className="font-semibold text-center mb-2">Live Preview</h3>
                    {selectedTemplate && previewEmployee && (
                        <NTEPreview 
                            template={selectedTemplate}
                            employeeName={previewEmployee.name}
                            nteNumber={`NTE-${new Date().getFullYear()}-XXX-XXX`}
                            allegations={allegations}
                            deadline={new Date(deadline || Date.now())}
                            citedMemos={citedMemos}
                            citedDiscipline={citedDiscipline}
                            evidenceUrl={evidenceUrl}
                        />
                    )}
                    {!previewEmployee && (
                         <div className="flex items-center justify-center h-full text-gray-500">
                            <p>Select an employee to see a preview.</p>
                         </div>
                     )}
                </div>
            </div>
        </Modal>
    );
  }
  
  const isEmployeeResponding = user?.id === nte.employeeId && nte.status === NTEStatus.Issued;
  const isManagerOrHR = user?.id !== nte.employeeId;

  // Existing NTE View
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`NTE: ${nte.id}`}
      size="2xl"
      footer={
        <div className="flex justify-end w-full space-x-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleUpdateNTE} disabled={!isEmployeeResponding && !isManagerOrHR}>
                {isEmployeeResponding ? "Submit Response" : "Save Changes"}
            </Button>
        </div>
      }
    >
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div><strong>Employee:</strong> {nte.employeeName}</div>
                <div><strong>Status:</strong> {nte.status}</div>
                <div><strong>Issued:</strong> {new Date(nte.issuedDate).toLocaleDateString()}</div>
                <div><strong>Deadline:</strong> {new Date(nte.deadline).toLocaleDateString()}</div>
            </div>
            
            <Textarea 
                label="Allegations/Details" 
                value={currentNTE.details || ''} 
                onChange={e => setCurrentNTE(prev => ({...prev, details: e.target.value}))}
                rows={4}
                disabled={!isManagerOrHR || nte.status === NTEStatus.Closed} 
            />
            
            {isEmployeeResponding && (
                <Textarea 
                    label="Your Response" 
                    value={currentNTE.employeeResponse || ''} 
                    onChange={e => setCurrentNTE(prev => ({...prev, employeeResponse: e.target.value}))}
                    rows={6}
                    placeholder="Provide your explanation here..."
                />
            )}
            
            {!isEmployeeResponding && nte.employeeResponse && (
                 <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-md">
                    <p className="font-bold mb-1">Employee Response:</p>
                    <p className="text-sm">{nte.employeeResponse}</p>
                 </div>
            )}
        </div>
    </Modal>
  );
};

export default NTEModal;
