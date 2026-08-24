// Phase 2 Migration: mockBusinessUnits + mockNotifications removed — BUs and notifications via Supabase

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Ticket, TicketStatus, TicketPriority, ChatMessage, TicketCategory, NotificationType, Role, BusinessUnit } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import TicketTable, { isTicketOverdue } from '../../components/helpdesk/TicketTable';
import TicketModal from '../../components/helpdesk/TicketModal';
import EditableDescription from '../../components/ui/EditableDescription';
import { useSettings } from '../../context/SettingsContext';
import Input from '../../components/ui/Input';
import { logActivity } from '../../services/auditService';
import { fetchTickets, saveTicket, fetchTicketById, followUpTicket } from '../../services/ticketService';
import { createNotification } from '../../services/notificationService';
import { supabase } from '../../services/supabaseClient';

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
    const [followUpBusyId, setFollowUpBusyId] = useState<string | null>(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [priorityFilter, setPriorityFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [buFilter, setBuFilter] = useState('');
    const [ownershipFilter, setOwnershipFilter] = useState<'all' | 'assigned' | 'requested'>('all');
    const [dbBus, setDbBus] = useState<BusinessUnit[]>([]);
    const handledTicketIdRef = useRef<string | null>(null);

    useEffect(() => {
        supabase.from('business_units').select('id, name, code').order('name').then(({ data }) => {
            if (data) setDbBus(data.map((d: any) => ({ id: d.id, name: d.name, code: d.code || '' })) as BusinessUnit[]);
        });
    }, []);

    const location = useLocation();
    const navigate = useNavigate();

    const descriptionKey = 'helpdeskTicketsDesc';

    const accessibleBus = useMemo(() => getAccessibleBusinessUnits(dbBus), [getAccessibleBusinessUnits, dbBus]);
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

        if (!ticketIdToView) {
            handledTicketIdRef.current = null;
            return;
        }
        if (handledTicketIdRef.current === ticketIdToView) return;
        handledTicketIdRef.current = ticketIdToView;

        const tryLoad = async () => {
            try {
                const remote = await fetchTicketById(ticketIdToView);
                if (remote) {
                    setSelectedTicket(remote);
                    setIsModalOpen(true);
                    setTickets(previous => [remote, ...previous.filter(item => item.id !== remote.id)]);
                } else {
                    alert('The requested ticket was not found.');
                }
            } catch (err: any) {
                alert(err?.message || 'Failed to load ticket.');
            } finally {
                navigate('/helpdesk/tickets', { replace: true });
            }
        };

        tryLoad();
    }, [location.search, navigate]);

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
            const statusMatch = !statusFilter || (statusFilter === 'Overdue' ? isTicketOverdue(ticket) : ticket.status === statusFilter);
            const buMatch = !buFilter || ticket.businessUnitId === buFilter;
            const ownershipMatch = ownershipFilter === 'all'
                || (ownershipFilter === 'assigned' && ticket.assignedToId === user?.id)
                || (ownershipFilter === 'requested' && ticket.requesterId === user?.id);

            return searchMatch && categoryMatch && priorityMatch && statusMatch && buMatch && ownershipMatch;
        });
    }, [tickets, searchTerm, categoryFilter, priorityFilter, statusFilter, buFilter, ownershipFilter, user?.id]);

    const handleViewTicket = (ticket: Ticket) => {
        setSelectedTicket(ticket);
        setIsModalOpen(true);
    };

    const handleFollowUpTicket = async (ticket: Ticket) => {
        if (!user || ticket.requesterId !== user.id) return;
        if ([TicketStatus.Resolved, TicketStatus.Closed].includes(ticket.status)) return;
        if (!window.confirm('Send a follow-up reminder for this ticket?')) return;

        setFollowUpBusyId(ticket.id);
        try {
            const updated = await followUpTicket(ticket.id);
            setTickets(previous => previous.map(item => item.id === updated.id ? updated : item));
            if (selectedTicket?.id === updated.id) setSelectedTicket(updated);
            alert('Follow-up reminder sent successfully. Helpdesk has been notified.');
        } catch (error: any) {
            alert(error?.message || 'Failed to send the ticket follow-up.');
        } finally {
            setFollowUpBusyId(null);
        }
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
        let newlyAssigned = false;

        if (ticketToSave.id) {
            const existing = tickets.find(t => t.id === ticketToSave.id);
            newlyAssigned = !!(ticketToSave.assignedToId && existing?.assignedToId !== ticketToSave.assignedToId);

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
            const bu = dbBus.find(b => b.id === ticketToSave.businessUnitId);
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

            // Notify support staff when a brand-new ticket is created
            if (!ticketToSave.id) {
                try {
                    const { data: supportStaff } = await supabase
                        .rpc('get_accessible_hris_users')
                        .eq('status', 'Active')
                        .in('role', [Role.Admin, Role.HRManager, Role.HRStaff, Role.IT]);
                    (supportStaff || []).forEach((row: any) => {
                        if (row?.id && row.id !== user.id) {
                            createNotification({
                                userId: row.id,
                                type: NotificationType.TICKET_NEW,
                                title: '🎫 New Support Ticket',
                                message: `${user.name} submitted a new ${saved.category || 'General'} ticket (${saved.priority || 'Medium'} priority).`,
                                link: `/helpdesk/tickets?ticketId=${saved.id}`,
                                relatedEntityId: saved.id,
                            }).catch(e => console.warn('Failed to send new ticket notification', e));
                        }
                    });
                } catch (e) {
                    console.error('Failed to notify support staff of new ticket', e);
                }
            }

            if (newlyAssigned && saved.assignedToId) {
                const { data: assigneeRow } = await supabase
                    .rpc('get_hris_user_profile', { p_user_id: saved.assignedToId })
                    .maybeSingle();

                const assignee = assigneeRow as any;
                const assigneeName = assignee?.full_name || saved.assignedToName || 'Assignee';
                const assigneeRole = assignee?.role as Role | undefined;

                const targets = new Set<string>();
                targets.add(saved.assignedToId);
                if (saved.requesterId) {
                    targets.add(saved.requesterId);
                }

                if (assigneeRole === Role.Manager) {
                    const { data: adminRows } = await supabase
                        .rpc('get_accessible_hris_users')
                        .eq('status', 'Active')
                        .in('role', [Role.Admin, Role.HRManager, Role.HRStaff]);
                    (adminRows || []).forEach((row: any) => {
                        if (row?.id) targets.add(row.id);
                    });
                }

                targets.forEach(targetId => {
                    const isAssignee = targetId === saved.assignedToId;
                    const isRequester = targetId === saved.requesterId;
                    if (!isAssignee && !isRequester && assigneeRole !== Role.Manager) {
                        return;
                    }
                    const type = isAssignee
                        ? NotificationType.TICKET_ASSIGNED_TO_YOU
                        : NotificationType.TICKET_UPDATE_REQUESTER;
                    const message = isAssignee
                        ? `Ticket ${saved.id} has been assigned to you.`
                        : `Ticket ${saved.id} has been assigned to ${assigneeName}.`;
                    createNotification({
                        userId: targetId,
                        type,
                        title: isAssignee ? 'Ticket Assigned to You' : 'Ticket Assigned',
                        message,
                        link: `/helpdesk/tickets?ticketId=${saved.id}`,
                        relatedEntityId: saved.id,
                    }).catch(e => console.warn('Failed to send ticket assignment notification', e));
                });
            }

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

            // Notify the requester their ticket has been marked resolved (pending their approval)
            if (current.requesterId && current.requesterId !== user.id) {
                createNotification({
                    userId: current.requesterId,
                    type: NotificationType.TICKET_UPDATE_REQUESTER,
                    title: 'Ticket Marked as Resolved',
                    message: `Your ticket "${current.description?.slice(0, 60)}" has been marked resolved. Please confirm or reopen it.`,
                    link: `/helpdesk/tickets?ticketId=${ticketId}`,
                    relatedEntityId: ticketId,
                }).catch(e => console.warn('Failed to send ticket resolved notification', e));
            }
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

            // Notify the assignee their resolution was accepted
            if (current.assignedToId && current.assignedToId !== user.id) {
                createNotification({
                    userId: current.assignedToId,
                    type: NotificationType.TICKET_RESOLVED,
                    title: 'Resolution Approved',
                    message: `The requester confirmed resolution of ticket ${ticketId}. Ticket is now closed.`,
                    link: `/helpdesk/tickets?ticketId=${ticketId}`,
                    relatedEntityId: ticketId,
                }).catch(e => console.warn('Failed to send resolution approval notification', e));
            }
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

            // Notify the assignee their resolution was rejected and ticket is reopened
            if (current.assignedToId && current.assignedToId !== user.id) {
                createNotification({
                    userId: current.assignedToId,
                    type: NotificationType.TICKET_UPDATE_REQUESTER,
                    title: 'Resolution Not Accepted',
                    message: `The requester did not accept the resolution for ticket ${ticketId}. It has been reopened.`,
                    link: `/helpdesk/tickets?ticketId=${ticketId}`,
                    relatedEntityId: ticketId,
                }).catch(e => console.warn('Failed to send resolution rejection notification', e));
            }
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
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    <div className="md:col-span-2 lg:col-span-5">
                        <Input
                            label="Search Tickets"
                            id="ticket-search"
                            placeholder="Search by ID, requester, or description..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Ticket View</label>
                        <select aria-label="Ticket view" value={ownershipFilter} onChange={e => setOwnershipFilter(e.target.value as typeof ownershipFilter)} className={selectClasses}>
                            <option value="all">All accessible tickets</option>
                            <option value="assigned">Assigned to Me</option>
                            <option value="requested">Requested by Me</option>
                        </select>
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
                            <option value="Overdue">Overdue</option>
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
                <TicketTable
                    tickets={filteredTickets}
                    onViewTicket={handleViewTicket}
                    currentUserId={user?.id}
                    onFollowUp={handleFollowUpTicket}
                    followUpBusyId={followUpBusyId}
                />
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
                onFollowUp={handleFollowUpTicket}
                followUpBusy={!!selectedTicket?.id && followUpBusyId === selectedTicket.id}
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
