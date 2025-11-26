
import React from 'react';
import { LeaveRequest, LeaveRequestStatus } from '../../types';
import { mockLeaveTypes } from '../../services/mockData';
import Button from '../ui/Button';

interface LeaveRequestTableProps {
    requests: LeaveRequest[];
    onSelectRequest: (request: LeaveRequest) => void;
    isManagerView?: boolean;
    onApprove?: (request: LeaveRequest) => void;
    onReject?: (request: LeaveRequest) => void;
}

const getStatusColor = (status: LeaveRequestStatus) => {
    switch(status) {
        case LeaveRequestStatus.Approved: return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200';
        case LeaveRequestStatus.Pending: return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200';
        case LeaveRequestStatus.Rejected:
        case LeaveRequestStatus.Cancelled: return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200';
        case LeaveRequestStatus.Draft:
        default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
};

const CheckIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>;
const XIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>;

const LeaveRequestTable: React.FC<LeaveRequestTableProps> = ({ requests, onSelectRequest, isManagerView = false, onApprove, onReject }) => {
    
    const getLeaveTypeName = (id: string) => mockLeaveTypes.find(lt => lt.id === id)?.name || 'Unknown';

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                        {isManagerView && <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Employee</th>}
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Leave Type</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Dates</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Reason</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                        <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                    </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {requests.map(req => (
                        <tr key={req.id}>
                            {isManagerView && <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{req.employeeName}</td>}
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{getLeaveTypeName(req.leaveTypeId)}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                {new Date(req.startDate).toLocaleDateString()} - {new Date(req.endDate).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate" title={req.reason}>{req.reason}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(req.status)}`}>
                                    {req.status}
                                </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <div className="flex justify-end space-x-2">
                                    {isManagerView && req.status === LeaveRequestStatus.Pending ? (
                                        <>
                                            {onApprove && <Button size="sm" variant="success" className="!p-2" title="Approve" onClick={() => onApprove(req)}><CheckIcon/></Button>}
                                            {onReject && <Button size="sm" variant="danger" className="!p-2" title="Reject" onClick={() => onReject(req)}><XIcon/></Button>}
                                            <Button size="sm" variant="secondary" onClick={() => onSelectRequest(req)}>Review</Button>
                                        </>
                                    ) : (
                                        <Button size="sm" variant="secondary" onClick={() => onSelectRequest(req)}>View</Button>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}
                    {requests.length === 0 && (
                        <tr>
                            <td colSpan={isManagerView ? 6 : 5} className="text-center py-10 text-gray-500 dark:text-gray-400">
                                No leave requests found.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default LeaveRequestTable;
