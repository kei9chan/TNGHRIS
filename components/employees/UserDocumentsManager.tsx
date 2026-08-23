import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { Role, UserDocument, UserDocumentStatus } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import DocumentUploadModal, { DocumentUploadValues } from './DocumentUploadModal';
import { useAuth } from '../../hooks/useAuth';

interface UserDocumentsManagerProps {
  employeeId: string;
  isMyProfile: boolean;
}

const BUCKET = 'employee-documents';

const getStatusColor = (status: UserDocumentStatus) => {
  switch (status) {
    case UserDocumentStatus.Pending: return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300';
    case UserDocumentStatus.Approved:
    case UserDocumentStatus.Verified: return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300';
    case UserDocumentStatus.Rejected: return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300';
  }
};

const safeFileName = (name: string) => name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');

const UserDocumentsManager: React.FC<UserDocumentsManagerProps> = ({ employeeId, isMyProfile }) => {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<UserDocument[]>([]);
  const [uploadMode, setUploadMode] = useState<'employee' | 'hr' | null>(null);
  const [replacing, setReplacing] = useState<UserDocument | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const activeRoles = useMemo(() => new Set(user?.roles?.length ? user.roles : user ? [user.role] : []), [user]);
  const canManage = activeRoles.has(Role.HRManager)
    || activeRoles.has(Role.HRStaff)
    || (activeRoles.has(Role.Admin) && !activeRoles.has(Role.IT));

  const fetchDocuments = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from('user_documents')
      .select('*')
      .eq('user_id', employeeId)
      .order('created_at', { ascending: false });
    if (fetchError) {
      setError(fetchError.message);
      return;
    }
    setDocuments((data || []).map((d: any) => ({
      id: d.id,
      employeeId: d.user_id,
      documentType: d.document_type,
      customDocumentType: d.custom_document_type || undefined,
      title: d.title || undefined,
      notes: d.notes || undefined,
      fileName: d.file_name,
      fileUrl: d.file_url,
      storageBucket: d.storage_bucket || undefined,
      storagePath: d.storage_path || undefined,
      documentSource: d.document_source || 'Employee',
      uploadedBy: d.uploaded_by || undefined,
      uploadedByName: d.uploaded_by_name || undefined,
      versionNumber: d.version_number || 1,
      replacesDocumentId: d.replaces_document_id || undefined,
      status: d.status,
      submittedAt: d.created_at ? new Date(d.created_at) : new Date(),
      archivedAt: d.archived_at ? new Date(d.archived_at) : undefined,
      rejectionReason: d.rejection_reason || undefined,
    })) as UserDocument[]);
    setError('');
  }, [employeeId]);

  useEffect(() => {
    void fetchDocuments();
    const subscription = supabase
      .channel(`user_documents_${employeeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_documents', filter: `user_id=eq.${employeeId}` }, () => void fetchDocuments())
      .subscribe();
    return () => { void subscription.unsubscribe(); };
  }, [employeeId, fetchDocuments]);

  const openUpload = (mode: 'employee' | 'hr', document?: UserDocument) => {
    setReplacing(document || null);
    setUploadMode(mode);
    setError('');
  };

  const closeUpload = () => {
    if (saving) return;
    setUploadMode(null);
    setReplacing(null);
  };

  const handleSaveDocument = async (values: DocumentUploadValues, file: File) => {
    if (!user || !uploadMode) return;
    setSaving(true); setError('');
    const documentId = crypto.randomUUID();
    const storagePath = `${employeeId}/${documentId}/${safeFileName(file.name)}`;
    try {
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      const { error: insertError } = await supabase.from('user_documents').insert({
        id: documentId,
        user_id: employeeId,
        document_type: values.documentType,
        custom_document_type: values.customDocumentType || null,
        title: values.title,
        notes: values.notes || null,
        file_name: file.name,
        file_url: storagePath,
        storage_bucket: BUCKET,
        storage_path: storagePath,
        document_source: uploadMode === 'hr' ? 'HR' : 'Employee',
        status: uploadMode === 'hr' ? values.status : UserDocumentStatus.Pending,
        version_number: (replacing?.versionNumber || 0) + 1,
        replaces_document_id: replacing?.id || null,
      });
      if (insertError) throw insertError;
      await fetchDocuments();
      setUploadMode(null);
      setReplacing(null);
    } catch (reason: any) {
      setError(reason?.message || 'Failed to upload document.');
    } finally {
      setSaving(false);
    }
  };

  const openDocument = async (document: UserDocument, download: boolean) => {
    if (!document.storagePath || !document.storageBucket) {
      setError('This legacy record does not have a secure storage path.');
      return;
    }
    const { data, error: signError } = await supabase.storage.from(document.storageBucket)
      .createSignedUrl(document.storagePath, 60, download ? { download: document.fileName } : undefined);
    if (signError || !data?.signedUrl) {
      setError(signError?.message || 'Unable to open the document.');
      return;
    }
    const { error: auditError } = await supabase.rpc('log_employee_document_download', { p_document_id: document.id });
    if (auditError) {
      setError(auditError.message || 'The document access could not be audited.');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const updateDocument = async (document: UserDocument, changes: Record<string, unknown>) => {
    const { error: updateError } = await supabase.from('user_documents').update(changes).eq('id', document.id);
    if (updateError) setError(updateError.message);
    else await fetchDocuments();
  };

  const editNotes = async (document: UserDocument) => {
    const notes = window.prompt('Document notes', document.notes || '');
    if (notes === null) return;
    await updateDocument(document, { notes: notes.trim() || null });
  };

  const archiveDocument = async (document: UserDocument) => {
    if (!window.confirm(`Archive “${document.title || document.fileName}”? The file and audit history will be retained.`)) return;
    await updateDocument(document, { archived_at: new Date().toISOString() });
  };

  return (
    <>
      <Card title="My Submitted Documents">
        <div className="mb-4 flex flex-wrap justify-end gap-2">
          {isMyProfile && <Button variant="secondary" onClick={() => openUpload('employee')}>Submit My Document</Button>}
          {canManage && <Button onClick={() => openUpload('hr')}>Upload Document</Button>}
        </div>
        {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700"><tr>{['Document Type','Document','Source','Uploaded By','Uploaded Date','Status','Notes','Actions'].map(label => <th key={label} className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-300">{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
              {documents.map(document => <tr key={document.id}>
                <td className="px-4 py-4 text-sm font-medium">{document.documentType === 'Others' ? document.customDocumentType : document.documentType}</td>
                <td className="px-4 py-4 text-sm"><p className="font-medium">{document.title || document.fileName}</p><p className="text-xs text-gray-500">{document.fileName} · v{document.versionNumber || 1}</p></td>
                <td className="px-4 py-4 text-sm"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${document.documentSource === 'HR' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700'}`}>{document.documentSource === 'HR' ? 'HR Uploaded' : 'Employee Submitted'}</span></td>
                <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">{document.uploadedByName || 'Historical record'}</td>
                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(document.submittedAt).toLocaleDateString('en-US')}</td>
                <td className="px-4 py-4 text-sm">{canManage ? <select aria-label={`Status for ${document.title || document.fileName}`} value={document.status} onChange={event => void updateDocument(document, { status: event.target.value })} className="rounded-md border-gray-300 py-1 text-xs dark:border-gray-600 dark:bg-gray-700">{Object.values(UserDocumentStatus).map(status => <option key={status}>{status}</option>)}</select> : <span className={`rounded-full px-2 py-1 text-xs font-semibold ${getStatusColor(document.status)}`}>{document.status}</span>}</td>
                <td className="max-w-56 px-4 py-4 text-sm text-gray-500 dark:text-gray-400">{document.notes || '—'}</td>
                <td className="px-4 py-4"><div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => void openDocument(document, false)}>View</Button><Button size="sm" variant="secondary" onClick={() => void openDocument(document, true)}>Download</Button>{canManage && <><Button size="sm" variant="secondary" onClick={() => void editNotes(document)}>Edit notes</Button><Button size="sm" variant="secondary" onClick={() => openUpload('hr', document)}>New version</Button><Button size="sm" variant="secondary" onClick={() => void archiveDocument(document)}>Archive</Button></>}</div></td>
              </tr>)}
              {documents.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-gray-500 dark:text-gray-400">No documents have been uploaded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      {uploadMode && <DocumentUploadModal isOpen mode={uploadMode} replacing={replacing} saving={saving} onClose={closeUpload} onSave={handleSaveDocument} />}
    </>
  );
};

export default UserDocumentsManager;
