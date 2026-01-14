
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Interview, InterviewFeedback, InterviewStatus, Permission, ApplicationStage, Role, Application, Candidate, JobPost, User } from '../../types';
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
import { supabase } from '../../services/supabaseClient';

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

    const [interviews, setInterviews] = useState<Interview[]>([]);
    const [feedbacks, setFeedbacks] = useState<InterviewFeedback[]>([]);
    const [applications, setApplications] = useState<Application[]>([]);
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [jobPosts, setJobPosts] = useState<JobPost[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const candidateOptions = useMemo(() => {
        return candidates.map(cand => {
            const apps = applications.filter(app => app.candidateId === cand.id);
            const latest = apps.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
            const jobTitle = latest ? (jobPosts.find(p => p.id === latest.jobPostId)?.title || 'Unknown') : 'No application';
            return {
                appId: latest?.id || '',
                label: `${cand.firstName} ${cand.lastName} - ${jobTitle}`,
            };
        }).filter(opt => opt.appId); // only candidates with applications
    }, [applications, candidates, jobPosts]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSchedulerOpen, setIsSchedulerOpen] = useState(false);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [selectedInterview, setSelectedInterview] = useState<Interview | null>(null);

    const [view, setView] = useState<'day' | 'week' | 'month'>('week');
    const [currentDate, setCurrentDate] = useState(new Date());

    const canManage = can('Interviews', Permission.Manage);
    const canView = can('Applicants', Permission.View) || can('Applicants', Permission.Manage);

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

    const mapInterview = useCallback((row: any): Interview => ({
        id: row.id,
        applicationId: row.application_id,
        interviewerId: row.interviewer_id,
        interviewType: row.type === 'Remote' ? 'Virtual' : row.type,
        scheduledStart: row.start_at ? new Date(row.start_at) : new Date(),
        scheduledEnd: row.end_at ? new Date(row.end_at) : new Date(),
        location: row.location || '',
        panelUserIds: row.panel_user_ids || (row.interviewer_id ? [row.interviewer_id] : []),
        calendarEventId: row.calendar_event_id || '',
        status: row.status as InterviewStatus,
        notes: row.notes || '',
    }), []);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [intRes, appRes, candRes, postRes, userRes, fbRes] = await Promise.all([
                supabase.from('job_interviews').select('*'),
                supabase.from('job_applications').select('*'),
                supabase.from('job_candidates').select('*'),
                supabase.from('job_posts').select('id,title'),
                supabase.from('hris_users').select('id,full_name,role,email'),
                supabase.from('job_interview_feedback').select('*'),
            ]);
            if (intRes.error) throw intRes.error;
            if (appRes.error) throw appRes.error;
            if (candRes.error) throw candRes.error;
            if (postRes.error) throw postRes.error;
            if (userRes.error) throw userRes.error;
            if (fbRes.error) throw fbRes.error;

            setInterviews((intRes.data || []).map(mapInterview));
            setApplications((appRes.data || []).map((a: any) => ({
                id: a.id,
                candidateId: a.candidate_id,
                jobPostId: a.job_post_id,
                requisitionId: a.requisition_id,
                stage: a.stage as ApplicationStage,
                ownerUserId: a.owner_user_id || undefined,
                createdAt: a.created_at ? new Date(a.created_at) : new Date(),
                updatedAt: a.updated_at ? new Date(a.updated_at) : new Date(),
                notes: a.notes || a.cover_letter || '',
                referrer: a.referrer || '',
            } as Application)));
            setCandidates((candRes.data || []).map((c: any) => ({
                id: c.id,
                firstName: c.first_name,
                lastName: c.last_name,
                email: c.email,
                phone: c.phone ?? '',
                source: c.source,
                tags: c.tags || [],
                portfolioUrl: c.portfolio_url || '',
                consentAt: c.consent_at ? new Date(c.consent_at) : undefined,
            } as Candidate)));
            setJobPosts((postRes.data || []).map((p: any) => ({
                id: p.id,
                title: p.title,
            } as JobPost)));
            setUsers((userRes.data || []).map((u: any) => ({
                id: u.id,
                name: u.full_name || u.email || 'User',
                email: u.email || '',
                role: u.role as Role,
                department: '',
                businessUnit: '',
                status: 'Active',
                isPhotoEnrolled: false,
                dateHired: new Date(),
                position: '',
                businessUnitId: undefined,
                departmentId: undefined,
            } as User)));
            setFeedbacks((fbRes.data || []).map((f: any) => ({
                id: f.id,
                interviewId: f.interview_id,
                reviewerUserId: f.reviewer_user_id,
                score: Number(f.score),
                competencyScores: f.competency_scores || {},
                strengths: f.strengths || '',
                concerns: f.concerns || '',
                hireRecommendation: f.hire_recommendation,
                submittedAt: f.submitted_at ? new Date(f.submitted_at) : new Date(),
            } as InterviewFeedback)));
        } catch (err) {
            console.error('Failed to load interviews', err);
            alert('Failed to load interview data.');
        } finally {
            setIsLoading(false);
        }
    }, [mapInterview]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleOpenScheduler = (interview: Interview | null = null) => {
        setSelectedInterview(interview);
        setIsSchedulerOpen(true);
    };

    const handleOpenDetail = (interview: Interview) => {
        setSelectedInterview(interview);
        setIsDetailOpen(true);
    };

    const handleSaveInterview = async (interviewToSave: Interview) => {
        const normalizedType =
            interviewToSave.interviewType === 'Virtual' ? 'Remote' :
            interviewToSave.interviewType === 'Phone Screen' ? 'Phone' :
            interviewToSave.interviewType || 'Remote';
        const normalizedStatus =
            interviewToSave.status === 'Completed' ? 'Completed' :
            interviewToSave.status === 'Cancelled' ? 'Cancelled' :
            'Scheduled';
        const payload = {
            application_id: interviewToSave.applicationId,
            interviewer_id: interviewToSave.panelUserIds?.[0] || interviewToSave.interviewerId || null,
            start_at: interviewToSave.scheduledStart,
            end_at: interviewToSave.scheduledEnd,
            location: interviewToSave.location || null,
            type: normalizedType,
            status: normalizedStatus,
            notes: interviewToSave.notes || null,
        };
        try {
            if (interviewToSave.id) {
                const { data, error } = await supabase.from('job_interviews').update(payload).eq('id', interviewToSave.id).select().single();
                if (error) throw error;
                setInterviews(prev => prev.map(i => i.id === interviewToSave.id ? mapInterview(data) : i));
            } else {
                const { data, error } = await supabase.from('job_interviews').insert(payload).select().single();
                if (error) throw error;
                setInterviews(prev => [mapInterview(data), ...prev]);
                // set application stage to Interview
                if (interviewToSave.applicationId) {
                    await supabase.from('job_applications').update({ stage: ApplicationStage.Interview }).eq('id', interviewToSave.applicationId);
                }
            }
            if (user) {
                logActivity(user, 'CREATE', 'Interview', interviewToSave.id || 'new', 'Scheduled interview');
            }
        } catch (err) {
            console.error('Failed to save interview', err);
            alert('Failed to save interview.');
        } finally {
            setIsSchedulerOpen(false);
        }
    };

    const handleSaveFeedback = async (feedbackToSave: InterviewFeedback) => {
        try {
            const payload = {
                interview_id: feedbackToSave.interviewId,
                reviewer_user_id: user?.id || feedbackToSave.reviewerUserId,
                score: feedbackToSave.score,
                competency_scores: feedbackToSave.competencyScores || {},
                strengths: feedbackToSave.strengths,
                concerns: feedbackToSave.concerns,
                hire_recommendation: feedbackToSave.hireRecommendation,
                submitted_at: feedbackToSave.submittedAt || new Date(),
            };
            const { data, error } = await supabase.from('job_interview_feedback').insert(payload).select().single();
            if (error) throw error;
            const mapped: InterviewFeedback = {
                id: data.id,
                interviewId: data.interview_id,
                reviewerUserId: data.reviewer_user_id,
                score: Number(data.score),
                competencyScores: data.competency_scores || {},
                strengths: data.strengths || '',
                concerns: data.concerns || '',
                hireRecommendation: data.hire_recommendation,
                submittedAt: data.submitted_at ? new Date(data.submitted_at) : new Date(),
            };
            setFeedbacks(prev => [mapped, ...prev]);
            // Mark interview as completed after feedback
            await supabase.from('job_interviews').update({ status: 'Completed' }).eq('id', mapped.interviewId);
            setInterviews(prev => prev.map(i => i.id === mapped.interviewId ? { ...i, status: InterviewStatus.Completed } : i));
        } catch (err) {
            console.error('Failed to save feedback', err);
            alert('Failed to save feedback.');
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
            {!canView ? (
                <Card><div className="p-6 text-gray-600 dark:text-gray-300">You do not have permission to view interviews.</div></Card>
            ) : (
            <>
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
                    candidateOptions={candidateOptions}
                    users={users}
                />
            )}

            {isDetailOpen && selectedInterview && (
                <InterviewDetailModal
                    isOpen={isDetailOpen}
                    onClose={() => setIsDetailOpen(false)}
                    interview={selectedInterview}
                    feedbacks={feedbacks.filter(f => f.interviewId === selectedInterview.id)}
                    onSaveFeedback={handleSaveFeedback}
                    applications={applications}
                    candidates={candidates}
                    users={users}
                />
            )}
            </>
            )}
        </div>
    );
};

export default Interviews;
