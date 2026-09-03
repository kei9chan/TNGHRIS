import { fetchBusinessUnits } from '../../services/userService';
import { fetchCodeOfDiscipline } from '../../services/disciplineService';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { IncidentReport, IRStatus, NTE, NTEStatus, User, BusinessUnit, CodeOfDiscipline, Permission } from '../../types';
import { formatIRDisplayId, formatNTEDisplayId } from '../../utils/formatCaseId';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import EmployeeMultiSelect from './EmployeeMultiSelect';
import SignaturePad, { SignaturePadRef } from '../ui/SignaturePad';
import { supabase } from '../../services/supabaseClient';
import FileUploader from '../ui/FileUploader';
import { fetchAssignableIncidentCaseHandlers, fetchIncidentReportUserDirectory } from '../../services/incidentReportService';

interface IncidentReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: IncidentReport | null;
  onSave: (report: Partial<IncidentReport>) => Promise<IncidentReport | void> | void;
  onSendMessage?: (reportId: string, text: string) => void;
  onGenerateNTE?: (report: Partial<IncidentReport>) => Promise<void> | void;
  relatedNtes?: NTE[];
  onCreateNTEForEmployee?: (employeeId: string) => Promise<void> | void;
  onOpenNTE?: (nte: NTE) => void;
  onMarkNoAction?: (reportId: string) => void;
  onConvertToCoaching?: (report: IncidentReport) => void;
  onDownloadPdf?: (report: IncidentReport) => void;
  onReturnForRevision?: (reportId: string, reason: string) => Promise<IncidentReport | void>;
  onRejectReport?: (reportId: string, reason: string) => Promise<IncidentReport | void>;
  onResubmit?: (reportId: string) => Promise<IncidentReport | void>;
  isEmployeeView?: boolean;
}

