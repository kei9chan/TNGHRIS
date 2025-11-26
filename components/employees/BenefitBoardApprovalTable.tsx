
import React from 'react';
import { BenefitRequest, BenefitRequestStatus } from '../../types';
import Button from '../ui/Button';
import { useSettings } from '../../context/SettingsContext';
import { mockUsers } from '../../services/mockData';

interface BenefitBoardApprovalTableProps {
    requests: BenefitRequest[];
    onApprove?: (request: BenefitRequest) => void;
    onReject?: (request: BenefitRequest) => void;
}

const CheckIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>;
const XIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>;

const BenefitBoardApprovalTable: React.FC<BenefitBoardApprovalTableProps> = ({ requests, onApprove, onReject }) => {
    const { settings } = useSettings();

    const getUserName = (userId?: string) => {
        if (!userId) return 'Unknown';
        return mockUsers.find(u => u.id === userId)?.name || 'Unknown';
    };
    
    const getStatusBadge = (status: BenefitRequestStatus) => {
        switch (status) {
            case BenefitRequestStatus.Approved: return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">Approved</span>;
            case BenefitRequestStatus.Rejected: return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200">Rejected</span>;
            case BenefitRequestStatus.PendingBOD: return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200">Pending</span>;
             case BenefitRequestStatus.Fulfilled: return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200">Fulfilled</span>;
            default: return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200">{status}</span>;
        }
    };

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Employee</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Benefit Details</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Endorsed By</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date Needed</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                        <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                    </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {requests.map(req => {
                        const isPending = req.status === BenefitRequestStatus.PendingBOD;
                        return (
                        <tr key={req.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                            <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900 dark:text-white">{req.employeeName}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">Submitted: {new Date(req.submissionDate).toLocaleDateString()}</div>
                            </td>
                            <td className="px-6 py-4">
                                <div className="text-sm text-gray-900 dark:text-white font-medium">{req.benefitTypeName}</div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                    {req.amount ? `${settings.currency} ${req.amount.toLocaleString()}` : 'No amount specified'}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic">"{req.details}"</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                <div>{getUserName(req.hrEndorsedBy)}</div>
                                <div className="text-xs">{req.hrEndorsedAt ? new Date(req.hrEndorsedAt).toLocaleDateString() : ''}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(req.dateNeeded).toLocaleDateString()}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                {getStatusBadge(req.status)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                {isPending && onApprove && onReject ? (
                                    <div className="flex justify-end space-x-2">
                                        <Button size="sm" variant="danger" onClick={() => onReject(req)} title="Reject">
                                            <XIcon />
                                        </Button>
                                        <Button size="sm" variant="success" onClick={() => onApprove(req)} title="Final Approve">
                                            <CheckIcon /> Approve
                                        </Button>
                                    </div>
                                ) : (
                                    <span className="text-gray-400">-</span>
                                )}
                            </td>
                        </tr>
                    )})}
                    {requests.length === 0 && (
                        <tr>
                            <td colSpan={6} className="text-center py-10 text-gray-500 dark:text-gray-400">
                                No requests found.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default BenefitBoardApprovalTable;
