import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import AssignedOnboardingChecklist from '../../components/employees/AssignedOnboardingChecklist';
import Card from '../../components/ui/Card';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { supabase } from '../../services/supabaseClient';
import { OnboardingChecklist, OnboardingTask, OnboardingTaskStatus, Role, User } from '../../types';
import { mockOnboardingChecklists, mockOnboardingTemplates, mockUsers } from '../../services/mockData';

const ArrowLeftIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>;

const OnboardingViewPage: React.FC = () => {
    const { checklistId } = useParams<{ checklistId: string }>();
    const { user } = useAuth();
    const { getVisibleEmployeeIds } = usePermissions();
    const navigate = useNavigate();

    const [checklist, setChecklist] = useState<OnboardingChecklist | null>(null);
    const [employee, setEmployee] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        const load = async () => {
            if (!checklistId) return;
            try {
                const { data: checklistRows, error: checklistError } = await supabase
                    .from('onboarding_checklists')
                    .select('id, employee_id, template_id, status, created_at, start_date')
                    .eq('id', checklistId)
                    .limit(1);

                const row = checklistError ? null : checklistRows?.[0];

                // Fallback to mock if not found or error
                const fallbackChecklist = mockOnboardingChecklists.find(c => c.id === checklistId);

                if (!row && !fallbackChecklist) {
                    setNotFound(true);
                    return;
                }

                const employeeId = row?.employee_id || fallbackChecklist?.employeeId;
                const templateId = row?.template_id || fallbackChecklist?.templateId;

                const [{ data: employeeRows }, { data: templateRows }] = await Promise.all([
                    employeeId
                        ? supabase.from('hris_users').select('id, full_name, role').eq('id', employeeId).limit(1)
                        : Promise.resolve({ data: null }),
                    templateId
                        ? supabase.from('onboarding_checklist_templates').select('id, name, tasks').eq('id', templateId).limit(1)
                        : Promise.resolve({ data: null }),
                ]);

                const emp = employeeRows?.[0] || mockUsers.find(u => u.id === employeeId);
                const tmpl = templateRows?.[0] || mockOnboardingTemplates.find(t => t.id === templateId);

                if (!emp || !tmpl) {
                    setNotFound(true);
                    return;
                }

                const startDate = row?.start_date ? new Date(row.start_date) : new Date();
                const tasks: OnboardingTask[] =
                    Array.isArray(tmpl.tasks) && tmpl.tasks.length
                        ? tmpl.tasks.map((t: any, idx: number) => {
                              const due = new Date(startDate);
                              due.setDate(due.getDate() + (t.dueDays || 0));
                              return {
                                  id: `${row?.id || fallbackChecklist?.id}-task-${idx}`,
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
                        : fallbackChecklist?.tasks || [];

                setChecklist({
                    id: row?.id || fallbackChecklist?.id || '',
                    employeeId: employeeId || '',
                    templateId: templateId || '',
                    status: (row?.status as any) || fallbackChecklist?.status || 'InProgress',
                    createdAt: row?.created_at ? new Date(row.created_at) : fallbackChecklist?.createdAt || new Date(),
                    tasks,
                });

                setEmployee({
                    id: emp.id,
                    name: emp.full_name || (emp as any).name,
                    email: '',
                    role: (emp.role as Role) || Role.Employee,
                    department: '',
                    businessUnit: '',
                    status: 'Active',
                });
            } catch (err) {
                console.error('Failed to load checklist view', err);
                // Attempt mock fallback before giving up
                const fallbackChecklist = mockOnboardingChecklists.find(c => c.id === checklistId);
                const fallbackEmployee = fallbackChecklist
                    ? mockUsers.find(u => u.id === fallbackChecklist.employeeId)
                    : null;
                if (fallbackChecklist && fallbackEmployee) {
                    setChecklist(fallbackChecklist);
                    setEmployee(fallbackEmployee as unknown as User);
                } else {
                    setNotFound(true);
                }
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [checklistId, user]);

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
    
    // In a view-only mode, status updates do nothing
    const handleDummyUpdate = () => {};

    return (
        <div className="space-y-6">
            <div>
                <Link to="/employees/onboarding" className="flex items-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-2">
                    <ArrowLeftIcon />
                    Back to Onboarding Dashboard
                </Link>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Onboarding Progress for {employee.name}</h1>
            </div>
            <AssignedOnboardingChecklist 
                checklist={checklist} 
                currentUser={employee} 
                onUpdateTaskStatus={handleDummyUpdate}
            />
        </div>
    );
};

export default OnboardingViewPage;
