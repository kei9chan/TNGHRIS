import React from 'react';
import { Ticket, TicketStatus, TicketPriority, Permission } from '../../types';
import { usePermissions } from '../../hooks/usePermissions';
import Button from '../ui/Button';
import SlaTimer from './SlaTimer';
import Card from '../ui/Card';

interface TicketTableProps {
    tickets: Ticket[];
    onViewTicket: (ticket: Ticket) => void;
}

const statusColors: { [key in TicketStatus]: string } = {
    [TicketStatus.New]: 'bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-100',
    [TicketStatus.Assigned]: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200',
    [TicketStatus.InProgress]: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200',
    // FIX: Added the missing 'PendingResolution' status to satisfy the TicketStatus type and fix the TypeScript error.
    [TicketStatus.PendingResolution]: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200',
    [TicketStatus.Resolved]: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200',
    [TicketStatus.Closed]: 'bg-gray-500 text-white dark:bg-gray-700',
};

const priorityColors: { [key in TicketPriority]: string } = {
    [TicketPriority.Low]: 'border-green-500',
    [TicketPriority.Medium]: 'border-yellow-500',
    [TicketPriority.High]: 'border-orange-500',
    [TicketPriority.Urgent]: 'border-red-500',
};

const TicketCard: React.FC<{ ticket: Ticket; onViewTicket: (ticket: Ticket) => void; canManage: boolean; }> = ({ ticket, onViewTicket, canManage }) => {
    const isOverdue = ticket.status === TicketStatus.New && ticket.slaDeadline && new Date() > new Date(ticket.slaDeadline);
    return (
        <div className={`bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden border-l-4 ${priorityColors[ticket.priority]}`}>
            <div className="p-4">
                <div className="flex justify-between items-start">
                    <div>
                        <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{ticket.id}</span>
                        <p className="font-semibold text-gray-800 dark:text-gray-200 truncate">{ticket.description}</p>
                    </div>
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${isOverdue ? 'bg-red-500 text-white animate-pulse' : statusColors[ticket.status]}`}>{isOverdue ? 'Overdue' : ticket.status}</span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <p className="text-gray-500 dark:text-gray-400">Requester</p>
                        <p className="text-gray-900 dark:text-gray-100">{ticket.requesterName}</p>
                    </div>
                    <div>
                        <p className="text-gray-500 dark:text-gray-400">Assignee</p>
                        <p className="text-gray-900 dark:text-gray-100">{ticket.assignedToName || 'Unassigned'}</p>
                    </div>
                    <div>
                        <p className="text-gray-500 dark:text-gray-400">Category</p>
                        <p className="text-gray-900 dark:text-gray-100">{ticket.category}</p>
                    </div>
                    <div>
                        <p className="text-gray-500 dark:text-gray-400">Submitted</p>
                        <p className="text-gray-900 dark:text-gray-100">{new Date(ticket.createdAt).toLocaleDateString()}</p>
                    </div>
                     <div className="col-span-2">
                        <p className="text-gray-500 dark:text-gray-400">SLA</p>
                        <SlaTimer deadline={ticket.slaDeadline} assignedAt={ticket.assignedAt} resolvedAt={ticket.resolvedAt} status={ticket.status} />
                    </div>
                </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-2">
                <Button variant="secondary" size="sm" onClick={() => onViewTicket(ticket)} className="w-full">
                    {canManage ? 'Manage Ticket' : 'View Details'}
                </Button>
            </div>
        </div>
    );
};


const TicketTable: React.FC<TicketTableProps> = ({ tickets, onViewTicket }) => {
    const { can } = usePermissions();
    const canManage = can('Helpdesk', Permission.Manage);

    return (
        <>
            {/* Desktop Table View */}
            <div className="overflow-x-auto hidden md:block">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">ID</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Requester</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Description</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Submitted</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Category</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Priority</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Assignee</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">SLA</th>
                            <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {tickets.map(ticket => {
                            const isOverdue = ticket.status === TicketStatus.New && ticket.slaDeadline && new Date() > new Date(ticket.slaDeadline);
                            return (
                                <tr key={ticket.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{ticket.id}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{ticket.requesterName}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate" title={ticket.description}>{ticket.description}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(ticket.createdAt).toLocaleString()}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{ticket.category}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm"><span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${Object.keys(priorityColors).includes(ticket.priority) ? statusColors[ticket.status] : 'bg-gray-100 text-gray-800'}`}>{ticket.priority}</span></td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${isOverdue ? 'bg-red-500 text-white animate-pulse' : statusColors[ticket.status]}`}>
                                            {isOverdue ? 'Overdue' : ticket.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{ticket.assignedToName || 'Unassigned'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm"><SlaTimer deadline={ticket.slaDeadline} assignedAt={ticket.assignedAt} resolvedAt={ticket.resolvedAt} status={ticket.status} /></td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <Button variant="secondary" size="sm" onClick={() => onViewTicket(ticket)}>
                                            {canManage ? 'Manage' : 'View'}
                                        </Button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            
            {/* Mobile Card View */}
            <div className="md:hidden space-y-4">
                 {tickets.map(ticket => (
                    <TicketCard key={ticket.id} ticket={ticket} onViewTicket={onViewTicket} canManage={canManage} />
                ))}
            </div>

            {tickets.length === 0 && (
                <div className="text-center py-10 text-gray-500 dark:text-gray-400">
                    No tickets found for the current filters.
                </div>
            )}
        </>
    );
};

export default TicketTable;