import React from 'react';
import { ChangeHistory } from '../../types';
import { mockUsers } from '../../services/mockData';

interface ChangeHistoryTableProps {
    history: ChangeHistory[];
}

const getStatusColor = (status: ChangeHistory['status']) => {
    switch (status) {
        case 'Approved': return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300';
        case 'Pending Approval': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300';
        case 'Rejected': return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300';
        default: return 'bg-gray-100 text-gray-800';
    }
};

const ChangeHistoryTable: React.FC<ChangeHistoryTableProps> = ({ history }) => {

    const getUserName = (userId: string) => {
        return mockUsers.find(u => u.id === userId)?.name || 'Unknown User';
    };
    
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Changed By</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Field</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Old Value</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">New Value</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                    </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {history.map(item => (
                        <tr key={item.id}>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(item.timestamp).toLocaleString()}</td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{getUserName(item.changedBy)}</td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-800 dark:text-gray-200">{item.field}</td>
                            <td className="px-4 py-4 whitespace-normal text-sm text-gray-500 dark:text-gray-400 font-mono">{item.oldValue}</td>
                            <td className="px-4 py-4 whitespace-normal text-sm text-gray-500 dark:text-gray-400 font-mono">{item.newValue}</td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm">
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(item.status)}`}>
                                    {item.status}
                                </span>
                            </td>
                        </tr>
                    ))}
                     {history.length === 0 && (
                        <tr>
                            <td colSpan={6} className="text-center py-6 text-gray-500 dark:text-gray-400">
                                No changes have been made to this profile yet.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default ChangeHistoryTable;