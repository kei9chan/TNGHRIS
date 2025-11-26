
import React, { useState, useMemo } from 'react';
import { Interview, InterviewFeedback, InterviewStatus, Permission, ApplicationStage, NotificationType, Notification, Role } from '../../types';
import { mockInterviews, mockInterviewFeedbacks, mockApplications, mockUsers, mockNotifications, mockCandidates } from '../../services/mockData';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { usePermissions } from '../../hooks/usePermissions';
import InterviewSchedulerModal from '../../components/recruitment/InterviewSchedulerModal';
import InterviewDetailModal from '../../components/recruitment/InterviewDetailModal';
import WeekView from '../../components/recruitment/WeekView';
import MonthView from '../../components/recruitment/MonthView';
import DayView from '../../components/recruitment/DayView';
import { useAuth } from '../../hooks/useAuth';
import { useSettings } from '../../context/SettingsContext';
import RichTextEditor from '../../components/ui/RichTextEditor';
import { logActivity } from '../../services/auditService';

// Date Helpers (to avoid external libraries)
const addDays = (date: Date, amount: number) => { const d = new Date(date); d.setDate(d.getDate() + amount); return d; };
const subDays = (date: Date, amount: number) => addDays(date, -amount);
const addMonths = (date: Date, amount: number) => { const d = new Date(date); d.setMonth(d.getMonth() + amount); return d; };
const subMonths = (date: Date, amount: number) => addMonths(date, -amount);

const EditIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" /></svg>;

