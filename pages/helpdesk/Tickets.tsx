
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { mockBusinessUnits } from '../../services/mockData';
import { Ticket, TicketStatus, TicketPriority, ChatMessage, TicketCategory } from '../../types';
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
import { fetchTickets, saveTicket, fetchTicketById } from '../../services/ticketService';

const PlusIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>;


const slaHours: Record<TicketPriority, number> = {
    [TicketPriority.Low]: 24,
    [TicketPriority.Medium]: 8,
    [TicketPriority.High]: 4,
    [TicketPriority.Urgent]: 2,
};

const Tickets: React.FC = () => {
    const { user } = useAuth();
    const { filterTicketsByScope, getAccessibleBusinessUnits, getTicketAccess } = usePermissions();
    const { settings, updateSettings } = useSettings();

    const [tickets, setTickets] = useState<Ticket[]>([]);
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
    const ticketAccess = useMemo(() => getTicketAccess(), [getTicketAccess]);

    const handleNewTicket = React.useCallback(() => {
        if (!ticketAccess.canSubmit) {
            alert('You do not have permission to submit tickets.');
            return;
        }
        setSelectedTicket(null);
        setIsModalOpen(true);
    }, [ticketAccess.canSubmit]);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const ticketIdToView = params.get('ticketId');
        
        if (!ticketIdToView) return;

        const tryLoad = async () => {
            // first try from already loaded list
            const fromState = tickets.find(t => t.id === ticketIdToView);
            if (fromState) {
                const canView = filterTicketsByScope([fromState]).length > 0;
                if (canView) {
                    setSelectedTicket(fromState);
                    setIsModalOpen(true);
                } else {
                    alert("You do not have permission to view this ticket.");
                }
                navigate('/helpdesk/tickets', { replace: true });
                return;
            }

            // fallback: fetch single ticket from supabase
            try {
                const remote = await fetchTicketById(ticketIdToView);
                if (remote && filterTicketsByScope([remote]).length > 0) {
                    setSelectedTicket(remote);
                    setIsModalOpen(true);
                } else {
                    alert(remote ? "You do not have permission to view this ticket." : "The requested ticket was not found.");
                }
            } catch (err) {
                alert("Failed to load ticket.");
            } finally {
                navigate('/helpdesk/tickets', { replace: true });
            }
        };

        tryLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.search, tickets, filterTicketsByScope, navigate]);
    
    useEffect(() => {
        if (location.state?.openNewTicketModal) {
            handleNewTicket();
            // Clear state to prevent re-opening on refresh
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.state, navigate, handleNewTicket]);

    
    useEffect(() => {
        const loadTickets = async () => {
            try {
                const data = await fetchTickets();
                setTickets(filterTicketsByScope(data));
            } catch (error) {
                console.error('Failed to load tickets', error);
            }
        };
        loadTickets();
    }, [filterTicketsByScope]);

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

    const handleSaveTicket = async (ticketToSave: Partial<Ticket>) => {
        if (!user) {
            alert('You must be logged in to submit a ticket.');
            return;
        }
        if (!ticketToSave.id && !ticketAccess.canSubmit) {
            alert('You do not have permission to submit tickets.');
            return;
        }

        if (ticketToSave.id && !(ticketAccess.canRespond || ticketToSave.requesterId === user.id)) {
            alert('You do not have permission to update this ticket.');
            return;
        }

        let payload: Partial<Ticket> = { ...ticketToSave };

        if (ticketToSave.id) { 
            const existing = tickets.find(t => t.id === ticketToSave.id);
            const newlyAssigned = ticketToSave.assignedToId && existing?.assignedToId !== ticketToSave.assignedToId;

            if (newlyAssigned) {
                payload.assignedAt = new Date();
                payload.status = TicketStatus.Assigned;
                const sla = slaHours[(ticketToSave.priority || TicketPriority.Medium) as TicketPriority];
                payload.slaDeadline = new Date(Date.now() + sla * 3600 * 1000);
                payload.assignedToName = ticketToSave.assignedToName || existing?.assignedToName;
            }
            if (ticketToSave.status === TicketStatus.Resolved && !existing?.resolvedAt) {
                payload.resolvedAt = new Date();
            }

        } else { 
            const bu = mockBusinessUnits.find(b => b.id === ticketToSave.businessUnitId);
            payload = {
                requesterId: user.id,
                requesterName: user.name,
                chatThread: [],
                description: ticketToSave.description || '',
                category: ticketToSave.category || TicketCategory.IT,
                priority: ticketToSave.priority || TicketPriority.Medium,
                status: TicketStatus.New,
                businessUnitId: ticketToSave.businessUnitId,
                businessUnitName: bu?.name,
                attachments: ticketToSave.attachments || [],
            };
            const sla = slaHours[(payload.priority || TicketPriority.Medium) as TicketPriority];
            payload.slaDeadline = new Date(Date.now() + sla * 3600 * 1000);
        }
        
        try {
            const saved = await saveTicket(payload);
            setTickets(prev => {
                const rest = prev.filter(t => t.id !== saved.id);
                return filterTicketsByScope([...rest, saved]);
            });
            logActivity(user, ticketToSave.id ? 'UPDATE' : 'CREATE', 'Ticket', saved.id, `${ticketToSave.id ? 'Updated' : 'Created'} ticket ${saved.id}`);
            setIsModalOpen(false);
        } catch (error: any) {
            alert(error?.message || 'Failed to save ticket.');
        }
    };

    const handleSendMessage = async (text: string) => {
      if (!user || !selectedTicket?.id) return;

      const newMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        userId: user.id,
        userName: user.name,
        timestamp: new Date(),
        text,
      };

      const current = tickets.find(t => t.id === selectedTicket.id);
      if (!current) return;

      const updated: Partial<Ticket> = {
        ...current,
        chatThread: [...(current.chatThread || []), newMessage],
      };

      if (current.status === TicketStatus.Assigned) {
        updated.status = TicketStatus.InProgress;
      }

      try {
        const saved = await saveTicket(updated);
        setTickets(prev => {
            const rest = prev.filter(t => t.id !== saved.id);
            return filterTicketsByScope([...rest, saved]);
        });
        setSelectedTicket(saved);
      } catch (error: any) {
        alert(error?.message || 'Failed to send message.');
      }
    };

    const handleResolveTicket = async (ticketId: string) => {
        if (!user) return;
        if (!ticketAccess.canRespond) {
            alert('You do not have permission to resolve this ticket.');
            return;
        }
        const current = tickets.find(t => t.id === ticketId);
        if (!current) return;

        const updated: Partial<Ticket> = {
            ...current,
            status: TicketStatus.Resolved,
            resolvedAt: new Date(),
            chatThread: [
                ...(current.chatThread || []),
                {
                    id: `msg-${Date.now()}`,
                    userId: 'system',
                    userName: 'System',
                    timestamp: new Date(),
                    text: `Ticket marked resolved by ${user.name}.`,
                } as ChatMessage,
            ],
        };

        try {
            const saved = await saveTicket(updated);
            setTickets(prev => {
                const rest = prev.filter(t => t.id !== saved.id);
                return filterTicketsByScope([...rest, saved]);
            });
            logActivity(user, 'UPDATE', 'Ticket', ticketId, `Marked ticket as Resolved`);
            setSelectedTicket(saved);
        } catch (error: any) {
            alert(error?.message || 'Failed to update ticket.');
        }
    };

    const handleApproveResolution = async (ticketId: string) => {
        if (!user) return;
        const current = tickets.find(t => t.id === ticketId);
        if (!current) return;
        if (!ticketAccess.canRespond && current.requesterId !== user.id) {
            alert('You do not have permission to approve this ticket.');
            return;
        }

        const updated: Partial<Ticket> = {
            ...current,
            status: TicketStatus.Resolved,
            resolvedAt: current.resolvedAt || new Date(),
            chatThread: [
                ...(current.chatThread || []),
                {
                    id: `msg-${Date.now()}`,
                    userId: 'system',
                    userName: 'System',
                    timestamp: new Date(),
                    text: `Resolution approved by ${user.name}. Ticket has been resolved.`,
                } as ChatMessage,
            ],
        };

        try {
            const saved = await saveTicket(updated);
            setTickets(prev => {
                const rest = prev.filter(t => t.id !== saved.id);
                return filterTicketsByScope([...rest, saved]);
            });
            logActivity(user, 'APPROVE', 'Ticket', ticketId, `Approved resolution for ticket.`);
            setIsModalOpen(false);
        } catch (error: any) {
            alert(error?.message || 'Failed to update ticket.');
        }
    };

    const handleRejectResolution = async (ticketId: string) => {
        if (!user) return;
        const current = tickets.find(t => t.id === ticketId);
        if (!current) return;
        if (!ticketAccess.canRespond && current.requesterId !== user.id) {
            alert('You do not have permission to reject this ticket.');
            return;
        }

        const updated: Partial<Ticket> = {
            ...current,
            status: TicketStatus.InProgress,
            chatThread: [
                ...(current.chatThread || []),
                {
                    id: `msg-${Date.now()}`,
                    userId: 'system',
                    userName: 'System',
                    timestamp: new Date(),
                    text: `Resolution was not accepted by ${user.name}. Ticket has been reopened.`,
                } as ChatMessage,
            ],
        };

        try {
            const saved = await saveTicket(updated);
            setTickets(prev => {
                const rest = prev.filter(t => t.id !== saved.id);
                return filterTicketsByScope([...rest, saved]);
            });
            logActivity(user, 'REJECT', 'Ticket', ticketId, `Rejected resolution for ticket.`);
            setSelectedTicket(saved);
        } catch (error: any) {
            alert(error?.message || 'Failed to update ticket.');
        }
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
                access={ticketAccess}
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
