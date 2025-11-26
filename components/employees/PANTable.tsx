import React from 'react';
import { PAN, PANActionTaken, PANStatus } from '../../types';
import Button from '../ui/Button';

interface PANTableProps {
    records: PAN[];
    onEdit: (record: PAN) => void;
    isEmployeeView?: boolean;
    isManagerView?: boolean;
}

const getStatusColor = (status: PAN['status']) => {
    switch(status) {
        case PANStatus.Completed: return 'bg-green-100 text-green-800';
        case PANStatus.Declined:
        case PANStatus.ReturnedForEdits:
        case PANStatus.Cancelled:
             return 'bg-red-100 text-red-800';
        case PANStatus.PendingApproval:
        case PANStatus.PendingRecommender: 
        case PANStatus.PendingEndorser:
        case PANStatus.PendingEmployee:
             return 'bg-yellow-100 text-yellow-800';
        case PANStatus.Draft:
        default: return 'bg-gray-100 text-gray-800';
    }
};

const getActionType = (action: PANActionTaken) => {
    if (!action) return 'N/A';
    const actions = [];
    if (action.changeOfStatus) actions.push('Status Change');
    if (action.promotion) actions.push('Promotion');
    if (action.transfer) actions.push('Transfer');
    if (action.salaryIncrease) actions.push('Salary Increase');
    if (action.changeOfJobTitle) actions.push('Job Title Change');
    if (action.others) actions.push(action.others);
    return actions.join(', ') || 'Update';
};


const PANTable: React.FC<PANTableProps> = ({ records, onEdit, isEmployeeView, isManagerView }) => {
    
    const getButtonText = (record: PAN) => {
        if (isEmployeeView) return 'View / Sign';
        if (isManagerView && (record.status === PANStatus.PendingRecommender || record.status === PANStatus.PendingEndorser || record.status === PANStatus.PendingApproval)) return 'Review / Endorse';
        if (record.status === PANStatus.Draft) return 'Edit';
        return 'View';
    };
    
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Employee</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Effective Date</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                        <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                    </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {records.map(record => (
                        <tr key={record.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{record.employeeName}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(record.effectiveDate).toLocaleDateString()}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{getActionType(record.actionTaken)}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(record.status)}`}>
                                    {record.status}
                                </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <Button size="sm" variant="secondary" onClick={() => onEdit(record)}>
                                    {getButtonText(record)}
                                </Button>
                            </td>
                        </tr>
                    ))}
                     {records.length === 0 && (
                        <tr>
                            <td colSpan={5} className="text-center py-10 text-gray-500 dark:text-gray-400">
                                No PAN records found.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default PANTable;