
import React from 'react';
import { COERequest, COEPurpose } from '../../types';
import Button from '../ui/Button';

interface COEQueueProps {
    requests: COERequest[];
    onApprove: (request: COERequest) => void;
    onReject: (request: COERequest) => void;
    canAct?: boolean;
    canActOn?: (request: COERequest) => boolean;
}

const COEQueue: React.FC<COEQueueProps> = ({ requests, onApprove, onReject, canAct = true, canActOn }) => {
    if (requests.length === 0) {
        return (
            <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                No pending COE requests.
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Employee</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date Requested</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Purpose</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Details</th>
                        <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                    </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {requests.map((req) => (
                        <tr key={req.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{req.employeeName}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(req.dateRequested).toLocaleDateString()}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 text-xs font-semibold">
                                    {req.purpose.replace(/_/g, ' ')}
                                </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">
                                {req.purpose === COEPurpose.Others ? req.otherPurposeDetail : '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                {canAct && (!canActOn || canActOn(req)) ? (
                                    <div className="flex justify-end space-x-2">
                                        <Button size="sm" variant="danger" onClick={() => onReject(req)}>Reject</Button>
                                        <Button size="sm" variant="success" onClick={() => onApprove(req)}>Approve</Button>
                                    </div>
                                ) : (
                                    <span className="text-xs text-gray-400">View only</span>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default COEQueue;
