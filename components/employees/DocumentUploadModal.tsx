import React, { useState } from 'react';
import { UserDocumentType, USER_DOCUMENT_TYPES } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import FileUploader from '../ui/FileUploader';

interface DocumentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { documentType: UserDocumentType; customDocumentType?: string; fileName: string; fileUrl: string; }, file: File) => void;
}

const DocumentUploadModal: React.FC<DocumentUploadModalProps> = ({ isOpen, onClose, onSave }) => {
    const [documentType, setDocumentType] = useState<UserDocumentType>('PSA Birth Certificate');
    const [customDocumentType, setCustomDocumentType] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [error, setError] = useState('');

    const handleSubmit = () => {
        setError('');
        if (!file) {
            setError('Please upload a file.');
            return;
        }
        if (documentType === 'Others' && !customDocumentType.trim()) {
            setError('Please specify the document type for "Others".');
            return;
        }
        
        onSave({ documentType, customDocumentType, fileName: file.name, fileUrl: '' }, file);
    };
    
    const footer = (
        <div className="flex justify-end w-full space-x-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit}>Submit for Review</Button>
        </div>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Upload Document"
            footer={footer}
        >
            <div className="space-y-4">
                {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/40 p-3 rounded-md">{error}</p>}
                <div>
                    <label htmlFor="documentType" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Document Type</label>
                    <select
                        id="documentType"
                        value={documentType}
                        onChange={(e) => setDocumentType(e.target.value as UserDocumentType)}
                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    >
                        {USER_DOCUMENT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                    </select>
                </div>
                {documentType === 'Others' && (
                    <Input
                        label="Please specify document type"
                        id="customDocumentType"
                        value={customDocumentType}
                        onChange={e => setCustomDocumentType(e.target.value)}
                        required
                    />
                )}
                <FileUploader onFileUpload={setFile} maxSize={2 * 1024 * 1024} />
            </div>
        </Modal>
    );
};

export default DocumentUploadModal;