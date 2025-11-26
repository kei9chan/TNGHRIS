import React, { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { mockOnboardingTemplates, mockUsers } from '../../services/mockData';
import { OnboardingChecklist, OnboardingTask, OnboardingTaskStatus, Role, User } from '../../types';
import AssignedOnboardingChecklist from '../../components/employees/AssignedOnboardingChecklist';
import Card from '../../components/ui/Card';

const ArrowLeftIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>;

const OnboardingPreviewPage: React.FC = () => {
    const { templateId } = useParams<{ templateId: string }>();

    const mockEmployee: User = useMemo(() => ({
        id: 'preview-user-123',
        name: 'Jane Doe (Preview)',
        email: 'preview@example.com',
        role: Role.Employee,
        department: 'Operations',
        businessUnit: 'Stimetology, Inc.',
        status: 'Active',
        isPhotoEnrolled: true,
        dateHired: new Date(),
        position: 'Operations Staff',
        managerId: '2', // Peter Jones
    }), []);

    const previewChecklist = useMemo<OnboardingChecklist | null>(() => {
        if (!templateId) return null;

        const template = mockOnboardingTemplates.find(t => t.id === templateId);
        if (!template) return null;

        const checklist: OnboardingChecklist = {
            id: `PREVIEW-${template.id}`,
            employeeId: mockEmployee.id,
            templateId: template.id,
            createdAt: new Date(),
            // FIX: Added the missing 'status' property to satisfy the OnboardingChecklist type.
            status: 'InProgress',
            tasks: template.tasks.map(taskTemplate => {
                let ownerUserId = '';
                if (taskTemplate.ownerRole === Role.Manager && mockEmployee.managerId) {
                    ownerUserId = mockEmployee.managerId;
                } else {
                    const owner = mockUsers.find(u => u.role === taskTemplate.ownerRole);
                    ownerUserId = owner?.id || 'system-user';
                }

                const ownerUser = mockUsers.find(u => u.id === ownerUserId);
                const ownerName = ownerUser ? ownerUser.name : 'System';

                const dueDate = new Date(mockEmployee.dateHired!);
                dueDate.setDate(dueDate.getDate() + taskTemplate.dueDays);

                // FIX: Added missing properties to satisfy the OnboardingTask type.
                const newTask: OnboardingTask = {
                    id: `PREVIEWTASK-${taskTemplate.id}`,
                    templateTaskId: taskTemplate.id,
                    employeeId: mockEmployee.id,
                    name: taskTemplate.name,
                    description: taskTemplate.description,
                    ownerUserId: ownerUserId,
                    ownerName: ownerName,
                    dueDate: dueDate,
                    status: OnboardingTaskStatus.Pending,
                    points: taskTemplate.points,
                    taskType: taskTemplate.taskType,
                    videoUrl: taskTemplate.videoUrl,
                    readContent: taskTemplate.readContent,
                    requiresApproval: taskTemplate.requiresApproval,
                    assetId: taskTemplate.assetId,
                    assetDescription: taskTemplate.assetDescription,
                };
                return newTask;
            }),
        };
        return checklist;
    }, [templateId, mockEmployee]);

    if (!previewChecklist) {
        return (
            <Card>
                <div className="text-center py-12">
                    <h2 className="text-xl font-semibold">Template Not Found</h2>
                    <p className="mt-2">The specified onboarding template could not be found.</p>
                    <Link to="/employees/onboarding" className="mt-4 inline-flex items-center text-indigo-600 hover:text-indigo-800">
                        <ArrowLeftIcon />
                        Back to Template Management
                    </Link>
                </div>
            </Card>
        );
    }
    
    const handleDummyUpdate = (taskId: string, status: OnboardingTaskStatus) => {
        console.log(`(Preview) Task ${taskId} status changed to ${status}`);
        // This is a preview, so we don't persist state changes.
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                     <Link to="/employees/onboarding" className="flex items-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-2">
                        <ArrowLeftIcon />
                        Back to Template Management
                    </Link>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Live Preview: {mockOnboardingTemplates.find(t=>t.id === previewChecklist.templateId)?.name}</h1>
                    <p className="text-gray-500 dark:text-gray-400">This is how the onboarding journey will appear to an employee assigned this template.</p>
                </div>
            </div>
            <AssignedOnboardingChecklist 
                checklist={previewChecklist} 
                currentUser={mockEmployee} 
                onUpdateTaskStatus={handleDummyUpdate}
            />
        </div>
    );
};

export default OnboardingPreviewPage;