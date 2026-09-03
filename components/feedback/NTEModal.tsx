import { fetchBusinessUnits } from '../../services/userService';
import { fetchMemos } from '../../services/memoService';
import { logActivity } from '../../services/auditService';
import { formatNTEDisplayId } from '../../utils/formatCaseId';
import { fetchCodeOfDiscipline } from '../../services/disciplineService';
import { fetchFeedbackTemplates } from '../../services/feedbackService';
import React, { useState, useEffect, useMemo } from 'react';
import { renderToString } from 'react-dom/server';
import { IncidentReport, NTE, NTEStatus, User, FeedbackTemplate, Role, ApproverStep, ApproverStatus, BusinessUnit, Memo, CodeOfDiscipline } from '../../types';
import Modal from '../ui/Modal';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import SearchableMultiSelect, { SearchableItem } from '../ui/SearchableMultiSelect';
import Input from '../ui/Input';
import NTEPreview from './NTEPreview';
import { useAuth } from '../../hooks/useAuth';
import NTEApproverPicker from './NTEApproverPicker';
import { supabase } from '../../services/supabaseClient';
import { formatEmployeeName } from '../../services/formatEmployeeName';
import { EligibleNTEApprover, fetchEligibleNTEApprovers, NTEApproverSelection } from '../../services/nteService';
import { ResolvedIncidentEvidence, resolveIncidentEvidence } from '../../services/incidentReportService';

interface NTEModalProps {
  isOpen: boolean;
  onClose: () => void;
  incidentReport: IncidentReport;
  nte: NTE | undefined;
  recipientEmployeeId?: string;
  existingRecipientIds?: string[];
  onSave: (data: NTE | NTE[]) => void;
  onResubmitRevision?: (data: NTE) => void;
}

