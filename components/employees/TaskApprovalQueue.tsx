import React, { useMemo } from 'react';
import { OnboardingChecklist, OnboardingTask, OnboardingTaskStatus, OnboardingTaskType } from '../../types';
import { mockUsers } from '../../services/mockData';
import Button from '../ui/Button';

interface TaskApprovalQueueProps {
  checklists: OnboardingChecklist[];
  onApprove: (taskId: string) => void;
  onReject: (task: OnboardingTask) => void;
}

const isUrl = (str: string | undefined): boolean => {
    if (!str) return false;
    try {
        new URL(str);
        return str.startsWith('http://') || str.startsWith('https://');
    } catch (_) {
        return false;
    }
};

const TaskApprovalQueue: React.FC<TaskApprovalQueueProps> = ({ checklists, onApprove, onReject }) => {
    const tasksToApprove = useMemo(() => {
        const allTasks: (OnboardingTask & { employeeName: string })[] = [];
        checklists.forEach(cl => {
            const employee = mockUsers.find(u => u.id === cl.employeeId);
            cl.tasks.forEach(task => {
                if (task.status === OnboardingTaskStatus.PendingApproval) {
                    allTasks.push({ ...task, employeeName: employee?.name || 'Unknown' });
                }
            });
        });
        return allTasks.sort((a, b) => new Date(a.submittedAt || 0).getTime() - new Date(b.submittedAt || 0).getTime());
    }, [checklists]);

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                <thead className="bg-slate-50 dark:bg-slate-700/50">
                    <tr>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Task</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">For Employee</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Submitted On</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Submission</th>
                        <th scope="col" className="relative px-4 py-3"><span className="sr-only">Actions</span></th>
                    </tr>
                </thead>
                 <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                    {tasksToApprove.map(task => (
                        <tr key={task.id}>
                            <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{task.name}</td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{task.employeeName}</td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{task.submittedAt ? new Date(task.submittedAt).toLocaleString() : 'N/A'}</td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                {isUrl(task.submissionValue) ? (
                                    <a href={task.submissionValue} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline dark:text-indigo-400">View Link</a>
                                ) : (
                                    <span className="truncate">{task.submissionValue}</span>
                                )}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <div className="flex space-x-2">
                                    <Button size="sm" variant="danger" onClick={() => onReject(task)}>Reject</Button>
                                    <Button size="sm" variant="success" onClick={() => onApprove(task.id)}>Approve</Button>
                                </div>
                            </td>
                        </tr>
                    ))}
                     {tasksToApprove.length === 0 && (
                        <tr>
                            <td colSpan={5} className="text-center py-10 text-gray-500 dark:text-gray-400">
                                The approval queue is empty.
                            </td>
                        </tr>
                    )}
                 </tbody>
            </table>
        </div>
    );
};

export default TaskApprovalQueue;