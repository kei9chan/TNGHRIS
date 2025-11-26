
import React, { useState, useMemo, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { CoachingSession, CoachingStatus, CoachingTrigger, Permission, Role, NotificationType } from '../../types';
import { mockCoachingSessions, mockNotifications } from '../../services/mockData';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import CoachingModal from '../../components/feedback/CoachingModal';

const CoachingLog: React.FC = () => {
    const { user } = useAuth();
    const { can } = usePermissions();
    const location = useLocation();
    const navigate = useNavigate();
    
    const canCreate = can('Coaching', Permission.Create); 

    const [sessions, setSessions] = useState<CoachingSession[]>(mockCoachingSessions);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedSession, setSelectedSession] = useState<CoachingSession | null>(null);
    
    // New state for passing data from IR conversion
    const [initialModalData, setInitialModalData] = useState<Partial<CoachingSession> | undefined>(undefined);

    // Check for incoming state from Incident Report conversion OR Dashboard action item
    useEffect(() => {
        if (location.state?.initiateCoaching) {
            setInitialModalData(location.state.initiateCoaching);
            setIsModalOpen(true);
            navigate(location.pathname, { replace: true, state: {} });
        } else if (location.state?.openSessionId) {
            // Deep link to existing session (e.g. for Acknowledgment)
            const sessionToOpen = sessions.find(s => s.id === location.state.openSessionId);
            if (sessionToOpen) {
                setSelectedSession(sessionToOpen);
                setIsModalOpen(true);
            }
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.state, navigate, sessions]);

    const filteredSessions = useMemo(() => {
        let baseList = sessions;
        
        // Filter logic:
        // 1. Admins/HR see all.
        // 2. Others see sessions where they are either the Employee OR the Coach.
        if (user) {
            const isPrivileged = [Role.Admin, Role.HRManager, Role.HRStaff].includes(user.role);
            if (!isPrivileged) {
                baseList = sessions.filter(s => s.employeeId === user.id || s.coachId === user.id);
            }
        } else {
            baseList = [];
        }

        return baseList.filter(session => {
            const matchesSearch = 
                session.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                session.coachName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                session.context.toLowerCase().includes(searchTerm.toLowerCase());
            
            return matchesSearch;
        });
    }, [sessions, searchTerm, user]);

    const getStatusColor = (status: CoachingStatus) => {
        switch (status) {
            case CoachingStatus.Draft: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
            case CoachingStatus.Scheduled: return 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300';
            case CoachingStatus.Completed: return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300';
            case CoachingStatus.Acknowledged: return 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const handleOpenModal = (session: CoachingSession | null) => {
        setSelectedSession(session);
        setInitialModalData(undefined); // Reset initial data when opening manually
        setIsModalOpen(true);
    };

    const handleSave = (sessionData: Partial<CoachingSession>) => {
        const isNew = !sessionData.id;
        const wasNotScheduled = !isNew && selectedSession?.status !== CoachingStatus.Scheduled;
        let finalSession: CoachingSession;

        if (sessionData.id) {
            // Update
            const index = mockCoachingSessions.findIndex(s => s.id === sessionData.id);
            if (index > -1) {
                const updatedSession = { ...mockCoachingSessions[index], ...sessionData } as CoachingSession;
                mockCoachingSessions[index] = updatedSession;
                setSessions([...mockCoachingSessions]);
                finalSession = updatedSession;
            } else {
                return; // Error handling
            }
        } else {
            // Create
            finalSession = {
                ...sessionData,
                id: `CS-${Date.now()}`,
            } as CoachingSession;
            mockCoachingSessions.unshift(finalSession);
            setSessions([finalSession, ...sessions]);
        }

        // Trigger Notification if Status becomes Scheduled (New or Updated)
        if (finalSession.status === CoachingStatus.Scheduled && (isNew || wasNotScheduled)) {
             mockNotifications.unshift({
                id: `notif-coaching-${Date.now()}`,
                userId: finalSession.employeeId,
                type: NotificationType.COACHING_INVITE,
                title: " Let's Connect! 🚀",
                message: `Hi ${finalSession.employeeName}, ${finalSession.coachName} has invited you to a coaching session on ${new Date(finalSession.date).toLocaleDateString()}.`,
                link: '/feedback/coaching',
                isRead: false,
                createdAt: new Date(),
                relatedEntityId: finalSession.id
            });
        }

        setIsModalOpen(false);
    };
    
    const getActionButtonText = (session: CoachingSession) => {
        const isCoach = user?.id === session.coachId;
        const isEmployee = user?.id === session.employeeId;

        if (session.status === CoachingStatus.Scheduled) {
            return isCoach ? 'Conduct' : 'View';
        }
        if (session.status === CoachingStatus.Completed && isEmployee) {
            return 'Acknowledge';
        }
        return 'View';
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Coaching & Mentoring Log</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Track developmental conversations and coaching sessions.</p>
                </div>
                {canCreate && (
                    <Button onClick={() => handleOpenModal(null)}>+ Request Coaching</Button>
                )}
            </div>

            <Card>
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                    <Input 
                        label="" 
                        placeholder="Search by employee, coach, or context..." 
                        value={searchTerm} 
                        onChange={(e) => setSearchTerm(e.target.value)} 
                    />
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Employee</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Coach</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Trigger</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Context</th>
                                <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                            {filteredSessions.map((session) => (
                                <tr key={session.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                        {session.employeeName}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {session.coachName}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {session.trigger}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {new Date(session.date).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(session.status)}`}>
                                            {session.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate" title={session.context}>
                                        {session.context}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <Button size="sm" variant="secondary" onClick={() => handleOpenModal(session)}>
                                            {getActionButtonText(session)}
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                            {filteredSessions.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-6 py-10 text-center text-gray-500 dark:text-gray-400">
                                        No coaching sessions found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            <CoachingModal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                session={selectedSession} 
                onSave={handleSave}
                initialData={initialModalData} 
            />
        </div>
    );
};

export default CoachingLog;
