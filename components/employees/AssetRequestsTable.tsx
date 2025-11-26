
import React from 'react';
import { AssetRequest, AssetRequestStatus, User, EnrichedAssetRequest } from '../../types';
import Button from '../ui/Button';

interface AssetRequestsTableProps {
    requests: EnrichedAssetRequest[];
    onReview: (request: EnrichedAssetRequest) => void;
    canManage: boolean;
    currentUser: User | null;
}

const getStatusColor = (status: AssetRequestStatus) => {
    switch (status) {
        case AssetRequestStatus.Pending: return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200';
        case AssetRequestStatus.Returned: return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200';
        case AssetRequestStatus.Approved:
        case AssetRequestStatus.Fulfilled: 
            return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200';
        case AssetRequestStatus.Rejected: return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200';
        default: return 'bg-gray-100 text-gray-800';
    }
};

const AssetRequestsTable: React.FC<AssetRequestsTableProps> = ({ requests, onReview, canManage, currentUser }) => {
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-slate-900/40">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">Request ID</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">Employee</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">Business Unit</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">Type</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">Asset</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">Requested At</th>
                        <th className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                    </tr>
                </thead>
                <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
                    {requests.map(req => {
                        const isReturnee = req.employeeId === currentUser?.id;
                        const isRequester = req.managerId === currentUser?.id;

                        return (
                        <tr key={req.id}>
                            <td className="px-6 py-4 whitespace-nowrap font-mono text-sm">{req.id}</td>
                            <td className="px-6 py-4 whitespace-nowrap font-semibold">{req.employeeName}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">{req.businessUnitName}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">{req.requestType}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-800 dark:text-gray-200">{req.assetName}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(req.status)}`}>
                                    {req.status}
                                </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">{new Date(req.requestedAt).toLocaleDateString()}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                {isReturnee ? (
                                    <>
                                        {req.status === AssetRequestStatus.Pending && req.requestType === 'Return' ? (
                                            <Button size="sm" onClick={() => onReview(req)}>Submit Return</Button>
                                        ) : req.status === AssetRequestStatus.Rejected ? (
                                            <Button size="sm" variant="danger" onClick={() => onReview(req)}>View Rejection &amp; Resubmit</Button>
                                        ) : (
                                            <Button size="sm" variant="secondary" onClick={() => onReview(req)}>View Details</Button>
                                        )}
                                    </>
                                ) : isRequester && req.status === AssetRequestStatus.Returned ? (
                                    <Button size="sm" onClick={() => onReview(req)}>Review</Button>
                                ) : (
                                    <Button size="sm" variant="secondary" onClick={() => onReview(req)}>View Details</Button>
                                )}
                            </td>
                        </tr>
                    )})}
                    {requests.length === 0 && (
                        <tr>
                            <td colSpan={8} className="text-center py-12 text-gray-500 dark:text-gray-400">
                                No asset requests found for the current filters.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default AssetRequestsTable;
