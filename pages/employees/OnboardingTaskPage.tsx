import React, { useState, useMemo, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { mockOnboardingChecklists, mockUsers, mockAssets } from '../../services/mockData';
import { OnboardingChecklist, OnboardingChecklistTemplate, OnboardingTask, OnboardingTaskStatus, OnboardingTaskType, Role } from '../../types';
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
    const { user } = useAuth();
    const navigate = useNavigate();

    const [submissionValue, setSubmissionValue] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [checklists, setChecklists] = useState<OnboardingChecklist[]>([]);
    const [templates, setTemplates] = useState<OnboardingChecklistTemplate[]>([]);

    useEffect(() => {
        if (!user?.id) return;
        let active = true;
        const loadOnboardingData = async () => {
            try {
                const [{ data: checklistRows, error: checklistError }, { data: templateRows, error: templateError }] =
                    await Promise.all([
                        supabase
                            .from('onboarding_checklists')
                            .select('id, employee_id, template_id, status, created_at, start_date')
                            .eq('employee_id', user.id),
                        supabase
                            .from('onboarding_checklist_templates')
                            .select('id, name, target_role, template_type, tasks'),
                    ]);
                if (checklistError) throw checklistError;
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
                const buildChecklistTasks = (
                    template: OnboardingChecklistTemplate | undefined,
                    employeeId: string,
                    startDateRaw?: string | null
                ): OnboardingTask[] => {
                    if (!template) return [];
                    const startDate = startDateRaw ? new Date(startDateRaw) : new Date();
                    return (template.tasks || []).map((taskTemplate: any) => {
                        const templateTaskId = taskTemplate.id || taskTemplate.name;
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
                            id: `ONBOARDTASK-${employeeId}-${templateTaskId}`,
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
                            taskType: taskTemplate.taskType,
                            readContent: taskTemplate.readContent,
                            requiresApproval: taskTemplate.requiresApproval,
                            assetId: taskTemplate.assetId,
                            assetDescription: taskTemplate.assetDescription,
                        } as OnboardingTask;
                    });
                };

                const mappedChecklists: OnboardingChecklist[] =
                    (checklistRows || []).map((c: any) => ({
                        id: c.id,
                        employeeId: c.employee_id,
                        templateId: c.template_id,
                        createdAt: c.created_at ? new Date(c.created_at) : new Date(),
                        status: (c.status as any) || 'InProgress',
                        tasks: buildChecklistTasks(templateMap.get(c.template_id), c.employee_id, c.start_date),
                        signedAt: undefined,
                    })) || [];
                setChecklists(mappedChecklists);
            } catch (err) {
                console.error('Failed to load onboarding tasks', err);
                setChecklists([...mockOnboardingChecklists]);
            }
        };
        loadOnboardingData();
        return () => {
            active = false;
        };
    }, [user?.id]);

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
            .filter(t => t.status === OnboardingTaskStatus.Completed)
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
    
    const isOwner = task.ownerUserId === user.id;
    const isEmployee = task.employeeId === user.id;
    const canInteract = (isOwner || isEmployee) && task.status !== OnboardingTaskStatus.Completed;
    const asset = (task.taskType === OnboardingTaskType.AssignAsset || task.taskType === OnboardingTaskType.ReturnAsset) && task.assetId ? mockAssets.find(a => a.id === task.assetId) : null;


    const handleComplete = () => {
        let newStatus = OnboardingTaskStatus.Completed;
        let finalSubmissionValue = submissionValue;

        if (task.requiresApproval) {
            newStatus = OnboardingTaskStatus.PendingApproval;
        }

        if (task.taskType === OnboardingTaskType.Upload && file) {
            finalSubmissionValue = file.name;
        }

        const checklistIndex = mockOnboardingChecklists.findIndex(c => c.id === checklist.id);
        if (checklistIndex > -1) {
            const originalChecklist = mockOnboardingChecklists[checklistIndex];
            
            // Create a new tasks array by mapping over the old one
            const updatedTasks = originalChecklist.tasks.map(t => {
                if (t.id === task.id) {
                    // This is the task to update, return a new object
                    return {
                        ...t,
                        status: newStatus,
                        submissionValue: finalSubmissionValue,
                        completedAt: new Date(),
                        submittedAt: task.requiresApproval ? new Date() : undefined,
                        isAcknowledged: task.taskType === OnboardingTaskType.Read || task.taskType === OnboardingTaskType.Video,
                    };
                }
                // Return the original task object if it's not the one we're updating
                return t;
            });

            // Replace the old checklist object in the mock array with a new one
            // This breaks reference equality and ensures useMemo re-calculates on the next page
            mockOnboardingChecklists[checklistIndex] = {
                ...originalChecklist,
                tasks: updatedTasks,
            };


            logActivity(user, 'UPDATE', 'OnboardingTask', task.id, `Completed task '${task.name}'.`);

            const updatedChecklist = mockOnboardingChecklists[checklistIndex];
            const currentTaskIdx = updatedChecklist.tasks.findIndex(t => t.id === task.id);

            // Find the next task that is still pending
            const nextPendingTask = updatedChecklist.tasks.find(
                (t, index) => index > currentTaskIdx && t.status === OnboardingTaskStatus.Pending
            );
            
            if (nextPendingTask) {
                navigate(`/employees/onboarding/task/${nextPendingTask.id}`);
            } else {
                navigate('/employees/onboarding');
            }
            return; 
        }
        
        logActivity(user, 'UPDATE', 'OnboardingTask', task.id, `Completed task '${task.name}'.`);
        navigate('/employees/onboarding');
    };
    
    const handleNavigate = (targetTask: OnboardingTask | null) => {
        if(targetTask) {
            navigate(`/employees/onboarding/task/${targetTask.id}`);
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
                    <Button variant="secondary" onClick={() => handleNavigate(nextTask)} disabled={!nextTask}>
                        Next Task
                    </Button>
                </div>
                {canInteract && (
                    <Button size="lg" onClick={handleComplete}>
                        {task.requiresApproval ? 'Submit for Approval' : 'Mark as Complete'}
                    </Button>
                )}
            </div>
        </div>
    );
};

export default OnboardingTaskPage;
