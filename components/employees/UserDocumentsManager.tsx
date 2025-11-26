import React, { useState, useEffect } from 'react';
import { UserDocument, UserDocumentStatus } from '../../types';
import { mockUserDocuments } from '../../services/mockData';
import Card from '../ui/Card';
import Button from '../ui/Button';
import DocumentUploadModal from './DocumentUploadModal';
import { logActivity } from '../../services/auditService';
import { useAuth } from '../../hooks/useAuth';

interface UserDocumentsManagerProps {
    employeeId: string;
    isMyProfile: boolean;
}

const getStatusColor = (status: UserDocumentStatus) => {
    switch(status) {
        case UserDocumentStatus.Pending: return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300';
        case UserDocumentStatus.Approved: return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300';
        case UserDocumentStatus.Rejected: return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300';
    }
};


const UserDocumentsManager: React.FC<UserDocumentsManagerProps> = ({ employeeId, isMyProfile }) => {
    const { user } = useAuth();
    const [documents, setDocuments] = useState<UserDocument[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        setDocuments(mockUserDocuments.filter(doc => doc.employeeId === employeeId));
    }, [employeeId]);
    
    // Polling to see updates from HR Review Queue
    useEffect(() => {
        const interval = setInterval(() => {
            const updatedDocs = mockUserDocuments.filter(doc => doc.employeeId === employeeId);
            if (JSON.stringify(updatedDocs) !== JSON.stringify(documents)) {
                setDocuments(updatedDocs);
            }
        }, 2000);
        return () => clearInterval(interval);
    }, [documents, employeeId]);


    const handleSaveDocument = (data: Omit<UserDocument, 'id' | 'employeeId' | 'submittedAt' | 'status'>, file: File) => {
        if (!user) return;

        const newDocument: UserDocument = {
            id: `DOC-${Date.now()}`,
            employeeId: employeeId,
            submittedAt: new Date(),
            status: UserDocumentStatus.Pending,
            fileName: file.name,
            fileUrl: URL.createObjectURL(file), // For mock preview
            ...data,
        };
        
        mockUserDocuments.unshift(newDocument);
        setDocuments(prev => [newDocument, ...prev]);
        logActivity(user, 'CREATE', 'UserDocument', newDocument.id, `Submitted document: ${newDocument.documentType} - ${newDocument.fileName}`);
        setIsModalOpen(false);
    };

    return (
        <>
            <Card title="My Submitted Documents">
                {isMyProfile && (
                    <div className="flex justify-end mb-4">
                        <Button onClick={() => setIsModalOpen(true)}>Upload New Document</Button>
                    </div>
                )}
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Document Type</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">File Name</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Submitted On</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Status</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {documents.map(doc => (
                                <tr key={doc.id}>
                                    <td className="px-4 py-4 whitespace-nowrap font-medium">{doc.documentType === 'Others' ? doc.customDocumentType : doc.documentType}</td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{doc.fileName}</td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(doc.submittedAt).toLocaleDateString()}</td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                                        <span title={doc.rejectionReason} className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(doc.status)}`}>
                                            {doc.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                             {documents.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="text-center py-6 text-gray-500 dark:text-gray-400">
                                        No documents have been uploaded yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
            <DocumentUploadModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveDocument}
            />
        </>
    );
};

export default UserDocumentsManager;