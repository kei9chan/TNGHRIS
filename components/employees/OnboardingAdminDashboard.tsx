import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { OnboardingChecklist, OnboardingTaskStatus, Role } from '../../types';
import { mockUsers, mockOnboardingTemplates, mockBusinessUnits, mockDepartments } from '../../services/mockData';
import OnboardingStatusBadge from './OnboardingStatusBadge';
import Button from '../ui/Button';
import Input from '../ui/Input';

interface OnboardingAdminDashboardProps {
  checklists: OnboardingChecklist[];
  employees?: { id: string; name: string; role: Role; businessUnit?: string; dateHired?: Date | null }[];
  templates?: { id: string; name: string }[];
}

const ProgressBar: React.FC<{ progress: number }> = ({ progress }) => (
    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5">
        <div className="bg-green-500 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
    </div>
);

const OnboardingAdminDashboard: React.FC<OnboardingAdminDashboardProps> = ({ checklists, employees = [], templates = [] }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [buFilter, setBuFilter] = useState('');
    const [monthFilter, setMonthFilter] = useState('');

    const calculateProgress = (checklist: OnboardingChecklist) => {
        const total = checklist.tasks.reduce((sum, task) => sum + (task.points || 0), 0);
        const completed = checklist.tasks
            .filter(task => task.status === OnboardingTaskStatus.Completed)
            .reduce((sum, task) => sum + (task.points || 0), 0);
        return total > 0 ? (completed / total) * 100 : 0;
    };

    const enrichedChecklists = useMemo(() => {
        return checklists.map(checklist => {
            const employee = employees.find(u => u.id === checklist.employeeId) || mockUsers.find(u => u.id === checklist.employeeId);
            const template = templates.find(t => t.id === checklist.templateId) || mockOnboardingTemplates.find(t => t.id === checklist.templateId);
            const progress = calculateProgress(checklist);
            
            const overdueCount = checklist.tasks.filter(
                t => t.status === OnboardingTaskStatus.Pending && new Date(t.dueDate) < new Date()
            ).length;
            
            const completedTasks = checklist.tasks.filter(t => t.completedAt);
            const lastUpdate = completedTasks.length > 0 
                ? new Date(Math.max(...completedTasks.map(t => new Date(t.completedAt!).getTime())))
                : new Date(checklist.createdAt);

            return {
                ...checklist,
                employeeName: employee?.name || 'N/A',
                employeeRole: employee?.role,
                employeeBU: (employee as any)?.businessUnit,
                employeeHireDate: (employee as any)?.dateHired,
                templateName: template?.name || 'N/A',
                progress,
                overdueCount,
                lastUpdate
            };
        });
    }, [checklists]);

    const filteredChecklists = useMemo(() => {
        return enrichedChecklists.filter(c => {
            const searchMatch = !searchTerm || c.employeeName.toLowerCase().includes(searchTerm.toLowerCase());
            const roleMatch = !roleFilter || c.employeeRole === roleFilter;
            const buMatch = !buFilter || c.employeeBU === buFilter;
            const monthMatch = !monthFilter || (c.employeeHireDate && `${new Date(c.employeeHireDate).getFullYear()}-${String(new Date(c.employeeHireDate).getMonth() + 1).padStart(2, '0')}` === monthFilter);
            return searchMatch && roleMatch && buMatch && monthMatch;
        });
    }, [enrichedChecklists, searchTerm, roleFilter, buFilter, monthFilter]);

    const handleExport = () => {
        const headers = ['Employee Name', 'Role', 'Business Unit', 'Hire Date', 'Onboarding Status', 'Progress (%)', 'Overdue Tasks', 'Last Updated'];
        const rows = filteredChecklists.map(c => [
            `"${c.employeeName}"`,
            c.employeeRole,
            c.employeeBU,
            c.employeeHireDate ? new Date(c.employeeHireDate).toLocaleDateString() : 'N/A',
            c.status,
            c.progress.toFixed(2),
            c.overdueCount,
            c.lastUpdate ? new Date(c.lastUpdate).toLocaleDateString() : 'N/A'
        ].join(','));

        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `onboarding_report_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };


  return (
    <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
            <div className="lg:col-span-2">
                <Input
                    label="Search by Employee"
                    id="search-onboarding-employee"
                    placeholder="Enter employee name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
             <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-400">Filter by Role</label>
                <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                    <option value="">All Roles</option>
                    {Object.values(Role).map(r => <option key={r} value={r}>{r}</option>)}
                </select>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-400">Filter by Business Unit</label>
                <select value={buFilter} onChange={e => setBuFilter(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                    <option value="">All BUs</option>
                    {[...new Set((employees.length ? employees : mockUsers).map(u => (u as any).businessUnit))].filter(Boolean).map(bu => <option key={bu} value={bu}>{bu}</option>)}
                </select>
            </div>
            <Input label="Filter by Hire Month" type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} />
        </div>
        <div className="flex justify-end">
             <Button onClick={handleExport} disabled={filteredChecklists.length === 0}>Export to CSV</Button>
        </div>
        <div className="mt-6 overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
            <thead className="bg-slate-50 dark:bg-slate-700/50">
            <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Employee</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Checklist Template</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Progress</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Overdue</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Last Update</th>
                <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
            </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
            {filteredChecklists.map(checklist => (
                <tr key={checklist.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">{checklist.employeeName}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">{checklist.employeeRole}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{checklist.templateName}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                        <ProgressBar progress={checklist.progress} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <OnboardingStatusBadge status={checklist.status === 'Completed' ? OnboardingTaskStatus.Completed : OnboardingTaskStatus.Pending} />
                    </td>
                     <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                        {checklist.overdueCount > 0 ? (
                            <span className="font-bold text-red-500 dark:text-red-400">{checklist.overdueCount}</span>
                        ) : (
                             <span className="text-gray-500 dark:text-gray-400">0</span>
                        )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {new Date(checklist.lastUpdate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Link to={`/employees/onboarding/view/${checklist.id}`} className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300">
                        View
                    </Link>
                    </td>
                </tr>
                ))}
            </tbody>
        </table>
        {filteredChecklists.length === 0 && (
            <div className="text-center py-10 text-gray-500 dark:text-gray-400">
            No onboarding checklists match the current filters.
            </div>
        )}
        </div>
    </div>
  );
};

export default OnboardingAdminDashboard;
