
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { mockTickets, mockUsers, mockNotifications, mockBusinessUnits } from '../../services/mockData';
import { Ticket, Permission, TicketStatus, TicketPriority, Role, NotificationType, ChatMessage, TicketCategory, BusinessUnit } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import TicketTable from '../../components/helpdesk/TicketTable';
import TicketModal from '../../components/helpdesk/TicketModal';
import EditableDescription from '../../components/ui/EditableDescription';
import { useSettings } from '../../context/SettingsContext';
import Input from '../../components/ui/Input';
import { logActivity } from '../../services/auditService';

const PlusIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>;


const slaHours: Record<TicketPriority, number> = {
    [TicketPriority.Low]: 24,
    [TicketPriority.Medium]: 8,
    [TicketPriority.High]: 4,
    [TicketPriority.Urgent]: 2,
};

const Tickets: React.FC = () => {
    const { user } = useAuth();
    const { can, filterTicketsByScope, getAccessibleBusinessUnits } = usePermissions();
    const { settings, updateSettings } = useSettings();

    const [tickets, setTickets] = useState<Ticket[]>(() => filterTicketsByScope(mockTickets));
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedTicket, setSelectedTicket] = useState<Partial<Ticket> | null>(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [priorityFilter, setPriorityFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [buFilter, setBuFilter] = useState('');

    const location = useLocation();
    const navigate = useNavigate();

    const descriptionKey = 'helpdeskTicketsDesc';

    const accessibleBus = useMemo(() => getAccessibleBusinessUnits(mockBusinessUnits), [getAccessibleBusinessUnits]);

    const handleNewTicket = React.useCallback(() => {
        setSelectedTicket(null);
        setIsModalOpen(true);
    }, []);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const ticketIdToView = params.get('ticketId');
        
        if (ticketIdToView) {
            const ticketFromSource = mockTickets.find(t => t.id === ticketIdToView);

            if (ticketFromSource) {
                const canView = filterTicketsByScope([ticketFromSource]).length > 0;
                if (canView) {
                    setSelectedTicket(ticketFromSource);
                    setIsModalOpen(true);
                } else {
                    alert("You do not have permission to view this ticket.");
                }
            } else {
                alert("The requested ticket was not found.");
            }
            
            navigate('/helpdesk/tickets', { replace: true });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.search, filterTicketsByScope, navigate]);
    
    useEffect(() => {
        if (location.state?.openNewTicketModal) {
            handleNewTicket();
            // Clear state to prevent re-opening on refresh
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.state, navigate, handleNewTicket]);

    
    const filteredTickets = useMemo(() => {
        const lowercasedTerm = searchTerm.toLowerCase();
        
        return tickets.filter(ticket => {
            const searchMatch = !lowercasedTerm || (
                ticket.id.toLowerCase().includes(lowercasedTerm) ||
                ticket.requesterName.toLowerCase().includes(lowercasedTerm) ||
                ticket.description.toLowerCase().includes(lowercasedTerm)
            );

            const categoryMatch = !categoryFilter || ticket.category === categoryFilter;
            const priorityMatch = !priorityFilter || ticket.priority === priorityFilter;
            const statusMatch = !statusFilter || ticket.status === statusFilter;
            const buMatch = !buFilter || ticket.businessUnitId === buFilter;

            return searchMatch && categoryMatch && priorityMatch && statusMatch && buMatch;
        });
    }, [tickets, searchTerm, categoryFilter, priorityFilter, statusFilter, buFilter]);

    const handleViewTicket = (ticket: Ticket) => {
        setSelectedTicket(ticket);
        setIsModalOpen(true);
    };

    const handleSaveTicket = (ticketToSave: Partial<Ticket>) => {
        let updatedTicket: Ticket;

        if (ticketToSave.id) { 
            const ticketIndex = mockTickets.findIndex(t => t.id === ticketToSave.id);
            if (ticketIndex === -1) return;

            const originalTicket = mockTickets[ticketIndex];
            const newlyAssigned = ticketToSave.assignedToId && originalTicket.assignedToId !== ticketToSave.assignedToId;

            updatedTicket = { ...originalTicket, ...ticketToSave } as Ticket;

            if (newlyAssigned) {
                updatedTicket.assignedAt = new Date();
                updatedTicket.status = TicketStatus.Assigned;
                const sla = slaHours[updatedTicket.priority as TicketPriority];
                updatedTicket.slaDeadline = new Date(Date.now() + sla * 3600 * 1000);
                const assignee = mockUsers.find(u => u.id === updatedTicket.assignedToId);
                updatedTicket.assignedToName = assignee?.name;

                const requester = mockUsers.find(u => u.id === updatedTicket.requesterId);
                if (requester && assignee) {
                    mockNotifications.unshift({
                        id: `notif-${Date.now()}-${requester.id}`,
                        userId: requester.id,
                        type: NotificationType.TICKET_UPDATE_REQUESTER,
                        message: `Your ticket #${updatedTicket.id} has been assigned to ${assignee.name}.`,
                        link: `/helpdesk/tickets?ticketId=${updatedTicket.id}`,
                        isRead: false,
                        createdAt: new Date(),
                        relatedEntityId: updatedTicket.id,
                    });
                    mockNotifications.unshift({
                        id: `notif-${Date.now()}-${assignee.id}`,
                        userId: assignee.id,
                        type: NotificationType.TICKET_ASSIGNED_TO_YOU,
                        message: `You've been assigned ticket #${updatedTicket.id} from ${requester.name}.`,
                        link: `/helpdesk/tickets?ticketId=${updatedTicket.id}`,
                        isRead: false,
                        createdAt: new Date(),
                        relatedEntityId: updatedTicket.id,
                    });
                }
            }
            if (updatedTicket.status === TicketStatus.Resolved && !originalTicket.resolvedAt) {
                updatedTicket.resolvedAt = new Date();
            }

            mockTickets[ticketIndex] = updatedTicket;
            logActivity(user, 'UPDATE', 'Ticket', updatedTicket.id, `Updated ticket status to ${updatedTicket.status}`);

        } else { 
            const bu = mockBusinessUnits.find(b => b.id === ticketToSave.businessUnitId);
             updatedTicket = {
                requesterId: user?.id || '',
                requesterName: user?.name || '',
                chatThread: [],
                ...ticketToSave,
                businessUnitName: bu?.name || 'N/A',
                id: `TICKET-${Date.now()}`,
            } as Ticket;
            const sla = slaHours[updatedTicket.priority as TicketPriority];
            updatedTicket.slaDeadline = new Date(Date.now() + sla * 3600 * 1000);
            
            mockTickets.unshift(updatedTicket);
            logActivity(user, 'CREATE', 'Ticket', updatedTicket.id, `Created new ticket: ${updatedTicket.description}`);
        }
        
        setTickets(filterTicketsByScope([...mockTickets]));
        setIsModalOpen(false);
    };

    const handleSendMessage = (text: string) => {
      if (!user || !selectedTicket?.id) return;

      const newMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        userId: user.id,
        userName: user.name,
        timestamp: new Date(),
        text,
      };

      const ticketIndex = mockTickets.findIndex(t => t.id === selectedTicket.id);
      if (ticketIndex === -1) return;

      const updatedTicket = { ...mockTickets[ticketIndex] };
      updatedTicket.chatThread = [...updatedTicket.chatThread, newMessage];

      if (updatedTicket.status === TicketStatus.Assigned) {
          updatedTicket.status = TicketStatus.InProgress;
      }
      
      mockTickets[ticketIndex] = updatedTicket;
      
      setTickets(filterTicketsByScope([...mockTickets]));
      setSelectedTicket(updatedTicket);
    };

    const handleResolveTicket = (ticketId: string) => {
        if (!user) return;
        const ticketIndex = mockTickets.findIndex(t => t.id === ticketId);
        if (ticketIndex === -1) return;

        const updatedTicket = { ...mockTickets[ticketIndex] };
        updatedTicket.status = TicketStatus.PendingResolution;
        
        const systemMessage: ChatMessage = {
          id: `msg-${Date.now()}`,
          userId: 'system',
          userName: 'System',
          timestamp: new Date(),
          text: `Case marked as pending resolution by ${user.name}.`,
        };
        updatedTicket.chatThread.push(systemMessage);
        
        mockTickets[ticketIndex] = updatedTicket;

        mockNotifications.unshift({
            id: `notif-${Date.now()}-${updatedTicket.requesterId}`,
            userId: updatedTicket.requesterId,
            type: NotificationType.TICKET_UPDATE_REQUESTER,
            message: `Ticket #${updatedTicket.id} is marked as resolved. Please confirm.`,
            link: `/helpdesk/tickets?ticketId=${updatedTicket.id}`,
            isRead: false,
            createdAt: new Date(),
            relatedEntityId: updatedTicket.id,
        });
        
        logActivity(user, 'UPDATE', 'Ticket', ticketId, `Marked ticket as Pending Resolution`);

        setTickets(filterTicketsByScope([...mockTickets]));
        setSelectedTicket(updatedTicket);
    };

    const handleApproveResolution = (ticketId: string) => {
        if (!user) return;
        const ticketIndex = mockTickets.findIndex(t => t.id === ticketId);
        if (ticketIndex === -1) return;

        const updatedTicket = { ...mockTickets[ticketIndex] };
        updatedTicket.status = TicketStatus.Resolved;
        updatedTicket.resolvedAt = new Date();
        
        const systemMessage: ChatMessage = {
          id: `msg-${Date.now()}`,
          userId: 'system',
          userName: 'System',
          timestamp: new Date(),
          text: `Resolution approved by ${user.name}. Ticket has been resolved.`,
        };
        updatedTicket.chatThread.push(systemMessage);
        
        mockTickets[ticketIndex] = updatedTicket;
        
        if (updatedTicket.assignedToId) {
            mockNotifications.unshift({
                id: `notif-${Date.now()}-${updatedTicket.assignedToId}`,
                userId: updatedTicket.assignedToId,
                type: NotificationType.TICKET_UPDATE_REQUESTER,
                message: `The resolution for ticket #${updatedTicket.id} was approved.`,
                link: `/helpdesk/tickets?ticketId=${updatedTicket.id}`,
                isRead: false,
                createdAt: new Date(),
                relatedEntityId: updatedTicket.id,
            });
        }

        // Find and mark the user's "please confirm" notification as read
        const notificationIndex = mockNotifications.findIndex(
            n => n.relatedEntityId === ticketId && n.userId === user.id && n.type === NotificationType.TICKET_UPDATE_REQUESTER
        );
        if (notificationIndex > -1) {
            mockNotifications[notificationIndex].isRead = true;
        }

        logActivity(user, 'APPROVE', 'Ticket', ticketId, `Approved resolution for ticket.`);
        setTickets(filterTicketsByScope([...mockTickets]));
        setIsModalOpen(false);
    };

    const handleRejectResolution = (ticketId: string) => {
        if (!user) return;
        const ticketIndex = mockTickets.findIndex(t => t.id === ticketId);
        if (ticketIndex === -1) return;

        const updatedTicket = { ...mockTickets[ticketIndex] };
        updatedTicket.status = TicketStatus.InProgress;
        
        const systemMessage: ChatMessage = {
          id: `msg-${Date.now()}`,
          userId: 'system',
          userName: 'System',
          timestamp: new Date(),
          text: `Resolution was not accepted by ${user.name}. Ticket has been reopened.`,
        };
        updatedTicket.chatThread.push(systemMessage);
        
        mockTickets[ticketIndex] = updatedTicket;
        
        if (updatedTicket.assignedToId) {
            mockNotifications.unshift({
                id: `notif-${Date.now()}-${updatedTicket.assignedToId}`,
                userId: updatedTicket.assignedToId,
                type: NotificationType.TICKET_UPDATE_REQUESTER,
                message: `The resolution for #${updatedTicket.id} was rejected and reopened.`,
                link: `/helpdesk/tickets?ticketId=${updatedTicket.id}`,
                isRead: false,
                createdAt: new Date(),
                relatedEntityId: updatedTicket.id,
            });
        }

        logActivity(user, 'REJECT', 'Ticket', ticketId, `Rejected resolution for ticket.`);
        setTickets(filterTicketsByScope([...mockTickets]));
        setSelectedTicket(updatedTicket);
    };
    
    const selectClasses = "mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white";

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Helpdesk Tickets</h1>
                <Button onClick={handleNewTicket} className="hidden md:inline-flex mt-4 md:mt-0">New Ticket</Button>
            </div>
            
            <EditableDescription descriptionKey={descriptionKey} />
            
             <Card>
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="md:col-span-2 lg:col-span-4">
                        <Input
                            label="Search Tickets"
                            id="ticket-search"
                            placeholder="Search by ID, requester, or description..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Category</label>
                        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className={selectClasses}>
                            <option value="">All</option>
                            {Object.values(TicketCategory).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Priority</label>
                        <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} className={selectClasses}>
                            <option value="">All</option>
                            {Object.values(TicketPriority).map(prio => <option key={prio} value={prio}>{prio}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={selectClasses}>
                            <option value="">All</option>
                            {Object.values(TicketStatus).map(stat => <option key={stat} value={stat}>{stat}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Unit</label>
                        <select value={buFilter} onChange={e => setBuFilter(e.target.value)} className={selectClasses}>
                             <option value="">All Accessible BUs</option>
                             {accessibleBus.map((bu: BusinessUnit) => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
                        </select>
                    </div>
                </div>
            </Card>
            
            <Card>
                <TicketTable tickets={filteredTickets} onViewTicket={handleViewTicket} />
            </Card>

            <TicketModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                ticket={selectedTicket}
                onSave={handleSaveTicket}
                onSendMessage={handleSendMessage}
                onResolve={handleResolveTicket}
                onApproveResolution={handleApproveResolution}
                onRejectResolution={handleRejectResolution}
            />

            <div className="fixed bottom-20 right-4 md:hidden z-20">
                <Button onClick={handleNewTicket} className="rounded-full !p-4 shadow-lg">
                    <PlusIcon />
                </Button>
            </div>
        </div>
    );
};

export default Tickets;
