// Phase F: mockDataCompat removed from OnboardingViewPage — live Supabase data
import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import AssignedOnboardingChecklist from '../../components/employees/AssignedOnboardingChecklist';
import Card from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Textarea from '../../components/ui/Textarea';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { supabase } from '../../services/supabaseClient';
import { formatEmployeeName } from '../../services/formatEmployeeName';
import { OnboardingChecklist, OnboardingTask, OnboardingTaskStatus, Role, User, NotificationType } from '../../types';

const ArrowLeftIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>;

const OnboardingViewPage: React.FC = () => {
    const { checklistId } = useParams<{ checklistId: string }>();
    const { user } = useAuth();
    const { getVisibleEmployeeIds } = usePermissions();
    const navigate = useNavigate();
    const location = useLocation();

    const [checklist, setChecklist] = useState<OnboardingChecklist | null>(null);
    const [employee, setEmployee] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
    const [rejectionReason, setRejectionReason] = useState('');
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

    const isReviewer =
        user?.role === Role.Admin ||
        user?.role === Role.HRManager ||
        user?.role === Role.HRStaff;

    useEffect(() => {
        const load = async () => {
            if (!checklistId) return;
            try {
                const { data: checklistRows, error: checklistError } = await supabase
                    .from('onboarding_checklists')
                    .select('id, employee_id, template_id, status, created_at, start_date, tasks')
                    .eq('id', checklistId)
                    .limit(1);

                const row = checklistError ? null : checklistRows?.[0];

                if (!row) {
                    setNotFound(true);
                    return;
                }

                const employeeId = row.employee_id;
                const templateId = row.template_id;

                const [{ data: employeeRows }, { data: templateRows }] = await Promise.all([
                    employeeId
                        ? supabase.from('hris_users').select('id, full_name, role').eq('id', employeeId).limit(1)
                        : Promise.resolve({ data: null }),
                    templateId
                        ? supabase.from('onboarding_checklist_templates').select('id, name, tasks').eq('id', templateId).limit(1)
                        : Promise.resolve({ data: null }),
                ]);

                const emp = employeeRows?.[0];
                const tmpl = templateRows?.[0];

                if (!emp || !tmpl) {
                    setNotFound(true);
                    return;
                }

                const normalizeStoredTasks = (rawTasks: any[]): OnboardingTask[] =>
                    rawTasks.map((task: any) => {
                        const completedAt = task.completedAt ? new Date(task.completedAt) : undefined;
                        const submittedAt = task.submittedAt ? new Date(task.submittedAt) : undefined;
                        let status = task.status as OnboardingTaskStatus;
                        if (submittedAt && status === OnboardingTaskStatus.Pending) {
                            status = OnboardingTaskStatus.PendingApproval;
                        }
                        if (completedAt && status === OnboardingTaskStatus.Pending) {
                            status = task.requiresApproval ? OnboardingTaskStatus.PendingApproval : OnboardingTaskStatus.Completed;
                        }
                        return {
                            ...task,
                            status,
                            dueDate: task.dueDate ? new Date(task.dueDate) : new Date(),
                            completedAt,
                            submittedAt,
                        };
                    });

                const parseStoredTasks = (raw: unknown): OnboardingTask[] => {
                    if (!raw) return [];
                    if (Array.isArray(raw)) return normalizeStoredTasks(raw);
                    if (typeof raw === 'string') {
                        try {
                            const parsed = JSON.parse(raw);
                            return Array.isArray(parsed) ? normalizeStoredTasks(parsed) : [];
                        } catch {
                            return [];
                        }
                    }
                    return [];
                };

                const startDate = row?.start_date ? new Date(row.start_date) : new Date();
                const templateTasks: OnboardingTask[] =
                    Array.isArray(tmpl.tasks) && tmpl.tasks.length
                        ? tmpl.tasks.map((t: any, idx: number) => {
                            const due = new Date(startDate);
                            due.setDate(due.getDate() + (t.dueDays || 0));
                            return {
                                id: `${row?.id || checklistId}-task-${idx}`,
                                templateTaskId: t.id || `tmpl-${idx}`,
                                employeeId: employeeId || '',
                                name: t.name || 'Task',
                                description: t.description || '',
                                ownerUserId: user?.id || '',
                                ownerName: user?.fullName || user?.name || 'System',
                                dueDate: due,
                                status: OnboardingTaskStatus.Pending,
                                points: t.points || 0,
                                taskType: t.taskType || 'Read',
                                readContent: t.readContent,
                                requiresApproval: t.requiresApproval,
                                assetId: t.assetId,
                                assetDescription: t.assetDescription,
                            } as OnboardingTask;
                        })
                        : [];

                const storedTasks = parseStoredTasks((row as any)?.tasks);
                const tasks: OnboardingTask[] =
                    storedTasks.length > 0
                        ? storedTasks
                        : templateTasks.length > 0
                            ? templateTasks
                            : [];

                const resolvedChecklist: OnboardingChecklist = {
                    id: row.id,
                    employeeId: employeeId || '',
                    templateId: templateId || '',
                    status: (row.status as any) || 'InProgress',
                    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
                    tasks,
                };

                setChecklist(resolvedChecklist);

                const pendingTasks = resolvedChecklist.tasks.filter(
                    t => t.status === OnboardingTaskStatus.Pending
                );
                const allNonPendingComplete = resolvedChecklist.tasks
                    .filter(t => t.status !== OnboardingTaskStatus.Pending)
                    .every(
                        t =>
                            t.status === OnboardingTaskStatus.Completed ||
                            t.status === OnboardingTaskStatus.PendingApproval
                    );
                const lastPendingIndex =
                    pendingTasks.length === 1
                        ? resolvedChecklist.tasks.findIndex(t => t.id === pendingTasks[0].id)
                        : -1;
                const shouldPromotePending =
                    pendingTasks.length === 1 &&
                    lastPendingIndex === resolvedChecklist.tasks.length - 1 &&
                    allNonPendingComplete &&
                    resolvedChecklist.status !== 'Pending Approval' &&
                    resolvedChecklist.status !== 'Approved';

                if (shouldPromotePending) {
                    const promotedTasks = resolvedChecklist.tasks.map(task => {
                        if (task.status !== OnboardingTaskStatus.Pending) return task;
                        return {
                            ...task,
                            status: OnboardingTaskStatus.PendingApproval,
                            completedAt: task.completedAt || new Date(),
                            submittedAt: task.submittedAt || new Date(),
                        };
                    });
                    await supabase
                        .from('onboarding_checklists')
                        .update({
                            tasks: promotedTasks.map(task => ({
                                ...task,
                                dueDate: task.dueDate ? new Date(task.dueDate).toISOString() : null,
                                completedAt: task.completedAt ? new Date(task.completedAt).toISOString() : null,
                                submittedAt: task.submittedAt ? new Date(task.submittedAt).toISOString() : null,
                            })),
                            status: 'Pending Approval',
                        })
                        .eq('id', resolvedChecklist.id);

                    setChecklist(prev =>
                        prev ? { ...prev, tasks: promotedTasks, status: 'Pending Approval' } : prev
                    );

                    const templateType =
                        templateRows?.[0]?.template_type || tmpl?.templateType || 'Onboarding';
                    const notificationType =
                        templateType === 'Offboarding'
                            ? NotificationType.OFFBOARDING_ASSIGNED
                            : NotificationType.ONBOARDING_ASSIGNED;
                    const approvalTitle =
                        templateType === 'Offboarding'
                            ? 'Offboarding Checklist Ready'
                            : 'Onboarding Checklist Ready';
                    const approvalMessage = `${templateType} checklist is ready for approval.`;
                    const { data: hrRows } = await supabase
                        .from('hris_users')
                        .select('id')
                        .in('role', [Role.HRManager, Role.HRStaff, Role.Admin]);

                    const createdAt = new Date();
                    const notificationRows: Array<{
                        id: string;
                        user_id: string;
                        type: NotificationType;
                        title: string;
                        message: string;
                        link: string;
                        is_read: boolean;
                        created_at: string;
                        related_entity_id: string;
                    }> = [];

                    (hrRows || []).forEach((hr: any) => {
                        notificationRows.push({
                            id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${hr.id}`,
                            user_id: hr.id,
                            type: notificationType,
                            title: approvalTitle,
                            message: approvalMessage,
                            link: `/employees/onboarding/view/${resolvedChecklist.id}?approve=1`,
                            is_read: false,
                            created_at: createdAt.toISOString(),
                            related_entity_id: resolvedChecklist.id,
                        });
                    });
                    if (notificationRows.length > 0) {
                        try {
                            await supabase.from('notifications').insert(notificationRows);
                        } catch (err) {
                            console.warn('Failed to persist HR notifications', err);
                        }
                    }
                }

                setEmployee({
                    id: emp.id,
                    name: formatEmployeeName(emp.full_name || (emp as any).name || 'Unknown'),
                    email: '',
                    role: (emp.role as Role) || Role.Employee,
                    department: '',
                    businessUnit: '',
                    status: 'Active',
                });
            } catch (err) {
                console.error('Failed to load checklist view', err);
                setNotFound(true);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [checklistId, user]);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const wantsApprove = params.get('approve') === '1';
        if (wantsApprove && isReviewer && checklist?.status === 'Pending Approval') {
            setIsApprovalModalOpen(true);
            return;
        }
        setIsApprovalModalOpen(false);
    }, [location.search, isReviewer, checklist?.status]);

    useEffect(() => {
        if (user && employee) {
            const visibleIds = getVisibleEmployeeIds();
            if (!visibleIds.includes(employee.id)) {
                console.warn('Access denied for this checklist. Showing limited view.');
            }
        }
    }, [user, employee, getVisibleEmployeeIds, navigate]);


    if (loading) {
        return <Card><div className="p-6 text-gray-500">Loading...</div></Card>;
    }

    if (notFound || !checklist || !employee) {
        return (
            <Card>
                <div className="text-center py-12">
                    <h2 className="text-xl font-semibold">Checklist Not Found</h2>
                    <Link to="/employees/onboarding" className="mt-4 inline-flex items-center text-indigo-600 hover:text-indigo-800">
                        <ArrowLeftIcon />
                        Back to Onboarding
                    </Link>
                </div>
            </Card>
        );
    }

    const handleDummyUpdate = () => { };

    const handleChecklistStatusUpdate = async (status: 'Approved' | 'Rejected') => {
        if (!checklistId || !checklist) return;
        setIsUpdatingStatus(true);
        try {
            const { error } = await supabase
                .from('onboarding_checklists')
                .update({ status })
                .eq('id', checklistId);
            if (error) throw error;
            setChecklist(prev => (prev ? { ...prev, status } : prev));
            setIsApprovalModalOpen(false);
            setRejectionReason('');
        } catch (err) {
            console.error('Failed to update checklist status', err);
            alert('Failed to update checklist status. Please try again.');
        } finally {
            setIsUpdatingStatus(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <Link to="/employees/onboarding" className="flex items-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-2">
                    <ArrowLeftIcon />
                    Back to Onboarding Dashboard
                </Link>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Onboarding Progress for {employee.name}</h1>
                    {isReviewer && checklist.status === 'Pending Approval' && (
                        <Button onClick={() => setIsApprovalModalOpen(true)}>
                            Review Checklist
                        </Button>
                    )}
                </div>
            </div>
            <AssignedOnboardingChecklist
                checklist={checklist}
                currentUser={employee}
                onUpdateTaskStatus={handleDummyUpdate}
            />
            {isReviewer && (
                <Modal
                    isOpen={isApprovalModalOpen}
                    onClose={() => setIsApprovalModalOpen(false)}
                    title="Review Checklist"
                >
                    <div className="space-y-4">
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                            Approve this checklist if all tasks are verified. Reject if changes are required.
                        </p>
                        <Textarea
                            label="Rejection Reason (optional)"
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            placeholder="Add a reason for rejection..."
                        />
                        <div className="flex justify-end gap-2">
                            <Button
                                variant="secondary"
                                onClick={() => handleChecklistStatusUpdate('Rejected')}
                                isLoading={isUpdatingStatus}
                            >
                                Reject
                            </Button>
                            <Button
                                onClick={() => handleChecklistStatusUpdate('Approved')}
                                isLoading={isUpdatingStatus}
                            >
                                Approve
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default OnboardingViewPage;
