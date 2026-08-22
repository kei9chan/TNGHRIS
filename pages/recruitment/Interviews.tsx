
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Interview, InterviewFeedback, InterviewStatus, Permission, ApplicationStage, Role, Application, Candidate, JobPost, User, BusinessUnit, Department } from '../../types';
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
import { formatEmployeeName } from '../../services/formatEmployeeName';
import { InterviewCandidateOption, InterviewScheduleOptions, scheduleInterviewWorkflow } from '../../services/interviewSchedulingService';

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
    const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [requisitions, setRequisitions] = useState<{ id: string; businessUnitId?: string; departmentId?: string }[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const candidateOptions = useMemo<InterviewCandidateOption[]>(() => applications.map(application => {
        const candidate = candidates.find(item => item.id === application.candidateId);
        const post = jobPosts.find(item => item.id === application.jobPostId);
        const requisition = requisitions.find(item => item.id === (application.requisitionId || post?.requisitionId));
        const businessUnitId = post?.businessUnitId || requisition?.businessUnitId;
        const departmentId = requisition?.departmentId;
        return {
            appId: application.id,
            candidateName: candidate ? `${candidate.firstName} ${candidate.lastName}`.trim() : 'Unknown applicant',
            firstName: candidate?.firstName || 'Applicant',
            email: candidate?.email || '',
            position: post?.title || 'Position not specified',
            businessUnitId,
            businessUnitName: businessUnits.find(item => item.id === businessUnitId)?.name || 'Business unit not specified',
            departmentId,
            departmentName: departments.find(item => item.id === departmentId)?.name || '',
            stage: application.stage,
        };
    }), [applications, businessUnits, candidates, departments, jobPosts, requisitions]);
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
        location: row.google_meet_link || row.location || '',
        panelUserIds: row.panel_user_ids || (row.interviewer_id ? [row.interviewer_id] : []),
        calendarEventId: row.calendar_event_id || '',
        googleCalendarLink: row.google_calendar_link || undefined,
        googleMeetLink: row.google_meet_link || undefined,
        calendarInviteStatus: row.calendar_invite_status || 'not_requested',
        applicantInviteStatus: row.applicant_invite_status || 'not_requested',
        panelInviteStatus: row.panel_invite_status || 'not_requested',
        confirmationEmailStatus: row.confirmation_email_status || 'not_requested',
        applicantInviteSentAt: row.applicant_invite_sent_at ? new Date(row.applicant_invite_sent_at) : undefined,
        panelInviteSentAt: row.panel_invite_sent_at ? new Date(row.panel_invite_sent_at) : undefined,
        confirmationEmailSentAt: row.confirmation_email_sent_at ? new Date(row.confirmation_email_sent_at) : undefined,
        calendarError: row.calendar_error || undefined,
        status: row.status as InterviewStatus,
        notes: row.notes || '',
    }), []);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [intRes, appRes, candRes, postRes, userRes, fbRes, buRes, deptRes, reqRes] = await Promise.all([
                supabase.from('job_interviews').select('*'),
                supabase.from('job_applications').select('*'),
                supabase.from('job_candidates').select('*'),
                supabase.from('job_posts').select('id,title,business_unit_id,requisition_id'),
                supabase.from('hris_users').select('id,full_name,role,email,position,department,department_id,business_unit,business_unit_id,status'),
                supabase.from('job_interview_feedback').select('*'),
                supabase.from('business_units').select('id,name'),
                supabase.from('departments').select('id,name,business_unit_id'),
                supabase.from('job_requisitions').select('id,business_unit_id,department_id'),
            ]);
            if (intRes.error) throw intRes.error;
            if (appRes.error) throw appRes.error;
            if (candRes.error) throw candRes.error;
            if (postRes.error) throw postRes.error;
            if (userRes.error) throw userRes.error;
            if (fbRes.error) throw fbRes.error;
            if (buRes.error) console.warn('Business units unavailable for interview details', buRes.error);
            if (deptRes.error) console.warn('Departments unavailable for interview filters', deptRes.error);
            if (reqRes.error) console.warn('Requisitions unavailable for interview filters', reqRes.error);

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
                businessUnitId: p.business_unit_id,
                requisitionId: p.requisition_id,
            } as JobPost)));
            setBusinessUnits((buRes.data || []).map((bu: any) => ({
                id: bu.id,
                name: bu.name,
            } as BusinessUnit)));
            setDepartments((deptRes.data || []).map((department: any) => ({
                id: department.id,
                name: department.name,
                businessUnitId: department.business_unit_id,
            } as Department)));
            setRequisitions((reqRes.data || []).map((requisition: any) => ({
                id: requisition.id,
                businessUnitId: requisition.business_unit_id || undefined,
                departmentId: requisition.department_id || undefined,
            })));
            setUsers((userRes.data || []).map((u: any) => ({
                id: u.id,
                name: formatEmployeeName(u.full_name || u.email || 'User'),
                email: u.email || '',
                role: u.role as Role,
                department: u.department || '',
                businessUnit: u.business_unit || '',
                status: u.status === 'Inactive' ? 'Inactive' : 'Active',
                isPhotoEnrolled: false,
                dateHired: new Date(),
                position: u.position || '',
                businessUnitId: u.business_unit_id || undefined,
                departmentId: u.department_id || undefined,
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

    const handleSaveInterview = async (interviewToSave: Interview, options: InterviewScheduleOptions) => {
        const applicant = candidateOptions.find(item => item.appId === interviewToSave.applicationId);
        if (!applicant) throw new Error('The selected applicant could not be loaded.');
        const panel = users.filter(member => interviewToSave.panelUserIds?.includes(member.id));
        if (panel.length !== interviewToSave.panelUserIds?.length) throw new Error('One or more panel members could not be loaded.');

        const outcome = await scheduleInterviewWorkflow({ interview: interviewToSave, options, applicant, panel });
        const saved = mapInterview(outcome.row);
        setInterviews(previous => previous.some(item => item.id === saved.id)
            ? previous.map(item => item.id === saved.id ? saved : item)
            : [saved, ...previous]);
        setApplications(previous => previous.map(application => application.id === saved.applicationId
            ? { ...application, stage: ApplicationStage.Interview, updatedAt: new Date() }
            : application));
        setSelectedInterview(saved);
        setIsSchedulerOpen(false);
        setIsDetailOpen(true);
        if (user) logActivity(user, interviewToSave.id ? 'UPDATE' : 'CREATE', 'Interview', saved.id, 'Scheduled interview');
        if (outcome.warning) alert(outcome.warning);
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
                return <DayView currentDate={currentDate} interviews={interviews} applications={applications} candidates={candidates} jobPosts={jobPosts} users={users} onInterviewClick={handleOpenDetail} />;
            case 'month':
                return <MonthView currentDate={currentDate} interviews={interviews} applications={applications} candidates={candidates} jobPosts={jobPosts} onDateClick={(date) => { setCurrentDate(date); setView('day'); }} onInterviewClick={handleOpenDetail} />;
            case 'week':
            default:
                return <WeekView currentDate={currentDate} interviews={interviews} applications={applications} candidates={candidates} jobPosts={jobPosts} onInterviewClick={handleOpenDetail} />;
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
                    businessUnits={businessUnits}
                    departments={departments}
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
                    jobPosts={jobPosts}
                    businessUnits={businessUnits}
                    users={users}
                />
            )}
            </>
            )}
        </div>
    );
};

export default Interviews;
