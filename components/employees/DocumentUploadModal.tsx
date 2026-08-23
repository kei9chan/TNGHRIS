import React, { useEffect, useState } from 'react';
import { UserDocument, UserDocumentStatus, UserDocumentType, USER_DOCUMENT_TYPES } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import FileUploader from '../ui/FileUploader';
import { ALLOWED_FILE_EXTENSIONS, ALLOWED_FILE_TYPES, MAX_FILE_SIZE } from '../../constants';

export interface DocumentUploadValues {
  documentType: UserDocumentType;
  customDocumentType?: string;
  title: string;
  notes?: string;
  status: UserDocumentStatus;
}

interface DocumentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: DocumentUploadValues, file: File) => void | Promise<void>;
  mode: 'employee' | 'hr';
  replacing?: UserDocument | null;
  saving?: boolean;
}

const DocumentUploadModal: React.FC<DocumentUploadModalProps> = ({ isOpen, onClose, onSave, mode, replacing, saving = false }) => {
  const [documentType, setDocumentType] = useState<UserDocumentType>('PSA Birth Certificate');
  const [customDocumentType, setCustomDocumentType] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<UserDocumentStatus>(UserDocumentStatus.Pending);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setDocumentType(replacing?.documentType || 'PSA Birth Certificate');
    setCustomDocumentType(replacing?.customDocumentType || '');
    setTitle(replacing?.title || replacing?.fileName || '');
    setNotes(replacing?.notes || '');
    setStatus(mode === 'hr' ? (replacing?.status || UserDocumentStatus.Verified) : UserDocumentStatus.Pending);
    setFile(null);
    setError('');
  }, [isOpen, mode, replacing]);

  const handleSubmit = async () => {
    setError('');
    if (!file) return setError('Please upload a file.');
    if (!title.trim()) return setError('Please enter a document name or title.');
    if (documentType === 'Others' && !customDocumentType.trim()) return setError('Please specify the document type for “Others”.');
    await onSave({ documentType, customDocumentType: customDocumentType.trim() || undefined, title: title.trim(), notes: notes.trim() || undefined, status }, file);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={replacing ? 'Upload New Document Version' : mode === 'hr' ? 'Upload HR Document' : 'Submit Employee Document'}
      footer={<div className="flex w-full justify-end gap-2"><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button onClick={handleSubmit} disabled={saving}>{saving ? 'Uploading…' : replacing ? 'Upload New Version' : mode === 'hr' ? 'Upload Document' : 'Submit for Review'}</Button></div>}
    >
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
      <div>
        <label htmlFor="documentType" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Document Type</label>
        <select id="documentType" value={documentType} onChange={event => setDocumentType(event.target.value as UserDocumentType)} className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white">
          {USER_DOCUMENT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
        </select>
      </div>
      {documentType === 'Others' && <Input label="Specify document type" value={customDocumentType} onChange={event => setCustomDocumentType(event.target.value)} required />}
      <Input label="Document Name or Title" value={title} onChange={event => setTitle(event.target.value)} required />
      <div>
        <label htmlFor="document-notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Notes (optional)</label>
        <textarea id="document-notes" rows={3} value={notes} onChange={event => setNotes(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
      </div>
      {mode === 'hr' && (
        <div>
          <label htmlFor="document-status" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Document Status</label>
          <select id="document-status" value={status} onChange={event => setStatus(event.target.value as UserDocumentStatus)} className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white">
            {Object.values(UserDocumentStatus).map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
      )}
      <FileUploader onFileUpload={setFile} onFileRemove={() => setFile(null)} maxSize={MAX_FILE_SIZE} allowedMimeTypes={ALLOWED_FILE_TYPES} allowedExtensions={ALLOWED_FILE_EXTENSIONS} inputId="employee-document-file" />
      <p className="text-xs text-gray-500 dark:text-gray-400">Files are stored privately and opened through short-lived, permission-checked links.</p>
    </Modal>
  );
};

export default DocumentUploadModal;
