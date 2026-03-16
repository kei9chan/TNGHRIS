import React from 'react';
import { Link } from 'react-router-dom';
import { Envelope, EnvelopeStatus } from '../../types';
import Button from '../ui/Button';

interface EnvelopeListProps {
    envelopes: Envelope[];
    currentUserId?: string | null;
    onEdit?: (envelope: Envelope) => void;
    onDelete?: (envelope: Envelope) => void;
    onWithdraw?: (envelope: Envelope) => void;
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

const EnvelopeList: React.FC<EnvelopeListProps> = ({ envelopes, currentUserId, onEdit, onDelete, onWithdraw }) => {
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Recipient</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Title</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Due Date</th>
                        {(onEdit || onDelete || onWithdraw) && (
                            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                        )}
                    </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {envelopes.map(envelope => {
                        const isOwner = !!currentUserId && envelope.employeeId === currentUserId;
                        const canEdit = isOwner && [EnvelopeStatus.Draft, EnvelopeStatus.PendingApproval].includes(envelope.status);
                        const canDelete = isOwner && envelope.status === EnvelopeStatus.Draft;
                        const canWithdraw = isOwner && [EnvelopeStatus.PendingApproval, EnvelopeStatus.OutForSignature].includes(envelope.status);
                        const showActions = !!(onEdit || onDelete || onWithdraw) && (canEdit || canDelete || canWithdraw);
                        return (
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
                            {(onEdit || onDelete || onWithdraw) && (
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                                    {showActions ? (
                                        <div className="flex justify-end gap-2">
                                            {canEdit && onEdit && (
                                                <Button size="sm" variant="secondary" onClick={() => onEdit(envelope)}>
                                                    Edit
                                                </Button>
                                            )}
                                            {canWithdraw && onWithdraw && (
                                                <Button size="sm" variant="secondary" onClick={() => onWithdraw(envelope)}>
                                                    Withdraw
                                                </Button>
                                            )}
                                            {canDelete && onDelete && (
                                                <Button size="sm" variant="danger" onClick={() => onDelete(envelope)}>
                                                    Delete
                                                </Button>
                                            )}
                                        </div>
                                    ) : (
                                        <span className="text-gray-400">—</span>
                                    )}
                                </td>
                            )}
                        </tr>
                        );
                    })}
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
