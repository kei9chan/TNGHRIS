
import React from 'react';
import { BenefitRequest, BenefitRequestStatus } from '../../types';
import Button from '../ui/Button';
import { useSettings } from '../../context/SettingsContext';

interface BenefitFulfillmentTableProps {
    requests: BenefitRequest[];
    onFulfill?: (request: BenefitRequest) => void;
}

const GiftIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" /></svg>;

const BenefitFulfillmentTable: React.FC<BenefitFulfillmentTableProps> = ({ requests, onFulfill }) => {
    const { settings } = useSettings();

    const getStatusBadge = (status: BenefitRequestStatus) => {
        switch (status) {
            case BenefitRequestStatus.Approved: return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200">Approved</span>;
            case BenefitRequestStatus.Fulfilled: return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200">Fulfilled</span>;
            default: return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">{status}</span>;
        }
    };

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Employee</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Benefit</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Amount</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                        <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                    </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {requests.map(req => (
                        <tr key={req.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                            <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900 dark:text-white">{req.employeeName}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">Submitted: {new Date(req.submissionDate).toLocaleDateString()}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{req.benefitTypeName}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-white">
                                {req.amount ? `${settings.currency} ${req.amount.toLocaleString()}` : 'N/A'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                {getStatusBadge(req.status)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                {onFulfill ? (
                                    <Button size="sm" onClick={() => onFulfill(req)}>
                                        <GiftIcon /> Fulfill
                                    </Button>
                                ) : (
                                    <div className="text-right">
                                        <div className="text-xs text-gray-500 dark:text-gray-400">
                                            {req.fulfilledAt ? new Date(req.fulfilledAt).toLocaleDateString() : ''}
                                        </div>
                                        {req.voucherCode && (
                                            <div className="text-xs font-mono text-purple-600 dark:text-purple-400 mt-1 select-all">
                                                {req.voucherCode}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </td>
                        </tr>
                    ))}
                    {requests.length === 0 && (
                        <tr>
                            <td colSpan={5} className="text-center py-10 text-gray-500 dark:text-gray-400">
                                No requests found.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default BenefitFulfillmentTable;
