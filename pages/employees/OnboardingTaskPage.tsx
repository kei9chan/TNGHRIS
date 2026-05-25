import React, { useState, useMemo, useEffect } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { OnboardingChecklist, OnboardingChecklistTemplate, OnboardingTask, OnboardingTaskStatus, OnboardingTaskType, Role, NotificationType } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import FileUploader from '../../components/ui/FileUploader';
import Modal from '../../components/ui/Modal';
import Textarea from '../../components/ui/Textarea';
import { logActivity } from '../../services/auditService';
import { supabase } from '../../services/supabaseClient';

const ArrowLeftIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>;

const OnboardingTaskPage: React.FC = () => {
    const { taskId } = useParams<{ taskId: string }>();
    const location = useLocation();
    const { user } = useAuth();
    const navigate = useNavigate();

    const [submissionValue, setSubmissionValue] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [checklists, setChecklists] = useState<OnboardingChecklist[]>([]);
    const [templates, setTemplates] = useState<OnboardingChecklistTemplate[]>([]);
    const [isLoadingTask, setIsLoadingTask] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);
    
    // Review Actions State
    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
    const [rejectionReasonInput, setRejectionReasonInput] = useState('');

    const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
    const checklistIdParam = searchParams.get('checklistId');
    const employeeIdParam = searchParams.get('employeeId');

    const normalizeTaskType = (value: any): OnboardingTaskType => {
        if (!value) return OnboardingTaskType.Read;
        const raw = String(value).trim();
        const normalized = raw.toLowerCase();
        if (normalized.includes('upload')) return OnboardingTaskType.Upload;
        if (normalized.includes('read')) return OnboardingTaskType.Read;
        if (normalized.includes('video')) return OnboardingTaskType.Video;
        if (normalized.includes('link')) return OnboardingTaskType.SubmitLink;
        if (normalized.includes('assign') && normalized.includes('asset')) return OnboardingTaskType.AssignAsset;
        if (normalized.includes('return') && normalized.includes('asset')) return OnboardingTaskType.ReturnAsset;
        return raw as OnboardingTaskType;
    };

    const normalizeStoredTasks = (rawTasks: any[]): OnboardingTask[] =>
        rawTasks.map((task: any) => {
            const completedAt = task.completedAt ? new Date(task.completedAt) : undefined;
            const submittedAt = task.submittedAt ? new Date(task.submittedAt) : undefined;
            let status = task.status as OnboardingTaskStatus;
            if (submittedAt && status === OnboardingTaskStatus.Pending) {
                status = OnboardingTaskStatus.PendingApproval;
            }
            if (completedAt && status === OnboardingTaskStatus.Pending) {
                status = OnboardingTaskStatus.PendingApproval;
            }
            return {
                ...task,
                taskType: normalizeTaskType(task.taskType),
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

    const buildChecklistTasks = (
        template: OnboardingChecklistTemplate | undefined,
        employeeId: string,
        startDateRaw?: string | null,
        checklistId?: string
    ): OnboardingTask[] => {
        if (!template) return [];
        const startDate = startDateRaw ? new Date(startDateRaw) : new Date();
        return (template.tasks || []).map((taskTemplate: any, idx: number) => {
            const templateTaskId = taskTemplate.id || `tmpl-${idx}`;
            let ownerUserId = '';
            if (taskTemplate.ownerUserId) {
                ownerUserId = taskTemplate.ownerUserId;
            }
            const dueDate = new Date(startDate);
            dueDate.setDate(dueDate.getDate() + (taskTemplate.dueDays || 0));

            return {
                id: checklistId ? `${checklistId}-task-${idx}` : `ONBOARDTASK-${employeeId}-${templateTaskId}`,
                templateTaskId,
                employeeId,
                name: taskTemplate.name,
                description: taskTemplate.description,
                ownerUserId,
                ownerName: 'System',
                videoUrl: taskTemplate.videoUrl,
                dueDate,
                status: OnboardingTaskStatus.Pending,
                points: taskTemplate.points || 0,
                taskType: normalizeTaskType(taskTemplate.taskType),
                readContent: taskTemplate.readContent,
                requiresApproval: taskTemplate.requiresApproval,
                assetId: taskTemplate.assetId,
                assetDescription: taskTemplate.assetDescription,
            } as OnboardingTask;
        });
    };

    const serializeTasksForDb = (tasks: OnboardingTask[]) =>
        tasks.map(task => ({
            ...task,
            dueDate: task.dueDate ? new Date(task.dueDate).toISOString() : null,
            completedAt: task.completedAt ? new Date(task.completedAt).toISOString() : null,
            submittedAt: task.submittedAt ? new Date(task.submittedAt).toISOString() : null,
        }));

    useEffect(() => {
        if (!user?.id && !checklistIdParam) return;
        let active = true;
        const loadOnboardingData = async () => {
            try {
                if (active) setIsLoadingTask(true);
                const checklistQuery = supabase
                    .from('onboarding_checklists')
                    .select('id, employee_id, template_id, status, created_at, start_date, tasks');

                const scopedChecklistQuery = checklistIdParam
                    ? checklistQuery.eq('id', checklistIdParam)
                    : checklistQuery.eq('employee_id', user?.id || '');

                const [{ data: checklistRows, error: checklistError }, { data: templateRows, error: templateError }] =
                    await Promise.all([
                        scopedChecklistQuery,
                        supabase
                            .from('onboarding_checklist_templates')
                            .select('id, name, target_role, template_type, tasks'),
                    ]);
                if (checklistError) {
                    const message = String((checklistError as any)?.message || '').toLowerCase();
                    if (message.includes('tasks')) {
                        const fallbackQuery = checklistIdParam
                            ? supabase
                                  .from('onboarding_checklists')
                                  .select('id, employee_id, template_id, status, created_at, start_date')
                                  .eq('id', checklistIdParam)
                            : supabase
                                  .from('onboarding_checklists')
                                  .select('id, employee_id, template_id, status, created_at, start_date')
                                  .eq('employee_id', user?.id || '');
                        const { data: checklistFallback, error: fallbackError } = await fallbackQuery;
                        if (fallbackError) throw fallbackError;
                        if (!active) return;
                        const mappedTemplates: OnboardingChecklistTemplate[] =
                            (templateRows || []).map((t: any) => ({
                                id: t.id,
                                name: t.name,
                                targetRole: (t.target_role as Role) || Role.Employee,
                                templateType: t.template_type || 'Onboarding',
                                tasks: Array.isArray(t.tasks) ? t.tasks : [],
                            }));
                        setTemplates(mappedTemplates);
                        const templateMap = new Map(mappedTemplates.map(t => [t.id, t]));
                        const mappedChecklists: OnboardingChecklist[] =
                            (checklistFallback || []).map((c: any) => {
                                const resolvedEmployeeId = c.employee_id || employeeIdParam || user?.id || '';
                                return {
                                    id: c.id,
                                    employeeId: resolvedEmployeeId,
                                    templateId: c.template_id,
                                    createdAt: c.created_at ? new Date(c.created_at) : new Date(),
                                    status: (c.status as any) || 'InProgress',
                                    tasks: buildChecklistTasks(templateMap.get(c.template_id), resolvedEmployeeId, c.start_date, c.id),
                                    signedAt: undefined,
                                };
                            }) || [];
                        setChecklists(mappedChecklists);
                        return;
                    }
                    throw checklistError;
                }
                if (templateError) throw templateError;
                if (!active) return;

                const mappedTemplates: OnboardingChecklistTemplate[] =
                    (templateRows || []).map((t: any) => ({
                        id: t.id,
                        name: t.name,
                        targetRole: (t.target_role as Role) || Role.Employee,
                        templateType: t.template_type || 'Onboarding',
                        tasks: Array.isArray(t.tasks) ? t.tasks : [],
                    }));
                setTemplates(mappedTemplates);

                const templateMap = new Map(mappedTemplates.map(t => [t.id, t]));

                let resolvedChecklistRows = checklistRows || [];

                const mappedChecklists: OnboardingChecklist[] =
                    (resolvedChecklistRows || []).map((c: any) => {
                        const resolvedEmployeeId = c.employee_id || employeeIdParam || user?.id || '';
                        const builtTasks = buildChecklistTasks(templateMap.get(c.template_id), resolvedEmployeeId, c.start_date, c.id);
                        const storedTasks = parseStoredTasks(c.tasks);
                        const resolvedTasks = storedTasks.length > 0 ? storedTasks : builtTasks;
                        return {
                        id: c.id,
                        employeeId: resolvedEmployeeId,
                        templateId: c.template_id,
                        createdAt: c.created_at ? new Date(c.created_at) : new Date(),
                        status: (c.status as any) || 'InProgress',
                        tasks: resolvedTasks,
                        signedAt: undefined,
                    };
                }) || [];
                setChecklists(mappedChecklists);

                const tasksToPersist = (resolvedChecklistRows || [])
                    .filter((row: any) => !Array.isArray(row.tasks) || row.tasks.length === 0)
                    .map((row: any) => ({
                        id: row.id,
                        tasks: serializeTasksForDb(
                            buildChecklistTasks(
                                templateMap.get(row.template_id),
                                row.employee_id || employeeIdParam || user?.id || '',
                                row.start_date,
                                row.id
                            )
                        ),
                    }))
                    .filter((row: any) => row.tasks.length > 0);
                if (tasksToPersist.length > 0) {
                    await Promise.all(tasksToPersist.map((row: any) =>
                        supabase.from('onboarding_checklists').update({ tasks: row.tasks }).eq('id', row.id)
                    ));
                }
            } catch (err) {
                console.error('Failed to load onboarding tasks', err);
                setChecklists([]);
            } finally {
                if (active) setIsLoadingTask(false);
            }
        };
        loadOnboardingData();
        return () => {
            active = false;
        };
    }, [user?.id, checklistIdParam, employeeIdParam]);

    const { checklist, task } = useMemo(() => {
        if (!taskId) return { checklist: null, task: null };
        for (const cl of checklists) {
            const t = cl.tasks.find(task => task.id === taskId || task.templateTaskId === taskId);
            if (t) {
                return { checklist: cl, task: t };
            }
        }
        return { checklist: null, task: null };
    }, [taskId, checklists]);

    const { progress, completedPoints, totalPoints } = useMemo(() => {
        if (!checklist) {
            return { progress: 0, completedPoints: 0, totalPoints: 0 };
        }
        const total = checklist.tasks.reduce((sum, t) => sum + (t.points || 0), 0);
        const completed = checklist.tasks
            .filter(
                t =>
                    t.status === OnboardingTaskStatus.Completed ||
                    t.status === OnboardingTaskStatus.PendingApproval
            )
            .reduce((sum, t) => sum + (t.points || 0), 0);
        const progressPercentage = total > 0 ? (completed / total) * 100 : 0;
        return { progress: progressPercentage, completedPoints: completed, totalPoints: total };
    }, [checklist]);

    const currentTaskIndex = useMemo(() => {
        if (!checklist || !task) return -1;
        return checklist.tasks.findIndex(t => t.id === task.id);
    }, [checklist, task]);

    const previousTask = useMemo(() => {
        if (!checklist || currentTaskIndex <= 0) return null;
        return checklist.tasks[currentTaskIndex - 1];
    }, [checklist, currentTaskIndex]);

    const nextTask = useMemo(() => {
        if (!checklist || currentTaskIndex >= checklist.tasks.length - 1) return null;
        return checklist.tasks[currentTaskIndex + 1];
    }, [checklist, currentTaskIndex]);


    useEffect(() => {
        if (task) {
            setSubmissionValue(task.submissionValue || '');
        }
    }, [task]);

    if (isLoadingTask) {
        return (
            <Card>
                <div className="p-6 text-gray-500">Loading task...</div>
            </Card>
        );
    }

    if (!task || !checklist || !user) {
        return (
            <Card>
                <div className="text-center py-12">
                    <h2 className="text-xl font-semibold">Task Not Found</h2>
                    <p className="mt-2">The task you are looking for does not exist or you do not have permission to view it.</p>
                    <Link to="/employees/onboarding" className="mt-4 inline-flex items-center text-indigo-600 hover:text-indigo-800">
                        <ArrowLeftIcon />
                        Back to My Checklist
                    </Link>
                </div>
            </Card>
        );
    }
    
    const isOwner = user?.id === task?.ownerUserId;
    const isEmployee = user?.id === checklist?.employeeId;
    const isReviewer = user?.role === Role.Admin || user?.role === Role.HRManager || user?.role === Role.HRStaff;
    const canReviewTask = isReviewer || isOwner;

    const canInteract = (isEmployee || (isOwner && isReviewer)) && 
        task.status !== OnboardingTaskStatus.Completed && 
        task.status !== OnboardingTaskStatus.PendingApproval;
    const asset: any = null; // Removed mockAssets fallback


    const handleTaskAction = async (action: 'Approved' | 'Rejected' | 'Refiled') => {
        setErrorMessage('');
        if (!task || !checklist || !user) return;
        
        setIsUpdating(true);
        try {
            let newStatus = task.status;
            let rejectReason = task.rejectionReason;
            
            if (action === 'Approved') {
                newStatus = OnboardingTaskStatus.Completed;
            } else if (action === 'Rejected') {
                newStatus = OnboardingTaskStatus.Rejected;
                rejectReason = rejectionReasonInput;
            } else if (action === 'Refiled') {
                newStatus = OnboardingTaskStatus.PendingApproval;
                rejectReason = undefined;
            }

            const updatedTasks = checklist.tasks.map(t => {
                if (t.id === task.id) {
                    return {
                        ...t,
                        status: newStatus,
                        rejectionReason: rejectReason,
                        approvedBy: action === 'Approved' ? user.id : t.approvedBy,
                        approvedAt: action === 'Approved' ? new Date().toISOString() : t.approvedAt,
                        submittedAt: action === 'Refiled' ? new Date().toISOString() : t.submittedAt,
                    };
                }
                return t;
            });

            // Check if all tasks are completed
            const allCompleted = updatedTasks.every(t => t.status === OnboardingTaskStatus.Completed);
            const anyRejected = updatedTasks.some(t => t.status === OnboardingTaskStatus.Rejected);

            let newChecklistStatus = checklist.status;
            if (allCompleted) {
                newChecklistStatus = 'Approved'; // Or Completed
            } else if (anyRejected) {
                newChecklistStatus = 'InProgress';
            }

            const updates: Record<string, any> = {
                tasks: updatedTasks.map(t => ({
                    ...t,
                    dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
                    completedAt: t.completedAt ? new Date(t.completedAt).toISOString() : null,
                    submittedAt: t.submittedAt ? new Date(t.submittedAt).toISOString() : null,
                })),
                status: newChecklistStatus,
            };

            const { error } = await supabase
                .from('onboarding_checklists')
                .update(updates)
                .eq('id', checklist.id);
                
            if (error) throw error;

            // Notify
            try {
                if (action === 'Rejected' || action === 'Approved') {
                    const title = action === 'Approved' ? `✅ Task Approved` : `❌ Task Rejected`;
                    const message = action === 'Approved'
                        ? `Your task "${task.name}" has been approved by ${user.name}.`
                        : `Your task "${task.name}" has been rejected. Reason: ${rejectReason}`;
                        
                    await supabase.from('notifications').insert({
                        id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${checklist.employeeId}`,
                        user_id: checklist.employeeId,
                        type: NotificationType.GENERAL,
                        title,
                        message,
                        link: `/employees/onboarding/task/${task.id}?checklistId=${checklist.id}&employeeId=${checklist.employeeId}`,
                        is_read: false,
                        created_at: new Date().toISOString(),
                        related_entity_id: checklist.id,
                    });
                } else if (action === 'Refiled') {
                    // Notify HR/Reviewers
                    const { data: hrRows } = await supabase.from('hris_users').select('id').in('role', [Role.HRManager, Role.HRStaff, Role.Admin]);
                    const notifications = (hrRows || []).map(hr => ({
                        id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${hr.id}`,
                        user_id: hr.id,
                        type: NotificationType.GENERAL,
                        title: `🔄 Task Refiled`,
                        message: `The task "${task.name}" has been refiled and is waiting for your review.`,
                        link: `/employees/onboarding/task/${task.id}?checklistId=${checklist.id}&employeeId=${checklist.employeeId}`,
                        is_read: false,
                        created_at: new Date().toISOString(),
                        related_entity_id: checklist.id,
                    }));
                    if (notifications.length > 0) {
                        await supabase.from('notifications').insert(notifications);
                    }
                }
            } catch (notifyErr) {
                console.warn('Failed to notify regarding task action', notifyErr);
            }

            logActivity(user, 'UPDATE', 'OnboardingTask', task.id, `${action} task '${task.name}'.`);
            
            const updatedChecklist = { ...checklist, status: newChecklistStatus, tasks: updatedTasks };
            setChecklists(prev => prev.map(c => c.id === updatedChecklist.id ? updatedChecklist : c));
            setIsRejectModalOpen(false);
            setRejectionReasonInput('');
            
        } catch (err) {
            console.error(`Failed to ${action} task`, err);
            setErrorMessage(`Failed to perform action. Please try again.`);
        } finally {
            setIsUpdating(false);
        }
    };

    const handleComplete = async () => {
        setErrorMessage('');
        if (!task || !checklist || !user) return;
        if (task.taskType === OnboardingTaskType.Upload && !file && !task.submissionValue) {
            setErrorMessage('Please upload a file before marking this task as complete.');
            return;
        }

        let newStatus = OnboardingTaskStatus.PendingApproval;
        let finalSubmissionValue = submissionValue;

        setIsUpdating(true);

        if (task.taskType === OnboardingTaskType.Upload && file) {
            try {
                const fileExt = file.name.split('.').pop();
                const fileName = `${task.id}-${Date.now()}.${fileExt}`;
                const path = `onboarding/${fileName}`;
                
                let successBucket = 'recruitment-uploads';
                let uploadResponse = await supabase.storage.from('recruitment-uploads').upload(path, file, { upsert: false });
                
                if (uploadResponse.error) {
                    console.warn('Failed to upload to recruitment-uploads, trying generic attachments...', uploadResponse.error);
                    successBucket = 'attachments';
                    uploadResponse = await supabase.storage.from('attachments').upload(path, file, { upsert: false });
                }

                if (uploadResponse.error) {
                    setErrorMessage('Failed to upload file. Please try again or contact support.');
                    setIsUpdating(false);
                    return;
                }

                const { data } = supabase.storage.from(successBucket).getPublicUrl(path);
                finalSubmissionValue = data.publicUrl;
            } catch (err) {
                console.error('File upload error', err);
                setErrorMessage('An unexpected error occurred during file upload.');
                setIsUpdating(false);
                return;
            }
        }

        const indexMatch = task.id.match(/-task-(\d+)$/);
        const taskIndexFromId = indexMatch ? Number(indexMatch[1]) : null;

        const updatedChecklists = checklists.map(list => {
            if (list.id !== checklist.id) return list;
            const updatedTasks = list.tasks.map((t, idx) => {
                const matchesTask =
                    t.id === task.id ||
                    (t.templateTaskId && t.templateTaskId === task.templateTaskId) ||
                    t.name === task.name ||
                    (taskIndexFromId !== null && idx === taskIndexFromId);
                if (!matchesTask) return t;
                return {
                    ...t,
                    status: newStatus,
                    submissionValue: finalSubmissionValue,
                    completedAt: new Date(),
                    submittedAt: new Date(),
                    isAcknowledged: task.taskType === OnboardingTaskType.Read || task.taskType === OnboardingTaskType.Video,
                    rejectionReason: undefined,
                };
            });
            return { ...list, tasks: updatedTasks };
        });

        const shouldMarkChecklistPending = (tasks: OnboardingTask[]) =>
            tasks.length > 0 &&
            tasks.every(
                t =>
                    t.status === OnboardingTaskStatus.Completed ||
                    t.status === OnboardingTaskStatus.PendingApproval
            );

        const updatedChecklistsWithStatus = updatedChecklists.map(list => {
            if (list.id !== checklist.id) return list;
            if (!shouldMarkChecklistPending(list.tasks)) return list;
            return { ...list, status: 'Pending Approval' };
        });

        setChecklists(updatedChecklistsWithStatus);

        const updatedChecklist = updatedChecklistsWithStatus.find(c => c.id === checklist.id) || checklist;

        const persistTaskUpdate = async () => {
            try {
                const { data: latestRow, error: latestError } = await supabase
                    .from('onboarding_checklists')
                    .select('id, tasks, status')
                    .eq('id', updatedChecklist.id)
                    .maybeSingle();
                if (latestError) throw latestError;

                const latestTasks = parseStoredTasks(latestRow?.tasks);
                const taskIndexMatch = task.id.match(/-task-(\d+)$/);
                const taskIndexFromId = taskIndexMatch ? Number(taskIndexMatch[1]) : null;

                const mergedTasks =
                    latestTasks.length > 0
                        ? latestTasks.map((t, idx) => {
                              const matchesTask =
                                  t.id === task.id ||
                                  (t.templateTaskId && t.templateTaskId === task.templateTaskId) ||
                                  t.name === task.name ||
                                  (taskIndexFromId !== null && idx === taskIndexFromId);
                              if (!matchesTask) return t;
                              return {
                                  ...t,
                                  status: newStatus,
                                  submissionValue: finalSubmissionValue,
                                  completedAt: new Date(),
                                  submittedAt: new Date(),
                                  isAcknowledged: task.taskType === OnboardingTaskType.Read || task.taskType === OnboardingTaskType.Video,
                                  rejectionReason: undefined,
                              };
                          })
                        : updatedChecklist.tasks;

                const updates: Record<string, any> = {
                    tasks: serializeTasksForDb(mergedTasks),
                };
                if (shouldMarkChecklistPending(mergedTasks)) {
                    updates.status = 'Pending Approval';
                }
                const { error } = await supabase
                    .from('onboarding_checklists')
                    .update(updates)
                    .eq('id', updatedChecklist.id);
                if (error) throw error;
            } catch (err) {
                console.warn('Failed to persist onboarding task update', err);
            }
        };

        const notifyHrIfNeeded = async () => {
            const allSubmitted = shouldMarkChecklistPending(updatedChecklist.tasks);
            const alreadyPending = checklist.status === 'Pending Approval' || checklist.status === 'Approved';
            if (!allSubmitted || alreadyPending) return;
            const templateType =
                templates.find(t => t.id === updatedChecklist.templateId)?.templateType || 'Onboarding';
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
                .select('id, role, full_name')
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
                    link: `/employees/onboarding/view/${updatedChecklist.id}?approve=1`,
                    is_read: false,
                    created_at: createdAt.toISOString(),
                    related_entity_id: updatedChecklist.id,
                });
            });

            if (notificationRows.length > 0) {
                try {
                    await supabase.from('notifications').insert(notificationRows);
                } catch (err) {
                    console.warn('Failed to persist HR notifications', err);
                }
            }
        };

        try {
            await persistTaskUpdate();
            await notifyHrIfNeeded();

            const { data: refreshedRow, error: refreshError } = await supabase
                .from('onboarding_checklists')
                .select('id, tasks, status')
                .eq('id', updatedChecklist.id)
                .maybeSingle();
            if (!refreshError && refreshedRow?.tasks) {
                const refreshedTasks = parseStoredTasks(refreshedRow.tasks);
                const refreshedTask = refreshedTasks.find(t => t.id === task.id);
                if (refreshedTask && (refreshedTask.status === OnboardingTaskStatus.Pending || refreshedTask.status === OnboardingTaskStatus.Rejected)) {
                    const forcedTasks = refreshedTasks.map(t =>
                        t.id === task.id
                            ? {
                                  ...t,
                                  status: newStatus,
                                  submissionValue: finalSubmissionValue,
                                  completedAt: new Date(),
                                  submittedAt: new Date(),
                                  isAcknowledged: task.taskType === OnboardingTaskType.Read || task.taskType === OnboardingTaskType.Video,
                                  rejectionReason: undefined,
                              }
                            : t
                    );
                    await supabase
                        .from('onboarding_checklists')
                        .update({
                            tasks: serializeTasksForDb(forcedTasks),
                            status: shouldMarkChecklistPending(forcedTasks) ? 'Pending Approval' : refreshedRow.status,
                        })
                        .eq('id', updatedChecklist.id);
                    refreshedTasks.splice(0, refreshedTasks.length, ...forcedTasks);
                }
                const refreshedChecklist = { ...updatedChecklist, tasks: refreshedTasks, status: refreshedRow.status || updatedChecklist.status };
                setChecklists(prev => prev.map(c => (c.id === refreshedChecklist.id ? refreshedChecklist : c)));

                const currentTaskIdx = refreshedChecklist.tasks.findIndex(t => t.id === task.id);
                const nextPendingTask = refreshedChecklist.tasks.find(
                    (t, index) => index > currentTaskIdx && t.status === OnboardingTaskStatus.Pending
                );
                if (nextPendingTask) {
                    navigate(`/employees/onboarding/task/${nextPendingTask.id}?checklistId=${refreshedChecklist.id}&employeeId=${refreshedChecklist.employeeId}`);
                } else {
                    navigate(`/employees/onboarding/view/${refreshedChecklist.id}`);
                }
            } else {
                const currentTaskIdx = updatedChecklist.tasks.findIndex(t => t.id === task.id);
                const nextPendingTask = updatedChecklist.tasks.find(
                    (t, index) => index > currentTaskIdx && t.status === OnboardingTaskStatus.Pending
                );
                if (nextPendingTask) {
                    navigate(`/employees/onboarding/task/${nextPendingTask.id}?checklistId=${updatedChecklist.id}&employeeId=${updatedChecklist.employeeId}`);
                } else {
                    navigate(`/employees/onboarding/view/${updatedChecklist.id}`);
                }
            }

            logActivity(user, 'UPDATE', 'OnboardingTask', task.id, `Completed task '${task.name}'.`);
        } catch (err) {
            console.warn('Failed to update onboarding task', err);
            setErrorMessage('Failed to update task status. Please try again.');
        } finally {
            setIsUpdating(false);
        }
    };
    
    const handleNavigate = (targetTask: OnboardingTask | null) => {
        if (targetTask && checklist) {
            navigate(`/employees/onboarding/task/${targetTask.id}?checklistId=${checklist.id}&employeeId=${checklist.employeeId}`);
        }
    }

    const renderTaskAction = () => {
        switch(task.taskType) {
            case OnboardingTaskType.Video:
                return (
                    <div className="aspect-w-16 aspect-h-9">
                        <iframe 
                            src={task.videoUrl} 
                            title={task.name} 
                            frameBorder="0" 
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                            allowFullScreen
                            className="w-full h-full rounded-lg"
                        ></iframe>
                    </div>
                );
            case OnboardingTaskType.Read:
                return (
                    <div className="prose dark:prose-invert max-w-none p-4 border rounded-md bg-gray-50 dark:bg-gray-900/50">
                        <div dangerouslySetInnerHTML={{ __html: task.readContent || '' }} />
                    </div>
                );
            case OnboardingTaskType.SubmitLink:
                return <Input label="Submission Link" value={submissionValue} onChange={e => setSubmissionValue(e.target.value)} placeholder="https://..." disabled={!canInteract} />;
            case OnboardingTaskType.Upload: {
                const isTaskOwner = isEmployee;
                const hasSubmission = !!task.submissionValue;
                // Reviewer: only show the submitted file (read-only)
                if (!isTaskOwner && canReviewTask) {
                    if (!hasSubmission) {
                        return <p className="text-gray-500 dark:text-gray-400 italic">No file has been uploaded by the employee yet.</p>;
                    }
                    return <FileUploader onFileUpload={() => {}} existingFileUrl={task.submissionValue} readOnly />;
                }
                // Employee: show upload form (with existing file if already uploaded)
                return <FileUploader onFileUpload={setFile} existingFileUrl={task.submissionValue || undefined} readOnly={!canInteract} />;
            }
            case OnboardingTaskType.AssignAsset:
            case OnboardingTaskType.ReturnAsset:
                 return (
                    <div className="p-4 border rounded-md bg-gray-50 dark:bg-gray-900/50">
                        <h4 className="font-semibold">Asset Details</h4>
                        <p><strong>Asset:</strong> {task.assetDescription || asset?.name || 'N/A'}</p>
                        {asset && <p><strong>Tag:</strong> {asset.assetTag}</p>}
                        <p className="mt-2 text-sm text-gray-500">{task.taskType === OnboardingTaskType.AssignAsset ? 'This asset will be assigned to you by IT.' : 'Please return this asset to your manager or IT department.'}</p>
                    </div>
                 );
            default:
                return <p>This task type has no specific action.</p>;
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-slate-800 dark:bg-slate-700 text-white p-3 rounded-lg mb-6 flex items-center gap-x-2 sm:gap-x-4 sticky top-32 z-10 shadow-lg">
                <Link to="/employees/onboarding" className="flex items-center hover:opacity-80 transition-opacity flex-shrink-0 p-2 -m-2 rounded-full">
                    <ArrowLeftIcon />
                    <span className="ml-1 font-semibold hidden sm:inline">Back</span>
                </Link>
                <div className="w-px h-6 bg-slate-600 hidden sm:block"></div>
                <span className="font-bold flex-shrink-0 hidden md:inline">Progress</span>
                <div className="flex-grow bg-slate-600 rounded-full h-4" title={`${Math.round(progress)}% complete`}>
                    <div className="bg-blue-500 h-4 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                </div>
                <span className="font-mono text-sm flex-shrink-0 w-12 text-center">{Math.round(progress)}%</span>
                <div className="w-px h-6 bg-slate-600 hidden sm:block"></div>
                <span className="font-mono text-sm whitespace-nowrap flex-shrink-0 hidden sm:inline">Points: {completedPoints} / {totalPoints}</span>
            </div>
            {errorMessage && (
                <Card>
                    <div className="p-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
                        {errorMessage}
                    </div>
                </Card>
            )}

            <Card>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{task.name}</h1>
                <p className="mt-2 text-gray-600 dark:text-gray-400">{task.description}</p>
                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-500 dark:text-gray-400">
                    <span><strong>Points:</strong> {task.points}</span>
                    <span><strong>Due:</strong> {new Date(task.dueDate).toLocaleDateString()}</span>
                    <span><strong>Assigned by:</strong> {task.ownerName}</span>
                </div>
            </Card>

            {task.status === OnboardingTaskStatus.Rejected && task.rejectionReason && (
                <Card>
                    <div className="p-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
                        <strong className="block mb-1">Rejection Reason:</strong> 
                        {task.rejectionReason}
                    </div>
                </Card>
            )}

            <Card title="Task Action">
                {renderTaskAction()}
            </Card>
            
            <div className="flex justify-between items-center">
                <div className="flex space-x-2">
                    <Button variant="secondary" onClick={() => handleNavigate(previousTask)} disabled={!previousTask}>
                        Previous Task
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={() => handleNavigate(nextTask)}
                        disabled={!nextTask || task.status === OnboardingTaskStatus.Pending}
                    >
                        Next Task
                    </Button>
                </div>
                <div className="flex space-x-2">
                    {canInteract && !canReviewTask && (
                        <Button size="lg" onClick={handleComplete} isLoading={isUpdating}>
                            {task.status === OnboardingTaskStatus.Rejected 
                                ? 'Refile Task' 
                                : 'Submit for Approval'}
                        </Button>
                    )}
                    {canReviewTask && (task.status === OnboardingTaskStatus.PendingApproval || task.status === OnboardingTaskStatus.Completed) && (
                        <>
                            <Button variant="danger" size="lg" onClick={() => setIsRejectModalOpen(true)} disabled={isUpdating}>
                                Reject
                            </Button>
                            <Button variant="primary" size="lg" onClick={() => handleTaskAction('Approved')} isLoading={isUpdating}>
                                Approve
                            </Button>
                        </>
                    )}
                </div>
            </div>

            <Modal
                isOpen={isRejectModalOpen}
                onClose={() => setIsRejectModalOpen(false)}
                title="Reject Task"
            >
                <div className="space-y-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        Please provide a reason for rejecting this task. The employee will see this reason and can refile the task.
                    </p>
                    <Textarea
                        label="Rejection Reason"
                        value={rejectionReasonInput}
                        onChange={(e) => setRejectionReasonInput(e.target.value)}
                        placeholder="e.g., The uploaded file is blurry. Please re-upload a clear copy."
                        rows={4}
                        required
                    />
                    <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <Button variant="secondary" onClick={() => setIsRejectModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button 
                            variant="danger" 
                            onClick={() => handleTaskAction('Rejected')} 
                            isLoading={isUpdating}
                            disabled={!rejectionReasonInput.trim()}
                        >
                            Reject Task
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default OnboardingTaskPage;
