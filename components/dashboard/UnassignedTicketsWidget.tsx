import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { mockTickets } from '../../services/mockData';
import { Ticket, TicketStatus } from '../../types';
import Card from '../ui/Card';

const UnassignedTicketsWidget: React.FC = () => {
    const unassignedTickets = useMemo(() => {
        return mockTickets.filter(ticket => ticket.status === TicketStatus.New)
            .sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, []);

    return (
        <Card title={`Unassigned Tickets (${unassignedTickets.length})`}>
            {unassignedTickets.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">Ticket queue is clear!</p>
            ) : (
                <>
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                        {unassignedTickets.map(ticket => (
                            <Link to="/helpdesk/tickets" key={ticket.id} className="block hover:bg-gray-50 dark:hover:bg-gray-700/50 p-3 rounded-md border-l-4 border-gray-400">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="font-semibold text-gray-800 dark:text-gray-200">{ticket.requesterName}</p>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{ticket.description}</p>
                                    </div>
                                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800`}>{ticket.priority}</span>
                                </div>
                                <p className="text-xs text-gray-400 mt-1">{new Date(ticket.createdAt).toLocaleDateString()}</p>
                            </Link>
                        ))}
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 text-right">
                        <Link to="/helpdesk/tickets" className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
                            Manage All Tickets &rarr;
                        </Link>
                    </div>
                </>
            )}
        </Card>
    );
};

export default UnassignedTicketsWidget;