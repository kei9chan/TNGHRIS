import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import PANTable from '../../components/employees/PANTable';
import PANModal from '../../components/employees/PANModal';
import PANTemplateTable from '../../components/employees/PANTemplateTable';
import PANTemplateModal from '../../components/employees/PANTemplateModal';
import PrintablePAN from '../../components/employees/PrintablePAN';
import Input from '../../components/ui/Input';
import RejectReasonModal from '../../components/feedback/RejectReasonModal';
import EditableDescription from '../../components/ui/EditableDescription';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { supabase } from '../../services/supabaseClient';
import { logActivity } from '../../services/auditService';
import {
  PAN,
  PANStatus,
  Permission,
  User,
  Role,
  PANTemplate,
  PANActionTaken,
  PANStepStatus,
  PANRoutingStep,
  PANRole,
} from '../../types';

const emptyActions: PANActionTaken = {
  changeOfStatus: false,
  promotion: false,
  transfer: false,
  salaryIncrease: false,
  changeOfJobTitle: false,
  others: '',
};

const PersonnelActionNotice: React.FC = () => {
  const { user } = useAuth();
  const { can, getPanAccess } = usePermissions();

  const [records, setRecords] = useState<PAN[]>([]);
  const [templates, setTemplates] = useState<PANTemplate[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<PAN | null>(null);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<PANTemplate | null>(null);
  const [activeTab, setActiveTab] = useState('records');
  const [panToPrint, setPanToPrint] = useState<PAN | null>(null);
  const [panForAction, setPanForAction] = useState<PAN | null>(null);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [yearFilter, setYearFilter] = useState<string>(new Date().getFullYear().toString());
  const [monthFilter, setMonthFilter] = useState<string>((new Date().getMonth() + 1).toString());

  const panAccess = getPanAccess();
  const canCreatePAN = panAccess.canCreate;
  const canManageTemplates = panAccess.canCreate;
  const canViewTemplatesTab = panAccess.canCreate;
  const canRespond = panAccess.canRespond;

  const mapPanRow = (p: any): PAN => ({
    id: p.id,
    employeeId: p.employee_id,
    employeeName: p.employee_name,
    effectiveDate: p.effective_date ? new Date(p.effective_date) : new Date(),
    status: p.status as PANStatus,
    actionTaken: p.action_taken || { ...emptyActions },
    particulars: p.particulars || { from: {}, to: {} },
    tenure: p.tenure || '',
    notes: p.notes || '',
    routingSteps: p.routing_steps || [],
    signedAt: p.signed_at ? new Date(p.signed_at) : undefined,
    signatureDataUrl: p.signature_data_url || undefined,
    signatureName: p.signature_name || undefined,
    logoUrl: p.logo_url || undefined,
    pdfHash: p.pdf_hash || undefined,
    preparerName: p.preparer_name || undefined,
    preparerSignatureUrl: p.preparer_signature_url || undefined,
  });

  useEffect(() => {
    const loadAll = async () => {
      try {
        const [{ data: empRows }, { data: tplRows }, { data: panRows }] = await Promise.all([
          supabase.from('hris_users').select(
            'id, full_name, email, role, status, department, position, salary_basic, salary_deminimis, salary_reimbursable, date_hired'
          ),
          supabase.from('pan_templates').select('*').order('updated_at', { ascending: false }),
          supabase.from('pans').select('*').order('updated_at', { ascending: false }),
        ]);

        if (empRows) {
          setEmployees(
            empRows.map((u: any) => ({
              id: u.id,
              name: u.full_name || u.email,
              email: u.email,
              role: u.role as Role,
              status: (u.status as any) || 'Active',
              department: u.department || '',
              position: u.position || '',
              salary: {
                basic: u.salary_basic ?? 0,
                deminimis: u.salary_deminimis ?? 0,
                reimbursable: u.salary_reimbursable ?? 0,
              },
              dateHired: u.date_hired ? new Date(u.date_hired) : undefined,
              businessUnit: '',
            }))
          );
        }

        if (tplRows) {
          setTemplates(
            tplRows.map((t: any) => ({
              id: t.id,
              name: t.name,
              actionTaken: t.action_taken || {},
              notes: t.notes || '',
              logoUrl: t.logo_url || undefined,
              preparerName: t.preparer_name || undefined,
              preparerSignatureUrl: t.preparer_signature_url || undefined,
              createdByUserId: t.created_by_user_id || '',
              createdAt: t.created_at ? new Date(t.created_at) : new Date(),
              updatedAt: t.updated_at ? new Date(t.updated_at) : new Date(),
              isDefault: t.is_default || false,
            }))
          );
        }

        if (panRows) {
          setRecords(panRows.map(mapPanRow));
        }
      } catch (err) {
        console.error('Failed to load PAN data', err);
      }
    };
    loadAll();
  }, []);

  const upsertPan = async (recordToSave: Partial<PAN>, status: PANStatus) => {
    if (!user || !recordToSave.employeeId) return null;
    const payload: any = {
      employee_id: recordToSave.employeeId,
      employee_name: recordToSave.employeeName || '',
      effective_date: recordToSave.effectiveDate ? new Date(recordToSave.effectiveDate).toISOString().split('T')[0] : null,
      status,
      action_taken: recordToSave.actionTaken || { ...emptyActions },
      particulars: recordToSave.particulars || { from: {}, to: {} },
      tenure: recordToSave.tenure || '',
      notes: recordToSave.notes || '',
      routing_steps: recordToSave.routingSteps || [],
      signed_at: recordToSave.signedAt || null,
      signature_data_url: recordToSave.signatureDataUrl || null,
      signature_name: recordToSave.signatureName || null,
      logo_url: recordToSave.logoUrl || null,
      pdf_hash: recordToSave.pdfHash || null,
      preparer_name: recordToSave.preparerName || null,
      preparer_signature_url: recordToSave.preparerSignatureUrl || null,
      template_id: (recordToSave as any).templateId || null,
      created_by_user_id: user.id,
      updated_at: new Date().toISOString(),
    };
    if (recordToSave.id) payload.id = recordToSave.id;
    const { data, error } = await supabase.from('pans').upsert(payload).select('*').single();
    if (error) {
      console.error('Failed to save PAN', error);
      alert('Failed to save PAN');
      return null;
    }
    return data;
  };

  const handleSaveDraft = async (recordToSave: Partial<PAN>) => {
    if (!recordToSave.employeeId) {
      alert('Please select an employee.');
      return;
    }
    const saved = await upsertPan(recordToSave, PANStatus.Draft);
    if (saved) {
      setRecords(prev => [mapPanRow(saved), ...prev.filter(p => p.id !== saved.id)]);
      setIsModalOpen(false);
      logActivity(user!, 'CREATE', 'PAN', saved.id, `Saved PAN draft for ${recordToSave.employeeName || ''}.`);
    }
  };

  const handleSendForAcknowledgement = async (panToSend: Partial<PAN>) => {
    if (!panToSend.employeeId) {
      alert('Please select an employee before sending.');
      return;
    }
    if (!panToSend.routingSteps || panToSend.routingSteps.length === 0) {
      alert('Please add at least one routing step/approver.');
      return;
    }
    const saved = await upsertPan(panToSend, PANStatus.PendingApproval);
    if (saved) {
      setRecords(prev => [mapPanRow(saved), ...prev.filter(p => p.id !== saved.id)]);
      setIsModalOpen(false);
      logActivity(user!, 'SUBMIT', 'PAN', saved.id, `Sent PAN for acknowledgement for ${panToSend.employeeName || ''}.`);
    }
  };

  const handleAcknowledge = async (panId: string, signatureDataUrl: string, signatureName: string) => {
    const updatedSteps = records.find(r => r.id === panId)?.routingSteps || [];
    const { data, error } = await supabase
      .from('pans')
      .update({
        status: PANStatus.Completed,
        signed_at: new Date().toISOString(),
        signature_data_url: signatureDataUrl,
        signature_name: signatureName,
        routing_steps: updatedSteps,
      })
      .eq('id', panId)
      .select('*')
      .single();
    if (!error && data) {
      setRecords(prev => prev.map(r => (r.id === panId ? mapPanRow(data) : r)));
    }
  };

  const handleApprovePAN = async (panId: string) => {
    const existing = records.find(r => r.id === panId);
    if (!existing || !user) return;
    const steps = existing.routingSteps.map(s =>
      s.userId === user.id && s.status === PANStepStatus.Pending
        ? { ...s, status: PANStepStatus.Approved, timestamp: new Date() }
        : s
    );
    const allApproved = steps.every(s => s.status === PANStepStatus.Approved);
    const newStatus = allApproved ? PANStatus.PendingEmployee : PANStatus.PendingApproval;
    const { data, error } = await supabase
      .from('pans')
      .update({ routing_steps: steps, status: newStatus })
      .eq('id', panId)
      .select('*')
      .single();
    if (!error && data) {
      setRecords(prev => prev.map(r => (r.id === panId ? mapPanRow(data) : r)));
    }
    setIsModalOpen(false);
    setSelectedRecord(null);
  };

  const handleRejectPANRequest = (pan: PAN) => {
    setPanForAction(pan);
    setIsRejectModalOpen(true);
  };

  const handleConfirmRejectPAN = async (reason: string) => {
    if (!panForAction || !user) return;
    const steps = panForAction.routingSteps.map(s =>
      s.userId === user.id && s.status === PANStepStatus.Pending
        ? { ...s, status: PANStepStatus.Declined, timestamp: new Date(), notes: reason }
        : s
    );
    const { data, error } = await supabase
      .from('pans')
      .update({ routing_steps: steps, status: PANStatus.Declined })
      .eq('id', panForAction.id)
      .select('*')
      .single();
    if (!error && data) {
      setRecords(prev => prev.map(r => (r.id === panForAction.id ? mapPanRow(data) : r)));
    }
    setIsRejectModalOpen(false);
    setPanForAction(null);
    setIsModalOpen(false);
    setSelectedRecord(null);
  };

  const handleOpenTemplateModal = (template: PANTemplate | null) => {
    setSelectedTemplate(template);
    setIsTemplateModalOpen(true);
  };

  const refreshTemplates = async () => {
    const { data } = await supabase.from('pan_templates').select('*').order('updated_at', { ascending: false });
    if (data) {
      setTemplates(
        data.map((t: any) => ({
          id: t.id,
          name: t.name,
          actionTaken: t.action_taken || {},
          notes: t.notes || '',
          logoUrl: t.logo_url || undefined,
          preparerName: t.preparer_name || undefined,
          preparerSignatureUrl: t.preparer_signature_url || undefined,
          createdByUserId: t.created_by_user_id || '',
          createdAt: t.created_at ? new Date(t.created_at) : new Date(),
          updatedAt: t.updated_at ? new Date(t.updated_at) : new Date(),
          isDefault: t.is_default || false,
        }))
      );
    }
  };

  const handleSaveTemplate = async (templateToSave: PANTemplate) => {
    const payload: any = {
      id: templateToSave.id?.startsWith('PANTPL-') ? undefined : templateToSave.id,
      name: templateToSave.name,
      action_taken: templateToSave.actionTaken || {},
      notes: templateToSave.notes || '',
      logo_url: templateToSave.logoUrl || null,
      preparer_name: templateToSave.preparerName || null,
      preparer_signature_url: templateToSave.preparerSignatureUrl || null,
      is_default: templateToSave.isDefault || false,
      created_by_user_id: templateToSave.createdByUserId || user?.id || null,
      updated_at: new Date().toISOString(),
    };
    await supabase.from('pan_templates').upsert(payload);
    setIsTemplateModalOpen(false);
    refreshTemplates();
  };

  const handleDeleteTemplate = async (templateId: string) => {
    await supabase.from('pan_templates').delete().eq('id', templateId);
    refreshTemplates();
  };

  const handleOpenModal = (record: PAN | null) => {
    setSelectedRecord(record);
    setIsModalOpen(true);
  };

  const getActionType = (action: PANActionTaken) => {
    if (!action) return 'N/A';
    const actions: string[] = [];
    if (action.changeOfStatus) actions.push('Status Change');
    if (action.promotion) actions.push('Promotion');
    if (action.transfer) actions.push('Transfer');
    if (action.salaryIncrease) actions.push('Salary Increase');
    if (action.changeOfJobTitle) actions.push('Job Title Change');
    if (action.others) actions.push(action.others);
    return actions.join(', ') || 'Update';
  };

  const yearOptions = useMemo(() => {
    const years = new Set(records.map(r => new Date(r.effectiveDate).getFullYear()));
    const currentYear = new Date().getFullYear();
    years.add(currentYear);
    return Array.from(years).sort((a, b) => b - a);
  }, [records]);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Personnel Action Notice (PAN)</h1>
        {canCreatePAN && (
          <div className="space-x-2">
            <Button onClick={() => handleOpenModal(null)}>Create New PAN</Button>
            {canViewTemplatesTab && (
              <Button variant="secondary" onClick={() => setIsTemplateModalOpen(true)}>Create PAN Template</Button>
            )}
          </div>
        )}
      </div>

      <EditableDescription descriptionKey="panPageDesc" />

      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          <button onClick={() => setActiveTab('records')} className={`px-3 py-2 border-b-2 ${activeTab === 'records' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500'}`}>PAN Requests</button>
          {canViewTemplatesTab && (
            <button onClick={() => setActiveTab('templates')} className={`px-3 py-2 border-b-2 ${activeTab === 'templates' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500'}`}>PAN Templates</button>
          )}
        </nav>
      </div>

      {activeTab === 'records' && (
        <>
          <Card>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4">
              <Input label="Search" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search PANs" />
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Year</label>
                <select value={yearFilter} onChange={e => setYearFilter(e.target.value)} className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                  <option value="all">All</option>
                  {yearOptions.map(y => <option key={y} value={y.toString()}>{y}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Month</label>
                <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                  <option value="all">All</option>
                  {monthOptions.map(m => <option key={m.value} value={m.value}>{m.name}</option>)}
                </select>
              </div>
            </div>
          </Card>

          <PANTable
            records={filteredRecords}
            onEdit={handleOpenModal}
            onPrint={setPanToPrint}
            onAcknowledge={handleAcknowledge}
            onApprove={canRespond ? handleApprovePAN : undefined}
            onReject={canRespond ? handleRejectPANRequest : undefined}
          />
        </>
      )}

      {activeTab === 'templates' && canViewTemplatesTab && (
        <PANTemplateTable
          templates={templates}
          onEdit={handleOpenTemplateModal}
          onDelete={handleDeleteTemplate}
        />
      )}

      {isModalOpen && (
        createPortal(
          <PANModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            pan={selectedRecord}
            templates={templates}
            employees={employees}
            onSaveDraft={handleSaveDraft}
            onSendForAcknowledgement={handleSendForAcknowledgement}
            onAcknowledge={handleAcknowledge}
            onDownloadPdf={() => {}}
            onApprove={handleApprovePAN}
            onReject={handleRejectPANRequest}
          />,
          document.body
        )
      )}

      {isTemplateModalOpen && (
        <PANTemplateModal
          isOpen={isTemplateModalOpen}
          onClose={() => setIsTemplateModalOpen(false)}
          template={selectedTemplate}
          onSave={handleSaveTemplate}
        />
      )}

      {panToPrint && (
        <PrintablePAN pan={panToPrint} onClose={() => setPanToPrint(null)} />
      )}

      {isRejectModalOpen && panForAction && (
        <RejectReasonModal
          isOpen={isRejectModalOpen}
          onClose={() => setIsRejectModalOpen(false)}
          onSubmit={handleConfirmRejectPAN}
          prompt="Please provide a reason for rejecting this PAN. This will be visible to the creator."
        />
      )}
    </div>
  );
};

export default PersonnelActionNotice;
