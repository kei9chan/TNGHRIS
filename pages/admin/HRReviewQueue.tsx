// Migration complete: mockDataCompat removed from HRReviewQueue
import React, { useState, useMemo, useEffect } from 'react';
import { ChangeHistory, ChangeHistoryStatus, EmployeeDraftStatus, User, Role, Permission, UserDocument, UserDocumentStatus, NotificationType } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { logActivity } from '../../services/auditService';
import RejectReasonModal from '../../components/admin/RejectReasonModal';
import { usePermissions } from '../../hooks/usePermissions';
import EditableDescription from '../../components/ui/EditableDescription';
import { supabase } from '../../services/supabaseClient';
import { formatEmployeeName } from '../../services/formatEmployeeName';
import { createNotification } from '../../services/notificationService';

interface SubmissionGroup {
    employeeName: string;
    employeeId: string;
    submissionDate: Date;
    changes: ChangeHistory[];
}

const HRReviewQueue: React.FC = () => {
    const { user } = useAuth();
    const { can } = usePermissions();
    const [pendingChanges, setPendingChanges] = useState<ChangeHistory[]>([]);
    const [pendingUsers, setPendingUsers] = useState<User[]>([]);
    const [pendingDocuments, setPendingDocuments] = useState<UserDocument[]>([]);
    const [employeeLookup, setEmployeeLookup] = useState<Map<string, string>>(new Map());
    const [activeUsers, setActiveUsers] = useState<Array<{ id: string; name: string; role: Role }>>([]);
    const [reportingToMap, setReportingToMap] = useState<Record<string, string>>({});
    const [employeeIdMap, setEmployeeIdMap] = useState<Record<string, string>>({});

    const [filterName, setFilterName] = useState('');
    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
    const [itemToReject, setItemToReject] = useState<{ type: 'profile' | 'document', id: string } | null>(null);

    const submissions = useMemo(() => {
        const groups: Record<string, SubmissionGroup> = {};
        pendingChanges.forEach(change => {
            const employeeName = employeeLookup.get(change.employeeId) || 'Unknown Employee';
            if (!groups[change.submissionId]) {
                groups[change.submissionId] = {
                    employeeName,
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
        return pendingDocuments.filter(doc => (doc as any).employeeName?.toLowerCase().includes(filterName.toLowerCase()));
    }, [pendingDocuments, filterName]);

    // Load new user registrations (email confirmed + inactive)
    useEffect(() => {
        let active = true;
        const loadPendingChanges = async () => {
            try {
                const { data, error } = await supabase
                    .from('profile_change_requests')
                    .select('*')
                    .eq('status', ChangeHistoryStatus.Pending)
                    .order('created_at', { ascending: false });
                if (error) throw error;
                const mapped = (data || []).map((row: any) => ({
                    id: row.id,
                    employeeId: row.employee_id,
                    timestamp: row.created_at ? new Date(row.created_at) : new Date(),
                    changedBy: row.changed_by,
                    field: row.field,
                    oldValue: row.old_value,
                    newValue: row.new_value,
                    status: row.status,
                    submissionId: row.submission_id,
                    rejectionReason: row.rejection_reason || undefined,
                })) as ChangeHistory[];

                const employeeIds = Array.from(new Set(mapped.map(change => change.employeeId)));
                if (employeeIds.length > 0) {
                    const { data: employees, error: empErr } = await supabase
                        .from('hris_users')
                        .select('id, full_name')
                        .in('id', employeeIds);
                    if (!empErr && employees) {
                        const nameMap = new Map(employees.map((row: any) => [row.id, row.full_name || 'Unknown Employee']));
                        if (active) setEmployeeLookup(nameMap);
                    }
                }

                if (active) setPendingChanges(mapped);
            } catch (e) {
                console.error('Failed to load profile change requests', e);
                if (active) setPendingChanges([]);
            }
        };
        loadPendingChanges();
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        const loadPendingUsers = async () => {
            try {
                const { data, error } = await supabase
                    .from('hris_users')
                    .select('id, full_name, email, role, status, position, department, business_unit, birth_date')
                    .eq('status', 'Inactive');
                if (error) throw error;
                if (data) {
                    setPendingUsers(
                        data.map((u: any) => ({
                            id: u.id,
                            name: formatEmployeeName(u.full_name || u.email || 'Unknown'),
                            email: u.email,
                            role: u.role as Role,
                            status: u.status as any,
                            position: u.position || '',
                            department: u.department || '',
                            businessUnit: u.business_unit || '',
                            birthDate: u.birth_date || '',
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

    // Role-based hierarchy for "Reports To" selection
    const getReportsToOptions = (pendingRole: Role) => {
        const seniorRoles: Role[] = [Role.OperationsDirector, Role.GeneralManager, Role.BOD];
        const managerAndAbove: Role[] = [Role.Manager, Role.BusinessUnitManager, ...seniorRoles];
        const isManagerLevel = pendingRole === Role.Manager || pendingRole === Role.BusinessUnitManager;
        return activeUsers.filter(u => (isManagerLevel ? seniorRoles : managerAndAbove).includes(u.role));
    };

    useEffect(() => {
        const loadActiveUsers = async () => {
            try {
                const { data, error } = await supabase
                    .from('hris_users')
                    .select('id, full_name, role')
                    .eq('status', 'Active')
                    .order('full_name');
                if (error || !data) return;
                setActiveUsers(
                    data.map((row: any) => ({
                        id: row.id,
                        name: formatEmployeeName(row.full_name || 'Unknown'),
                        role: row.role as Role,
                    }))
                );
            } catch (e) {
                console.error('Failed to load active users for Reports To', e);
            }
        };
        loadActiveUsers();
    }, []);

    useEffect(() => {
        const loadPendingDocuments = async () => {
            try {
                const { data, error } = await supabase
                    .from('user_documents')
                    .select('*, hris_users(full_name)')
                    .eq('status', UserDocumentStatus.Pending);
                if (error) throw error;
                if (data) {
                    setPendingDocuments(
                        data.map((d: any) => ({
                            id: d.id,
                            employeeId: d.user_id,
                            documentType: d.document_type,
                            customDocumentType: d.custom_document_type,
                            fileName: d.file_name,
                            fileUrl: d.file_url,
                            status: d.status,
                            submittedAt: d.created_at ? new Date(d.created_at) : new Date(),
                            employeeName: d.hris_users?.full_name || 'Unknown'
                        }))
                    );
                }
            } catch (e) {
                console.error('Failed to load pending documents', e);
                setPendingDocuments([]);
            }
        };
        loadPendingDocuments();
    }, []);


    const handleProfileApprovalAction = async (submissionId: string, status: ChangeHistoryStatus.Approved | ChangeHistoryStatus.Rejected, reason?: string) => {
        if (!user) return;
        try {
            const { data: changeRows, error } = await supabase
                .from('profile_change_requests')
                .select('*')
                .eq('submission_id', submissionId);
            if (error) throw error;

            if (status === ChangeHistoryStatus.Approved && changeRows && changeRows.length > 0) {
                const employeeId = changeRows[0].employee_id;
                const updates: Record<string, any> = {};
                const formatDateOnly = (d?: string | null) => (d ? d.split('T')[0] : null);
                changeRows.forEach((row: any) => {
                    switch (row.field) {
                        case 'name':
                            updates.full_name = row.new_value;
                            break;
                        case 'email':
                            updates.email = row.new_value;
                            break;
                        case 'position':
                            updates.position = row.new_value;
                            break;
                        case 'department':
                            updates.department = row.new_value;
                            break;
                        case 'departmentId':
                            updates.department_id = row.new_value;
                            break;
                        case 'businessUnit':
                            updates.business_unit = row.new_value;
                            break;
                        case 'businessUnitId':
                            updates.business_unit_id = row.new_value;
                            break;
                        case 'birthDate':
                            updates.birth_date = formatDateOnly(row.new_value);
                            break;
                        default:
                            break;
                    }
                });

                if (Object.keys(updates).length > 0) {
                    const { error: updateErr } = await supabase
                        .from('hris_users')
                        .update(updates)
                        .eq('id', employeeId);
                    if (updateErr) throw updateErr;
                }
            }

            const updatePayload: Record<string, any> = {
                status,
            };
            if (status === ChangeHistoryStatus.Rejected) {
                updatePayload.rejection_reason = reason || null;
            }
            const { error: updateErr } = await supabase
                .from('profile_change_requests')
                .update(updatePayload)
                .eq('submission_id', submissionId);
            if (updateErr) throw updateErr;

            const action = status === ChangeHistoryStatus.Approved ? 'APPROVE' : 'REJECT';
            const details = status === ChangeHistoryStatus.Approved ? `Approved profile changes.` : `Rejected profile changes. Reason: ${reason}`;
            logActivity(user, action, 'EmployeeProfileChange', submissionId, details);

            const targetEmployeeId = changeRows && changeRows.length > 0 ? changeRows[0].employee_id : null;

            if (status === ChangeHistoryStatus.Approved && targetEmployeeId) {
                createNotification({
                    userId: targetEmployeeId,
                    type: NotificationType.PROFILE_CHANGE_APPROVED,
                    title: 'Profile Update Approved',
                    message: 'Your profile update request was approved.',
                    link: '/my-profile',
                    relatedEntityId: submissionId,
                }).catch(e => console.warn('Failed to persist profile approval notification', e));
            }

            if (status === ChangeHistoryStatus.Rejected && targetEmployeeId) {
                createNotification({
                    userId: targetEmployeeId,
                    type: NotificationType.PROFILE_CHANGE_REJECTED,
                    title: 'Profile Update Rejected',
                    message: `Your profile update request was rejected${reason ? `: ${reason}` : '.'}`,
                    link: '/my-profile',
                    relatedEntityId: submissionId,
                }).catch(e => console.warn('Failed to persist profile rejection notification', e));
            }

            setPendingChanges(prev => prev.filter(c => c.submissionId !== submissionId));
        } catch (e) {
            console.error('Failed to update profile change request', e);
            alert('Failed to update profile change request.');
        }
    };

    const handleDocumentApprovalAction = async (documentId: string, status: UserDocumentStatus.Approved | UserDocumentStatus.Rejected, reason?: string) => {
        if (!user) return;
        try {
            const updatePayload: any = {
                status,
                reviewed_at: new Date().toISOString(),
                reviewed_by: user.id
            };
            if (status === UserDocumentStatus.Rejected) {
                updatePayload.rejection_reason = reason;
            }
            const { error } = await supabase.from('user_documents').update(updatePayload).eq('id', documentId);
            if (error) throw error;

            const action = status === UserDocumentStatus.Approved ? 'APPROVE' : 'REJECT';
            const details = status === UserDocumentStatus.Approved ? `Approved document.` : `Rejected document. Reason: ${reason}`;
            logActivity(user, action, 'UserDocument', documentId, details);

            // Find the document's owner to notify
            const docRecord = pendingDocuments.find(d => d.id === documentId);
            if (docRecord?.employeeId) {
                if (status === UserDocumentStatus.Approved) {
                    createNotification({
                        userId: docRecord.employeeId,
                        type: NotificationType.DOCUMENT_APPROVED,
                        title: 'Document Approved',
                        message: `Your submitted document "${docRecord.documentType}" has been approved.`,
                        link: '/my-profile',
                        relatedEntityId: documentId,
                    }).catch(e => console.warn('Failed to send document approval notification', e));
                } else {
                    createNotification({
                        userId: docRecord.employeeId,
                        type: NotificationType.DOCUMENT_REJECTED,
                        title: 'Document Rejected',
                        message: `Your submitted document "${docRecord.documentType}" was rejected${reason ? `: ${reason}` : '.'}`,
                        link: '/my-profile',
                        relatedEntityId: documentId,
                    }).catch(e => console.warn('Failed to send document rejection notification', e));
                }
            }

            setPendingDocuments(prev => prev.filter(d => d.id !== documentId));
        } catch (e) {
            console.error('Failed to update document status', e);
            alert('Failed to update document status.');
        }
    };

    const handleUserApproval = async (userId: string, reportsToId: string, employeeId: string) => {
        if (!user) return;
        try {
            const { error } = await supabase
                .from('hris_users')
                .update({ status: 'Active', reports_to: reportsToId, employee_id: employeeId })
                .eq('id', userId);
            if (error) throw error;
            logActivity(user, 'APPROVE', 'UserRegistration', userId, `Approved new user registration.`);
            setPendingUsers(prev =>
                prev.map(u => (u.id === userId ? { ...u, status: 'Active' } : u))
            );
            // Notify the newly-activated user that their account is ready
            createNotification({
                userId,
                type: NotificationType.GENERAL,
                title: 'Account Activated',
                message: 'Your registration has been approved. Welcome to the system!',
                link: '/dashboard',
            }).catch(e => console.warn('Failed to send account activation notification', e));
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
                        {filteredPendingUsers.map(pendingUser => {
                            const reportsToOptions = getReportsToOptions(pendingUser.role);
                            const selectedReportsTo = reportingToMap[pendingUser.id] || '';
                            const isManagerLevel = pendingUser.role === Role.Manager || pendingUser.role === Role.BusinessUnitManager;
                            const hintText = isManagerLevel
                                ? 'Managers must report to: Operations Director, General Manager, or Board of Director.'
                                : 'Employees must report to: Manager, Business Unit Manager, Operations Director, General Manager, or Board of Director.';
                            return (
                                <div key={pendingUser.id} className="p-4 border dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div><span className="font-semibold">Name:</span> {pendingUser.name}</div>
                                        <div><span className="font-semibold">Email:</span> {pendingUser.email}</div>
                                        <div><span className="font-semibold">Role:</span> {pendingUser.role}</div>
                                        <div><span className="font-semibold">Business Unit:</span> {(pendingUser as any).businessUnit || <span className="text-amber-500 italic">Not provided</span>}</div>
                                        <div><span className="font-semibold">Department:</span> {pendingUser.department || <span className="text-amber-500 italic">Not provided</span>}</div>
                                        <div><span className="font-semibold">Birth Date:</span> {(pendingUser as any).birthDate || <span className="text-amber-500 italic">Not provided</span>}</div>
                                        <div><span className="font-semibold">Position:</span> {pendingUser.position || <span className="text-gray-400 italic">—</span>}</div>
                                        <div><span className="font-semibold">Status:</span> {pendingUser.status}</div>
                                    </div>
                                    {can('Employees', Permission.Edit) && pendingUser.status !== 'Active' && (
                                        <>
                                            <div className="mt-4 pt-4 border-t dark:border-gray-600">
                                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                                    Reports To <span className="text-red-500">*</span>
                                                </label>
                                                <select
                                                    value={selectedReportsTo}
                                                    onChange={e => setReportingToMap(prev => ({ ...prev, [pendingUser.id]: e.target.value }))}
                                                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                                >
                                                    <option value="">— Select a manager —</option>
                                                    {reportsToOptions.map(opt => (
                                                        <option key={opt.id} value={opt.id}>
                                                            {opt.name} ({opt.role})
                                                        </option>
                                                    ))}
                                                </select>
                                                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{hintText}</p>
                                                {!selectedReportsTo && (
                                                    <p className="mt-1 text-xs text-red-500">Required — select a manager before approving.</p>
                                                )}
                                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mt-4 mb-1">
                                                    Employee ID <span className="text-red-500">*</span>
                                                </label>
                                                <Input
                                                    id={`employee-id-${pendingUser.id}`}
                                                    value={employeeIdMap[pendingUser.id] || ''}
                                                    onChange={e => setEmployeeIdMap(prev => ({ ...prev, [pendingUser.id]: e.target.value }))}
                                                    placeholder="e.g. EMP-00123"
                                                />
                                                {!employeeIdMap[pendingUser.id] && (
                                                    <p className="mt-1 text-xs text-red-500">Required — provide an Employee ID before approving.</p>
                                                )}
                                            </div>
                                            <div className="flex justify-end space-x-2 mt-4">
                                                <Button variant="danger" onClick={() => handleUserRejection(pendingUser.id)}>Reject</Button>
                                                <Button
                                                    onClick={() => handleUserApproval(pendingUser.id, selectedReportsTo, employeeIdMap[pendingUser.id])}
                                                    disabled={!selectedReportsTo || !employeeIdMap[pendingUser.id]}
                                                >
                                                    Approve
                                                </Button>
                                            </div>
                                        </>
                                    )}
                                    {can('Employees', Permission.Edit) && pendingUser.status === 'Active' && (
                                        <div className="flex justify-end mt-4 pt-4 border-t dark:border-gray-600">
                                            <Button variant="success" disabled>Active</Button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
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
