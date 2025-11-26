import React, { useState, useMemo } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { useAuth } from '../../hooks/useAuth';
import { Role, ContractTemplate, Envelope, EnvelopeStatus, RoutingStep, RoutingStepStatus, EnvelopeEvent, EnvelopeEventType, Permission } from '../../types';
import TemplateList from '../../components/contracts/TemplateList';
import TemplateDrawer from '../../components/contracts/TemplateDrawer';
import EnvelopeList from '../../components/contracts/EnvelopeList';
import EnvelopeCreationDrawer from '../../components/contracts/EnvelopeCreationDrawer';
import { mockContractTemplates, mockEnvelopes, mockUsers } from '../../services/mockData';
import Input from '../../components/ui/Input';
import { usePermissions } from '../../hooks/usePermissions';
import EditableDescription from '../../components/ui/EditableDescription';


const Contracts: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'documents' | 'templates'>('documents');
  const { user } = useAuth();
  const { can } = usePermissions();

  const [templates, setTemplates] = useState<ContractTemplate[]>(mockContractTemplates);
  const [isTemplateDrawerOpen, setIsTemplateDrawerOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Partial<ContractTemplate> | null>(null);
  
  const [envelopes, setEnvelopes] = useState<Envelope[]>(mockEnvelopes);
  const [isEnvelopeDrawerOpen, setIsEnvelopeDrawerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const canManage = can('Employees', Permission.Edit);
  const canViewAll = can('Employees', Permission.View);

  const filteredEnvelopes = useMemo(() => {
    if (!searchTerm) {
        return envelopes;
    }
    const lowercasedTerm = searchTerm.toLowerCase();
    return envelopes.filter(env => 
        env.employeeName.toLowerCase().includes(lowercasedTerm) ||
        env.title.toLowerCase().includes(lowercasedTerm) ||
        env.status.toLowerCase().includes(lowercasedTerm)
    );
  }, [envelopes, searchTerm]);

  const tabClass = (tabName: 'documents' | 'templates') =>
    `px-4 py-2 text-sm font-medium transition-colors ${
      activeTab === tabName
        ? 'border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400'
        : 'border-b-2 border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
    }`;
    

  const handleOpenTemplateDrawer = (template: ContractTemplate | null) => {
    setSelectedTemplate(template);
    setIsTemplateDrawerOpen(true);
  };

  const handleSaveTemplate = (templateData: Partial<ContractTemplate>) => {
    const index = mockContractTemplates.findIndex(t => t.id === templateData.id);
    if (index > -1) { // Editing existing
        mockContractTemplates[index] = templateData as ContractTemplate;
    } else { // Creating new
        const newTemplate = { ...templateData, id: `CTPL-${Date.now()}`} as ContractTemplate;
        mockContractTemplates.unshift(newTemplate);
    }
    setTemplates([...mockContractTemplates]); // Re-set from source of truth
    setIsTemplateDrawerOpen(false);
    setSelectedTemplate(null);
  };
  
  const handleOpenEnvelopeDrawer = () => {
    setIsEnvelopeDrawerOpen(true);
  };

  const handleSaveEnvelope = (envelopeToSave: Partial<Envelope>, send: boolean) => {
      if (!user || !envelopeToSave.routingSteps || !envelopeToSave.templateId || !envelopeToSave.employeeId) return;

      const template = templates.find(t => t.id === envelopeToSave.templateId);
      const employee = mockUsers.find(u => u.id === envelopeToSave.employeeId);

      if (!employee || !template) return;

      let initialStatus = EnvelopeStatus.Draft;
      if (send) {
          const firstStep = envelopeToSave.routingSteps[0];
          initialStatus = firstStep.role === 'Approver' ? EnvelopeStatus.PendingApproval : EnvelopeStatus.OutForSignature;
      }

      // FIX: The newEnvelope object was incomplete, causing a type error. It has been fully populated.
      const newEnvelope: Envelope = {
        id: `ENV-${Date.now()}`,
        templateId: template.id,
        templateTitle: template.title,
        employeeId: employee.id,
        employeeName: employee.name,
        title: `Contract for ${employee.name}`,
        routingSteps: envelopeToSave.routingSteps,
        dueDate: envelopeToSave.dueDate!,
        status: initialStatus,
        createdByUserId: user.id,
        createdAt: new Date(),
        events: [
            { timestamp: new Date(), type: EnvelopeEventType.Created, userName: user.name },
            ...(send ? [{ timestamp: new Date(), type: EnvelopeEventType.Sent, userName: user.name, details: `Status set to ${initialStatus}` }] : [])
        ],
        contentSnapshot: envelopeToSave.contentSnapshot,
      };

      mockEnvelopes.unshift(newEnvelope);
      setEnvelopes([...mockEnvelopes]);
      setIsEnvelopeDrawerOpen(false);
  };


  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Contracts & Signing</h1>
      <EditableDescription descriptionKey="contractsDesc" />

      {canManage && (
        <div className="flex space-x-2 p-1 bg-gray-200 dark:bg-slate-800 rounded-lg self-start">
            <button className={tabClass('documents')} onClick={() => setActiveTab('documents')}>Documents</button>
            <button className={tabClass('templates')} onClick={() => setActiveTab('templates')}>Templates</button>
        </div>
      )}

      {activeTab === 'documents' && (
        <Card>
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div className="flex-grow">
                    <Input
                        label="Search Documents"
                        id="doc-search"
                        placeholder="Search by recipient, title, or status..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                {canManage && (
                    <div className="flex-shrink-0 self-end md:self-center">
                        <Button onClick={handleOpenEnvelopeDrawer}>Create New Document</Button>
                    </div>
                )}
            </div>
           <EnvelopeList envelopes={filteredEnvelopes} />
        </Card>
      )}

      {activeTab === 'templates' && canManage && (
        <Card>
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <h2 className="text-lg font-semibold">Contract Templates</h2>
                <Button onClick={() => handleOpenTemplateDrawer(null)}>Create New Template</Button>
            </div>
           <TemplateList templates={templates} onEdit={handleOpenTemplateDrawer} />
        </Card>
      )}

      {isTemplateDrawerOpen && canManage && (
        <TemplateDrawer
            isOpen={isTemplateDrawerOpen}
            onClose={() => setIsTemplateDrawerOpen(false)}
            template={selectedTemplate}
            onSave={handleSaveTemplate}
        />
      )}

      {isEnvelopeDrawerOpen && canManage && (
          <EnvelopeCreationDrawer
            isOpen={isEnvelopeDrawerOpen}
            onClose={() => setIsEnvelopeDrawerOpen(false)}
            onSave={handleSaveEnvelope}
          />
      )}
    </div>
  );
};

export default Contracts;