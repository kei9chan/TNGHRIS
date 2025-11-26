import React from 'react';
import { Link } from 'react-router-dom';
import { Envelope, EnvelopeStatus } from '../../types';

interface EnvelopeListProps {
    envelopes: Envelope[];
}

const getStatusColor = (status: EnvelopeStatus) => {
    switch (status) {
        case EnvelopeStatus.Completed: return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300';
        case EnvelopeStatus.OutForSignature: return 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300';
        case EnvelopeStatus.PendingApproval: return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300';
        case EnvelopeStatus.Declined: return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300';
        case EnvelopeStatus.Draft:
        default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
};

const EnvelopeList: React.FC<EnvelopeListProps> = ({ envelopes }) => {
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Recipient</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Title</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Due Date</th>
                    </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {envelopes.map(envelope => (
                        <tr key={envelope.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                <Link to={`/employees/contracts/${envelope.id}`} className="hover:underline">
                                    {envelope.employeeName}
                                </Link>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                <Link to={`/employees/contracts/${envelope.id}`} className="hover:underline">
                                    {envelope.title}
                                </Link>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(envelope.status)}`}>
                                    {envelope.status}
                                </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(envelope.dueDate).toLocaleDateString()}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {envelopes.length === 0 && (
                <div className="text-center py-10 text-gray-500 dark:text-gray-400">
                    No documents found.
                </div>
            )}
        </div>
    );
};

export default EnvelopeList;