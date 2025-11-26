import React from 'react';
import { LeaveLedgerEntry, LeaveLedgerEntryType } from '../../types';
import { mockLeaveTypes } from '../../services/mockData';

interface LeaveLedgerTableProps {
    ledgerEntries: LeaveLedgerEntry[];
}

const getTypeColor = (type: LeaveLedgerEntryType) => {
    switch(type) {
        case LeaveLedgerEntryType.Accrual:
        case LeaveLedgerEntryType.CarryOverApplied:
             return 'bg-green-100 text-green-800';
        case LeaveLedgerEntryType.Usage:
        case LeaveLedgerEntryType.CarryOverExpired:
             return 'bg-red-100 text-red-800';
        case LeaveLedgerEntryType.Adjustment: return 'bg-yellow-100 text-yellow-800';
        default: return 'bg-gray-100 text-gray-800';
    }
};

const LeaveLedgerTable: React.FC<LeaveLedgerTableProps> = ({ ledgerEntries }) => {
    
    const getLeaveTypeName = (id: string) => mockLeaveTypes.find(lt => lt.id === id)?.name || 'Unknown';

    const sortedEntries = [...ledgerEntries].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Leave Type</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Transaction Type</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Change</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Balance After</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Notes</th>
                    </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {sortedEntries.map(entry => (
                        <tr key={entry.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(entry.date).toLocaleDateString()}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{getLeaveTypeName(entry.leaveTypeId)}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getTypeColor(entry.type)}`}>
                                    {entry.type.replace('_', ' ')}
                                </span>
                            </td>
                            <td className={`px-6 py-4 whitespace-nowrap text-sm font-semibold ${entry.change > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {entry.change > 0 ? `+${entry.change.toFixed(2)}` : entry.change.toFixed(2)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-700 dark:text-gray-300">{entry.balanceAfter.toFixed(2)}</td>
                            <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate" title={entry.notes}>{entry.notes}</td>
                        </tr>
                    ))}
                    {sortedEntries.length === 0 && (
                        <tr>
                            <td colSpan={6} className="text-center py-10 text-gray-500 dark:text-gray-400">
                                No balance history found.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default LeaveLedgerTable;
