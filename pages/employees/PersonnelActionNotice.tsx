
import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { mockPANs, mockUsers, mockPANTemplates, mockChangeHistory, mockEmployeeDrafts, mockNotifications } from '../../services/mockData';
import { PAN, PANStatus, Permission, User, Role, PANTemplate, ChangeHistory, ChangeHistoryStatus, PANParticulars, SalaryBreakdown, PANRole, PANStepStatus, PANActionTaken, PANRoutingStep, EmployeeDraftStatus, NotificationType } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import PANTable from '../../components/employees/PANTable';
import PANModal from '../../components/employees/PANModal';
import PANTemplateTable from '../../components/employees/PANTemplateTable';
import PANTemplateModal from '../../components/employees/PANTemplateModal';
import PrintablePAN from '../../components/employees/PrintablePAN';
import Input from '../../components/ui/Input';
import { logActivity } from '../../services/auditService';
import RejectReasonModal from '../../components/feedback/RejectReasonModal';
import EditableDescription from '../../components/ui/EditableDescription';

const emptySalary: SalaryBreakdown = { basic: 0, deminimis: 0, reimbursable: 0 };
const emptyActions = { changeOfStatus: false, promotion: false, transfer: false, salaryIncrease: false, changeOfJobTitle: false, others: '' };


