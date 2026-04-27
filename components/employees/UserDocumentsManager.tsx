import { supabase } from '../../services/supabaseClient';
import React, { useState, useEffect } from 'react';
import { UserDocument, UserDocumentStatus } from '../../types';
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
        let active = true;
        const fetchDocuments = async () => {
            try {
                const { data, error } = await supabase
                    .from('user_documents')
                    .select('*')
                    .eq('user_id', employeeId)
                    .order('created_at', { ascending: false });

                if (error) throw error;
                
                if (active && data) {
                    const mappedDocs = data.map((d: any) => ({
                        id: d.id,
                        employeeId: d.user_id,
                        documentType: d.document_type,
                        customDocumentType: d.custom_document_type,
                        fileName: d.file_name,
                        fileUrl: d.file_url,
                        status: d.status,
                        submittedAt: d.created_at ? new Date(d.created_at) : new Date(),
                        rejectionReason: d.rejection_reason
                    }));
                    setDocuments(mappedDocs as UserDocument[]);
                }
            } catch (error) {
                console.error("Error fetching documents:", error);
            }
        };

        fetchDocuments();

        const subscription = supabase
            .channel(`user_documents_${employeeId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'user_documents', filter: `user_id=eq.${employeeId}` }, () => {
                fetchDocuments();
            })
            .subscribe();

        return () => {
            active = false;
            subscription.unsubscribe();
        };
    }, [employeeId]);

    const handleSaveDocument = async (data: Omit<UserDocument, 'id' | 'employeeId' | 'submittedAt' | 'status'>, file: File) => {
        if (!user) return;

        try {
            const documentId = `DOC-${Date.now()}`;
            
            // Note: In a real app, you would upload the file to Supabase Storage here and get a public URL.
            // For now, keeping the mock blob URL or relying on the file logic in DocumentUploadModal.
            const fileUrl = URL.createObjectURL(file);

            const { error } = await supabase.from('user_documents').insert([{
                id: documentId,
                user_id: employeeId,
                document_type: data.documentType,
                custom_document_type: data.customDocumentType,
                file_name: file.name,
                file_url: fileUrl,
                status: UserDocumentStatus.Pending
            }]);

            if (error) throw error;

            const newDocument: UserDocument = {
                id: documentId,
                employeeId: employeeId,
                submittedAt: new Date(),
                status: UserDocumentStatus.Pending,
                fileName: file.name,
                fileUrl: fileUrl,
                ...data,
            };
            
            setDocuments(prev => [newDocument, ...prev]);
            logActivity(user, 'CREATE', 'UserDocument', newDocument.id, `Submitted document: ${newDocument.documentType} - ${newDocument.fileName}`);
            setIsModalOpen(false);
        } catch (error) {
            console.error("Failed to save document:", error);
            alert("Failed to save document.");
        }
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