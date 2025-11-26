import React, { useMemo, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { mockOnboardingChecklists, mockUsers } from '../../services/mockData';
import AssignedOnboardingChecklist from '../../components/employees/AssignedOnboardingChecklist';
import Card from '../../components/ui/Card';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';

const ArrowLeftIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>;

const OnboardingViewPage: React.FC = () => {
    const { checklistId } = useParams<{ checklistId: string }>();
    const { user } = useAuth();
    const { getVisibleEmployeeIds } = usePermissions();
    const navigate = useNavigate();

    const { checklist, employee } = useMemo(() => {
        const foundChecklist = mockOnboardingChecklists.find(c => c.id === checklistId);
        if (!foundChecklist) return { checklist: null, employee: null };

        const foundEmployee = mockUsers.find(u => u.id === foundChecklist.employeeId);
        return { checklist: foundChecklist, employee: foundEmployee };
    }, [checklistId]);

    useEffect(() => {
        if (user && employee) {
            const visibleIds = getVisibleEmployeeIds();
            if (!visibleIds.includes(employee.id)) {
                // This user is not authorized to see this checklist
                navigate('/dashboard', { replace: true, state: { error: 'Access Denied' } });
            }
        }
    }, [user, employee, getVisibleEmployeeIds, navigate]);


    if (!checklist || !employee) {
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