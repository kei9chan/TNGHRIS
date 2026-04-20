import { mockUsers, mockOnboardingChecklists } from '../../services/mockDataCompat';
import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import SignaturePad, { SignaturePadRef } from '../../components/ui/SignaturePad';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { supabase } from '../../services/supabaseClient';
import { OnboardingChecklist, OnboardingChecklistTemplate, OnboardingTask, OnboardingTaskStatus, Role } from '../../types';

const ArrowLeftIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>;

const OnboardingSignPage: React.FC = () => {
    const { checklistId } = useParams<{ checklistId: string }>();
    const { user } = useAuth();
    const navigate = useNavigate();
    const signaturePadRef = useRef<SignaturePadRef>(null);

    const [checklist, setChecklist] = useState<OnboardingChecklist | null>(null);
    const [isLoadingChecklist, setIsLoadingChecklist] = useState(true);

    const [fullName, setFullName] = useState(user?.name || '');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        let active = true;
        const loadChecklist = async () => {
            if (!checklistId) return;
            setIsLoadingChecklist(true);
            try {
                const { data: checklistRows, error: checklistError } = await supabase
                    .from('onboarding_checklists')
                    .select('id, employee_id, template_id, status, created_at, start_date, tasks')
                    .eq('id', checklistId)
                    .limit(1);
                if (checklistError) throw checklistError;
                const row = checklistRows?.[0];
                if (!row) {
                    setChecklist(null);
                    return;
                }

                const { data: templateRows, error: templateError } = await supabase
                    .from('onboarding_checklist_templates')
                    .select('id, name, target_role, template_type, tasks')
                    .eq('id', row.template_id)
                    .limit(1);
                if (templateError) throw templateError;
                const template: OnboardingChecklistTemplate | undefined = templateRows?.[0]
                    ? {
                          id: templateRows[0].id,
                          name: templateRows[0].name,
                          targetRole: (templateRows[0].target_role as Role) || Role.Employee,
                          templateType: templateRows[0].template_type || 'Onboarding',
                          tasks: Array.isArray(templateRows[0].tasks) ? templateRows[0].tasks : [],
                      }
                    : undefined;

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

                const startDate = row.start_date ? new Date(row.start_date) : new Date();
                const templateTasks: OnboardingTask[] = (template?.tasks || []).map((taskTemplate: any) => {
                    const templateTaskId = taskTemplate.id || taskTemplate.name;
                    let ownerUserId = '';
                    if (taskTemplate.ownerUserId) {
                        ownerUserId = taskTemplate.ownerUserId;
                    } else if (taskTemplate.ownerRole === Role.Manager) {
                        const employee = mockUsers.find(e => e.id === row.employee_id);
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
                        id: `ONBOARDTASK-${row.employee_id}-${templateTaskId}`,
                        templateTaskId,
                        employeeId: row.employee_id,
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

                const tasks: OnboardingTask[] =
                    Array.isArray((row as any).tasks) && (row as any).tasks.length > 0
                        ? normalizeStoredTasks((row as any).tasks)
                        : templateTasks;

                if (active) {
                    setChecklist({
                        id: row.id,
                        employeeId: row.employee_id,
                        templateId: row.template_id,
                        createdAt: row.created_at ? new Date(row.created_at) : new Date(),
                        status: (row.status as any) || 'InProgress',
                        tasks,
                        signedAt: undefined,
                    });
                }
            } catch (err) {
                console.error('Failed to load onboarding checklist for sign page', err);
                setChecklist(null);
            } finally {
                if (active) setIsLoadingChecklist(false);
            }
        };
        loadChecklist();
        return () => {
            active = false;
        };
    }, [checklistId]);

    if (isLoadingChecklist) {
        return <div className="p-4">Loading checklist...</div>;
    }

    if (!checklist) {
        return <div className="p-4">Onboarding checklist not found.</div>;
    }
    if (checklist.status !== 'Approved' && checklist.status !== 'Completed') {
        return (
            <div className="p-4">
                <Card>
                    <div className="text-center py-8">
                        <h2 className="text-xl font-semibold">Checklist Pending Approval</h2>
                        <p className="mt-2 text-gray-600 dark:text-gray-400">
                            Your checklist is awaiting HR/admin approval before you can sign.
                        </p>
                        <Link to="/employees/onboarding" className="mt-4 inline-flex items-center text-indigo-600 hover:text-indigo-800">
                            <ArrowLeftIcon />
                            Back to Onboarding
                        </Link>
                    </div>
                </Card>
            </div>
        );
    }

    const handleAcceptAndSign = () => {
        if (!fullName.trim() || signaturePadRef.current?.isEmpty()) {
            alert("Please provide your full name and signature.");
            return;
        }

        setIsLoading(true);
        
        const signatureDataUrl = signaturePadRef.current?.getSignatureDataUrl();

        const persistCompletion = async () => {
            try {
                const { error } = await supabase
                    .from('onboarding_checklists')
                    .update({ status: 'Completed' })
                    .eq('id', checklist.id);
                if (error) throw error;
            } catch (err) {
                console.warn('Failed to persist onboarding completion', err);
            }

            const checklistIndex = mockOnboardingChecklists.findIndex(c => c.id === checklist.id);
            if (checklistIndex !== -1) {
                mockOnboardingChecklists[checklistIndex] = {
                    ...mockOnboardingChecklists[checklistIndex],
                    status: 'Completed',
                    signatureName: fullName,
                    signatureDataUrl: signatureDataUrl || undefined,
                    signedAt: new Date(),
                };
            }
        };

        persistCompletion()
            .then(() => {
                setIsLoading(false);
                navigate('/employees/onboarding');
            })
            .catch(() => {
                setIsLoading(false);
                navigate('/employees/onboarding');
            });
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <Link to="/employees/onboarding" className="flex items-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                <ArrowLeftIcon />
                <span className="ml-2 font-medium">Back to Onboarding Journey</span>
            </Link>
            <Card>
                <div className="text-center">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Final Acknowledgement</h1>
                    <p className="mt-2 text-gray-600 dark:text-gray-400">Please review your completed tasks and sign below to finalize your onboarding process.</p>
                </div>
            </Card>

            <Card title="Completed Task Summary">
                <ul className="divide-y divide-gray-200 dark:divide-gray-700 max-h-60 overflow-y-auto">
                    {checklist.tasks.map(task => (
                        <li key={task.id} className="py-3 flex justify-between items-center">
                            <p className="font-medium text-gray-800 dark:text-gray-200">{task.name}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Completed on: {task.completedAt ? new Date(task.completedAt).toLocaleDateString() : 'N/A'}
                            </p>
                        </li>
                    ))}
                </ul>
            </Card>

            <Card title="Acknowledgement & Signature">
                <div className="space-y-6">
                    <Input 
                        label="Full Name"
                        id="full-name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                    />
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Digital Signature</label>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Type your name or draw your signature below.</p>
                        <SignaturePad ref={signaturePadRef} />
                    </div>

                    <div className="p-4 bg-gray-100 dark:bg-gray-700/50 rounded-lg text-sm text-gray-700 dark:text-gray-300">
                        By signing, you confirm that you have completed all assigned onboarding tasks and acknowledge receipt of all company policies provided.
                    </div>
                </div>
            </Card>
            
            <div className="flex justify-end">
                <Button size="lg" onClick={handleAcceptAndSign} isLoading={isLoading}>
                    Accept & Sign
                </Button>
            </div>
        </div>
    );
};

export default OnboardingSignPage;
