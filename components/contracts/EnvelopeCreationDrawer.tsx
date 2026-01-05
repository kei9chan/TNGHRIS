import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Envelope, Role, User, RoutingStep, RoutingStepStatus, ContractTemplate, SignatoryBlock, ContractTemplateSection } from '../../types';
import { mockContractTemplates, mockUsers } from '../../services/mockData';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import RichTextEditor from '../ui/RichTextEditor';
import EmployeeMultiSelect from '../feedback/EmployeeMultiSelect';
import { supabase } from '../../services/supabaseClient';

interface EnvelopeCreationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (envelope: Partial<Envelope>, send: boolean) => void;
  employees?: User[];
  templates?: ContractTemplate[];
}

const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
};

const TrashIcon: React.FC = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;

const EnvelopeCreationDrawer: React.FC<EnvelopeCreationDrawerProps> = ({ isOpen, onClose, onSave, employees: employeesProp, templates: templatesProp }) => {
  const [templateId, setTemplateId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [content, setContent] = useState<Partial<ContractTemplate>>({});
  
  // New state for searchable inputs
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<User | null>(null);
  const [isEmployeeSearchOpen, setIsEmployeeSearchOpen] = useState(false);
  const [selectedApprovers, setSelectedApprovers] = useState<User[]>([]);
  const [employees, setEmployees] = useState<User[]>(employeesProp || []);

  const searchWrapperRef = useRef<HTMLDivElement>(null);
  const logoUploadRef = useRef<HTMLInputElement>(null);

  const templates = templatesProp && templatesProp.length ? templatesProp : mockContractTemplates;

  useEffect(() => {
    if (isOpen) {
        const defaultTemplate = templates.find(t => t.isDefault);
        const initialTemplateId = defaultTemplate?.id || (templates.length > 0 ? templates[0].id : '');
        setTemplateId(initialTemplateId);
        
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 14);
        setDueDate(futureDate.toISOString().split('T')[0]);
        
        setEmployeeSearch('');
        setSelectedEmployee(null);
        setSelectedApprovers([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (templateId) {
        const template = templates.find(t => t.id === templateId);
        if (template) {
            setContent(template);
            return;
        }
    }
    setContent({});
  }, [templateId, templates]);

  // Fetch employees for selection
  useEffect(() => {
    if (employeesProp && employeesProp.length) {
      setEmployees(employeesProp);
      return;
    }
    if (!isOpen) return;
    const loadEmployees = async () => {
      try {
        const { data, error } = await supabase
          .from('hris_users')
          .select('id, full_name, role, status');
        if (error) throw error;
        const mapped =
          data?.map((u: any) => ({
            id: u.id,
            name: u.full_name,
            email: '',
            role: (u.role as Role) || Role.Employee,
            status: (u.status as any) || 'Active',
          })) || [];
        setEmployees(mapped);
      } catch (err) {
        console.error('Failed to load employees for envelopes', err);
        setEmployees(mockUsers);
      }
    };
    loadEmployees();
  }, [isOpen, employeesProp]);

  const approverPool = useMemo(() => {
    // Allow any non-employee active user to be an approver (Managers, HR, Admin, etc.)
    return (employees.length ? employees : mockUsers).filter(u => 
        (u as any).status === 'Active' && u.role !== Role.Employee
    );
  }, [employees]);

  const availableEmployees = useMemo(() => {
    if (!employeeSearch || employeeSearch === selectedEmployee?.name) return [];
    const lowerSearch = employeeSearch.toLowerCase();
    return (employees.length ? employees : mockUsers).filter(u => 
        (u as any).status === 'Active' && 
        u.name.toLowerCase().includes(lowerSearch)
    ).slice(0, 5); // Limit results
  }, [employeeSearch, selectedEmployee, employees]);

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

  const handleSelectEmployee = (employee: User) => {
      setSelectedEmployee(employee);
      setEmployeeSearch(employee.name);
      setIsEmployeeSearchOpen(false);
  };

  const handleSaveAndSend = (send: boolean) => {
    if (!selectedEmployee || !templateId || !dueDate) {
      alert("Please select an employee, template, and due date.");
      return;
    }
    if (selectedApprovers.length === 0) {
        alert("Please select at least one approver.");
        return;
    }
    if (!selectedApprovers.some(a => [Role.BOD, Role.GeneralManager].includes(a.role))) {
        alert("At least one approver must be a Board of Director or General Manager.");
        return;
    }
    
    const steps: RoutingStep[] = [];
    let order = 1;

    // Add approvers first
    selectedApprovers.forEach(approver => {
        steps.push({ 
            id: `step-new-approver-${order}`, 
            userId: approver.id, 
            name: `${approver.name}${approver.role ? ` (${approver.role})` : ''}`, 
            role: 'Approver', 
            status: RoutingStepStatus.Pending, 
            order: order++, 
            is_required: true, 
        });
    });

    // Add employee (primary signer)
    steps.push({ 
        id: `step-new-signer-${order}`, 
        userId: selectedEmployee.id, 
        name: `${selectedEmployee.name}${selectedEmployee.role ? ` (${selectedEmployee.role})` : ''}`, 
        role: 'Signer', 
        status: RoutingStepStatus.Pending, 
        order: order++, 
        is_required: true, 
    });
    
    // Add final HR signer
    const hrHead = (employees.length ? employees : mockUsers).find(u => u.id === '5'); // Assuming HR Head has ID '5'
    if (hrHead) {
         steps.push({ 
             id: `step-new-finalsigner-${order}`, 
             userId: hrHead.id, 
             name: `${hrHead.name}${hrHead.role ? ` (${hrHead.role})` : ''}`, 
             role: 'Signer', 
             status: RoutingStepStatus.Pending, 
             order: order++, 
             is_required: true, 
        });
    }

    onSave({ 
        templateId, 
        dueDate: new Date(dueDate), 
        routingSteps: steps, 
        contentSnapshot: content,
        employeeId: selectedEmployee.id,
        employeeName: selectedEmployee.name
    }, send);
  };


  const footer = (
    <div className="flex justify-end w-full space-x-2">
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button onClick={() => handleSaveAndSend(false)}>Save as Draft</Button>
      <Button onClick={() => handleSaveAndSend(true)}>Send for Signature</Button>
    </div>
  );

    const handleContentChange = (field: keyof ContractTemplate, value: any) => {
        setContent(prev => ({...prev, [field]: value}));
    }

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const base64 = await fileToBase64(file);
            handleContentChange('logoUrl', base64);
        }
    };
    const handleAddSection = () => {
        const newSection: ContractTemplateSection = { id: `section-${Date.now()}`, title: '', body: '' };
        handleContentChange('sections', [...(content.sections || []), newSection]);
    };
    const handleRemoveSection = (id: string) => {
        handleContentChange('sections', content.sections?.filter(s => s.id !== id));
    };
    const handleSectionChange = (id: string, field: 'title' | 'body', value: string) => {
        handleContentChange('sections', content.sections?.map(s => s.id === id ? { ...s, [field]: value } : s));
    };
    const handleSignatoryChange = (block: 'companySignatory' | 'employeeSignatory', field: keyof SignatoryBlock, value: string) => {
        handleContentChange(block, { ...(content[block] || {}), [field]: value });
    };
    const handleAddWitness = () => {
        const newWitness = { id: `witness-${Date.now()}`, name: '' };
        handleContentChange('witnesses', [...(content.witnesses || []), newWitness]);
    };
    const handleRemoveWitness = (id: string) => {
        handleContentChange('witnesses', content.witnesses?.filter(w => w.id !== id));
    };
    const handleWitnessChange = (id: string, value: string) => {
        handleContentChange('witnesses', content.witnesses?.map(w => w.id === id ? { ...w, name: value } : w));
    };
    const handleAddParty = () => {
        const newParty = { id: `party-${Date.now()}`, name: '', idProof: '', idIssue: '' };
        handleContentChange('acknowledgmentParties', [...(content.acknowledgmentParties || []), newParty]);
    };
    const handleRemoveParty = (id: string) => {
        handleContentChange('acknowledgmentParties', content.acknowledgmentParties?.filter(p => p.id !== id));
    };
    const handlePartyChange = (id: string, field: 'name' | 'idProof' | 'idIssue', value: string) => {
        handleContentChange('acknowledgmentParties', content.acknowledgmentParties?.map(p => p.id === id ? { ...p, [field]: value } : p));
    };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New Document Envelope" footer={footer} size="4xl">
      <div className="space-y-6">
        <div className="p-4 border rounded-md dark:border-gray-600 space-y-4">
            <h3 className="font-semibold text-lg">Document & Scheduling</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Contract Template</label>
              <select value={templateId} onChange={e => setTemplateId(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                {templates.map(t => <option key={t.id} value={t.id}>{t.title}{t.activeVersion ? ` (v${t.activeVersion})` : ''}</option>)}
              </select>
            </div>
            <Input label="Due Date" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </div>
        
        <div className="p-4 border rounded-md dark:border-gray-600 space-y-4">
            <h3 className="font-semibold text-lg">Recipients & Routing</h3>
             <div ref={searchWrapperRef} className="relative">
                <Input
                    label="Employee (Primary Recipient)"
                    id="employee-search"
                    value={employeeSearch}
                    onChange={(e) => { setEmployeeSearch(e.target.value); setIsEmployeeSearchOpen(true); }}
                    onFocus={() => setIsEmployeeSearchOpen(true)}
                    autoComplete="off"
                    placeholder="Search by name..."
                    required
                />
                {isEmployeeSearchOpen && availableEmployees.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-md shadow-lg max-h-60 overflow-auto">
                        {availableEmployees.map(user => (
                            <div key={user.id} onClick={() => handleSelectEmployee(user)} className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer">
                                <p className="text-sm font-medium flex items-center gap-1">
                                  <span>{user.name}</span>
                                  {user.role && <span className="text-xs text-gray-500">[{user.role}]</span>}
                                </p>
                                <p className="text-xs text-gray-500">{user.position}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <EmployeeMultiSelect
                label="Approvers (At least one BOD or GM required)"
                allUsers={approverPool}
                selectedUsers={selectedApprovers}
                onSelectionChange={setSelectedApprovers}
            />
        </div>

        {/* --- Start of Copied Form from TemplateDrawer --- */}
        <div className="space-y-6 pt-6 border-t dark:border-gray-700">
            <div className="p-4 border rounded-md dark:border-gray-600 space-y-4">
                <h3 className="font-semibold text-lg">Logo Settings</h3>
                <div className="relative flex items-center">
                    <input type="text" name="logoUrl" placeholder="https://example.com/logo.png or paste data URI..." value={content.logoUrl || ''} onChange={e => handleContentChange('logoUrl', e.target.value)} className="block w-full pr-24 py-2 border rounded-md shadow-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white" />
                    <input type="file" ref={logoUploadRef} onChange={handleLogoUpload} accept="image/*" className="hidden" />
                    <Button type="button" onClick={() => logoUploadRef.current?.click()} variant="secondary" className="absolute right-1">Upload</Button>
                </div>
                {content.logoUrl && <img src={content.logoUrl} alt="Logo Preview" className="mt-2 max-h-20 border p-1 rounded-md" />}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium">Position</label>
                        <select name="logoPosition" value={content.logoPosition || 'left'} onChange={e => handleContentChange('logoPosition', e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600">
                            <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                        </select>
                    </div>
                    <Input label="Max Width (px)" name="logoMaxWidth" type="number" value={content.logoMaxWidth || ''} onChange={e => handleContentChange('logoMaxWidth', e.target.value)} />
                </div>
            </div>
            
            <RichTextEditor label="Body / Introduction" value={content.body || ''} onChange={(value) => handleContentChange('body', value)} />

            <div className="space-y-4 pt-4 border-t dark:border-gray-600">
                <div className="flex justify-between items-center"><h3 className="text-lg font-semibold">Additional Sections</h3><Button variant="secondary" onClick={handleAddSection}>+ Add Section</Button></div>
                {(content.sections || []).map((section, index) => (
                    <div key={section.id || index} className="p-4 border rounded-md dark:border-gray-700 space-y-3 relative bg-gray-50 dark:bg-slate-900/50">
                        <Button variant="danger" size="sm" className="!p-1 absolute top-2 right-2" onClick={() => handleRemoveSection(section.id)}><TrashIcon /></Button>
                        <Input label="Section Title" value={section.title} onChange={(e) => handleSectionChange(section.id, 'title', e.target.value)} />
                        <RichTextEditor value={section.body} onChange={(value) => handleSectionChange(section.id, 'body', value)} rows={5} />
                    </div>
                ))}
            </div>
            
            <div className="space-y-4 pt-4 border-t dark:border-gray-600">
                <h3 className="text-lg font-semibold">Signatory Blocks</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-4 border rounded-md dark:border-gray-700 space-y-3">
                        <h4 className="font-medium">Company Signatory</h4>
                        <Input label="Name" value={content.companySignatory?.name || ''} onChange={e => handleSignatoryChange('companySignatory', 'name', e.target.value)} />
                        <Input label="Position" value={content.companySignatory?.position || ''} onChange={e => handleSignatoryChange('companySignatory', 'position', e.target.value)} />
                        <Input label="Company (Optional)" value={content.companySignatory?.company || ''} onChange={e => handleSignatoryChange('companySignatory', 'company', e.target.value)} />
                    </div>
                    <div className="p-4 border rounded-md dark:border-gray-700 space-y-3">
                        <h4 className="font-medium">Employee Signatory</h4>
                        <Input label="Name Label" placeholder="e.g., NAME or {{employee_name}}" value={content.employeeSignatory?.name || ''} onChange={e => handleSignatoryChange('employeeSignatory', 'name', e.target.value)} />
                        <Input label="Position Label" placeholder="e.g., Position" value={content.employeeSignatory?.position || ''} onChange={e => handleSignatoryChange('employeeSignatory', 'position', e.target.value)} />
                        <Input label="Company Label (Optional)" placeholder="e.g., Company" value={content.employeeSignatory?.company || ''} onChange={e => handleSignatoryChange('employeeSignatory', 'company', e.target.value)} />
                    </div>
                </div>
            </div>

            <div className="space-y-4 pt-4 border-t dark:border-gray-600">
                <h3 className="text-lg font-semibold">Witnesses</h3>
                {(content.witnesses || []).map((witness, index) => (
                    <div key={witness.id} className="flex items-end space-x-2"><div className="flex-grow"><Input label={`Witness ${index + 1} Name Label`} value={witness.name} onChange={(e) => handleWitnessChange(witness.id, e.target.value)} /></div><Button variant="danger" size="sm" onClick={() => handleRemoveWitness(witness.id)}>Remove</Button></div>
                ))}
                <Button variant="secondary" size="sm" onClick={handleAddWitness}>+ Add Witness</Button>
            </div>

            <div className="space-y-4 pt-4 border-t dark:border-gray-600">
                <h3 className="text-lg font-semibold">Footer</h3>
                <RichTextEditor label="Footer Content" value={content.footer || ''} onChange={(value) => handleContentChange('footer', value)} rows={4} />
            </div>

            <div className="space-y-4 pt-4 border-t dark:border-gray-600">
                <h3 className="text-lg font-semibold">Acknowledgment (Last Page)</h3>
                <RichTextEditor label="Acknowledgment Text" value={content.acknowledgmentBody || ''} onChange={(value) => handleContentChange('acknowledgmentBody', value)} rows={8} />
                <div className="space-y-4 pt-4 border-t dark:border-gray-700">
                    <h4 className="font-medium">Parties Appearing in Acknowledgment</h4>
                    {(content.acknowledgmentParties || []).map((party) => (
                         <div key={party.id} className="p-3 border rounded-md dark:border-gray-700 bg-gray-100 dark:bg-slate-800/50 relative">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <Input label="Name" value={party.name} onChange={(e) => handlePartyChange(party.id, 'name', e.target.value)} />
                                <Input label="Valid Proof of Identification" value={party.idProof} onChange={(e) => handlePartyChange(party.id, 'idProof', e.target.value)} />
                                <Input label="Date/Place Issued" value={party.idIssue} onChange={(e) => handlePartyChange(party.id, 'idIssue', e.target.value)} />
                            </div>
                            <Button variant="danger" size="sm" onClick={() => handleRemoveParty(party.id)} className="!p-1 absolute top-2 right-2"><TrashIcon /></Button>
                        </div>
                    ))}
                    <Button variant="secondary" size="sm" onClick={handleAddParty}>+ Add Party</Button>
                </div>
            </div>
        </div>
      </div>
    </Modal>
  );
};

export default EnvelopeCreationDrawer;
