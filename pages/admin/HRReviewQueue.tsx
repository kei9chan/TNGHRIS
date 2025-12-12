import React, { useState, useMemo, useEffect } from 'react';
import { mockChangeHistory, mockUsers, mockEmployeeDrafts, mockUserDocuments } from '../../services/mockData';
import { ChangeHistory, ChangeHistoryStatus, EmployeeDraftStatus, User, Role, Permission, UserDocument, UserDocumentStatus } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { logActivity } from '../../services/auditService';
import RejectReasonModal from '../../components/admin/RejectReasonModal';
import { usePermissions } from '../../hooks/usePermissions';
import EditableDescription from '../../components/ui/EditableDescription';
import { supabase } from '../../services/supabaseClient';

interface SubmissionGroup {
    employeeName: string;
    employeeId: string;
    submissionDate: Date;
    changes: ChangeHistory[];
}

const HRReviewQueue: React.FC = () => {
    const { user } = useAuth();
    const { can } = usePermissions();
    const [pendingChanges, setPendingChanges] = useState<ChangeHistory[]>(() => mockChangeHistory.filter(c => c.status === ChangeHistoryStatus.Pending));
    const [pendingUsers, setPendingUsers] = useState<User[]>([]);
    const [pendingDocuments, setPendingDocuments] = useState<UserDocument[]>(() => mockUserDocuments.filter(d => d.status === UserDocumentStatus.Pending));
    
    const [filterName, setFilterName] = useState('');
    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
    const [itemToReject, setItemToReject] = useState<{ type: 'profile' | 'document', id: string } | null>(null);

    const submissions = useMemo(() => {
        const groups: Record<string, SubmissionGroup> = {};
        pendingChanges.forEach(change => {
            const employee = mockUsers.find(u => u.id === change.employeeId);
            if (!groups[change.submissionId]) {
                groups[change.submissionId] = {
                    employeeName: employee?.name || 'Unknown Employee',
                    employeeId: change.employeeId,
                    submissionDate: change.timestamp,
                    changes: []
                };
            }
            groups[change.submissionId].changes.push(change);
        });
        return Object.entries(groups)
            .filter(([_, group]) => group.employeeName.toLowerCase().includes(filterName.toLowerCase()))
            .sort((a,b) => new Date(b[1].submissionDate).getTime() - new Date(a[1].submissionDate).getTime());
    }, [pendingChanges, filterName]);
    
    const filteredPendingUsers = useMemo(() => {
        return pendingUsers.filter(user => user.name.toLowerCase().includes(filterName.toLowerCase()));
    }, [pendingUsers, filterName]);

    const filteredPendingDocuments = useMemo(() => {
        return pendingDocuments.map(doc => ({
            ...doc,
            employeeName: mockUsers.find(u => u.id === doc.employeeId)?.name || 'Unknown'
        })).filter(doc => doc.employeeName.toLowerCase().includes(filterName.toLowerCase()));
    }, [pendingDocuments, filterName]);

    // Load new user registrations (email confirmed + inactive)
    useEffect(() => {
        const loadPendingUsers = async () => {
            try {
                const { data, error } = await supabase
                    .from('hris_users')
                    .select('id, full_name, email, role, status, position');
                if (error) throw error;
                if (data) {
                    setPendingUsers(
                        data.map((u: any) => ({
                            id: u.id,
                            name: u.full_name || u.email,
                            email: u.email,
                            role: u.role as Role,
                            status: u.status as any,
                            position: u.position || '',
                            department: '',
                            businessUnit: '',
                        })) as User[]
                    );
                }
            } catch (e) {
                console.error('Failed to load pending users', e);
                setPendingUsers([]);
            }
        };
        loadPendingUsers();
    }, []);


    const handleProfileApprovalAction = (submissionId: string, status: ChangeHistoryStatus.Approved | ChangeHistoryStatus.Rejected, reason?: string) => {
        if (!user) return;
        
        mockChangeHistory.forEach(c => {
            if (c.submissionId === submissionId) {
                c.status = status;
                if (status === ChangeHistoryStatus.Rejected) {
                    c.rejectionReason = reason;
                }
            }
        });
    
        const draft = mockEmployeeDrafts.find(d => d.submissionId === submissionId);
    
        if (draft) {
            if (status === ChangeHistoryStatus.Approved) {
                draft.status = EmployeeDraftStatus.Approved;
                const userIndex = mockUsers.findIndex(u => u.id === draft.employeeId);
                if (userIndex > -1) Object.assign(mockUsers[userIndex], draft.draftData);
            } else {
                draft.status = EmployeeDraftStatus.Rejected;
            }
        }
        
        const action = status === ChangeHistoryStatus.Approved ? 'APPROVE' : 'REJECT';
        const details = status === ChangeHistoryStatus.Approved ? `Approved profile changes.` : `Rejected profile changes. Reason: ${reason}`;
        logActivity(user, action, 'EmployeeProfileChange', submissionId, details);
        
        setPendingChanges(prev => prev.filter(c => c.submissionId !== submissionId));
    };

    const handleDocumentApprovalAction = (documentId: string, status: UserDocumentStatus.Approved | UserDocumentStatus.Rejected, reason?: string) => {
        if (!user) return;
        const docIndex = mockUserDocuments.findIndex(d => d.id === documentId);
        if (docIndex > -1) {
            mockUserDocuments[docIndex].status = status;
            mockUserDocuments[docIndex].reviewedAt = new Date();
            mockUserDocuments[docIndex].reviewedBy = user.id;
            if (status === UserDocumentStatus.Rejected) {
                mockUserDocuments[docIndex].rejectionReason = reason;
            }
            const action = status === UserDocumentStatus.Approved ? 'APPROVE' : 'REJECT';
            const details = status === UserDocumentStatus.Approved ? `Approved document.` : `Rejected document. Reason: ${reason}`;
            logActivity(user, action, 'UserDocument', documentId, details);
            setPendingDocuments(prev => prev.filter(d => d.id !== documentId));
        }
    };

     const handleUserApproval = async (userId: string) => {
        if (!user) return;
        try {
            const { error } = await supabase.from('hris_users').update({ status: 'Active' }).eq('id', userId);
            if (error) throw error;
            logActivity(user, 'APPROVE', 'UserRegistration', userId, `Approved new user registration.`);
            setPendingUsers(prev =>
                prev.map(u => (u.id === userId ? { ...u, status: 'Active' } : u))
            );
        } catch (e) {
            console.error('Failed to approve user', e);
            alert('Failed to approve user.');
        }
    };

    const handleUserRejection = async (userId: string) => {
        if (!user) return;
        if (window.confirm('Are you sure you want to reject and delete this user registration? This cannot be undone.')) {
            try {
                const { error } = await supabase.from('hris_users').delete().eq('id', userId);
                if (error) throw error;
                logActivity(user, 'DELETE', 'UserRegistration', userId, `Rejected and deleted new user registration.`);
                setPendingUsers(prev => prev.filter(u => u.id !== userId));
            } catch (e) {
                console.error('Failed to reject user', e);
                alert('Failed to reject user.');
            }
        }
    };

    const handleOpenRejectModal = (type: 'profile' | 'document', id: string) => {
        setItemToReject({ type, id });
        setIsRejectModalOpen(true);
    };

    const handleConfirmRejection = (reason: string) => {
        if (itemToReject) {
            if (itemToReject.type === 'profile') {
                handleProfileApprovalAction(itemToReject.id, ChangeHistoryStatus.Rejected, reason);
            } else {
                handleDocumentApprovalAction(itemToReject.id, UserDocumentStatus.Rejected, reason);
            }
        }
        setIsRejectModalOpen(false);
        setItemToReject(null);
    };

    return (
        <div className="space-y-6">
            <EditableDescription descriptionKey="hrReviewQueueDesc" />
            
            <Card>
                <div className="p-4">
                    <Input
                        label="Filter by Employee Name"
                        id="filter-name"
                        placeholder="Start typing a name..."
                        value={filterName}
                        onChange={e => setFilterName(e.target.value)}
                    />
                </div>
            </Card>

            {filteredPendingUsers.length > 0 && (
                <Card title="New User Registrations">
                    <div className="space-y-4">
                        {filteredPendingUsers.map(pendingUser => (
                            <div key={pendingUser.id} className="p-4 border dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div><span className="font-semibold">Name:</span> {pendingUser.name}</div>
                                    <div><span className="font-semibold">Email:</span> {pendingUser.email}</div>
                                    <div><span className="font-semibold">Position:</span> {pendingUser.position}</div>
                                    <div className="md:col-span-3"><span className="font-semibold">Status:</span> {pendingUser.status}</div>
                                </div>
                                {can('Employees', Permission.Edit) && pendingUser.status !== 'Active' && (
                                    <div className="flex justify-end space-x-2 mt-4 pt-4 border-t dark:border-gray-600">
                                        <Button variant="danger" onClick={() => handleUserRejection(pendingUser.id)}>Reject</Button>
                                        <Button onClick={() => handleUserApproval(pendingUser.id)}>Approve</Button>
                                    </div>
                                )}
                                {can('Employees', Permission.Edit) && pendingUser.status === 'Active' && (
                                    <div className="flex justify-end mt-4 pt-4 border-t dark:border-gray-600">
                                        <Button variant="success" disabled>Active</Button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {filteredPendingDocuments.length > 0 && (
                <Card title="Pending Document Submissions">
                    <div className="space-y-4">
                        {filteredPendingDocuments.map(doc => (
                            <div key={doc.id} className="p-4 border dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                    <div><span className="font-semibold">Employee:</span> {doc.employeeName}</div>
                                    <div><span className="font-semibold">Document:</span> {doc.documentType === 'Others' ? doc.customDocumentType : doc.documentType}</div>
                                    <div><span className="font-semibold">Submitted:</span> {new Date(doc.submittedAt).toLocaleDateString()}</div>
                                    <div className="md:col-span-3"><span className="font-semibold">File:</span> <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline">{doc.fileName}</a></div>
                                </div>
                                {can('Employees', Permission.Edit) && (
                                    <div className="flex justify-end space-x-2 mt-4 pt-4 border-t dark:border-gray-600">
                                        <Button variant="danger" onClick={() => handleOpenRejectModal('document', doc.id)}>Reject</Button>
                                        <Button onClick={() => handleDocumentApprovalAction(doc.id, UserDocumentStatus.Approved)}>Approve</Button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {submissions.length > 0 && (
                <div className="space-y-4">
                    {submissions.map(([submissionId, group]) => (
                        <Card key={submissionId} title={`Profile Change Request for ${group.employeeName}`}>
                            <div className="space-y-4">
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 border dark:border-gray-600">
                                        <thead className="bg-gray-50 dark:bg-gray-700">
                                            <tr>
                                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Field</th>
                                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Old Value</th>
                                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">New Value</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                            {group.changes.map(change => (
                                                <tr key={change.id}>
                                                    <td className="px-4 py-2 font-semibold">{change.field}</td>
                                                    <td className="px-4 py-2 text-red-600 dark:text-red-400 font-mono text-sm">{change.oldValue}</td>
                                                    <td className="px-4 py-2 text-green-600 dark:text-green-400 font-mono text-sm">{change.newValue}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {can('Employees', Permission.Edit) && (
                                    <div className="flex justify-end space-x-2 pt-4 border-t dark:border-gray-600">
                                        <Button variant="danger" onClick={() => handleOpenRejectModal('profile', submissionId)}>Reject</Button>
                                        <Button onClick={() => handleProfileApprovalAction(submissionId, ChangeHistoryStatus.Approved)}>Approve</Button>
                                    </div>
                                )}
                            </div>
                        </Card>
                    ))}
                </div>
            )}
            
            {submissions.length === 0 && filteredPendingUsers.length === 0 && filteredPendingDocuments.length === 0 && (
                <Card>
                    <div className="text-center py-10">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">All Clear!</h3>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">There are no pending items in the review queue.</p>
                    </div>
                </Card>
            )}

            <RejectReasonModal
                isOpen={isRejectModalOpen}
                onClose={() => setIsRejectModalOpen(false)}
                onSubmit={handleConfirmRejection}
            />
        </div>
    );
};

export default HRReviewQueue;
