
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { CoachingSession, CoachingStatus, CoachingTrigger, Permission, Role, User } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import CoachingModal from '../../components/feedback/CoachingModal';
import { supabase } from '../../services/supabaseClient';

const CoachingLog: React.FC = () => {
    const { user } = useAuth();
    const { can } = usePermissions();
    const location = useLocation();
    const navigate = useNavigate();
    
    const canCreate = can('Coaching', Permission.Create); 

    const [sessions, setSessions] = useState<CoachingSession[]>([]);
    const [employees, setEmployees] = useState<User[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedSession, setSelectedSession] = useState<CoachingSession | null>(null);
    
    // New state for passing data from IR conversion
    const [initialModalData, setInitialModalData] = useState<Partial<CoachingSession> | undefined>(undefined);

    const mapRowToSession = useCallback((row: any): CoachingSession => ({
        id: row.id,
        employeeId: row.employee_id,
        employeeName: row.employee_name,
        coachId: row.coach_id,
        coachName: row.coach_name,
        trigger: row.trigger as CoachingTrigger,
        context: row.context,
        date: row.date ? new Date(row.date) : new Date(),
        status: row.status as CoachingStatus,
        rootCause: row.root_cause || '',
        actionPlan: row.action_plan || '',
        followUpDate: row.follow_up_date ? new Date(row.follow_up_date) : undefined,
        employeeSignatureUrl: row.employee_signature_url || undefined,
        coachSignatureUrl: row.coach_signature_url || undefined,
        acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at) : undefined,
    }), []);

    // Load employees and sessions on mount
    useEffect(() => {
        const loadEmployees = async () => {
            try {
                const { data, error } = await supabase
                    .from('hris_users')
                    .select('id, full_name, role, status, position');
                if (error) throw error;
                const mapped: User[] =
                    data?.map((u: any) => ({
                        id: u.id,
                        name: u.full_name,
                        email: '',
                        role: u.role,
                        department: '',
                        businessUnit: '',
                        status: u.status || 'Active',
                        position: (u as any)?.position || '',
                        isPhotoEnrolled: false,
                        dateHired: new Date(),
                    })) || [];
                setEmployees(mapped);
            } catch (err) {
                console.error('Failed to load employees for coaching', err);
                setEmployees([]);
            }
        };

        const loadSessions = async () => {
            try {
                const { data, error } = await supabase
                    .from('coaching_sessions')
                    .select('*')
                    .order('created_at', { ascending: false });
                if (error) throw error;
                const mapped = (data as any[])?.map(mapRowToSession) || [];
                setSessions(mapped);
            } catch (err) {
                console.error('Failed to load coaching sessions', err);
                setSessions([]);
            }
        };

        loadEmployees();
        loadSessions();
    }, [mapRowToSession]);

    // Handle navigation state (e.g., open modal) once sessions are loaded
    useEffect(() => {
        if (location.state?.initiateCoaching) {
            setInitialModalData(location.state.initiateCoaching);
            setIsModalOpen(true);
            navigate(location.pathname, { replace: true, state: {} });
        } else if (location.state?.openSessionId && sessions.length > 0) {
            const sessionToOpen = sessions.find(s => s.id === location.state.openSessionId);
            if (sessionToOpen) {
                setSelectedSession(sessionToOpen);
                setIsModalOpen(true);
            }
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.pathname, location.state, navigate, sessions]);

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

    const handleSave = async (sessionData: Partial<CoachingSession>) => {
        const isNew = !sessionData.id;
        try {
            const payload = {
                employee_id: sessionData.employeeId,
                employee_name: sessionData.employeeName,
                coach_id: sessionData.coachId,
                coach_name: sessionData.coachName,
                trigger: sessionData.trigger || CoachingTrigger.Performance,
                context: sessionData.context || '',
                date: sessionData.date ? new Date(sessionData.date).toISOString() : new Date().toISOString(),
                status: sessionData.status || CoachingStatus.Draft,
                root_cause: sessionData.rootCause || null,
                action_plan: sessionData.actionPlan || null,
                follow_up_date: sessionData.followUpDate ? new Date(sessionData.followUpDate).toISOString() : null,
                employee_signature_url: sessionData.employeeSignatureUrl || null,
                coach_signature_url: sessionData.coachSignatureUrl || null,
                acknowledged_at: sessionData.acknowledgedAt ? new Date(sessionData.acknowledgedAt).toISOString() : null,
            };

            if (!sessionData.employeeId || !sessionData.coachId) {
                throw new Error('Employee and coach are required');
            }

            let savedRow: any;
            if (sessionData.id) {
                const { data, error } = await supabase
                    .from('coaching_sessions')
                    .update(payload)
                    .eq('id', sessionData.id)
                    .select()
                    .single();
                if (error) throw error;
                savedRow = data;
            } else {
                const { data, error } = await supabase
                    .from('coaching_sessions')
                    .insert(payload)
                    .select()
                    .single();
                if (error) throw error;
                savedRow = data;
            }

            const mapped = mapRowToSession(savedRow);
            setSessions(prev => {
                if (isNew) {
                    return [mapped, ...prev];
                }
                return prev.map(s => (s.id === mapped.id ? mapped : s));
            });
            setIsModalOpen(false);
        } catch (err) {
            console.error('Failed to save coaching session', err);
            alert('Failed to save coaching session. Please try again.');
        }
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
                employees={employees} 
            />
        </div>
    );
};

export default CoachingLog;
