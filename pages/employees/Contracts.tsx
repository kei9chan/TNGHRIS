import React, { useState, useMemo } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { useAuth } from '../../hooks/useAuth';
import { Role, ContractTemplate, Envelope, EnvelopeStatus, RoutingStep, RoutingStepStatus, EnvelopeEvent, EnvelopeEventType, Permission, NotificationType } from '../../types';
import TemplateList from '../../components/contracts/TemplateList';
import TemplateDrawer from '../../components/contracts/TemplateDrawer';
import EnvelopeList from '../../components/contracts/EnvelopeList';
import EnvelopeCreationDrawer from '../../components/contracts/EnvelopeCreationDrawer';
import { mockContractTemplates, mockNotifications, mockUsers } from '../../services/mockData';
import Input from '../../components/ui/Input';
import { usePermissions } from '../../hooks/usePermissions';
import EditableDescription from '../../components/ui/EditableDescription';
import { supabase } from '../../services/supabaseClient';

type ContractTemplateRow = {
  id: string;
  title: string;
  description?: string | null;
  owning_business_unit_id?: string | null;
  is_default: boolean;
  logo_url?: string | null;
  logo_position?: string | null;
  logo_max_width?: number | null;
  body: string;
  sections: any[] | null;
  footer?: string | null;
  company_signatory?: any | null;
  employee_signatory?: any | null;
  witnesses?: any[] | null;
  acknowledgment_body?: string | null;
  acknowledgment_parties?: any[] | null;
  active_version?: number | null;
  versions?: any[] | null;
  created_at?: string;
  updated_at?: string;
};

type EnvelopeRow = {
  id: string;
  template_id: string | null;
  template_title: string | null;
  employee_id: string;
  employee_name: string;
  title: string;
  routing_steps: any[] | null;
  due_date: string | null;
  status: string;
  created_by_user_id: string;
  created_at?: string;
  events?: any[] | null;
  content_snapshot?: Partial<ContractTemplate> | null;
};


