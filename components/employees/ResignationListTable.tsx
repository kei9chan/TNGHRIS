import React, { useState } from 'react';
import { Resignation, ResignationStatus } from '../../types';
import Button from '../ui/Button';
import ResignationDetailModal from './ResignationDetailModal';

interface ResignationListTableProps {
    resignations: Resignation[];
    onUpdate: () => void;
}

const getStatusColor = (status: ResignationStatus) => {
    switch(status) {
        case ResignationStatus.PendingHRReview: return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200';
        case ResignationStatus.ForClearance: return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200';
        case ResignationStatus.ReturnedForEdits: return 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200';
        case ResignationStatus.Processing: return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200';
        case ResignationStatus.Completed: return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200';
        default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
};

const ResignationListTable: React.FC<ResignationListTableProps> = ({ resignations, onUpdate }) => {
    const [selected, setSelected] = useState<Resignation | null>(null);

    const handleView = (resignation: Resignation) => {
        setSelected(resignation);
    };

    return (
        <>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Employee Name</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Submission Date</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Last Working Day</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Status</th>
                            <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {resignations.map(resignation => (
                            <tr key={resignation.id}>
                                <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900 dark:text-white">{resignation.employeeName}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(resignation.submissionDate).toLocaleDateString()}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(resignation.lastWorkingDay).toLocaleDateString()}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(resignation.status)}`}>
                                        {resignation.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <Button size="sm" variant="secondary" onClick={() => handleView(resignation)}>
                                        {resignation.status === ResignationStatus.PendingHRReview ? 'Review' : 'View'}
                                    </Button>
                                </td>
                            </tr>
                        ))}
                        {resignations.length === 0 && (
                            <tr>
                                <td colSpan={5} className="text-center py-10 text-gray-500 dark:text-gray-400">
                                    No resignation submissions yet.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            {selected && (
                <ResignationDetailModal
                    isOpen={!!selected}
                    onClose={() => setSelected(null)}
                    resignation={selected}
                    onUpdate={onUpdate}
                />
            )}
        </>
    );
};

export default ResignationListTable;
