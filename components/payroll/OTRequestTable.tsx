import React from 'react';
import { OTRequest, OTStatus, Permission } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import Button from '../ui/Button';

interface OTRequestTableProps {
    requests: OTRequest[];
    onEdit: (request: OTRequest) => void;
    onDelete: (requestId: string) => void;
    onWithdraw: (requestId: string) => void;
    canReviewRequest?: (request: OTRequest) => boolean;
}

const statusColors: { [key in OTStatus]: string } = {
    [OTStatus.Draft]: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
    [OTStatus.Submitted]: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    [OTStatus.PendingGM]: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
    [OTStatus.PendingBOD]: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    [OTStatus.Approved]: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    [OTStatus.Rejected]: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const statusLabels: { [key in OTStatus]: string } = {
    [OTStatus.Draft]: 'Draft',
    [OTStatus.Submitted]: 'Pending Manager Approval',
    [OTStatus.PendingGM]: 'Pending GM Approval',
    [OTStatus.PendingBOD]: 'Pending BOD Approval',
    [OTStatus.Approved]: 'Approved',
    [OTStatus.Rejected]: 'Rejected',
};

const OTRequestTable: React.FC<OTRequestTableProps> = ({ requests, onEdit, onDelete, onWithdraw, canReviewRequest }) => {
    const { user } = useAuth();
    const { can } = usePermissions();


    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Employee</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Time</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Approved Hrs</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Reason</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Manager Note</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                        <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                    </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {requests.map(req => {
                        const isOwner = req.employeeId === user?.id;

                        return (
                            <tr key={req.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{req.employeeName}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(req.date).toLocaleDateString()}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                    {req.otType === 'Offset' ? (
                                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200">Offset</span>
                                    ) : (
                                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Paid</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{req.startTime} - {req.endTime}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-700 dark:text-gray-300">{req.approvedHours?.toFixed(2) ?? 'N/A'}</td>
                                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate" title={req.reason}>{req.reason}</td>
                                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate" title={req.managerNote}>{req.managerNote || 'N/A'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColors[req.status] ?? 'bg-gray-100 text-gray-800'}`}>
                                        {statusLabels[req.status] ?? req.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                     <div className="flex space-x-2 justify-end">
                                        {!isOwner && (req.status === OTStatus.Submitted || req.status === OTStatus.PendingBOD) && (canReviewRequest ? canReviewRequest(req) : can('OT', Permission.Approve)) && (
                                            <Button variant="secondary" size="sm" onClick={() => onEdit(req)}>Review</Button>
                                        )}
                                        {isOwner && req.status === OTStatus.Draft && (
                                            <>
                                                {(can('OT', Permission.Edit) || can('OT', Permission.Create)) && <Button variant="secondary" size="sm" onClick={() => onEdit(req)}>Edit</Button>}
                                                {can('OT', Permission.Manage) && <Button variant="danger" size="sm" onClick={() => onDelete(req.id)}>Delete</Button>}
                                            </>
                                        )}
                                        {isOwner && req.status === OTStatus.Submitted && (
                                            <>
                                                {can('OT', Permission.Edit) && <Button variant="secondary" size="sm" onClick={() => onEdit(req)}>Edit</Button>}
                                                <Button variant="secondary" size="sm" onClick={() => onWithdraw(req.id)}>Withdraw</Button>
                                            </>
                                        )}
                                        {(req.status === OTStatus.Approved || req.status === OTStatus.Rejected) && (
                                            <Button variant="secondary" size="sm" onClick={() => onEdit(req)}>View</Button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                     {requests.length === 0 && (
                        <tr>
                            <td colSpan={8} className="text-center py-10 text-gray-500 dark:text-gray-400">
                                No overtime requests found in this view.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default OTRequestTable;