const Contracts: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'documents' | 'templates'>('documents');
  const { user } = useAuth();
  const { can } = usePermissions();

  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [isTemplateDrawerOpen, setIsTemplateDrawerOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Partial<ContractTemplate> | null>(null);
  
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [employees, setEmployees] = useState(mockUsers);
  const [isEnvelopeDrawerOpen, setIsEnvelopeDrawerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const canManage = can('Employees', Permission.Edit);
  const canViewAll = can('Employees', Permission.View);

  // Load employees for envelope creation
  React.useEffect(() => {
    const loadEmployees = async () => {
      try {
        const { data, error } = await supabase.from('hris_users').select('id, full_name, role, status');
        if (error) throw error;
        if (data) {
          const mapped = data.map((u: any) => ({
            id: u.id,
            name: u.full_name,
            email: '',
            role: (u.role as Role) || Role.Employee,
            status: u.status || 'Active',
          }));
          setEmployees(mapped);
        } else {
          setEmployees(mockUsers);
        }
      } catch (err) {
        console.error('Failed to load employees for envelopes', err);
        setEmployees(mockUsers);
      }
    };
    loadEmployees();
  }, []);

  // Load contract templates from Supabase
  React.useEffect(() => {
    const loadTemplates = async () => {
      try {
        const { data, error } = await supabase
          .from('contract_templates')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) throw error;
        setTemplates((data as ContractTemplateRow[]).map(mapTemplateRow));
      } catch (err) {
        console.error('Failed to load contract templates', err);
        setTemplates(mockContractTemplates);
      }
    };
    loadTemplates();
  }, []);

  // Load envelopes from Supabase so we no longer show mock data
  React.useEffect(() => {
    const loadEnvelopes = async () => {
      try {
        const { data, error } = await supabase
          .from('envelopes')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) throw error;
        if (data) {
          const mapped = (data as EnvelopeRow[]).map(mapEnvelopeRow);
          setEnvelopes(mapped);
        } else {
          setEnvelopes([]);
        }
      } catch (err) {
        console.error('Failed to load envelopes', err);
        setEnvelopes([]);
      }
    };
    loadEnvelopes();
  }, []);

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

  const mapTemplateRow = (row: ContractTemplateRow): ContractTemplate => ({
    id: row.id,
    title: row.title,
    description: row.description || '',
    owningBusinessUnitId: row.owning_business_unit_id || '',
    isDefault: row.is_default,
    logoUrl: row.logo_url || undefined,
    logoPosition: (row.logo_position as any) || 'left',
    logoMaxWidth: row.logo_max_width || undefined,
    body: row.body || '',
    sections: Array.isArray(row.sections) ? row.sections : [],
    footer: row.footer || '',
    companySignatory: row.company_signatory || {},
    employeeSignatory: row.employee_signatory || {},
    witnesses: Array.isArray(row.witnesses) ? row.witnesses : [],
    acknowledgmentBody: row.acknowledgment_body || '',
    acknowledgmentParties: Array.isArray(row.acknowledgment_parties)
      ? row.acknowledgment_parties
      : [],
    activeVersion: row.active_version || undefined,
    versions: Array.isArray(row.versions) ? row.versions : [],
  });
    
  const mapEnvelopeStatus = (status: string): EnvelopeStatus => {
    switch (status) {
      case 'PendingApproval':
      case 'Pending Approval':
        return EnvelopeStatus.PendingApproval;
      case 'OutForSignature':
      case 'Out for Signature':
        return EnvelopeStatus.OutForSignature;
      case 'Declined':
        return EnvelopeStatus.Declined;
      case 'Voided':
        return EnvelopeStatus.Voided;
      case 'Completed':
        return EnvelopeStatus.Completed;
      case 'Draft':
        return EnvelopeStatus.Draft;
      default:
        return status as EnvelopeStatus;
    }
  };

  const mapEnvelopeRow = (row: EnvelopeRow): Envelope => ({
    id: row.id,
    templateId: row.template_id || '',
    templateTitle: row.template_title || '',
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    title: row.title,
    routingSteps: Array.isArray(row.routing_steps) ? row.routing_steps : [],
    dueDate: row.due_date ? new Date(row.due_date) : new Date(),
    status: mapEnvelopeStatus(row.status),
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
    events: Array.isArray(row.events)
      ? row.events.map(ev => ({ ...ev, timestamp: new Date(ev.timestamp) }))
      : [],
    contentSnapshot: row.content_snapshot || undefined,
  });


  const handleOpenTemplateDrawer = (template: ContractTemplate | null) => {
    setSelectedTemplate(template);
    setIsTemplateDrawerOpen(true);
  };

  const handleSaveTemplate = (templateData: Partial<ContractTemplate>) => {
    const persistTemplate = async () => {
      const owningBuId =
        isUuid(templateData.owningBusinessUnitId || null)
          ? templateData.owningBusinessUnitId
          : null;

      const payload = {
        title: templateData.title,
        description: templateData.description || '',
        owning_business_unit_id: owningBuId,
        is_default: templateData.isDefault || false,
        logo_url: templateData.logoUrl || null,
        logo_position: templateData.logoPosition || 'left',
        logo_max_width: templateData.logoMaxWidth || null,
        body: templateData.body || '',
        sections: templateData.sections || [],
        footer: templateData.footer || '',
        company_signatory: templateData.companySignatory || {},
        employee_signatory: templateData.employeeSignatory || {},
        witnesses: templateData.witnesses || [],
        acknowledgment_body: templateData.acknowledgmentBody || '',
        acknowledgment_parties: templateData.acknowledgmentParties || [],
        active_version: templateData.activeVersion || null,
        versions: templateData.versions || [],
      };

      const isEdit = !!templateData.id;
      const { data, error } = isEdit
        ? await supabase
            .from('contract_templates')
            .update({ ...payload, updated_at: new Date().toISOString() })
            .eq('id', templateData.id)
            .select('*')
            .single()
        : await supabase
            .from('contract_templates')
            .insert(payload)
            .select('*')
            .single();

      if (error) throw error;
      const mapped = mapTemplateRow(data as ContractTemplateRow);
      setTemplates(prev => {
        if (isEdit) {
          return prev.map(t => (t.id === mapped.id ? mapped : t));
        }
        return [mapped, ...prev];
      });
    };

    persistTemplate()
      .catch(err => {
        console.error('Failed to save template', err);
        alert('Failed to save template. Please try again.');
      })
      .finally(() => {
        setIsTemplateDrawerOpen(false);
        setSelectedTemplate(null);
      });
  };
  
  const handleOpenEnvelopeDrawer = () => {
    setIsEnvelopeDrawerOpen(true);
  };

  const isUuid = (value?: string | null) => {
    if (!value) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  };

  const handleSaveEnvelope = async (envelopeToSave: Partial<Envelope>, send: boolean) => {
      if (!user || !envelopeToSave.routingSteps || !envelopeToSave.templateId || !envelopeToSave.employeeId) return;

      const template = templates.find(t => t.id === envelopeToSave.templateId);
      const employee = employees.find(u => u.id === envelopeToSave.employeeId) || mockUsers.find(u => u.id === envelopeToSave.employeeId);

      if (!employee || !template) return;

      let initialStatus = EnvelopeStatus.Draft;
      if (send) {
          const firstStep = envelopeToSave.routingSteps[0];
          initialStatus = firstStep.role === 'Approver' ? EnvelopeStatus.PendingApproval : EnvelopeStatus.OutForSignature;
      }

      const events: EnvelopeEvent[] = [
        { timestamp: new Date(), type: EnvelopeEventType.Created, userName: user.name },
        ...(send ? [{ timestamp: new Date(), type: EnvelopeEventType.Sent, userName: user.name, details: `Status set to ${initialStatus}` }] : [])
      ];

      const templateIdForDb = isUuid(template?.id || null) ? template?.id : null;
      const templateTitleForDb = template?.title || envelopeToSave.templateId;

      try {
        const { data, error } = await supabase
          .from('envelopes')
          .insert({
            template_id: templateIdForDb,
            template_title: templateTitleForDb,
            employee_id: employee.id,
            employee_name: employee.name,
            title: `Contract for ${employee.name}`,
            routing_steps: envelopeToSave.routingSteps,
            due_date: envelopeToSave.dueDate ? envelopeToSave.dueDate.toISOString().split('T')[0] : null,
            status: initialStatus,
            created_by_user_id: user.id,
            events: events.map(ev => ({ ...ev, timestamp: new Date(ev.timestamp).toISOString() })),
            content_snapshot: envelopeToSave.contentSnapshot || null,
          })
          .select()
          .single();

        if (error) throw error;

        const newEnvelope: Envelope = {
          id: data.id,
          templateId: data.template_id || envelopeToSave.templateId || '',
          templateTitle: data.template_title,
          employeeId: data.employee_id,
          employeeName: data.employee_name,
          title: data.title,
          routingSteps: data.routing_steps || [],
          dueDate: data.due_date ? new Date(data.due_date) : new Date(),
          status: data.status as EnvelopeStatus,
          createdByUserId: data.created_by_user_id,
          createdAt: data.created_at ? new Date(data.created_at) : new Date(),
          events: data.events || [],
          contentSnapshot: data.content_snapshot || undefined,
        };

        if (send) {
          const createdAt = new Date();
          const link = `/employees/contracts/${newEnvelope.id}`;
          const approvalIds = new Set(
            (newEnvelope.routingSteps || [])
              .filter(step => step.role === 'Approver' && step.userId)
              .map(step => step.userId)
          );

          mockNotifications.unshift({
            id: `notif-contract-sign-${newEnvelope.id}-${newEnvelope.employeeId}-${createdAt.getTime()}`,
            userId: newEnvelope.employeeId,
            type: NotificationType.CONTRACT_SIGNATURE_REQUEST,
            message: `Contract "${newEnvelope.title}" is ready for your signature.`,
            link,
            isRead: false,
            createdAt,
            relatedEntityId: newEnvelope.id,
          });

          approvalIds.forEach(approverId => {
            if (approverId === newEnvelope.employeeId) return;
            mockNotifications.unshift({
              id: `notif-contract-approve-${newEnvelope.id}-${approverId}-${createdAt.getTime()}`,
              userId: approverId,
              type: NotificationType.CONTRACT_APPROVAL_REQUEST,
              message: `Approval required for "${newEnvelope.title}" for ${newEnvelope.employeeName}.`,
              link,
              isRead: false,
              createdAt,
              relatedEntityId: newEnvelope.id,
            });
          });
        }

        setEnvelopes(prev => [newEnvelope, ...prev]);
      } catch (err) {
        console.error('Failed to save envelope', err);
        const message = (err as any)?.message || 'Failed to save envelope. Please try again.';
        alert(message);
      } finally {
        setIsEnvelopeDrawerOpen(false);
      }
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
            employees={employees}
            templates={templates}
          />
      )}
    </div>
  );
};

export default Contracts;