const PersonnelActionNotice: React.FC = () => {
  const { user } = useAuth();
  const { can } = usePermissions();

  const [records, setRecords] = useState<PAN[]>(() => {
    if (!user) return [];
    
    const allPans = mockPANs;

    if ([Role.Admin, Role.HRManager, Role.HRStaff, Role.BOD].includes(user.role)) {
        return allPans;
    }
    
    // Managers/Approvers see their own, plus any pending their action or that they've actioned
    const managerRoles = [Role.GeneralManager, Role.Manager, Role.BusinessUnitManager, Role.OperationsDirector];
    if (managerRoles.includes(user.role)) {
        return allPans.filter(p => 
            p.employeeId === user.id || 
            p.routingSteps.some(s => s.userId === user.id)
        );
    }
    
    // Employees see only their own.
    if (user.role === Role.Employee) {
        return allPans.filter(p => p.employeeId === user.id);
    }
    return [];
  });

  const [templates, setTemplates] = useState<PANTemplate[]>(mockPANTemplates);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<PAN | null>(null);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<PANTemplate | null>(null);
  const [activeTab, setActiveTab] = useState('records');
  const [panToPrint, setPanToPrint] = useState<PAN | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [yearFilter, setYearFilter] = useState<string>(new Date().getFullYear().toString());
  const [monthFilter, setMonthFilter] = useState<string>((new Date().getMonth() + 1).toString());
  const [panForAction, setPanForAction] = useState<PAN | null>(null);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);


  const canCreatePAN = can('PAN', Permission.Create);
  const canManageTemplates = can('PAN', Permission.Manage);
  const canViewTemplatesTab = can('PAN', Permission.Create) || can('PAN', Permission.Manage);

  const getActionType = (action: PANActionTaken) => {
    if (!action) return 'N/A';
    const actions = [];
    if (action.changeOfStatus) actions.push('Status Change');
    if (action.promotion) actions.push('Promotion');
    if (action.transfer) actions.push('Transfer');
    if (action.salaryIncrease) actions.push('Salary Increase');
    if (action.changeOfJobTitle) actions.push('Job Title Change');
    if (action.others) actions.push(action.others);
    return actions.join(', ') || 'Update';
  };

  const yearOptions = useMemo(() => {
    const years = new Set(mockPANs.map(r => new Date(r.effectiveDate).getFullYear()));
    const currentYear = new Date().getFullYear();
    years.add(currentYear);
    return Array.from(years).sort((a, b) => b - a);
  }, []);

  const monthOptions = [
    { value: '1', name: 'January' }, { value: '2', name: 'February' }, { value: '3', name: 'March' },
    { value: '4', name: 'April' }, { value: '5', name: 'May' }, { value: '6', name: 'June' },
    { value: '7', name: 'July' }, { value: '8', name: 'August' }, { value: '9', name: 'September' },
    { value: '10', name: 'October' }, { value: '11', name: 'November' }, { value: '12', name: 'December' }
  ];

  const filteredRecords = useMemo(() => {
    return records.filter(record => {
      const recordDate = new Date(record.effectiveDate);
      const yearMatch = yearFilter === 'all' || recordDate.getFullYear().toString() === yearFilter;
      const monthMatch = monthFilter === 'all' || (recordDate.getMonth() + 1).toString() === monthFilter;

      const searchTermMatch = !searchTerm ||
        record.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        getActionType(record.actionTaken).toLowerCase().includes(searchTerm.toLowerCase()) ||
        record.status.toLowerCase().includes(searchTerm.toLowerCase());

      return yearMatch && monthMatch && searchTermMatch;
    });
  }, [records, searchTerm, yearFilter, monthFilter]);


  const handleOpenModal = (record: PAN | null) => {
    setSelectedRecord(record);
    setIsModalOpen(true);
  };

  const handleSaveDraft = (recordToSave: Partial<PAN>) => {
    if (!user) return;
    const employee = mockUsers.find(u => u.id === recordToSave.employeeId);
    if (!employee) {
        alert("Please select an employee.");
        return;
    }
    
    const draftRecord: PAN = {
      id: recordToSave.id || `PAN-${Date.now()}`,
      status: PANStatus.Draft,
      employeeId: employee.id,
      employeeName: employee.name,
      effectiveDate: recordToSave.effectiveDate || new Date(),
      actionTaken: recordToSave.actionTaken || { ...emptyActions },
      particulars: recordToSave.particulars || { from: {}, to: {} },
      tenure: recordToSave.tenure || 'N/A',
      notes: recordToSave.notes || '',
      logoUrl: recordToSave.logoUrl,
      routingSteps: recordToSave.routingSteps || [],
      signedAt: undefined,
    };

    const recordIndex = mockPANs.findIndex(p => p.id === draftRecord.id);
    if (recordIndex > -1) {
        mockPANs[recordIndex] = draftRecord;
    } else {
        mockPANs.unshift(draftRecord);
    }
    setRecords([...mockPANs]);
    setIsModalOpen(false);
  };

  const handleSendForAcknowledgement = (panToSend: Partial<PAN>) => {
    if (!user) return;
    const employee = mockUsers.find(u => u.id === panToSend.employeeId);
    if (!employee) {
        alert("Please select an employee before sending.");
        return;
    }

    const firstStep = panToSend.routingSteps?.[0];
    const initialStatus = firstStep ? PANStatus.PendingApproval : PANStatus.PendingEmployee;

    const finalPAN: PAN = {
        id: panToSend.id || `PAN-${Date.now()}`,
        status: initialStatus,
        employeeId: employee.id,
        employeeName: employee.name,
        effectiveDate: panToSend.effectiveDate!,
        actionTaken: panToSend.actionTaken!,
        particulars: panToSend.particulars!,
        tenure: panToSend.tenure!,
        notes: panToSend.notes!,
        logoUrl: panToSend.logoUrl,
        routingSteps: panToSend.routingSteps || [],
        signedAt: undefined,
    };
    
    // Note: ChangeHistory generation moved to handleAcknowledge to prevent appearance in HR queue before approval/acknowledgement

    const recordIndex = mockPANs.findIndex(p => p.id === finalPAN.id);
    if (recordIndex > -1) {
        mockPANs[recordIndex] = finalPAN;
    } else {
        mockPANs.unshift(finalPAN);
    }
    
    setRecords([...mockPANs]);
    setIsModalOpen(false);
  };

  const handleAcknowledge = (panId: string, signatureDataUrl: string, signatureName: string) => {
    const panToAcknowledge = records.find(r => r.id === panId);
    if (!panToAcknowledge || !user) return;

    // 1. Update the PAN status to Completed and add signature details
    const updatedPAN: PAN = { 
        ...panToAcknowledge, 
        status: PANStatus.Completed,
        signedAt: new Date(),
        signatureDataUrl: signatureDataUrl,
        signatureName: signatureName,
    };
    const mockPanIndex = mockPANs.findIndex(p => p.id === panId);
    if (mockPanIndex > -1) mockPANs[mockPanIndex] = updatedPAN;
    setRecords(prev => prev.map(r => r.id === panId ? updatedPAN : r));
    
    // 2. Generate Change History (Now triggered upon acknowledgement)
    const from = updatedPAN.particulars.from;
    const to = updatedPAN.particulars.to;
    const changes: { field: string, oldValue: any, newValue: any }[] = [];

    const fieldsToCompare: (keyof PANParticulars)[] = ['employmentStatus', 'position', 'department'];
    fieldsToCompare.forEach(field => {
        if (from[field] !== to[field]) {
            changes.push({ field: String(field), oldValue: from[field], newValue: to[field] });
        }
    });

    if (JSON.stringify(from.salary || emptySalary) !== JSON.stringify(to.salary || emptySalary)) {
        const fromSalary = from.salary || emptySalary;
        const toSalary = to.salary || emptySalary;
        const salaryFields: (keyof SalaryBreakdown)[] = ['basic', 'deminimis', 'reimbursable'];
        
        salaryFields.forEach(sField => {
            if (fromSalary[sField] !== toSalary[sField]) {
                changes.push({
                    field: `Salary - ${String(sField)}`,
                    oldValue: fromSalary[sField],
                    newValue: toSalary[sField]
                });
            }
        });
    }

    const newHistoryItems: ChangeHistory[] = changes.map(change => ({
        id: `ch-${updatedPAN.id}-${String(change.field).replace(/\s/g, '')}`,
        employeeId: updatedPAN.employeeId,
        timestamp: new Date(),
        changedBy: user.id,
        field: String(change.field).replace(/([A-Z])/g, ' $1').trim(),
        oldValue: String(change.oldValue || 'Not Set'),
        newValue: String(change.newValue || 'Not Set'),
        status: ChangeHistoryStatus.Pending,
        submissionId: updatedPAN.id,
    }));
    mockChangeHistory.unshift(...newHistoryItems);
    
    // 3. Prepare the draft data for HR review
    const updatedProfileData: Partial<User> = {};
    if (to.position) updatedProfileData.position = to.position;
    if (to.department) updatedProfileData.department = to.department;
    if (to.salary) {
        updatedProfileData.salary = to.salary;
        updatedProfileData.monthlySalary = to.salary.basic;
        updatedProfileData.rateAmount = to.salary.basic;
    }
    
    // 4. Create or update the EmployeeDraft
    const submissionId = updatedPAN.id;
    const draftIndex = mockEmployeeDrafts.findIndex(d => d.employeeId === updatedPAN.employeeId && d.status !== EmployeeDraftStatus.Approved);
    
    if (draftIndex > -1) {
        // Update an existing draft (rare case, but handles if user had a pending self-service edit)
        mockEmployeeDrafts[draftIndex].draftData = { ...mockEmployeeDrafts[draftIndex].draftData, ...updatedProfileData };
        mockEmployeeDrafts[draftIndex].status = EmployeeDraftStatus.Submitted;
        mockEmployeeDrafts[draftIndex].submissionId = submissionId;
    } else {
        // Create a new draft for the HR Review Queue
         mockEmployeeDrafts.push({
            id: `draft-pan-${updatedPAN.employeeId}-${Date.now()}`,
            employeeId: updatedPAN.employeeId,
            draftData: updatedProfileData,
            status: EmployeeDraftStatus.Submitted,
            createdAt: new Date(),
            submissionId: submissionId,
        });
    }
    
    setIsModalOpen(false);
  };
  
  const handleApprovePAN = (panId: string) => {
    if (!user) return;
    
    const panIndex = mockPANs.findIndex(p => p.id === panId);
    if (panIndex === -1) return;

    const updatedPAN = JSON.parse(JSON.stringify(mockPANs[panIndex]));
    const userStepIndex = updatedPAN.routingSteps.findIndex((s: PANRoutingStep) => s.userId === user.id && s.status === PANStepStatus.Pending);

    if (userStepIndex > -1) {
        updatedPAN.routingSteps[userStepIndex].status = PANStepStatus.Approved;
        updatedPAN.routingSteps[userStepIndex].timestamp = new Date();
    }
    
    const allStepsCompleted = updatedPAN.routingSteps.every((s: PANRoutingStep) => s.status === PANStepStatus.Approved);

    if (allStepsCompleted) {
        updatedPAN.status = PANStatus.PendingEmployee;

        // Notify HR Manager and HR Staff upon final approval (e.g. BOD approval)
        const hrUsers = mockUsers.filter(u => u.role === Role.HRManager || u.role === Role.HRStaff);
        hrUsers.forEach(hr => {
            mockNotifications.unshift({
                id: `notif-pan-approved-${Date.now()}-${hr.id}`,
                userId: hr.id,
                type: NotificationType.PAN_UPDATE,
                title: 'PAN Approved',
                message: `The PAN for ${updatedPAN.employeeName} has been fully approved by all approvers.`,
                link: '/employees/pan',
                isRead: false,
                createdAt: new Date(),
                relatedEntityId: updatedPAN.id
            });
        });
    }


    mockPANs[panIndex] = updatedPAN;
    setRecords([...mockPANs]);
    setIsModalOpen(false);
    logActivity(user, 'APPROVE', 'PAN', panId, `Approved PAN step for ${updatedPAN.employeeName}.`);
  };

  const handleRejectPANRequest = (pan: PAN) => {
    setPanForAction(pan);
    setIsRejectModalOpen(true);
  };

  const handleConfirmRejectPAN = (reason: string) => {
    if (!user || !panForAction) return;
    const panId = panForAction.id;

    const panIndex = mockPANs.findIndex(p => p.id === panId);
    if (panIndex === -1) return;

    const updatedPAN = JSON.parse(JSON.stringify(mockPANs[panIndex]));
    const userStepIndex = updatedPAN.routingSteps.findIndex((s: PANRoutingStep) => s.userId === user.id && s.status === PANStepStatus.Pending);
    
    if (userStepIndex > -1) {
        updatedPAN.routingSteps[userStepIndex].status = PANStepStatus.Declined;
        updatedPAN.routingSteps[userStepIndex].timestamp = new Date();
        updatedPAN.routingSteps[userStepIndex].notes = reason;
    }

    updatedPAN.status = PANStatus.Declined;

    mockPANs[panIndex] = updatedPAN;
    setRecords([...mockPANs]);
    setIsModalOpen(false);
    setIsRejectModalOpen(false);
    setPanForAction(null);
    logActivity(user, 'REJECT', 'PAN', panId, `Rejected PAN for ${updatedPAN.employeeName}. Reason: ${reason}`);
  };

  // Template Handlers
  const handleOpenTemplateModal = (template: PANTemplate | null) => {
      setSelectedTemplate(template);
      setIsTemplateModalOpen(true);
  };

  const handleSaveTemplate = (templateToSave: PANTemplate) => {
      if (templateToSave.id) {
          const index = mockPANTemplates.findIndex(t => t.id === templateToSave.id);
          if (index > -1) {
              mockPANTemplates[index] = {...mockPANTemplates[index], ...templateToSave, updatedAt: new Date()};
          }
      } else {
          const newTemplate: PANTemplate = {
              ...templateToSave,
              id: `PANTPL-${Date.now()}`,
              createdByUserId: user!.id,
              createdAt: new Date(),
              updatedAt: new Date(),
          };
          mockPANTemplates.unshift(newTemplate);
      }
      setTemplates([...mockPANTemplates]);
      setIsTemplateModalOpen(false);
  };
  
  const handleDeleteTemplate = (templateId: string) => {
      if (window.confirm("Are you sure you want to delete this template?")) {
          const index = mockPANTemplates.findIndex(t => t.id === templateId);
          if (index > -1) {
              mockPANTemplates.splice(index, 1);
              setTemplates([...mockPANTemplates]);
          }
      }
  };


  const tabClass = (tabName: string) => `px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === tabName ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Personnel Action Notice (PAN)</h1>
      <EditableDescription descriptionKey="panDesc" className="mt-1 mb-6" />
      
      {canViewTemplatesTab && (
        <div className="inline-flex space-x-1 p-1 bg-gray-200 dark:bg-slate-800 rounded-lg">
            <button className={tabClass('records')} onClick={() => setActiveTab('records')}>Records</button>
            <button className={tabClass('templates')} onClick={() => setActiveTab('templates')}>Templates</button>
        </div>
      )}

      {activeTab === 'records' && (
          <div className="space-y-6">
              <Card>
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 space-y-4">
                    <div className="flex flex-col md:flex-row justify-between md:items-start gap-4">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Filter & Search Records</h3>
                        {canCreatePAN && (
                            <div className="flex-shrink-0">
                               <Button onClick={() => handleOpenModal(null)}>Create New PAN</Button>
                            </div>
                        )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Input
                            label=""
                            id="pan-search"
                            placeholder="Search by employee, type, or status..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                        <div>
                            <label htmlFor="year-filter" className="sr-only">Year</label>
                            <select id="year-filter" value={yearFilter} onChange={e => setYearFilter(e.target.value)} className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                                <option value="all">All Years</option>
                                {yearOptions.map(year => <option key={year} value={year}>{year}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="month-filter" className="sr-only">Month</label>
                            <select id="month-filter" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                                <option value="all">All Months</option>
                                {monthOptions.map(month => <option key={month.value} value={month.value}>{month.name}</option>)}
                            </select>
                        </div>
                    </div>
                </div>
                <PANTable 
                    records={filteredRecords} 
                    onEdit={handleOpenModal}
                />
              </Card>
          </div>
      )}

      {activeTab === 'templates' && canViewTemplatesTab && (
          <div className="space-y-6">
              <div className="flex justify-end items-center">
                {canManageTemplates && (
                    <Button onClick={() => handleOpenTemplateModal(null)}>Create New Template</Button>
                )}
              </div>
              <Card>
                <PANTemplateTable 
                    templates={templates} 
                    onEdit={handleOpenTemplateModal} 
                    onDelete={handleDeleteTemplate} 
                />
              </Card>
          </div>
      )}

      <PANModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        pan={selectedRecord}
        templates={templates}
        onSaveDraft={handleSaveDraft}
        onSendForAcknowledgement={handleSendForAcknowledgement}
        onAcknowledge={handleAcknowledge}
        onDownloadPdf={setPanToPrint}
        onApprove={handleApprovePAN}
        onReject={handleRejectPANRequest}
      />
      
      <PANTemplateModal 
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        template={selectedTemplate}
        onSave={handleSaveTemplate}
      />

      <RejectReasonModal
        isOpen={isRejectModalOpen}
        onClose={() => setIsRejectModalOpen(false)}
        onSubmit={handleConfirmRejectPAN}
        title="Reason for Rejection"
        prompt="Please provide a reason for rejecting this PAN. This will be visible to the creator."
        submitText="Confirm Rejection"
      />

      {panToPrint && createPortal(
        <PrintablePAN pan={panToPrint} onClose={() => setPanToPrint(null)} />,
        document.body
      )}
    </div>
  );
};

export default PersonnelActionNotice;
