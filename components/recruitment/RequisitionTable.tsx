import React from 'react';
import { JobRequisition, JobRequisitionStatus, ApplicationStage } from '../../types';
import Button from '../ui/Button';
import { mockDepartments, mockBusinessUnits, mockApplications } from '../../services/mockData';

interface RequisitionTableProps {
    requisitions: JobRequisition[];
    onEdit: (requisition: JobRequisition) => void;
}

const getStatusColor = (status: JobRequisitionStatus) => {
    switch (status) {
        case JobRequisitionStatus.Approved: return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300';
        case JobRequisitionStatus.PendingApproval: return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300';
        case JobRequisitionStatus.Rejected: return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300';
        case JobRequisitionStatus.Closed: return 'bg-gray-500 text-white dark:bg-gray-700';
        case JobRequisitionStatus.Draft:
        default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
};

const RequisitionTable: React.FC<RequisitionTableProps> = ({ requisitions, onEdit }) => {
    
    const getDepartmentName = (id: string) => mockDepartments.find(d => d.id === id)?.name || 'N/A';
    const getBuName = (id: string) => mockBusinessUnits.find(bu => bu.id === id)?.name || 'N/A';

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Req Code</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Title</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Business Unit</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Department</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Headcount</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Fulfillment</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                        <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                    </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {requisitions.map(req => {
                        const hiredCount = mockApplications.filter(app => app.requisitionId === req.id && app.stage === ApplicationStage.Hired).length;
                        return (
                            <tr key={req.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500 dark:text-gray-400">{req.reqCode}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                    <div className="flex items-center space-x-2">
                                        <span>{req.title}</span>
                                        {req.isUrgent && <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300">Urgent</span>}
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{getBuName(req.businessUnitId)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{getDepartmentName(req.departmentId)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-500 dark:text-gray-400">{req.headcount}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                    <div className="flex items-center">
                                        <span className={`font-semibold ${hiredCount === req.headcount ? 'text-green-500' : ''}`}>{hiredCount}</span>
                                        <span className="mx-1">/</span>
                                        <span>{req.headcount} Hired</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(req.status)}`}>
                                        {req.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <Button size="sm" variant="secondary" onClick={() => onEdit(req)}>View / Edit</Button>
                                </td>
                            </tr>
                        );
                    })}
                    {requisitions.length === 0 && (
                        <tr>
                            <td colSpan={8} className="text-center py-10 text-gray-500 dark:text-gray-400">No requisitions found.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default RequisitionTable;
