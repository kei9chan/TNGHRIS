
import React from 'react';
import { AttendanceExceptionRecord, ExceptionType } from '../../types';
import Button from '../ui/Button';

interface ExceptionsTableProps {
    exceptions: AttendanceExceptionRecord[];
    onAcknowledge: (exceptionId: string) => void;
}

const getExceptionTypeColor = (type: ExceptionType) => {
    switch (type) {
        case ExceptionType.MissingOut:
        case ExceptionType.MissingIn:
            return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
        case ExceptionType.LateIn:
        case ExceptionType.Undertime: // Changed from EarlyOut
            return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
        case ExceptionType.OutsideFence:
            return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
        case ExceptionType.DoubleLog:
             return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
        case ExceptionType.MissingBreak:
             return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
        case ExceptionType.ExtendedBreak:
             return 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200';
        default:
            return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
};

const ExceptionsTable: React.FC<ExceptionsTableProps> = ({ exceptions, onAcknowledge }) => {

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Employee</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Details</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                        <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                    </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {exceptions.map(ex => (
                        <tr key={ex.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{ex.employeeName}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(ex.date).toLocaleDateString()}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getExceptionTypeColor(ex.type)}`}>
                                    {ex.type.replace(/([A-Z])/g, ' $1').trim()}
                                </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-sm truncate" title={ex.details}>{ex.details}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${ex.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                                    {ex.status}
                                </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                {ex.status === 'Pending' && (
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => onAcknowledge(ex.id)}
                                    >
                                        Acknowledge
                                    </Button>
                                )}
                            </td>
                        </tr>
                    ))}
                    {exceptions.length === 0 && (
                        <tr>
                            <td colSpan={6} className="text-center py-10 text-gray-500 dark:text-gray-400">
                                No exceptions match the current filters.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default ExceptionsTable;