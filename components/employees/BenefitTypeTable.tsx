
import React from 'react';
import { BenefitType } from '../../types';
import Button from '../ui/Button';

interface BenefitTypeTableProps {
    benefitTypes: BenefitType[];
    onEdit: (benefitType: BenefitType) => void;
    onDelete: (id: string) => void;
}

const BenefitTypeTable: React.FC<BenefitTypeTableProps> = ({ benefitTypes, onEdit, onDelete }) => {
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Name</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Description</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Max Value</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">BOD Approval</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                        <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                    </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {benefitTypes.map(bt => (
                        <tr key={bt.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                            <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900 dark:text-white">{bt.name}</td>
                            <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">{bt.description}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{bt.maxValue ? bt.maxValue.toLocaleString() : 'N/A'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                {bt.requiresBodApproval ? (
                                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200">Required</span>
                                ) : 'No'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${bt.isActive ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'}`}>
                                    {bt.isActive ? 'Active' : 'Inactive'}
                                </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <div className="flex justify-end space-x-2">
                                    <Button size="sm" variant="secondary" onClick={() => onEdit(bt)}>Edit</Button>
                                    <Button size="sm" variant="danger" onClick={() => onDelete(bt.id)}>Delete</Button>
                                </div>
                            </td>
                        </tr>
                    ))}
                    {benefitTypes.length === 0 && (
                        <tr>
                            <td colSpan={6} className="text-center py-10 text-gray-500 dark:text-gray-400">No benefit types configured.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default BenefitTypeTable;
