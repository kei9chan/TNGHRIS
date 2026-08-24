// Phase E: mockDataCompat removed from PersonnelActionNotice
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { formatEmployeeName } from '../../services/formatEmployeeName';
import { mergePanParticulars } from '../../services/panUtils';
import { logActivity } from '../../services/auditService';
import { getPANActionType, normalizeTemplateFields, normalizeTemplateSections } from '../../services/panTemplateUtils';
import {
  PAN,
  PANStatus,
  User,
  Role,
  PANTemplate,
  PANActionTaken,
} from '../../types';

type BusinessUnitOption = { id: string; name: string };

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
  const [searchParams] = useSearchParams();
  const { getPanAccess } = usePermissions();

  const [records, setRecords] = useState<PAN[]>([]);
  const [templates, setTemplates] = useState<PANTemplate[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [approvers, setApprovers] = useState<User[]>([]);
  const [directoryError, setDirectoryError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<PAN | null>(null);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<PANTemplate | null>(null);
  const [activeTab, setActiveTab] = useState('records');
  const [panToPrint, setPanToPrint] = useState<PAN | null>(null);
  const [panForAction, setPanForAction] = useState<PAN | null>(null);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [panForApproval, setPanForApproval] = useState<PAN | null>(null);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [panForCancellation, setPanForCancellation] = useState<PAN | null>(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnitOption[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [openedQueryItem, setOpenedQueryItem] = useState<string | null>(null);

  const panAccess = getPanAccess();
  const canCreatePAN = panAccess.canCreate;
  const canManageTemplates = panAccess.canManageTemplates;
  const canViewTemplatesTab = panAccess.canManageTemplates;
  const canRespond = panAccess.canRespond;

  const mapPanRow = (p: any): PAN => {
    const baseParticulars = mergePanParticulars(p.particulars, p.salary_from);
    return {
      id: p.id,
      employeeId: p.employee_id,
      employeeName: p.employee_name,
      effectiveDate: p.effective_date ? new Date(p.effective_date) : new Date(),
      status: p.status as PANStatus,
      actionTaken: p.action_taken || { ...emptyActions },
      particulars: baseParticulars,
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
      createdByUserId: p.created_by_user_id || undefined,
      workflowVersion: p.workflow_version ?? 1,
      approvalCompletedAt: p.approval_completed_at ? new Date(p.approval_completed_at) : undefined,
      rejectionReason: p.rejection_reason || undefined,
      cancelledAt: p.cancelled_at ? new Date(p.cancelled_at) : undefined,
      cancelledBy: p.cancelled_by || undefined,
      cancellationReason: p.cancellation_reason || undefined,
      acceptedAt: p.accepted_at ? new Date(p.accepted_at) : undefined,
      acceptedBy: p.accepted_by || undefined,
      appliedAt: p.applied_at ? new Date(p.applied_at) : undefined,
      templateId: p.template_id || undefined,
      businessUnitId: p.business_unit_id || undefined,
      templateVersion: p.template_version ?? undefined,
      templateName: p.template_name || undefined,
      templateSnapshot: p.template_snapshot || undefined,
      actionType: p.action_type || getPANActionType(p.action_taken),
    };
  };

  const mapDirectoryUser = (u: any): User => ({
    id: u.id,
    employeeId: u.employee_id || undefined,
    name: formatEmployeeName(u.full_name || u.email || 'Unknown'),
    email: u.email,
    role: u.role as Role,
    status: String(u.status || 'Active').toLowerCase() === 'active' ? 'Active' : 'Inactive',
    department: u.department || '',
    departmentId: u.department_id || undefined,
    businessUnit: u.business_unit || '',
    businessUnitId: u.business_unit_id || undefined,
    employmentStatus: u.employment_status || undefined,
    position: u.position || '',
    roles: Array.isArray(u.roles) && u.roles.length ? u.roles as Role[] : [u.role as Role],
    salary: {
      basic: u.salary_basic ?? 0,
      deminimis: u.salary_deminimis ?? 0,
      reimbursable: u.salary_reimbursable ?? 0,
    },
    dateHired: u.date_hired ? new Date(u.date_hired) : undefined,
  });

  useEffect(() => {
    const loadAll = async () => {
      try {
        const [directoryResult, templateResult, panResult, unitResult] = await Promise.all([
          supabase.rpc('get_pan_directory'),
          supabase.from('pan_templates').select('*').order('updated_at', { ascending: false }),
          supabase.from('pans').select('*').order('updated_at', { ascending: false }),
          supabase.from('business_units').select('id,name').order('name'),
        ]);

        const { data: tplRows, error: templateError } = templateResult;
        const { data: panRows, error: panError } = panResult;
        const { data: unitRows, error: unitError } = unitResult;

        if (directoryResult.error) {
          console.error('Failed to load PAN employee directory', directoryResult.error);
          setEmployees([]);
          setApprovers([]);
          setDirectoryError(directoryResult.error.message || 'The PAN employee directory could not be loaded.');
        } else {
          const directory = (directoryResult.data || {}) as { employees?: any[]; approvers?: any[] };
          setEmployees((directory.employees || []).map(mapDirectoryUser));
          setApprovers((directory.approvers || []).map(mapDirectoryUser));
          setDirectoryError('');
        }

        if (unitError) console.error('Failed to load PAN business units', unitError);
        setBusinessUnits((unitRows || []).map((unit: any) => ({ id: unit.id, name: unit.name })));

        if (templateError) console.error('Failed to load PAN templates', templateError);
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
              businessUnitId: t.business_unit_id || undefined,
              businessUnitName: (unitRows || []).find((unit: any) => unit.id === t.business_unit_id)?.name,
              actionType: t.action_type || 'general',
              status: t.status || 'published',
              version: t.version || 1,
              documentTitle: t.document_title || 'PERSONNEL ACTION NOTICE',
              documentCode: t.document_code || 'TNG-HRD-022',
              footerText: t.footer_text || '',
              colorAccent: t.color_accent || '#172554',
              paperSize: t.paper_size === 'Letter' ? 'Letter' : 'A4',
              orientation: t.orientation === 'landscape' ? 'landscape' : 'portrait',
              sections: normalizeTemplateSections(t.sections),
              fieldConfig: normalizeTemplateFields(t.field_config),
              publishedAt: t.published_at ? new Date(t.published_at) : undefined,
              publishedByUserId: t.published_by || undefined,
              updatedByUserId: t.updated_by || undefined,
            }))
          );
        }

        if (panError) console.error('Failed to load PAN records', panError);
        if (panRows) {
          setRecords(panRows.map(mapPanRow));
        }
      } catch (err) {
        console.error('Failed to load PAN data', err);
      }
    };
    loadAll();
  }, []);

  useEffect(() => {
    const requestedPanId = searchParams.get('item');
    if (!requestedPanId || requestedPanId === openedQueryItem || !records.length) return;
    const requestedPan = records.find(record => record.id === requestedPanId);
    if (!requestedPan) return;
    setSelectedRecord(requestedPan);
    setIsModalOpen(true);
    setOpenedQueryItem(requestedPanId);
  }, [searchParams, records, openedQueryItem]);

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
      business_unit_id: recordToSave.businessUnitId || recordToSave.particulars?.from?.businessUnitId || null,
      template_version: recordToSave.templateVersion || null,
      template_name: recordToSave.templateName || null,
      template_snapshot: recordToSave.templateSnapshot || null,
      action_type: recordToSave.actionType || getPANActionType(recordToSave.actionTaken),
      salary_from: recordToSave.particulars?.from?.salary || null,
      updated_at: new Date().toISOString(),
    };
    if (recordToSave.id) {
      payload.id = recordToSave.id;
    } else {
      payload.created_by_user_id = user.id;
    }
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
    if (getPANActionType(panToSend.actionTaken) === 'general') {
      alert('Select at least one personnel action before sending for approval.');
      return;
    }
    const draft = await upsertPan(panToSend, PANStatus.Draft);
    if (!draft) return;
    const { data, error } = await supabase.rpc('submit_pan', { p_pan_id: draft.id });
    if (error || !data) {
      alert(error?.message || 'Failed to submit PAN for approval.');
      return;
    }
    setRecords(prev => [mapPanRow(data), ...prev.filter(p => p.id !== data.id)]);
    setIsModalOpen(false);
  };

  const handleAcknowledge = async (panId: string, signatureDataUrl: string, signatureName: string) => {
    const { data, error } = await supabase.rpc('accept_pan', {
      p_pan_id: panId,
      p_signature_data_url: signatureDataUrl,
      p_signature_name: signatureName,
    });
    if (error || !data) {
      alert(error?.message || 'Failed to acknowledge and accept this PAN.');
      return;
    }
    setRecords(prev => prev.map(r => (r.id === panId ? mapPanRow(data) : r)));
    setIsModalOpen(false);
    setSelectedRecord(null);
  };

  const handleApprovePANRequest = (pan: PAN) => {
    setPanForApproval(pan);
    setIsApproveModalOpen(true);
  };

  const handleConfirmApprovePAN = async (comment: string) => {
    if (!panForApproval) return;
    const { data, error } = await supabase.rpc('approve_pan', { p_pan_id: panForApproval.id, p_comment: comment });
    if (error || !data) {
      alert(error?.message || 'Failed to approve this PAN.');
      return;
    }
    setRecords(prev => prev.map(r => (r.id === panForApproval.id ? mapPanRow(data) : r)));
    setIsApproveModalOpen(false);
    setPanForApproval(null);
    setSelectedRecord(null);
  };

  const handleRejectPANRequest = (pan: PAN) => {
    setPanForAction(pan);
    setIsRejectModalOpen(true);
  };

  const handleConfirmRejectPAN = async (reason: string) => {
    if (!panForAction || !user) return;
    const { data, error } = await supabase.rpc('reject_pan', { p_pan_id: panForAction.id, p_reason: reason });
    if (error || !data) {
      alert(error?.message || 'Failed to reject this PAN.');
      return;
    }
    setRecords(prev => prev.map(r => (r.id === panForAction.id ? mapPanRow(data) : r)));
    setIsRejectModalOpen(false);
    setPanForAction(null);
    setIsModalOpen(false);
    setSelectedRecord(null);
  };

  const handleCancelPANRequest = (pan: PAN) => {
    setPanForCancellation(pan);
    setIsCancelModalOpen(true);
  };

  const handleConfirmCancelPAN = async (reason: string) => {
    if (!panForCancellation) return;
    const { data, error } = await supabase.rpc('cancel_pan', { p_pan_id: panForCancellation.id, p_reason: reason });
    if (error || !data) {
      alert(error?.message || 'Failed to cancel this PAN.');
      return;
    }
    setRecords(prev => prev.map(record => record.id === panForCancellation.id ? mapPanRow(data) : record));
    setIsCancelModalOpen(false);
    setPanForCancellation(null);
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
          businessUnitId: t.business_unit_id || undefined,
          businessUnitName: businessUnits.find(unit => unit.id === t.business_unit_id)?.name,
          actionType: t.action_type || 'general',
          status: t.status || 'published',
          version: t.version || 1,
          documentTitle: t.document_title || 'PERSONNEL ACTION NOTICE',
          documentCode: t.document_code || 'TNG-HRD-022',
          footerText: t.footer_text || '',
          colorAccent: t.color_accent || '#172554',
          paperSize: t.paper_size === 'Letter' ? 'Letter' : 'A4',
          orientation: t.orientation === 'landscape' ? 'landscape' : 'portrait',
          sections: normalizeTemplateSections(t.sections),
          fieldConfig: normalizeTemplateFields(t.field_config),
          publishedAt: t.published_at ? new Date(t.published_at) : undefined,
          publishedByUserId: t.published_by || undefined,
          updatedByUserId: t.updated_by || undefined,
        }))
      );
    }
  };

  const handleSaveTemplate = async (templateToSave: PANTemplate) => {
    const payload: any = {
      id: templateToSave.id?.startsWith('PANTPL-') ? null : templateToSave.id,
      name: templateToSave.name,
      actionTaken: templateToSave.actionTaken || {},
      notes: templateToSave.notes || '',
      logoUrl: templateToSave.logoUrl || null,
      preparerName: templateToSave.preparerName || null,
      preparerSignatureUrl: templateToSave.preparerSignatureUrl || null,
      businessUnitId: templateToSave.businessUnitId || null,
      actionType: templateToSave.actionType,
      status: templateToSave.status,
      isDefault: templateToSave.isDefault || false,
      documentTitle: templateToSave.documentTitle,
      documentCode: templateToSave.documentCode,
      footerText: templateToSave.footerText,
      colorAccent: templateToSave.colorAccent,
      paperSize: templateToSave.paperSize,
      orientation: templateToSave.orientation,
      sections: templateToSave.sections,
      fieldConfig: templateToSave.fieldConfig,
    };
    const { error } = await supabase.rpc('save_pan_template', { p_template: payload });
    if (error) throw new Error(error.message || 'Failed to save PAN template.');
    setIsTemplateModalOpen(false);
    setSelectedTemplate(null);
    await refreshTemplates();
  };

  const handleDuplicateTemplate = (template: PANTemplate) => {
    setSelectedTemplate({ ...template, id: `PANTPL-${Date.now()}`, name: `${template.name} — Copy`, status: 'draft', version: 1, isDefault: false, publishedAt: undefined, publishedByUserId: undefined });
    setIsTemplateModalOpen(true);
  };

  const handleArchiveTemplate = async (template: PANTemplate) => {
    if (!window.confirm(`Archive “${template.name}”? Existing PANs will keep their saved template version.`)) return;
    const { error } = await supabase.rpc('archive_pan_template', { p_template_id: template.id });
    if (error) return alert(error.message || 'Failed to archive the template.');
    await refreshTemplates();
  };

  const handleSetDefaultTemplate = async (template: PANTemplate) => {
    const { error } = await supabase.rpc('set_default_pan_template', { p_template_id: template.id });
    if (error) return alert(error.message || 'Failed to set the default template.');
    await refreshTemplates();
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
    const years = new Set<number>(records.map(r => new Date(r.effectiveDate).getFullYear()));
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
    if (!user) return [];
    return records.filter(record => {
      const recordDate = new Date(record.effectiveDate);
      const yearMatch = yearFilter === 'all' || recordDate.getFullYear().toString() === yearFilter;
      const monthMatch = monthFilter === 'all' || (recordDate.getMonth() + 1).toString() === monthFilter;
      const routingMatch = record.routingSteps?.some(step => step.userId === user.id);
      const employeeMatch = record.employeeId === user.id;

      const searchTermMatch = !searchTerm ||
        record.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        getActionType(record.actionTaken).toLowerCase().includes(searchTerm.toLowerCase()) ||
        record.status.toLowerCase().includes(searchTerm.toLowerCase());

      if (!canRespond && !routingMatch && record.status !== PANStatus.Completed && record.status !== PANStatus.PendingEmployee) {
        return false;
      }

      if (panAccess.scope === 'global') {
        return yearMatch && monthMatch && searchTermMatch;
      }

      return yearMatch && monthMatch && searchTermMatch && (routingMatch || employeeMatch);
    });
  }, [records, searchTerm, yearFilter, monthFilter, user, panAccess.scope, canRespond]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Personnel Action Notice (PAN)</h1>
        {canCreatePAN && (
          <div className="space-x-2">
            <Button onClick={() => handleOpenModal(null)}>Create New PAN</Button>
            {canViewTemplatesTab && (
              <Button variant="secondary" onClick={() => handleOpenTemplateModal(null)}>Create PAN Template</Button>
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
          />
        </>
      )}

      {activeTab === 'templates' && canViewTemplatesTab && (
        <PANTemplateTable
          templates={templates}
          businessUnits={businessUnits}
          canManage={canManageTemplates}
          onEdit={handleOpenTemplateModal}
          onDuplicate={handleDuplicateTemplate}
          onArchive={handleArchiveTemplate}
          onSetDefault={handleSetDefaultTemplate}
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
            approvers={approvers}
            directoryError={directoryError}
            businessUnits={businessUnits}
            onSaveDraft={handleSaveDraft}
            onSendForAcknowledgement={handleSendForAcknowledgement}
            onAcknowledge={handleAcknowledge}
            onDownloadPdf={setPanToPrint}
            onApprove={handleApprovePANRequest}
            onReject={handleRejectPANRequest}
            onCancel={handleCancelPANRequest}
          />,
          document.body
        )
      )}

      {isTemplateModalOpen && (
        <PANTemplateModal
          isOpen={isTemplateModalOpen}
          onClose={() => setIsTemplateModalOpen(false)}
          template={selectedTemplate}
          businessUnits={businessUnits}
          onSave={handleSaveTemplate}
        />
      )}

      {panToPrint && (
        <PrintablePAN pan={panToPrint} template={templates.find(template => template.id === panToPrint.templateId)} onClose={() => setPanToPrint(null)} />
      )}

      {isRejectModalOpen && panForAction && (
        <RejectReasonModal
          isOpen={isRejectModalOpen}
          onClose={() => setIsRejectModalOpen(false)}
          onSubmit={handleConfirmRejectPAN}
          prompt="Please provide a reason for rejecting this PAN. This will be visible to the creator."
        />
      )}

      {isApproveModalOpen && panForApproval && (
        <RejectReasonModal
          isOpen={isApproveModalOpen}
          onClose={() => { setIsApproveModalOpen(false); setPanForApproval(null); }}
          onSubmit={handleConfirmApprovePAN}
          title="Approve PAN"
          prompt="Provide an approval comment or reason. It will be recorded in the PAN timeline and audit history."
          submitText="Confirm Approval"
          submitVariant="primary"
        />
      )}

      {isCancelModalOpen && panForCancellation && (
        <RejectReasonModal
          isOpen={isCancelModalOpen}
          onClose={() => { setIsCancelModalOpen(false); setPanForCancellation(null); }}
          onSubmit={handleConfirmCancelPAN}
          prompt="Are you sure you want to cancel this PAN request? Please provide the cancellation reason."
        />
      )}
    </div>
  );
};

export default PersonnelActionNotice;