const Interviews: React.FC = () => {
    const { can } = usePermissions();
    const { user } = useAuth();
    const { settings, updateSettings } = useSettings();
    const [isEditingDesc, setIsEditingDesc] = useState(false);
    const [editText, setEditText] = useState('');

    const [interviews, setInterviews] = useState<Interview[]>(mockInterviews);
    const [feedbacks, setFeedbacks] = useState<InterviewFeedback[]>(mockInterviewFeedbacks);
    const [isSchedulerOpen, setIsSchedulerOpen] = useState(false);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [selectedInterview, setSelectedInterview] = useState<Interview | null>(null);

    const [view, setView] = useState<'day' | 'week' | 'month'>('week');
    const [currentDate, setCurrentDate] = useState(new Date('2025-11-04'));

    const canManage = can('Interviews', Permission.Manage);

    const isAdmin = user?.role === Role.Admin;
    const descriptionKey = 'recruitmentInterviewsDesc';
    const description = settings[descriptionKey] as string || '';

    const handleEditDesc = () => {
        setEditText(description);
        setIsEditingDesc(true);
    };
    
    const handleSaveDesc = () => {
        updateSettings({ [descriptionKey]: editText });
        setIsEditingDesc(false);
    };

    const handleOpenScheduler = (interview: Interview | null = null) => {
        setSelectedInterview(interview);
        setIsSchedulerOpen(true);
    };

    const handleOpenDetail = (interview: Interview) => {
        setSelectedInterview(interview);
        setIsDetailOpen(true);
    };

    const handleSaveInterview = (interviewToSave: Interview) => {
        let savedInterview: Interview;
        if (interviewToSave.id) {
            savedInterview = interviewToSave;
            const updated = interviews.map(i => i.id === interviewToSave.id ? interviewToSave : i);
            setInterviews(updated);
            const mockIndex = mockInterviews.findIndex(i => i.id === interviewToSave.id);
            if (mockIndex > -1) mockInterviews[mockIndex] = interviewToSave;
        } else {
            const newInterview = { ...interviewToSave, id: `INT-${Date.now()}`};
            savedInterview = newInterview;
            setInterviews(prev => [newInterview, ...prev]);
            mockInterviews.unshift(newInterview);
        }

        // Update applicant stage and send notifications for NEW interviews
        if (!interviewToSave.id) {
            const appIndex = mockApplications.findIndex(app => app.id === savedInterview.applicationId);
            if (appIndex > -1) {
                mockApplications[appIndex].stage = ApplicationStage.Interview;
            }

            const application = mockApplications.find(a => a.id === savedInterview.applicationId);
            const candidate = mockCandidates.find(c => c.id === application?.candidateId);
            const applicantName = candidate ? `${candidate.firstName} ${candidate.lastName}` : 'the applicant';
            const interviewDate = new Date(savedInterview.scheduledStart).toLocaleString();
            const interviewLocation = savedInterview.location;

            // --- Email Simulation Logic ---
            const panelists = mockUsers.filter(u => savedInterview.panelUserIds.includes(u.id));
            
            // List of people receiving emails
            const recipients = [
                candidate ? `Candidate: ${candidate.email}` : null,
                ...panelists.map(p => `Interviewer: ${p.email}`)
            ].filter(Boolean);

            // Log activity
            if (user) {
                logActivity(
                    user, 
                    'CREATE', 
                    'Interview', 
                    savedInterview.id, 
                    `Scheduled interview with ${applicantName} for ${interviewDate}. Emailed ${recipients.length} recipients.`
                );
            }

            // In-App Notifications
            savedInterview.panelUserIds.forEach(userId => {
                const newNotification: Notification = {
                    id: `notif-${Date.now()}-${userId}`,
                    userId: userId,
                    type: NotificationType.InterviewInvite,
                    message: `For ${applicantName} on ${new Date(savedInterview.scheduledStart).toLocaleDateString()}.`,
                    link: '/recruitment/interviews',
                    isRead: false,
                    createdAt: new Date(),
                    relatedEntityId: savedInterview.id,
                };
                mockNotifications.unshift(newNotification);
            });

            // User Feedback
            alert(`Interview Scheduled Successfully!\n\nEmails with calendar invites have been sent to:\n${recipients.join('\n')}`);
        }
        setIsSchedulerOpen(false);
    };

    const handleSaveFeedback = (feedbackToSave: InterviewFeedback) => {
        if (feedbackToSave.id) {
            // Not implemented for this MVP - editing feedback
        } else {
            const newFeedback = { ...feedbackToSave, id: `FDBK-${Date.now()}` };
            setFeedbacks(prev => [newFeedback, ...prev]);
            mockInterviewFeedbacks.unshift(newFeedback);

            const updatedInterviews = interviews.map(i => 
                i.id === newFeedback.interviewId ? { ...i, status: InterviewStatus.Completed } : i
            );
            setInterviews(updatedInterviews);
            const mockInterviewIndex = mockInterviews.findIndex(i => i.id === newFeedback.interviewId);
            if(mockInterviewIndex > -1) mockInterviews[mockInterviewIndex].status = InterviewStatus.Completed;

        }
    };
    
    const handlePrev = () => {
        if (view === 'day') setCurrentDate(subDays(currentDate, 1));
        if (view === 'week') setCurrentDate(subDays(currentDate, 7));
        if (view === 'month') setCurrentDate(subMonths(currentDate, 1));
    };

    const handleNext = () => {
        if (view === 'day') setCurrentDate(addDays(currentDate, 1));
        if (view === 'week') setCurrentDate(addDays(currentDate, 7));
        if (view === 'month') setCurrentDate(addMonths(currentDate, 1));
    };

    const handleToday = () => {
        setCurrentDate(new Date());
    };

    const viewHeader = useMemo(() => {
        if (view === 'day') return currentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        if (view === 'week') {
            const start = subDays(currentDate, currentDate.getDay());
            const end = addDays(start, 6);
            return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
        }
        if (view === 'month') return currentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    }, [currentDate, view]);

    const renderView = () => {
        switch (view) {
            case 'day':
                return <DayView currentDate={currentDate} interviews={interviews} onInterviewClick={handleOpenDetail} />;
            case 'month':
                return <MonthView currentDate={currentDate} interviews={interviews} onDateClick={(date) => { setCurrentDate(date); setView('day'); }} />;
            case 'week':
            default:
                return <WeekView currentDate={currentDate} interviews={interviews} onInterviewClick={handleOpenDetail} />;
        }
    };

    const viewButtonClass = (buttonView: typeof view) => `px-3 py-1 text-sm font-medium rounded-md transition-colors ${view === buttonView ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 shadow-sm' : 'text-gray-600 dark:text-gray-300 hover:bg-white/50'}`;

    return (
        <div className="space-y-6">
             <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Interviews</h1>
            {isEditingDesc ? (
                <div className="p-4 border rounded-lg bg-gray-50 dark:bg-slate-800/50 dark:border-slate-700 space-y-4">
                    <RichTextEditor
                        label="Edit Description"
                        value={editText}
                        onChange={setEditText}
                    />
                    <div className="flex justify-end space-x-2">
                        <Button variant="secondary" onClick={() => setIsEditingDesc(false)}>Cancel</Button>
                        <Button onClick={handleSaveDesc}>Save</Button>
                    </div>
                </div>
            ) : (
                <div className="relative group">
                    <div 
                        className="text-gray-600 dark:text-gray-400 mt-2" 
                        dangerouslySetInnerHTML={{ __html: description }}
                    />
                    {isAdmin && (
                        <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button size="sm" variant="secondary" onClick={handleEditDesc} title="Edit description">
                                <EditIcon />
                            </Button>
                        </div>
                    )}
                </div>
            )}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center space-x-2">
                    <Button variant="secondary" onClick={handlePrev}>&larr;</Button>
                    <Button variant="secondary" onClick={handleToday}>Today</Button>
                    <Button variant="secondary" onClick={handleNext}>&rarr;</Button>
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 ml-4">{viewHeader}</h2>
                </div>
                 <div className="flex items-center space-x-2">
                    <div className="flex items-center bg-gray-200 dark:bg-gray-700 rounded-lg p-1 space-x-1">
                        <button onClick={() => setView('day')} className={viewButtonClass('day')}>Day</button>
                        <button onClick={() => setView('week')} className={viewButtonClass('week')}>Week</button>
                        <button onClick={() => setView('month')} className={viewButtonClass('month')}>Month</button>
                    </div>
                     {canManage && (
                        <Button onClick={() => handleOpenScheduler()}>Schedule New</Button>
                    )}
                </div>
            </div>
            
            <Card>
                {renderView()}
            </Card>

            {isSchedulerOpen && (
                <InterviewSchedulerModal
                    isOpen={isSchedulerOpen}
                    onClose={() => setIsSchedulerOpen(false)}
                    interview={selectedInterview}
                    onSave={handleSaveInterview}
                />
            )}

            {isDetailOpen && selectedInterview && (
                <InterviewDetailModal
                    isOpen={isDetailOpen}
                    onClose={() => setIsDetailOpen(false)}
                    interview={selectedInterview}
                    feedbacks={feedbacks.filter(f => f.interviewId === selectedInterview.id)}
                    onSaveFeedback={handleSaveFeedback}
                />
            )}
        </div>
    );
};

export default Interviews;
