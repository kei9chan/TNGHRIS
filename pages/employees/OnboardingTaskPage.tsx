import React, { useState, useMemo, useEffect } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { mockOnboardingChecklists, mockUsers, mockAssets, mockNotifications } from '../../services/mockData';
import { OnboardingChecklist, OnboardingChecklistTemplate, OnboardingTask, OnboardingTaskStatus, OnboardingTaskType, Role, NotificationType } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import FileUploader from '../../components/ui/FileUploader';
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
                status = task.requiresApproval ? OnboardingTaskStatus.PendingApproval : OnboardingTaskStatus.Completed;
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
            } else if (taskTemplate.ownerRole === Role.Manager) {
                const employee = mockUsers.find(e => e.id === employeeId);
                if (employee?.managerId) {
                    ownerUserId = employee.managerId;
                }
            } else {
                const owner = mockUsers.find(u => u.role === taskTemplate.ownerRole);
                if (owner) ownerUserId = owner.id;
            }
            const ownerUser = mockUsers.find(u => u.id === ownerUserId);
            const dueDate = new Date(startDate);
            dueDate.setDate(dueDate.getDate() + (taskTemplate.dueDays || 0));

            return {
                id: checklistId ? `${checklistId}-task-${idx}` : `ONBOARDTASK-${employeeId}-${templateTaskId}`,
                templateTaskId,
                employeeId,
                name: taskTemplate.name,
                description: taskTemplate.description,
                ownerUserId,
                ownerName: ownerUser ? ownerUser.name : 'System',
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
                if (checklistIdParam && resolvedChecklistRows.length === 0) {
                    const fallbackChecklist = mockOnboardingChecklists.find(c => c.id === checklistIdParam);
                    if (fallbackChecklist) {
                        resolvedChecklistRows = [
                            {
                                id: fallbackChecklist.id,
                                employee_id: fallbackChecklist.employeeId,
                                template_id: fallbackChecklist.templateId,
                                status: fallbackChecklist.status,
                                created_at: fallbackChecklist.createdAt?.toISOString() || null,
                                start_date: undefined,
                            },
                        ] as any;
                    }
                }

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
                    await supabase.from('onboarding_checklists').upsert(tasksToPersist, { onConflict: 'id' });
                }
            } catch (err) {
                console.error('Failed to load onboarding tasks', err);
                setChecklists([...mockOnboardingChecklists]);
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
    
    const isOwner = task.ownerUserId === user.id || (user.authUserId && task.ownerUserId === user.authUserId);
    const isEmployee =
        task.employeeId === user.id ||
        (user.authUserId ? task.employeeId === user.authUserId : false);
    const isReviewer =
        user.role === Role.Admin ||
        user.role === Role.HRManager ||
        user.role === Role.HRStaff;
    const canInteract = (isOwner || isEmployee || isReviewer) && task.status !== OnboardingTaskStatus.Completed;
    const asset = (task.taskType === OnboardingTaskType.AssignAsset || task.taskType === OnboardingTaskType.ReturnAsset) && task.assetId ? mockAssets.find(a => a.id === task.assetId) : null;


    const handleComplete = async () => {
        setErrorMessage('');
        if (!task || !checklist || !user) return;
        if (task.taskType === OnboardingTaskType.Upload && !file) {
            setErrorMessage('Please upload a file before marking this task as complete.');
            return;
        }

        let newStatus = OnboardingTaskStatus.Completed;
        let finalSubmissionValue = submissionValue;

        if (task.requiresApproval) {
            newStatus = OnboardingTaskStatus.PendingApproval;
        }

        if (task.taskType === OnboardingTaskType.Upload && file) {
            finalSubmissionValue = file.name;
        }

        setIsUpdating(true);

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
                    submittedAt: task.requiresApproval ? new Date() : undefined,
                    isAcknowledged: task.taskType === OnboardingTaskType.Read || task.taskType === OnboardingTaskType.Video,
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
        const mockIndex = mockOnboardingChecklists.findIndex(c => c.id === checklist.id);
        if (mockIndex > -1) {
            mockOnboardingChecklists[mockIndex] =
                updatedChecklistsWithStatus.find(c => c.id === checklist.id) || mockOnboardingChecklists[mockIndex];
        }

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
                                  submittedAt: task.requiresApproval ? new Date() : undefined,
                                  isAcknowledged: task.taskType === OnboardingTaskType.Read || task.taskType === OnboardingTaskType.Video,
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
                mockNotifications.unshift({
                    id: `notif-onboard-approval-${updatedChecklist.id}-${hr.id}-${createdAt.getTime()}`,
                    userId: hr.id,
                    type: notificationType,
                    title: approvalTitle,
                    message: approvalMessage,
                    link: `/employees/onboarding/view/${updatedChecklist.id}?approve=1`,
                    isRead: false,
                    createdAt,
                    relatedEntityId: updatedChecklist.id,
                });

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
                if (refreshedTask && refreshedTask.status === OnboardingTaskStatus.Pending) {
                    const forcedTasks = refreshedTasks.map(t =>
                        t.id === task.id
                            ? {
                                  ...t,
                                  status: newStatus,
                                  submissionValue: finalSubmissionValue,
                                  completedAt: new Date(),
                                  submittedAt: task.requiresApproval ? new Date() : undefined,
                                  isAcknowledged: task.taskType === OnboardingTaskType.Read || task.taskType === OnboardingTaskType.Video,
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
            case OnboardingTaskType.Upload:
                return <FileUploader onFileUpload={setFile} />;
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
                {canInteract && (
                    <Button size="lg" onClick={handleComplete} isLoading={isUpdating}>
                        {task.requiresApproval ? 'Submit for Approval' : 'Mark as Complete'}
                    </Button>
                )}
            </div>
        </div>
    );
};

export default OnboardingTaskPage;
