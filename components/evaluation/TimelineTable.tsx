import React from 'react';
import { EvaluationTimeline, TimelineStatus, Permission } from '../../types';
import Button from '../ui/Button';
import { usePermissions } from '../../hooks/usePermissions';

interface TimelineTableProps {
    timelines: EvaluationTimeline[];
    onEdit: (timeline: EvaluationTimeline) => void;
    onDelete: (timelineId: string) => void;
}

const getStatusColor = (status: TimelineStatus) => {
    switch(status) {
        case TimelineStatus.Active: return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200';
        case TimelineStatus.Completed: return 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200';
        case TimelineStatus.Draft:
        default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
};

const TimelineTable: React.FC<TimelineTableProps> = ({ timelines, onEdit, onDelete }) => {
    const { can } = usePermissions();
    const canManage = can('Evaluation', Permission.Manage);

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-slate-900/50">
                    <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Name</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Rollout Date</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">End Date</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                        {canManage && <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>}
                    </tr>
                </thead>
                <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {timelines.map(timeline => (
                        <tr key={timeline.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{timeline.name}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{timeline.type}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(timeline.rolloutDate).toLocaleDateString()}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(timeline.endDate).toLocaleDateString()}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(timeline.status)}`}>
                                    {timeline.status}
                                </span>
                            </td>
                            {canManage && (
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <div className="flex space-x-2 justify-end">
                                        <Button variant="secondary" size="sm" onClick={() => onEdit(timeline)}>Edit</Button>
                                        <Button variant="danger" size="sm" onClick={() => onDelete(timeline.id)}>Delete</Button>
                                    </div>
                                </td>
                            )}
                        </tr>
                    ))}
                    {timelines.length === 0 && (
                        <tr>
                            <td colSpan={canManage ? 6 : 5} className="text-center py-10 text-gray-500 dark:text-gray-400">
                                No timelines found for this business unit.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default TimelineTable;