const NTEModal: React.FC<NTEModalProps> = ({ isOpen, onClose, incidentReport, nte, recipientEmployeeId, existingRecipientIds = [], onSave, onResubmitRevision }) => {
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
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedApprovers, setSelectedApprovers] = useState<NTEApproverSelection[]>([]);
  const [eligibleApprovers, setEligibleApprovers] = useState<EligibleNTEApprover[]>([]);
  const [approverLoading, setApproverLoading] = useState(false);
  const [approverError, setApproverError] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [manualNteNumber, setManualNteNumber] = useState('');
  const [incidentEvidence, setIncidentEvidence] = useState<ResolvedIncidentEvidence[]>([]);
  const [incidentEvidenceLoading, setIncidentEvidenceLoading] = useState(false);

  // Fetched data states
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [disciplineEntries, setDisciplineEntries] = useState<CodeOfDiscipline[]>([]);
  const [feedbackTemplates, setFeedbackTemplates] = useState<FeedbackTemplate[]>([]);

  // State for existing NTE
  const [currentNTE, setCurrentNTE] = useState<Partial<NTE>>(nte || {});

  const selectedTemplate = useMemo(() => {
    return feedbackTemplates.find(t => t.id === selectedTemplateId);
  }, [selectedTemplateId, feedbackTemplates]);

  // Load users from Supabase for recipients/approvers
  useEffect(() => {
    if (!isOpen) return;

    const fetchData = async () => {
      try {
        const [
          buData,
          memoData,
          disciplineData,
          templateData
        ] = await Promise.all([
          fetchBusinessUnits(),
          fetchMemos(),
          fetchCodeOfDiscipline(),
          fetchFeedbackTemplates()
        ]);
        
        setBusinessUnits(buData);
        setMemos(memoData);
        setDisciplineEntries(disciplineData.entries || []);
        setFeedbackTemplates(templateData);

        if (templateData.length > 0 && !selectedTemplateId) {
          setSelectedTemplateId(templateData[0].id);
        }
      } catch (err) {
        console.warn('Failed to load NTE reference data', err);
      }
    };

    fetchData();

    const fetchUsers = async () => {
      try {
        const { data, error } = await supabase
          .from('hris_users')
          .select('id, full_name, email, role, department, business_unit, business_unit_id, department_id, position, status')
          .order('full_name', { ascending: true });

        if (error) {
          console.warn('Failed to load users for NTE', error);
          return;
        }
        if (data) {
          const mapped = data.map((u: any) => ({
            id: u.id,
            name: formatEmployeeName(u.full_name || 'User'),
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
      } catch (err) {
        console.warn('NTE user fetch error', err);
      }
    };
    fetchUsers();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !isNewNTE) return;
    let cancelled = false;
    setIncidentEvidenceLoading(true);
    resolveIncidentEvidence(incidentReport)
      .then(items => { if (!cancelled) setIncidentEvidence(items); })
      .catch(() => { if (!cancelled) setIncidentEvidence([]); })
      .finally(() => { if (!cancelled) setIncidentEvidenceLoading(false); });
    return () => { cancelled = true; };
  }, [incidentReport, isNewNTE, isOpen]);

  useEffect(() => {
    if (isOpen) {
      const pool = allUsers;
      if (isNewNTE) {
        const involved = pool.filter(u => incidentReport.involvedEmployeeIds.includes(u.id));
        setRecipientList(involved);
        const available = involved.filter(u => !existingRecipientIds.includes(u.id));
        const initialRecipientId = recipientEmployeeId && available.some(u => u.id === recipientEmployeeId)
          ? recipientEmployeeId
          : available[0]?.id;
        setSelectedEmployeeIds(initialRecipientId ? [initialRecipientId] : []);

        const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
        setDeadline(threeDaysFromNow.toISOString().slice(0, 16));

        setAllegations(incidentReport.description);
        setMemoIds([]);
        setDisciplineCodeIds([]);
        setEvidenceUrl('');
        setSelectedTemplateId(feedbackTemplates[0]?.id || '');
        setSelectedApprovers([]);
        setManualNteNumber('');
      } else {
        setCurrentNTE(nte);
      }
    }
  }, [nte, incidentReport, isOpen, isNewNTE, allUsers, feedbackTemplates, recipientEmployeeId, existingRecipientIds.join('|')]);

  useEffect(() => {
    const selectedEmployeeId = selectedEmployeeIds[0];
    if (!isOpen || !isNewNTE || !selectedEmployeeId) {
      setEligibleApprovers([]);
      return;
    }
    let cancelled = false;
    setApproverLoading(true);
    setApproverError(null);
    setSelectedApprovers([]);
    fetchEligibleNTEApprovers(incidentReport.id, selectedEmployeeId)
      .then(rows => { if (!cancelled) setEligibleApprovers(rows); })
      .catch(error => { if (!cancelled) setApproverError(error?.message || 'Failed to load eligible NTE approvers.'); })
      .finally(() => { if (!cancelled) setApproverLoading(false); });
    return () => { cancelled = true; };
  }, [incidentReport.id, isNewNTE, isOpen, selectedEmployeeIds]);

  const memoItems: SearchableItem[] = useMemo(() => memos.map(memo => ({ id: memo.id, label: memo.title })), [memos]);
  const disciplineItems: SearchableItem[] = useMemo(() => disciplineEntries.map(entry => ({ id: entry.id, label: entry.description, subLabel: entry.category, tag: entry.code })), [disciplineEntries]);

  const citedMemos = useMemo(() => {
    return memoIds.filter(id => id.trim() !== '').map(id => {
      const found = memos.find(m => m.id === id);
      return found || { id, title: 'Manual Memo Reference', body: id } as unknown as Memo;
    });
  }, [memoIds, memos]);

  const citedDiscipline = useMemo(() => {
    return disciplineCodeIds.filter(id => id.trim() !== '').map(id => {
      const found = disciplineEntries.find(e => e.id === id);
      return found || { id, code: 'Manual', category: 'Manual Entry', description: id } as unknown as CodeOfDiscipline;
    });
  }, [disciplineCodeIds, disciplineEntries]);

  const previewBusinessUnitCode = useMemo(() => {
    const incidentBu = businessUnits.find(b => b.id === incidentReport.businessUnitId);
    const firstRecipient = recipientList.find(u => selectedEmployeeIds.includes(u.id));
    const employeeBu = businessUnits.find(b => b.name === firstRecipient?.businessUnit);
    return (incidentBu?.code || employeeBu?.code || 'GEN').toUpperCase();
  }, [businessUnits, incidentReport.businessUnitId, recipientList, selectedEmployeeIds]);

  const previewNteCode = useMemo(() => {
    if (manualNteNumber.trim()) return formatNTEDisplayId(manualNteNumber.trim()) || manualNteNumber.trim();
    return `NTE-${new Date().getFullYear()}-${previewBusinessUnitCode}-XXX`;
  }, [manualNteNumber, previewBusinessUnitCode]);

  const handleSelectEmployee = (employeeId: string) => {
    setSelectedEmployeeIds(employeeId ? [employeeId] : []);
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
    if (selectedApprovers.length === 0 || !selectedApprovers.some(item => item.roleId === Role.BOD)) {
      errors.push('Select at least one approver whose selected role is Board of Director.');
    }


    if (errors.length > 0) {
      alert(`Please address the following issues before submitting the NTE for approval:\n\n- ${errors.join('\n- ')}`);
      return;
    }

    const approverSteps: ApproverStep[] = selectedApprovers.map(item => ({
      userId: item.approver.id,
      userName: item.approver.name,
      roleId: item.roleId,
      role: item.approver.eligibleRoleLabels[item.approver.eligibleRoleIds.indexOf(item.roleId)] || item.roleId,
      roleSnapshot: item.approver.eligibleRoleLabels[item.approver.eligibleRoleIds.indexOf(item.roleId)] || item.roleId,
      isBod: item.roleId === Role.BOD,
      required: true,
      status: ApproverStatus.Pending,
    }));

    // Determine Business Unit Code for NTE Number
    // Priority: IncidentReport BU -> Employee BU -> GEN
    const irBu = businessUnits.find(b => b.id === incidentReport.businessUnitId);

    const newNTEs: Partial<NTE>[] = selectedEmployeeIds.map((employeeId, index) => {
      const employee = recipientList.find(u => u.id === employeeId)!;
      const employeeBu = businessUnits.find(b => b.name === employee.businessUnit);
      const buCode = (irBu?.code || employeeBu?.code || 'GEN').toUpperCase();
      const nteDisplayNum = manualNteNumber.trim()
        ? formatNTEDisplayId(manualNteNumber.trim()) || manualNteNumber.trim()
        : `NTE-${new Date().getFullYear()}-${buCode}-XXX`;
      
      let generatedBody = "Template missing";
      if (selectedTemplate) {
        generatedBody = renderToString(
          <NTEPreview
            template={selectedTemplate}
            employeeName={employee.name}
            employeePosition={employee.position}
            employeeDepartment={employee.department}
            nteNumber={nteDisplayNum}
            allegations={allegations}
            deadline={new Date(deadline || Date.now())}
            citedMemos={citedMemos}
            citedDiscipline={citedDiscipline}
            evidenceUrl={evidenceUrl}
            ccRecipients={selectedApprovers.map(item => `${item.approver.name} (${item.approver.eligibleRoleLabels[item.approver.eligibleRoleIds.indexOf(item.roleId)] || item.roleId})`)}
            incidentDate={incidentReport.dateTime}
            incidentLocation={incidentReport.location}
            incidentCategory={incidentReport.category}
          />
        );
      }

      return {
        incidentReportId: incidentReport.id,
        employeeId: employee.id,
        employeeName: employee.name,
        status: NTEStatus.PendingApproval,
        issuedDate: new Date(),
        deadline: new Date(deadline),
        details: allegations,
        body: generatedBody,
        employeeResponse: '',
        memoIds,
        disciplineCodeIds,
        evidenceUrl,
        issuedByUserId: user.id,
        approverSteps,
        templateId: selectedTemplateId || undefined,
        nteNumber: manualNteNumber || undefined,
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
            <Button
              onClick={handleIssueNTE}
              disabled={selectedEmployeeIds.length === 0 || approverLoading || !selectedApprovers.some(item => item.roleId === Role.BOD)}
            >{buttonText}</Button>
          </div>
        }
      >
        <div className="space-y-8">
          <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
            <h3 className="font-semibold text-slate-900 dark:text-white">Original Incident Report</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">These details remain linked to the original IR and are not replaced by the NTE creation date.</p>
            <dl className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div><dt className="font-medium text-slate-500">Date &amp; time of incident</dt><dd className="mt-1 font-semibold text-slate-900 dark:text-white">{new Date(incidentReport.dateTime).toLocaleString('en-PH')}</dd></div>
              <div><dt className="font-medium text-slate-500">Location</dt><dd className="mt-1 font-semibold text-slate-900 dark:text-white">{incidentReport.location || '—'}</dd></div>
              <div><dt className="font-medium text-slate-500">Category</dt><dd className="mt-1 font-semibold text-slate-900 dark:text-white">{incidentReport.category || '—'}</dd></div>
              <div className="sm:col-span-2 lg:col-span-3"><dt className="font-medium text-slate-500">Involved employee(s)</dt><dd className="mt-1 font-semibold text-slate-900 dark:text-white">{incidentReport.involvedEmployeeNames.join(', ') || '—'}</dd></div>
              <div className="sm:col-span-2 lg:col-span-3"><dt className="font-medium text-slate-500">Description</dt><dd className="mt-1 whitespace-pre-wrap rounded-md border border-slate-200 bg-white p-3 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">{incidentReport.description || '—'}</dd></div>
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="font-medium text-slate-500">Supporting evidence</dt>
                {incidentEvidenceLoading ? (
                  <dd className="mt-1 text-slate-500">Loading evidence…</dd>
                ) : incidentEvidence.length > 0 ? (
                  <dd className="mt-2 space-y-2">
                    {incidentEvidence.map(item => (
                      <div key={item.path} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                        <span className="min-w-0 break-all text-slate-800 dark:text-slate-200">{item.name}</span>
                        {item.url ? (
                          <span className="flex gap-2">
                            <a href={item.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">Preview</a>
                            <a href={item.url} target="_blank" rel="noopener noreferrer" download className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">Download</a>
                          </span>
                        ) : (
                          <span className="text-xs text-amber-700 dark:text-amber-300">Unavailable with your current access</span>
                        )}
                      </div>
                    ))}
                  </dd>
                ) : (
                  <dd className="mt-1 text-slate-500">No supporting evidence attached.</dd>
                )}
              </div>
            </dl>
          </section>

          {/* Form Fields */}
          <div className="space-y-4">
            <div className="p-3 border rounded-md dark:border-gray-600">
              <h4 className="font-semibold text-gray-800 dark:text-gray-200">Issue To:</h4>
              <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">Each notice belongs to exactly one involved employee and proceeds independently.</p>
              <select
                aria-label="NTE recipient employee"
                value={selectedEmployeeIds[0] || ''}
                onChange={event => handleSelectEmployee(event.target.value)}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-slate-700 dark:text-white"
              >
                <option value="">Select an involved employee</option>
                {recipientList.map(employee => {
                  const alreadyHasNte = existingRecipientIds.includes(employee.id);
                  return <option key={employee.id} value={employee.id} disabled={alreadyHasNte}>{employee.name}{alreadyHasNte ? ' — NTE already created' : ''}</option>;
                })}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium">Template</label>
              <select value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                {feedbackTemplates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
            <Input 
              label="NTE Serial Number (Optional)" 
              id="nteNumber" 
              type="text"
              placeholder="e.g. 123 or ABC-123 (Leave blank for auto-generate)" 
              value={manualNteNumber} 
              onChange={e => setManualNteNumber(e.target.value)} 
            />
            <Input label="Response Deadline" id="deadline" type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} />
            <Textarea label="NTE Details / Allegations" value={allegations} onChange={e => setAllegations(e.target.value)} rows={5} />
            <Input
              label="Additional Evidence/Support Link"
              id="evidenceUrl"
              placeholder="https://example.com/document.pdf"
              value={evidenceUrl}
              onChange={e => setEvidenceUrl(e.target.value)}
            />
            {memos.length > 0 ? (
              <SearchableMultiSelect
                label="Cite Memos (Optional)"
                placeholder="Search for policy titles..."
                items={memoItems}
                selectedItemIds={memoIds}
                onSelectionChange={setMemoIds}
                variant="primary"
              />
            ) : (
              <Textarea
                label="Cite Memos (Optional)"
                placeholder="Leave blank when no memo applies."
                value={memoIds.join('\n')}
                onChange={e => setMemoIds(e.target.value.trim() ? [e.target.value] : [])}
                rows={3}
              />
            )}
            {disciplineEntries.length > 0 ? (
              <SearchableMultiSelect
                label="Cite Code of Discipline"
                placeholder="Search by code or description..."
                items={disciplineItems}
                selectedItemIds={disciplineCodeIds}
                onSelectionChange={setDisciplineCodeIds}
                variant="danger"
              />
            ) : (
              <Textarea
                label="Cite Code of Discipline"
                placeholder="Enter code of discipline manually..."
                value={disciplineCodeIds.join('\n')}
                onChange={e => setDisciplineCodeIds([e.target.value])}
                rows={3}
              />
            )}
          </div>

          {/* Preview */}
          <div className="bg-gray-200 dark:bg-slate-900 p-4 rounded-lg">
            <h3 className="font-semibold text-center mb-2">Live Preview</h3>
            {selectedTemplate && previewEmployee && (
              <NTEPreview
                template={selectedTemplate}
                employeeName={previewEmployee.name}
                employeePosition={previewEmployee.position}
                employeeDepartment={previewEmployee.department}
                nteNumber={previewNteCode}
                allegations={allegations}
                deadline={new Date(deadline || Date.now())}
                citedMemos={citedMemos}
                citedDiscipline={citedDiscipline}
                evidenceUrl={evidenceUrl}
                ccRecipients={selectedApprovers.map(item => `${item.approver.name} (${item.approver.eligibleRoleLabels[item.approver.eligibleRoleIds.indexOf(item.roleId)] || item.roleId})`)}
                incidentDate={incidentReport.dateTime}
                incidentLocation={incidentReport.location}
                incidentCategory={incidentReport.category}
              />
            )}
            {!previewEmployee && (
              <div className="flex items-center justify-center h-full text-gray-500">
                <p>Select an employee to see a preview.</p>
              </div>
            )}
          </div>

          <div className="p-3 border rounded-md dark:border-gray-600">
            <h4 className="font-semibold text-gray-800 dark:text-gray-200">Approvals:</h4>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Select who must approve this NTE (at least one BOD required).</p>
            <NTEApproverPicker
              approvers={eligibleApprovers}
              selected={selectedApprovers}
              onChange={setSelectedApprovers}
              loading={approverLoading}
              error={approverError}
            />
          </div>
        </div>
      </Modal>
    );
  }

  const isEmployeeResponding = user?.id === nte.employeeId && nte.status === NTEStatus.Issued;
  const isManagerOrHR = user?.id !== nte.employeeId;
  const isPendingApproval = nte.status === NTEStatus.PendingApproval;
  const isRevisionDraft = nte.status === NTEStatus.Draft && !!nte.revisionRequestedAt;

  const handleResubmitRevision = () => {
    if (!currentNTE.details?.trim()) {
      alert('Please complete the revised allegations/details before resubmitting.');
      return;
    }
    onResubmitRevision?.(currentNTE as NTE);
  };

  // Existing NTE View
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`NTE: ${formatNTEDisplayId(nte.nteNumber) || nte.id}`}
      size="2xl"
      footer={
        <div className="flex justify-end w-full space-x-2">
          <Button variant="secondary" onClick={onClose}>{isPendingApproval ? 'Close' : 'Cancel'}</Button>
          {isRevisionDraft ? (
            <Button onClick={handleResubmitRevision}>Resubmit for Approval</Button>
          ) : !isPendingApproval && (
            <Button onClick={handleUpdateNTE} disabled={!isEmployeeResponding && !isManagerOrHR}>
              {isEmployeeResponding ? "Submit Response" : "Save Changes"}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {isPendingApproval && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 text-yellow-800 dark:text-yellow-300">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span className="text-sm font-medium">This NTE is awaiting all required approvals and cannot be edited.</span>
          </div>
        )}
        {isRevisionDraft && (
          <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Returned for revision by an assigned approver</p>
            <p className="mt-1 text-sm text-amber-800 dark:text-amber-300 whitespace-pre-wrap">{nte.revisionNote}</p>
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">Revise the NTE below, then resubmit it to the existing approval route.</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div><strong>Employee:</strong> {nte.employeeName}</div>
          <div><strong>Status:</strong> {nte.status}</div>
          <div><strong>Issued:</strong> {new Date(nte.issuedDate).toLocaleDateString()}</div>
          <div><strong>Deadline:</strong> {new Date(nte.deadline).toLocaleDateString()}</div>
        </div>

        <Textarea
          label="Allegations/Details"
          value={currentNTE.details || ''}
          onChange={e => setCurrentNTE(prev => ({ ...prev, details: e.target.value }))}
          rows={4}
          disabled={isPendingApproval || !isManagerOrHR || nte.status === NTEStatus.Closed}
        />

        {isRevisionDraft && (
          <Textarea
            label="Notice to Explain Document"
            value={currentNTE.body || ''}
            onChange={e => setCurrentNTE(prev => ({ ...prev, body: e.target.value }))}
            rows={10}
          />
        )}

        {isEmployeeResponding && (
          <Textarea
            label="Your Response"
            value={currentNTE.employeeResponse || ''}
            onChange={e => setCurrentNTE(prev => ({ ...prev, employeeResponse: e.target.value }))}
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
