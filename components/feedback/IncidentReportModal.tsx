
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { IncidentReport, IRStatus, User, Role } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import { useAuth } from '../../hooks/useAuth';
import EmployeeMultiSelect from './EmployeeMultiSelect';
import { mockUsers, mockCodeOfDiscipline, mockBusinessUnits } from '../../services/mockData';
import SignaturePad, { SignaturePadRef } from '../ui/SignaturePad';
import { supabase } from '../../services/supabaseClient';
import FileUploader from '../ui/FileUploader';

interface IncidentReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: IncidentReport | null;
  onSave: (report: Partial<IncidentReport>) => void;
  onSendMessage: (reportId: string, text: string) => void;
  onGenerateNTE: (report: IncidentReport) => void;
  onMarkNoAction: (reportId: string) => void;
  onConvertToCoaching?: (report: IncidentReport) => void;
  onDownloadPdf: (report: IncidentReport) => void;
  isEmployeeView?: boolean;
}

const getStatusTag = (status: IRStatus, pipelineStage?: string) => {
    if (status === IRStatus.HRReview) {
        return { text: 'HR Review', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200' };
    }
    if (status === IRStatus.Submitted) {
        return { text: 'New', color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' };
    }
    if (status === IRStatus.Converted || pipelineStage === 'converted-coaching') {
        return { text: 'For Coaching', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200' };
    }
    return { text: status, color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' };
};

const DetailItem: React.FC<{label: string; children: React.ReactNode}> = ({ label, children }) => (
    <div>
        <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className="mt-1 text-sm text-gray-900 dark:text-white">{children}</dd>
    </div>
);


const IncidentReportModal: React.FC<IncidentReportModalProps> = ({ isOpen, onClose, report, onSave, onGenerateNTE, onMarkNoAction, onConvertToCoaching, onDownloadPdf, isEmployeeView = false }) => {
  const { user } = useAuth();
  const [currentReport, setCurrentReport] = useState<Partial<IncidentReport>>({});
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [involvedEmployees, setInvolvedEmployees] = useState<User[]>([]);
  const [witnesses, setWitnesses] = useState<User[]>([]);
  const signaturePadRef = useRef<SignaturePadRef>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const signaturePathRef = useRef<string | null>(null);
  const signatureCacheRef = useRef<Map<string, string>>(new Map());

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
    return [...new Set(mockCodeOfDiscipline.entries.map(e => e.category))].sort();
  }, []);
  
  const potentialHandlers = useMemo(() => {
    const pool = allUsers.length ? allUsers : mockUsers;
    return pool.filter(u => [Role.HRManager, Role.HRStaff, Role.Admin].includes(u.role) && u.status === 'Active');
  }, [allUsers]);

  const canAssign = user?.role === Role.Admin || user?.role === Role.HRManager;

  // Load users from Supabase for selectors
  useEffect(() => {
    if (!isOpen) return;
    supabase
      .from('hris_users')
      .select('id, full_name, email, role, department, business_unit, business_unit_id, department_id, position, status')
      .order('full_name', { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.warn('Failed to load users for IR modal', error);
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
      .catch((err) => console.warn('IR modal user fetch error', err));
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
        const pool = allUsers.length ? allUsers : mockUsers;
        if (report) {
            setCurrentReport(report);
            setInvolvedEmployees(pool.filter(u => report.involvedEmployeeIds.includes(u.id)));
            setWitnesses(pool.filter(u => report.witnessIds.includes(u.id)));
            setAttachmentPreview(report.attachmentUrl || null);
            signaturePathRef.current = report.signatureDataUrl || null;
            setSignaturePreview(report.signatureDataUrl || null);
        } else {
            setCurrentReport({
                status: IRStatus.Submitted,
                pipelineStage: 'ir-review',
                dateTime: new Date(),
                category: '',
                businessUnitId: '',
            });
            setInvolvedEmployees([]);
            setWitnesses([]);
            setAttachmentPreview(null);
            setSignaturePreview(null);
        }
    }
  }, [report, isOpen, user, allUsers]);

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
        const bu = mockBusinessUnits.find(b => b.id === value);
        setCurrentReport(prev => ({ ...prev, businessUnitId: value, businessUnitName: bu?.name }));
    } else if (name === 'assignedToId') {
        const handler = potentialHandlers.find(u => u.id === value);
        setCurrentReport(prev => ({ ...prev, assignedToId: value, assignedToName: handler?.name }));
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
  
  const reporterName = report ? mockUsers.find(u => u.id === report.reportedBy)?.name : user?.name;
  const statusTag = report ? getStatusTag(report.status, report.pipelineStage) : null;

  // Only show assignment if editing an existing report AND it is in the initial review stage
  const showAssignment = !isEmployeeView && canAssign && report && report.pipelineStage === 'ir-review';

  const renderModalContent = () => {
      if (report) {
        // VIEW mode for existing reports
        return (
            <div className="space-y-6">
                <h2 className="text-lg text-gray-600 dark:text-gray-400 -mt-4">
                    {report.category}
                </h2>

                <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-3">
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
                                className="block w-full pl-3 pr-10 py-1 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                            >
                                <option value="">-- Select HR Staff --</option>
                                {potentialHandlers.map(u => (
                                    <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-500 mt-1">Assigning will move this case to the handler's dashboard.</p>
                         </div>
                    )}
                    {!showAssignment && currentReport.assignedToName && (
                        <DetailItem label="Assigned Handler">{currentReport.assignedToName}</DetailItem>
                    )}
                </dl>

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

      // CREATE mode for new reports
      return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Row 1: Reporter and Date */}
            <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Reporter</label>
                <p className="mt-1 font-semibold text-gray-900 dark:text-white">{user?.name}</p>
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
                    {mockBusinessUnits.map(bu => (
                        <option key={bu.id} value={bu.id}>{bu.name}</option>
                    ))}
                </select>
            </div>
            
            {/* Row 3: Involved Employees */}
            <div className="md:col-span-2">
              <EmployeeMultiSelect
                  label="Involved Employees*"
                  allUsers={allUsers.length ? allUsers : mockUsers}
                  selectedUsers={involvedEmployees}
                  onSelectionChange={setInvolvedEmployees}
              />
            </div>

            {/* Row 4: Witnesses */}
            <div className="md:col-span-2">
              <EmployeeMultiSelect
                  label="Witnesses"
                  allUsers={allUsers.length ? allUsers : mockUsers}
                  selectedUsers={witnesses}
                  onSelectionChange={setWitnesses}
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
                        <a className="text-indigo-600 hover:underline text-sm" href={attachmentPreview} target="_blank" rel="noopener noreferrer">
                            View uploaded attachment
                        </a>
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
        return (
            <div className="flex justify-between items-center w-full">
                 <div className="flex space-x-2">
                     <Button variant="secondary" onClick={() => onDownloadPdf(report)}>Download as PDF</Button>
                     {/* If HR Manager/Admin, they can save reassignment changes */}
                     {!isEmployeeView && canAssign && (
                        <Button onClick={() => onSave(currentReport)}>Save Changes</Button>
                     )}
                 </div>

                {!isEmployeeView && !isClosed && (
                    <div className="flex space-x-2">
                        <Button variant="secondary" onClick={() => onMarkNoAction(report.id)}>Mark as "No Action"</Button>
                        {onConvertToCoaching && <Button variant="secondary" onClick={() => onConvertToCoaching(report)}>Convert to Coaching</Button>}
                        <Button onClick={() => onGenerateNTE(report)}>Issue NTE</Button>
                    </div>
                )}
                {!isEmployeeView && isClosed && (
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
      title={report ? `Incident Report: ${report.id}` : 'File New Incident Report'}
      footer={renderFooter()}
    >
      {renderModalContent()}
    </Modal>
  );
};

export default IncidentReportModal;