const getStatusTag = (status: IRStatus, pipelineStage?: string) => {
  if (pipelineStage?.startsWith('nte-') || pipelineStage === 'employee-processing-complete') {
    return { text: 'NTE Processing', color: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200' };
  }
  if (status === IRStatus.HRReview) {
    return { text: 'HR Review', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200' };
  }
  if (status === IRStatus.Submitted) {
    return { text: 'New', color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' };
  }
  if (status === IRStatus.ReturnedForRevision) {
    return { text: 'Returned for Revision', color: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200' };
  }
  if (status === IRStatus.Rejected) {
    return { text: 'Rejected', color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200' };
  }
  if (pipelineStage === 'converted-coaching') {
    return { text: 'For Coaching', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200' };
  }
  return { text: status, color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' };
};

const DetailItem: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</dt>
    <dd className="mt-1 text-sm text-gray-900 dark:text-white">{children}</dd>
  </div>
);


const IncidentReportModal: React.FC<IncidentReportModalProps> = ({ isOpen, onClose, report, onSave, onGenerateNTE, relatedNtes = [], onCreateNTEForEmployee, onOpenNTE, onMarkNoAction, onConvertToCoaching, onDownloadPdf, onReturnForRevision, onRejectReport, onResubmit, isEmployeeView = false }) => {
  const { user } = useAuth();
  const { can } = usePermissions();
  const [currentReport, setCurrentReport] = useState<Partial<IncidentReport>>({});
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [potentialHandlers, setPotentialHandlers] = useState<User[]>([]);
  const [handlerDirectoryLoading, setHandlerDirectoryLoading] = useState(false);
  const [handlerDirectoryError, setHandlerDirectoryError] = useState('');
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState('');
  const [involvedEmployees, setInvolvedEmployees] = useState<User[]>([]);
  const [witnesses, setWitnesses] = useState<User[]>([]);
  const signaturePadRef = useRef<SignaturePadRef>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const [assignmentState, setAssignmentState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [assignmentMessage, setAssignmentMessage] = useState('');
  const [isEditingRevision, setIsEditingRevision] = useState(false);
  const signaturePathRef = useRef<string | null>(null);
  const signatureCacheRef = useRef<Map<string, string>>(new Map());

  // Fetched data
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [disciplineEntries, setDisciplineEntries] = useState<CodeOfDiscipline[]>([]);

  const loadSignatureCache = () => {
    if (signatureCacheRef.current.size > 0) return;
    try {
      const raw = localStorage.getItem('ir_signature_cache');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          Object.entries(parsed).forEach(([k, v]) => {
            if (typeof v === 'string') signatureCacheRef.current.set(k, v);
          });
        }
      }
    } catch {
      // ignore cache load errors
    }
  };

  const persistSignatureCache = () => {
    try {
      const obj: Record<string, string> = {};
      signatureCacheRef.current.forEach((v, k) => {
        obj[k] = v;
      });
      localStorage.setItem('ir_signature_cache', JSON.stringify(obj));
    } catch {
      // ignore cache save errors
    }
  };

  const resolveStorageUrl = async (path?: string | null) => {
    if (!path) return null;
    // If already an absolute URL or data URL, just use it
    if (/^(https?:)?data:/i.test(path)) return path;
    if (/^https?:\/\//i.test(path)) return path;
    loadSignatureCache();
    const cached = signatureCacheRef.current.get(path);
    if (cached) return cached;
    const { data, error } = await supabase.storage.from('incident_reports_attachments').createSignedUrl(path, 60 * 60);
    if (!error && data?.signedUrl) return data.signedUrl;
    const { data: pub } = supabase.storage.from('incident_reports_attachments').getPublicUrl(path);
    return pub?.publicUrl || null;
  };

  const categories = useMemo(() => {
    return [...new Set(disciplineEntries.map(e => e.category))].sort();
  }, [disciplineEntries]);

  const availableEmployees = useMemo(() => {
    return allUsers.filter(u => !u.status || u.status.toLowerCase() === 'active');
  }, [allUsers]);

  const canAssign = can('IncidentReports', Permission.Assign) || can('IncidentReports', Permission.Manage);

  // Load users from Supabase for selectors
  useEffect(() => {
    if (!isOpen) return;

    const fetchData = async () => {
      try {
        const [buData, disciplineData] = await Promise.all([
          fetchBusinessUnits(),
          fetchCodeOfDiscipline()
        ]);
        setBusinessUnits(buData);
        setDisciplineEntries(disciplineData.entries || []);
      } catch (err) {
        console.warn('Failed to load IR reference data', err);
      }
    };
    fetchData();

    const fetchUsers = async () => {
      setDirectoryLoading(true);
      setDirectoryError('');
      try {
        const directory = await fetchIncidentReportUserDirectory();
        setAllUsers(directory);
      } catch (err: any) {
        console.warn('IR modal user fetch error', err);
        setAllUsers([]);
        setDirectoryError(err?.message || 'The employee directory could not be loaded. Please refresh and try again.');
      } finally {
        setDirectoryLoading(false);
      }
    };
    fetchUsers();

    const fetchHandlers = async () => {
      if (!canAssign) {
        setPotentialHandlers([]);
        setHandlerDirectoryError('');
        return;
      }
      setHandlerDirectoryLoading(true);
      setHandlerDirectoryError('');
      try {
        setPotentialHandlers(await fetchAssignableIncidentCaseHandlers());
      } catch (err: any) {
        setPotentialHandlers([]);
        setHandlerDirectoryError(err?.message || 'Eligible case handlers could not be loaded.');
      } finally {
        setHandlerDirectoryLoading(false);
      }
    };
    void fetchHandlers();
  }, [isOpen, canAssign]);

  useEffect(() => {
    if (isOpen) {
      if (report) {
        setCurrentReport(report);
        setInvolvedEmployees(allUsers.filter(u => report.involvedEmployeeIds.includes(u.id)));
        setWitnesses(allUsers.filter(u => report.witnessIds.includes(u.id)));
        setAttachmentPreview(report.attachmentUrl || null);
        signaturePathRef.current = report.signatureDataUrl || null;
        setSignaturePreview(report.signatureDataUrl || null);
        setIsEditingRevision(false);
      } else {
        const defaultBu = businessUnits.find(
          b => b.id === user?.businessUnitId || (user?.businessUnit && b.name.toLowerCase() === user.businessUnit.toLowerCase())
        );
        setCurrentReport({
          status: IRStatus.Submitted,
          pipelineStage: 'ir-review',
          dateTime: new Date(),
          category: '',
          businessUnitId: defaultBu?.id || user?.businessUnitId || '',
          businessUnitName: defaultBu?.name || user?.businessUnit || '',
        });
        setInvolvedEmployees([]);
        setWitnesses([]);
        setAttachmentPreview(null);
        setSignaturePreview(null);
      }
    }
  }, [report, isOpen, user, allUsers, businessUnits]);

  // Build signed URLs for attachment/signature when viewing an existing report
  useEffect(() => {
    const buildSignedUrls = async () => {
      if (!report || !isOpen) return;
      const [attUrl, sigUrl] = await Promise.all([
        resolveStorageUrl(report.attachmentUrl),
        resolveStorageUrl(report.signatureDataUrl),
      ]);
      if (attUrl) setAttachmentPreview(attUrl);
      if (sigUrl) {
        setSignaturePreview(sigUrl);
        if (signaturePathRef.current) {
          signatureCacheRef.current.set(signaturePathRef.current, sigUrl);
          persistSignatureCache();
        }
      } else if (report.signatureDataUrl) {
        setSignaturePreview(report.signatureDataUrl);
      }
    };
    buildSignedUrls();
  }, [report, isOpen]);

  const handleSignatureError = async () => {
    const path = signaturePathRef.current;
    if (!path) return;
    const refreshed = await resolveStorageUrl(path);
    if (refreshed) {
      signatureCacheRef.current.set(path, refreshed);
      persistSignatureCache();
      setSignaturePreview(refreshed);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'dateTime') {
      setCurrentReport(prev => ({ ...prev, dateTime: new Date(value) }));
    } else if (name === 'businessUnitId') {
      const bu = businessUnits.find(b => b.id === value);
      setCurrentReport(prev => ({ ...prev, businessUnitId: value, businessUnitName: bu?.name }));
    } else if (name === 'assignedToId') {
      const handler = potentialHandlers.find(u => u.id === value);
      setCurrentReport(prev => ({ ...prev, assignedToId: value, assignedToName: handler?.name }));
      setAssignmentState('idle');
      setAssignmentMessage(value ? 'Assignment selected. It will be saved before NTE approval.' : '');
    } else {
      setCurrentReport(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleAttachmentUpload = async (file: File) => {
    if (!user) return;
    setUploadingAttachment(true);
    try {
      const ext = file.name.split('.').pop() || 'bin';
      const key = `${user.id}/attachments/${crypto.randomUUID?.() || Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('incident_reports_attachments').upload(key, file, { upsert: false });
      if (error) throw error;
      const { data, error: signErr } = await supabase.storage.from('incident_reports_attachments').createSignedUrl(key, 60 * 60);
      if (signErr) throw signErr;
      const url = data?.signedUrl || key;
      setCurrentReport(prev => ({ ...prev, attachmentUrl: key }));
      setAttachmentPreview(url);
    } catch (err: any) {
      alert(err?.message || 'Failed to upload attachment.');
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleCreateReport = async () => {
    if (!user) return;

    const errors: string[] = [];

    if (!currentReport.businessUnitId) {
      errors.push('Business Unit');
    }
    if (!currentReport.category) {
      errors.push('Category');
    }
    if (involvedEmployees.length === 0) {
      errors.push('Involved Employees');
    }
    if (!currentReport.description || currentReport.description.trim() === '') {
      errors.push('Description of Incident');
    }
    if (signaturePadRef.current?.isEmpty()) {
      errors.push('Signature');
    }

    if (errors.length > 0) {
      alert(`Please fill out the following required fields:\n- ${errors.join('\n- ')}`);
      return;
    }

    let signaturePath: string | undefined = currentReport.signatureDataUrl;
    if (signaturePadRef.current && !signaturePadRef.current.isEmpty()) {
      setUploadingSignature(true);
      try {
        const dataUrl = signaturePadRef.current.getSignatureDataUrl();
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const key = `${user.id}/signatures/${crypto.randomUUID?.() || Date.now()}.png`;
        const { error } = await supabase.storage.from('incident_reports_attachments').upload(key, blob, { contentType: 'image/png', upsert: true });
        if (error) throw error;
        signaturePath = key;
      } catch (err: any) {
        alert(err?.message || 'Failed to upload signature.');
        setUploadingSignature(false);
        return;
      }
      setUploadingSignature(false);
    }

    const reportToSave: Partial<IncidentReport> = {
      ...currentReport,
      reportedBy: user.id,
      involvedEmployeeIds: involvedEmployees.map(u => u.id),
      involvedEmployeeNames: involvedEmployees.map(u => u.name),
      witnessIds: witnesses.map(u => u.id),
      witnessNames: witnesses.map(u => u.name),
      status: IRStatus.Submitted,
      pipelineStage: 'ir-review',
      signatureDataUrl: signaturePath,
    };
    onSave(reportToSave);
  };

  const handleSaveExisting = async (resubmit = false) => {
    if (!report || !user) return;
    if (!currentReport.category || !currentReport.description?.trim() || !currentReport.location?.trim()) {
      alert('Date, location, category, and description are required.');
      return;
    }
    const saved = await onSave({
      ...currentReport,
      id: report.id,
      reportedBy: report.reportedBy,
      involvedEmployeeIds: involvedEmployees.map(item => item.id),
      involvedEmployeeNames: involvedEmployees.map(item => item.name),
      witnessIds: witnesses.map(item => item.id),
      witnessNames: witnesses.map(item => item.name),
    });
    if (resubmit && onResubmit) await onResubmit(report.id);
    setIsEditingRevision(false);
    return saved;
  };

  const reporterName = report ? allUsers.find(u => u.id === report.reportedBy)?.name : user?.name;
  const statusTag = report ? getStatusTag(report.status, report.pipelineStage) : null;
  const isReporter = !!report && report.reportedBy === user?.id;
  const isReporterRevisionState = !!report && [IRStatus.ReturnedForRevision, IRStatus.Rejected].includes(report.status);
  const reporterCanRevise = isReporter && !!report && [IRStatus.Draft, IRStatus.ReturnedForRevision, IRStatus.Rejected].includes(report.status);
  const isActiveHrReview = !!report
    && [IRStatus.Submitted, IRStatus.HRReview, IRStatus.Converted].includes(report.status)
    && report.pipelineStage === 'ir-review';
  const hasIncidentProcessingPermission = can('IncidentReports', Permission.Review)
    || can('IncidentReports', Permission.Edit)
    || can('IncidentReports', Permission.Manage);
  const canProcessReport = !isEmployeeView && hasIncidentProcessingPermission && isActiveHrReview;
  const canProcessEmployeeNtes = !isEmployeeView && hasIncidentProcessingPermission;
  const activeNteRecipientCount = useMemo(() => new Set(
    relatedNtes
      .filter(item => ![NTEStatus.Rejected, NTEStatus.Closed].includes(item.status))
      .map(item => item.employeeId)
  ).size, [relatedNtes]);

  // Only show assignment if editing an existing report AND it is in the initial review stage
  const showAssignment = canProcessReport && canAssign;

  const renderModalContent = () => {
    if (report && !isEditingRevision) {
      // VIEW mode for existing reports
      return (
        <div className="space-y-6">
          <h2 className="text-lg text-gray-600 dark:text-gray-400 -mt-4">
            {report.category}
          </h2>

          {report.status === IRStatus.ReturnedForRevision && report.revisionNotes && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
              <strong>Revision requested:</strong> {report.revisionNotes}
            </div>
          )}
          {report.status === IRStatus.Rejected && report.rejectionReason && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-700 dark:bg-red-950/30 dark:text-red-100">
              <strong>Rejection reason:</strong> {report.rejectionReason}
            </div>
          )}

          <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-3">
            <DetailItem label="Case ID">{formatIRDisplayId(report.caseNumber) || report.id}</DetailItem>
            <DetailItem label="Status">
              {statusTag && (
                <span className={`px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${statusTag.color}`}>
                  {statusTag.text}
                </span>
              )}
            </DetailItem>
            <DetailItem label="Business Unit">{report.businessUnitName || 'N/A'}</DetailItem>
            <DetailItem label="Date & Time of Incident">
              {new Date(report.dateTime).toLocaleString()}
            </DetailItem>
            <DetailItem label="Location">{report.location}</DetailItem>
            <DetailItem label="Category">{report.category}</DetailItem>
            <DetailItem label="Reported by">{reporterName}</DetailItem>
            <DetailItem label="Involved Employee(s)">{report.involvedEmployeeNames.join(', ')}</DetailItem>

            {showAssignment && (
              <div className="sm:col-span-2 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md border border-blue-200 dark:border-blue-800">
                <label htmlFor="assignedToId" className="block text-sm font-bold text-blue-700 dark:text-blue-300 mb-1">Assign Case Handler</label>
                <select
                  id="assignedToId"
                  name="assignedToId"
                  value={currentReport.assignedToId || ''}
                  onChange={handleChange}
                  disabled={handlerDirectoryLoading || !!handlerDirectoryError || potentialHandlers.length === 0}
                  className="block w-full pl-3 pr-10 py-1 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                >
                  <option value="">{handlerDirectoryLoading ? 'Loading eligible case handlers…' : '-- Select HR Staff --'}</option>
                  {potentialHandlers.map(u => (
                    <option key={u.id} value={u.id}>{u.name} · {u.position || u.role} · {u.email}</option>
                  ))}
                </select>
                {handlerDirectoryError && <p role="alert" className="mt-1 text-xs text-red-700">{handlerDirectoryError}</p>}
                {!handlerDirectoryLoading && !handlerDirectoryError && potentialHandlers.length === 0 && (
                  <p className="mt-1 text-xs text-amber-700">No eligible active HR case handlers found</p>
                )}
                <p className="text-xs text-gray-500 mt-1">Assigning will move this case to the handler's dashboard.</p>
              </div>
            )}
            {!showAssignment && currentReport.assignedToName && (
              <DetailItem label="Assigned Handler">{currentReport.assignedToName}</DetailItem>
            )}
          </dl>

          {canProcessEmployeeNtes && report.involvedEmployeeIds.length > 0 && (
            <section className="rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">Employee-specific NTE processing</h3>
                  <p className="text-xs text-gray-500">{activeNteRecipientCount} of {report.involvedEmployeeIds.length} active NTEs · Each employee proceeds independently.</p>
                </div>
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${activeNteRecipientCount >= report.involvedEmployeeIds.length ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                  {activeNteRecipientCount >= report.involvedEmployeeIds.length ? 'Employee processing complete' : 'Employee processing incomplete'}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                  <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-800">
                    <tr><th className="px-4 py-3">Involved employee</th><th className="px-4 py-3">NTE</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Response</th><th className="px-4 py-3 text-right">Action</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {report.involvedEmployeeIds.map((employeeId, index) => {
                      const employee = allUsers.find(item => item.id === employeeId);
                      const employeeNte = relatedNtes.find(item => item.employeeId === employeeId && item.status !== NTEStatus.Rejected)
                        || relatedNtes.find(item => item.employeeId === employeeId);
                      const responseStatus = !employeeNte
                        ? 'Not available'
                        : employeeNte.status === NTEStatus.ResponseSubmitted
                          ? 'Response submitted'
                          : employeeNte.status === NTEStatus.Issued
                            ? 'Awaiting response'
                            : 'Not yet issued';
                      return (
                        <tr key={employeeId}>
                          <td className="px-4 py-3"><p className="font-semibold text-gray-900 dark:text-white">{employee?.name || report.involvedEmployeeNames[index] || 'Employee'}</p><p className="text-xs text-gray-500">{employee?.position || 'Position not recorded'} · {employee?.department || 'Department not recorded'} · {employee?.businessUnit || report.businessUnitName || 'Business unit not recorded'}</p></td>
                          <td className="px-4 py-3 font-medium">{employeeNte ? formatNTEDisplayId(employeeNte.nteNumber) || employeeNte.id : 'No NTE Created'}</td>
                          <td className="px-4 py-3">{employeeNte?.status || 'No NTE Created'}</td>
                          <td className="px-4 py-3 text-gray-500">{responseStatus}</td>
                          <td className="px-4 py-3 text-right">
                            {employeeNte ? (
                              <div className="flex justify-end gap-2">
                                <Button size="sm" variant="secondary" onClick={() => onOpenNTE?.(employeeNte)}>{employeeNte.status === NTEStatus.Rejected ? 'View Rejection' : employeeNte.status === NTEStatus.Draft ? 'Continue Draft' : employeeNte.status === NTEStatus.ResponseSubmitted ? 'View Response' : 'View NTE'}</Button>
                                {employeeNte.status === NTEStatus.Rejected && <Button size="sm" onClick={() => void onCreateNTEForEmployee?.(employeeId)}>Create Revised NTE</Button>}
                              </div>
                            ) : (
                              <Button size="sm" onClick={() => void onCreateNTEForEmployee?.(employeeId)}>Create NTE</Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Description of Incident</h3>
            <p className="mt-1 text-gray-800 dark:text-gray-200 whitespace-pre-wrap bg-gray-50 dark:bg-gray-900/50 p-3 rounded-md border dark:border-gray-700">
              {report.description}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Attachments</h3>
              {attachmentPreview ? (
                <a href={attachmentPreview} target="_blank" rel="noopener noreferrer" className="mt-1 text-indigo-600 dark:text-indigo-400 hover:underline">
                  View attachment
                </a>
              ) : report.attachmentUrl ? (
                <p className="mt-1 text-xs text-gray-500 break-all">{report.attachmentUrl}</p>
              ) : <p className="mt-1 text-sm text-gray-500">No attachments.</p>}
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Reporter's Signature</h3>
              {signaturePreview ? (
                <img
                  src={signaturePreview}
                  alt="Signature"
                  className="mt-1 border rounded-md p-2 bg-gray-100 dark:bg-gray-700 max-h-24"
                  onError={handleSignatureError}
                />
              ) : report.signatureDataUrl ? (
                <p className="mt-1 text-xs text-gray-500 break-all">{report.signatureDataUrl}</p>
              ) : <p className="mt-1 text-sm text-gray-500">No signature provided.</p>}
            </div>
          </div>
        </div>
      );
    }

    // CREATE mode and controlled reporter revision mode share the same fields.
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Row 1: Reporter and Date */}
        <div>
          <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Reporter</label>
          <p className="mt-1 font-semibold text-gray-900 dark:text-white">{report ? reporterName : user?.name}</p>
        </div>
        <Input
          label="Date of Incident"
          id="dateTime"
          name="dateTime"
          type="date"
          value={currentReport.dateTime ? new Date(currentReport.dateTime).toISOString().split('T')[0] : ''}
          onChange={handleChange}
          required
        />

        {/* Row 2: Location and Category */}
        <Input
          label="Location"
          id="location"
          name="location"
          value={currentReport.location || ''}
          onChange={handleChange}
          placeholder="e.g., Shuttlebay 1, Deck 8"
          required
        />
        <div>
          <label htmlFor="category" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Category*</label>
          <select
            id="category"
            name="category"
            value={currentReport.category || ''}
            onChange={handleChange}
            required
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white"
          >
            <option value="" disabled>Select a category</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* Row 2.5: Business Unit */}
        <div className="md:col-span-2">
          <label htmlFor="businessUnitId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Unit*</label>
          <select
            id="businessUnitId"
            name="businessUnitId"
            value={currentReport.businessUnitId || ''}
            onChange={handleChange}
            required
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white"
          >
            <option value="" disabled>Select a Business Unit</option>
            {businessUnits.map(bu => (
              <option key={bu.id} value={bu.id}>{bu.name}</option>
            ))}
          </select>
        </div>

        {/* Row 3: Involved Employees */}
        <div className="md:col-span-2">
          {directoryError && (
            <p role="alert" className="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
              {directoryError}
            </p>
          )}
          {!directoryError && (
            <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
              {directoryLoading ? 'Loading active employees…' : `${availableEmployees.length} active users available across all business units.`}
            </p>
          )}
          <EmployeeMultiSelect
            label="Involved Employees*"
            allUsers={availableEmployees}
            selectedUsers={involvedEmployees}
            onSelectionChange={setInvolvedEmployees}
            disabled={directoryLoading || !!directoryError}
            showDetails={false}
            searchPlaceholder="Search for employees or users..."
          />
        </div>

        {/* Row 4: Witnesses */}
        <div className="md:col-span-2">
          <EmployeeMultiSelect
            label="Witnesses"
            allUsers={availableEmployees}
            selectedUsers={witnesses}
            onSelectionChange={setWitnesses}
            disabled={directoryLoading || !!directoryError}
            showDetails={false}
            searchPlaceholder="Search for employees or users..."
          />
        </div>

        {/* Row 5: Description */}
        <div className="md:col-span-2">
          <Textarea
            label="Description of Incident"
            id="description"
            name="description"
            value={currentReport.description || ''}
            onChange={handleChange}
            rows={10}
            placeholder="Provide a clear, factual, and objective account of what happened. Include dates, times, locations, and any other relevant details."
            required
          />
        </div>

        {/* Row 6: Attachments */}
        <div className="md:col-span-2">
          <div className="space-y-2">
            <FileUploader onFileUpload={handleAttachmentUpload} maxSize={5 * 1024 * 1024} disabled={uploadingAttachment} />
            {attachmentPreview && (
              <div className="flex items-center gap-3">
                <a className="text-indigo-600 hover:underline text-sm" href={attachmentPreview} target="_blank" rel="noopener noreferrer">View uploaded attachment</a>
                {isEditingRevision && <button type="button" className="text-sm font-semibold text-red-600" onClick={() => { setCurrentReport(value => ({ ...value, attachmentUrl: undefined })); setAttachmentPreview(null); }}>Remove</button>}
              </div>
            )}
            {uploadingAttachment && <p className="text-xs text-gray-500">Uploading...</p>}
          </div>
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Signature</label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Please sign in the box below to confirm the accuracy of this report.</p>
          <SignaturePad ref={signaturePadRef} />
        </div>
      </div>
    );
  };

  const renderFooter = () => {
    if (report) {
      const isClosed = report.status === IRStatus.Closed || report.status === IRStatus.NoAction;
      if (isEditingRevision) {
        return <div className="flex w-full justify-end gap-2">
          <Button variant="secondary" onClick={() => setIsEditingRevision(false)}>Cancel</Button>
          <Button variant="secondary" onClick={() => void handleSaveExisting(false)}>Save changes</Button>
          {isReporterRevisionState && <Button onClick={() => void handleSaveExisting(true)}>Resubmit report</Button>}
        </div>;
      }

      if (isReporterRevisionState) {
        return (
          <div className="flex w-full items-center justify-between gap-3">
            <div>{onDownloadPdf && <Button variant="secondary" onClick={() => onDownloadPdf(report)}>Download as PDF</Button>}</div>
            <div className="flex items-center gap-2">
              {reporterCanRevise && <Button onClick={() => setIsEditingRevision(true)}>Edit for resubmission</Button>}
              {!reporterCanRevise && <Button variant="secondary" onClick={onClose}>Close</Button>}
            </div>
          </div>
        );
      }

      return (
        <div className="flex justify-between items-center w-full">
          <div className="flex space-x-2">
            {onDownloadPdf && <Button variant="secondary" onClick={() => onDownloadPdf(report)}>Download as PDF</Button>}
            {reporterCanRevise && <Button onClick={() => setIsEditingRevision(true)}>Edit report</Button>}
            {/* If HR Manager/Admin, they can save reassignment changes */}
            {canProcessReport && canAssign && (
              <Button
                isLoading={assignmentState === 'saving'}
                onClick={async () => {
                  setAssignmentState('saving');
                  setAssignmentMessage('Saving case handler assignment…');
                  try {
                    await onSave(currentReport);
                    setAssignmentState('saved');
                    setAssignmentMessage('Assignment saved. Handler routing and notification are up to date.');
                  } catch (error: any) {
                    setAssignmentState('error');
                    setAssignmentMessage(error?.message || 'Assignment could not be saved.');
                  }
                }}
              >Save Changes</Button>
            )}
          </div>

          {canProcessReport && (
            <div className="flex space-x-2">
              {onReturnForRevision && <Button variant="secondary" onClick={async () => { const reason = window.prompt('Revision instructions (required)'); if (reason?.trim()) await onReturnForRevision(report.id, reason); }}>Return for Revision</Button>}
              {onRejectReport && <Button variant="danger" onClick={async () => { const reason = window.prompt('Rejection reason (required)'); if (reason?.trim()) await onRejectReport(report.id, reason); }}>Reject</Button>}
              {onMarkNoAction && <Button variant="secondary" onClick={() => onMarkNoAction(report.id)}>Mark as "No Action"</Button>}
              {onConvertToCoaching && <Button variant="secondary" onClick={() => onConvertToCoaching(report)}>Convert to Coaching</Button>}
              {onGenerateNTE && <Button
                isLoading={assignmentState === 'saving'}
                onClick={async () => {
                  setAssignmentState('saving');
                  setAssignmentMessage('Saving assignment and validating NTE transition…');
                  try {
                    await onGenerateNTE(currentReport);
                    setAssignmentState('saved');
                  } catch (error: any) {
                    setAssignmentState('error');
                    setAssignmentMessage(error?.message || 'The NTE transition could not be completed.');
                  }
                }}
              >Continue Processing</Button>}
            </div>
          )}
          {!canProcessReport && (isClosed || !reporterCanRevise) && (
            <Button variant="secondary" onClick={onClose}>Close</Button>
          )}
        </div>
      );
    }
    return (
        <div className="flex justify-end w-full space-x-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleCreateReport}>Create Report</Button>
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={report ? `Incident Report: ${formatIRDisplayId(report.caseNumber) || report.id}` : 'File New Incident Report'}
      footer={renderFooter()}
    >
      {renderModalContent()}
      {report && assignmentMessage && (
        <p
          role={assignmentState === 'error' ? 'alert' : 'status'}
          className={`mt-4 rounded-md px-3 py-2 text-sm ${assignmentState === 'error' ? 'bg-red-50 text-red-700' : assignmentState === 'saved' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}
        >
          {assignmentMessage}
        </p>
      )}
    </Modal>
  );
};

export default IncidentReportModal;
