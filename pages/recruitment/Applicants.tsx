
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Application, ApplicationStage, Candidate, CandidateSource, JobPostStatus, Role, BusinessUnit, JobRequisition, Interview, JobPost, Permission, User, Offer, OfferStatus, Department, InterviewRatingRecord } from '../../types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { useSettings } from '../../context/SettingsContext';
import RichTextEditor from '../../components/ui/RichTextEditor';
import AddApplicantModal from '../../components/recruitment/AddApplicantModal';
import ApplicantKanbanBoard from '../../components/recruitment/ApplicantKanbanBoard';
import ApplicantDetailModal from '../../components/recruitment/ApplicantDetailModal';
import { logActivity } from '../../services/auditService';
import InterviewSchedulerModal from '../../components/recruitment/InterviewSchedulerModal';
import RejectionEmailModal from '../../components/recruitment/RejectionEmailModal';
import { supabase } from '../../services/supabaseClient';
import { buildInterviewApplicantOption, InterviewScheduleResult, saveInterviewSchedule } from '../../services/recruitmentInterviewService';
import { formatEmployeeName } from '../../services/formatEmployeeName';
import { EnrichedOffer } from '../../components/recruitment/OfferTable';
import { fetchRatingRecordsForCandidate } from '../../services/interviewRatingService';
import { mapJobOfferRow } from '../../services/jobOfferMapper';
import { candidateOfferUrl, isPublishedOffer, offerWorkspaceStatus, saveOfferDraft, selectCurrentOffer, sendApprovedOffer } from '../../services/jobOfferWorkspaceService';
import type { HrisEmailAttachment } from '../../services/gmailConnectionService';
import { employmentTypeLabel } from '../../components/recruitment/offerEmployment';

const CandidateProfileModal = React.lazy(() => import('../../components/recruitment/CandidateProfileModal'));
const CreateInterviewRatingModal = React.lazy(() => import('../../components/recruitment/CreateInterviewRatingModal'));
const OfferCreationDrawer = React.lazy(() => import('../../components/recruitment/OfferCreationDrawer'));
const OfferApprovalPackageModal = React.lazy(() => import('../../components/recruitment/OfferApprovalPackageModal'));

export interface EnrichedApplication extends Application {
    candidateName: string;
    candidateEmail?: string;
    candidateFirstName?: string;
    candidateLastName?: string;
    candidatePhone?: string;
    candidatePortfolioUrl?: string;
    candidateTags?: string[];
    jobTitle: string;
    businessUnitName: string;
    businessUnitId?: string;
    departmentName: string;
    candidateSource?: CandidateSource;
    applicationReference?: string;
}

// --- ICONS ---
const EditIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" /></svg>;
const ViewColumnsIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2-2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h5a2 2 0 00-2-2V7a2 2 0 00-2-2h-5a2 2 0 00-2 2m0 10V7m0 10h5" /></svg>;
const ListBulletIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>;

// --- LIST VIEW ---
const getStageColor = (stage: ApplicationStage) => ({
    [ApplicationStage.Hired]: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
    [ApplicationStage.Offer]: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300',
    [ApplicationStage.Interview]: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
    [ApplicationStage.Rejected]: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
    [ApplicationStage.Withdrawn]: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
}[stage] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200');

interface ApplicantListTableProps {
    applications: EnrichedApplication[];
    offers: Offer[];
    onRowClick: (app: EnrichedApplication) => void;
    onViewProfile: (app: EnrichedApplication) => void;
    onCreateRating: (app: EnrichedApplication) => void;
    onScheduleInterview: (app: EnrichedApplication) => void;
    onOfferAction: (app: EnrichedApplication, offer: Offer | null) => void;
    onReject: (app: EnrichedApplication) => void;
    canManageApplicants: boolean;
    canManageInterviews: boolean;
    canViewOffers: boolean;
    canManageOffers: boolean;
}

const offerColor = (label: string) => label === 'Accepted & Signed'
    ? 'bg-green-100 text-green-800'
    : ['Sent', 'Viewed'].includes(label) ? 'bg-blue-100 text-blue-800' : label === 'Draft' ? 'bg-gray-100 text-gray-800' : 'text-gray-500';

const ApplicantListTable: React.FC<ApplicantListTableProps> = ({ applications, offers, onRowClick, onViewProfile, onCreateRating, onScheduleInterview, onOfferAction, onReject, canManageApplicants, canManageInterviews, canViewOffers, canManageOffers }) => (
    <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase">Candidate</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase">Position</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase">Business Unit</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase">Stage</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase">Applied</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase">Offer</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase">Actions</th>
                </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {applications.map(app => { const currentOffer = selectCurrentOffer(offers, app.id); const offerLabel = offerWorkspaceStatus(currentOffer); const inactive = [ApplicationStage.Rejected, ApplicationStage.Withdrawn].includes(app.stage); return (
                    <tr key={app.id} onClick={() => onRowClick(app)} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                        <td className="px-6 py-4 whitespace-nowrap font-medium">{app.candidateName}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{app.jobTitle}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{app.businessUnitName}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm"><span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStageColor(app.stage)}`}>{app.stage}</span></td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{new Date(app.createdAt).toLocaleDateString()}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${offerColor(offerLabel)}`}>{offerLabel}</span>{currentOffer && isPublishedOffer(currentOffer) && currentOffer.secureToken && <span className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><span className="h-2 w-2 rounded-full bg-emerald-500"/>Live</span>}{currentOffer && <span className="mt-1 block text-xs text-slate-500">{employmentTypeLabel(currentOffer)}{currentOffer.employmentEndDate ? ` · Ends ${new Date(currentOffer.employmentEndDate).toLocaleDateString()}` : ''}</span>}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm"><div className="flex gap-2" onClick={(event) => event.stopPropagation()}><button type="button" onClick={() => onViewProfile(app)} className="rounded-md border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">View Profile</button>{canManageInterviews && !inactive && <button type="button" onClick={() => onCreateRating(app)} className="rounded-md border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">Create Interview Rating</button>}{canManageApplicants && !inactive && <button type="button" onClick={() => onScheduleInterview(app)} className="rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700">Schedule Interview</button>}{(canManageOffers || (canViewOffers && currentOffer && isPublishedOffer(currentOffer))) && !inactive && <button type="button" onClick={() => onOfferAction(app, currentOffer)} className={`rounded-md px-3 py-2 text-xs font-semibold ${currentOffer && isPublishedOffer(currentOffer) ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'border border-indigo-200 text-indigo-700 hover:bg-indigo-50'}`}>{!currentOffer ? 'Create Offer' : currentOffer.status === OfferStatus.Draft ? 'View/Edit Offer' : 'Open Live Offer'}</button>}{canManageApplicants && !inactive && <button type="button" onClick={() => onReject(app)} className="rounded-md border border-red-300 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/20">Reject</button>}</div></td>
                    </tr>
                ); })}
            </tbody>
        </table>
    </div>
);

// ----- MAIN COMPONENT -----
const Applicants: React.FC = () => {
    const { user } = useAuth();
    const { can, getAccessibleBusinessUnits } = usePermissions();
    const { settings, updateSettings } = useSettings();
    const [isEditingDesc, setIsEditingDesc] = useState(false);
    const [editText, setEditText] = useState('');

    const [applications, setApplications] = useState<Application[]>([]);
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [jobPosts, setJobPosts] = useState<JobPost[]>([]);
    const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
    const [jobRequisitions, setJobRequisitions] = useState<JobRequisition[]>([]);
    const [departments, setDepartments] = useState<{ id: string; name: string; businessUnitId: string }[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [offers, setOffers] = useState<Offer[]>([]);
    const [businessUnitLogos, setBusinessUnitLogos] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(true);

    const [selectedApplication, setSelectedApplication] = useState<EnrichedApplication | null>(null);
    const [profileApplication, setProfileApplication] = useState<EnrichedApplication | null>(null);
    const [ratingApplication, setRatingApplication] = useState<EnrichedApplication | null>(null);
    const [offerApplication, setOfferApplication] = useState<EnrichedApplication | null>(null);
    const [editingOffer, setEditingOffer] = useState<Offer | null>(null);
    const [approvalPackage, setApprovalPackage] = useState<{ offer: EnrichedOffer; candidate: Candidate; application: Application; ratings: InterviewRatingRecord[] } | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    
    // Automation Modal States
    const [isSchedulerOpen, setIsSchedulerOpen] = useState(false);
    const [isRejectionModalOpen, setIsRejectionModalOpen] = useState(false);
    const [pendingAppId, setPendingAppId] = useState<string | null>(null);
    const [pendingStage, setPendingStage] = useState<ApplicationStage | null>(null);
    
    const [buFilter, setBuFilter] = useState<string>('');
    const [departmentFilter, setDepartmentFilter] = useState<string>('');
    const [yearFilter, setYearFilter] = useState<string>('all');
    const [monthFilter, setMonthFilter] = useState<string>('all');
    const [view, setView] = useState<'kanban' | 'list'>('list');

    const accessibleBus = useMemo(() => getAccessibleBusinessUnits(businessUnits), [getAccessibleBusinessUnits, businessUnits]);

    const isAdmin = user?.role === Role.Admin;
    const descriptionKey = 'recruitmentApplicantsDesc';
    const description = settings[descriptionKey] as string || '';
    
    const handleEditDesc = () => { setEditText(description); setIsEditingDesc(true); };
    const handleSaveDesc = () => { updateSettings({ [descriptionKey]: editText }); setIsEditingDesc(false); };

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [buRes, deptRes, reqRes, postRes, candRes, appRes, userRes, offerRes, themeRes] = await Promise.all([
                supabase.from('business_units').select('id,name'),
                supabase.from('departments').select('id,name,business_unit_id'),
                supabase.from('job_requisitions').select('*'),
                supabase.from('job_posts').select('*'),
                supabase.from('job_candidates').select('*'),
                supabase.from('job_applications').select('*'),
                supabase.from('hris_users').select('id,full_name,role,email,department,position,business_unit,business_unit_id,department_id,status'),
                supabase.from('job_offers').select('*').order('updated_at', { ascending: false }),
                supabase.from('applicant_page_themes').select('business_unit_id,logo_url').not('business_unit_id', 'is', null).order('updated_at', { ascending: false }),
            ]);
            if (buRes.error) throw buRes.error;
            if (deptRes.error) throw deptRes.error;
            if (reqRes.error) throw reqRes.error;
            if (postRes.error) throw postRes.error;
            if (candRes.error) throw candRes.error;
            if (appRes.error) throw appRes.error;
            if (userRes.error) throw userRes.error;
            if (offerRes.error) throw offerRes.error;

            setBusinessUnits(buRes.data || []);
            setDepartments((deptRes.data || []).map((d: any) => ({ id: d.id, name: d.name, businessUnitId: d.business_unit_id })));
            setJobRequisitions((reqRes.data || []).map((r: any) => ({
                ...r,
                createdAt: r.created_at ? new Date(r.created_at) : new Date(),
                updatedAt: r.updated_at ? new Date(r.updated_at) : new Date(),
                departmentId: r.department_id,
                businessUnitId: r.business_unit_id,
            } as JobRequisition)));
            const postsMapped = (postRes.data || []).map((p: any) => {
                const statusRaw = (p.status || '').toString().toLowerCase();
                const status =
                    statusRaw === 'published' ? JobPostStatus.Published :
                    statusRaw === 'paused' ? JobPostStatus.Paused :
                    statusRaw === 'closed' ? JobPostStatus.Closed :
                    JobPostStatus.Draft;
                return {
                    id: p.id,
                    requisitionId: p.requisition_id,
                    businessUnitId: p.business_unit_id,
                    title: p.title,
                    slug: p.slug,
                    description: p.description,
                    requirements: p.requirements ?? '',
                    benefits: p.benefits ?? '',
                    locationLabel: p.location_label ?? '',
                    employmentType: p.employment_type,
                    status,
                    publishedAt: p.published_at ? new Date(p.published_at) : undefined,
                    channels: p.channels || { careerSite: false, qr: false, social: false, jobBoards: false },
                    referralBonus: p.referral_bonus ?? undefined,
                    departmentLabel: p.department_label ?? undefined,
                } as JobPost;
            });
            setJobPosts(postsMapped);
            setCandidates((candRes.data || []).map((c: any) => ({
                id: c.id,
                firstName: c.first_name,
                lastName: c.last_name,
                email: c.email,
                phone: c.phone ?? '',
                source: c.source as CandidateSource,
                tags: c.tags || [],
                portfolioUrl: c.portfolio_url || '',
                consentAt: c.consent_at ? new Date(c.consent_at) : undefined,
                currentCity: c.current_city || undefined,
                currentEmployer: c.current_employer || undefined,
                yearsRelevantExperience: c.years_relevant_experience || undefined,
                earliestStartDate: c.earliest_start_date || undefined,
                linkedinUrl: c.linkedin_url || undefined,
            } as Candidate)));
            const appsMapped = (appRes.data || []).map((a: any) => ({
                id: a.id,
                candidateId: a.candidate_id,
                jobPostId: a.job_post_id,
                requisitionId: a.requisition_id,
                stage: a.stage as ApplicationStage,
                notes: a.notes || '',
                createdAt: a.created_at ? new Date(a.created_at) : new Date(),
                updatedAt: a.updated_at ? new Date(a.updated_at) : new Date(),
                roleId: a.role_id || undefined,
                roleSlug: a.role_slug || undefined,
                roleTitleSnapshot: a.role_title_snapshot || undefined,
                departmentSnapshot: a.department_snapshot || undefined,
                locationSnapshot: a.location_snapshot || undefined,
                employmentTypeSnapshot: a.employment_type_snapshot || undefined,
                workArrangementSnapshot: a.work_arrangement_snapshot || undefined,
                roleAnswers: a.role_answers || undefined,
                sourceApplicationPage: a.source_application_page || undefined,
                applicationReference: a.application_reference || undefined,
                submissionToken: a.submission_token || undefined,
                resumeLink: a.resume_link || undefined,
                resumeFileUrl: a.resume_file_url || undefined,
                resumeFilePath: a.resume_file_path || undefined,
                coverLetter: a.cover_letter || undefined,
            } as Application));
            setApplications(appsMapped);
            setUsers((userRes.data || []).map((u: any) => ({
                id: u.id,
                name: formatEmployeeName(u.full_name || u.email || 'User'),
                email: u.email || '',
                role: u.role as Role,
                department: u.department || '',
                businessUnit: u.business_unit || '',
                businessUnitId: u.business_unit_id || undefined,
                departmentId: u.department_id || undefined,
                position: u.position || '',
                status: u.status === 'Inactive' ? 'Inactive' : 'Active',
                isPhotoEnrolled: false,
                dateHired: new Date(),
            } as User)));
            setOffers((offerRes.data || []).map(mapJobOfferRow));
            if (!themeRes.error) setBusinessUnitLogos((themeRes.data || []).reduce((logos: Record<string, string>, row: any) => {
                if (row.business_unit_id && row.logo_url && !logos[row.business_unit_id]) logos[row.business_unit_id] = row.logo_url;
                return logos;
            }, {}));
        } catch (err) {
            console.error('Failed to load applicants', err);
            alert('Failed to load applicant data.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const loadOffers = useCallback(async () => {
        const { data, error } = await supabase.from('job_offers').select('*').order('updated_at', { ascending: false });
        if (!error) setOffers((data || []).map(mapJobOfferRow));
    }, []);

    useEffect(() => {
        const channel = supabase.channel('ats-offer-workspace').on('postgres_changes', { event: '*', schema: 'public', table: 'job_offers' }, () => { void loadOffers(); }).subscribe();
        return () => { void supabase.removeChannel(channel); };
    }, [loadOffers]);

    const enrichedApplications: EnrichedApplication[] = useMemo(() => {
        return applications.map(app => {
            const candidate = candidates.find(c => c.id === app.candidateId);
            const jobPost = jobPosts.find(p => p.id === app.jobPostId);
            const requisition = jobRequisitions.find(r => r.id === app.requisitionId);
            const businessUnit = businessUnits.find(bu => bu.id === (jobPost?.businessUnitId || requisition?.businessUnitId));
            const department = departments.find(d => d.id === requisition?.departmentId);
            return {
                ...app,
                candidateName: candidate ? `${candidate.firstName} ${candidate.lastName}` : 'Unknown',
                candidateEmail: candidate?.email,
                candidateFirstName: candidate?.firstName,
                candidateLastName: candidate?.lastName,
                candidatePhone: candidate?.phone,
                candidatePortfolioUrl: candidate?.portfolioUrl,
                candidateTags: candidate?.tags,
                jobTitle: jobPost?.title || app.roleTitleSnapshot || 'General Application',
                businessUnitName: businessUnit?.name || 'N/A',
                businessUnitId: businessUnit?.id,
                departmentName: department?.name || app.departmentSnapshot || 'N/A',
                candidateSource: candidate?.source,
                applicationReference: app.applicationReference,
            };
        }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [applications, candidates, jobPosts, jobRequisitions, businessUnits, departments]);

    const interviewCandidateOptions = useMemo(() => enrichedApplications.map((application) => {
        const candidate = candidates.find((item) => item.id === application.candidateId);
        if (!candidate) return null;
        return buildInterviewApplicantOption({
            application,
            candidate,
            jobPost: jobPosts.find((post) => post.id === application.jobPostId),
            businessUnitName: application.businessUnitName,
            departmentName: application.departmentName,
        });
    }).filter(Boolean) as ReturnType<typeof buildInterviewApplicantOption>[], [candidates, enrichedApplications, jobPosts]);

    const departmentsForBU = useMemo(() => {
        if (!buFilter) return departments;
        return departments.filter(d => d.businessUnitId === buFilter);
    }, [buFilter, departments]);

    const yearOptions = useMemo(() => {
        const years = new Set(enrichedApplications.map(app => new Date(app.createdAt).getFullYear()));
        years.add(new Date().getFullYear());
        return Array.from(years).sort((a, b) => b - a);
    }, [enrichedApplications]);
    
    const monthOptions = [{ value: 'all', name: 'All Months' }, ...Array.from({length: 12}, (_, i) => ({ value: (i+1).toString(), name: new Date(0, i).toLocaleString('default', { month: 'long' }) }))];

    const filteredApplications = useMemo(() => {
        return enrichedApplications.filter(app => {
            const buName = businessUnits.find(b => b.id === buFilter)?.name;
            const deptName = departments.find(d => d.id === departmentFilter)?.name;
            
            const appDate = new Date(app.createdAt);
            const buMatch = !buFilter || app.businessUnitName === buName;
            const deptMatch = !departmentFilter || app.departmentName === deptName;
            const yearMatch = yearFilter === 'all' || appDate.getFullYear().toString() === yearFilter;
            const monthMatch = monthFilter === 'all' || (appDate.getMonth() + 1).toString() === monthFilter;
            return buMatch && deptMatch && yearMatch && monthMatch;
        });
    }, [enrichedApplications, buFilter, departmentFilter, yearFilter, monthFilter, accessibleBus, businessUnits, departments]);

    const performStageUpdate = async (appId: string, stage: ApplicationStage) => {
        const updatedAt = new Date();
        setApplications(prev => prev.map(app => app.id === appId ? { ...app, stage, updatedAt } : app));
        try {
            const { error } = await supabase.from('job_applications').update({ stage, updated_at: updatedAt }).eq('id', appId);
            if (error) throw error;
            logActivity(user, 'UPDATE', 'Application', appId, `Updated application stage to ${stage}`);
        } catch (err) {
            console.error('Failed to update stage', err);
            alert('Failed to update stage.');
        }
    };

    const handleUpdateStage = (applicationId: string, newStage: ApplicationStage) => {
        // --- Automation Logic ---
        
        if (newStage === ApplicationStage.Interview) {
            setPendingAppId(applicationId);
            setPendingStage(newStage);
            // The stage is updated only after the interview is successfully saved.
            setIsSchedulerOpen(true);
            return;
        }

        if (newStage === ApplicationStage.Rejected) {
            setPendingAppId(applicationId);
            setPendingStage(newStage);
            setIsRejectionModalOpen(true);
            // Don't update stage yet, wait for confirmation/email send
            return;
        }
        
        // Standard update for other stages
        performStageUpdate(applicationId, newStage);
    };

    const openInterviewScheduler = (application: EnrichedApplication) => {
        setPendingAppId(application.id);
        setPendingStage(ApplicationStage.Interview);
        setIsSchedulerOpen(true);
    };

    const openRejectionEmail = (application: EnrichedApplication) => {
        setPendingAppId(application.id);
        setPendingStage(ApplicationStage.Rejected);
        setIsRejectionModalOpen(true);
    };

    const candidateForApplication = (application: Application) => candidates.find(candidate => candidate.id === application.candidateId) || null;

    const enrichOffer = (offer: Offer, application: EnrichedApplication, candidate: Candidate): EnrichedOffer => ({
        ...offer,
        candidateName: `${candidate.firstName} ${candidate.lastName}`,
        candidateEmail: candidate.email,
        jobTitle: application.jobTitle,
        businessUnitId: application.businessUnitId,
        businessUnitName: application.businessUnitName,
        departmentName: application.departmentName,
    });

    const openOfferAction = (application: EnrichedApplication, currentOffer: Offer | null) => {
        if (currentOffer && isPublishedOffer(currentOffer)) {
            const url = candidateOfferUrl(currentOffer);
            if (url) window.open(url, '_blank', 'noopener,noreferrer');
            return;
        }
        if (!can('Offers', Permission.Manage)) return;
        setOfferApplication(application);
        setEditingOffer(currentOffer?.status === OfferStatus.Draft ? currentOffer : null);
    };

    const handleSaveOffer = async (offerToSave: Offer): Promise<Offer> => {
        const result = await saveOfferDraft(offerToSave, user?.id);
        setOffers(previous => previous.some(item => item.id === result.offer.id) ? previous.map(item => item.id === result.offer.id ? result.offer : item) : [result.offer, ...previous]);
        setEditingOffer(result.offer);
        await logActivity(user, result.created ? 'CREATE' : 'UPDATE', 'Offer', result.offer.id, `${result.created ? 'Created' : 'Updated'} offer ${result.offer.offerNumber} from Applicant Tracking`);
        return result.offer;
    };

    const handleSendOffer = async (offerToSend: Offer, recipient: string, subject: string, message: string, previewHtml: string, attachments: HrisEmailAttachment[]): Promise<Offer> => {
        if (!can('Offers', Permission.Manage)) throw new Error('You do not have permission to send offers.');
        const result = await sendApprovedOffer({ offer: offerToSend, userId: user?.id, recipient, subject, message, previewHtml, attachments });
        setOffers(previous => previous.map(item => item.id === result.offer.id ? result.offer : item));
        setEditingOffer(result.offer);
        await logActivity(user, 'UPDATE', 'Offer', result.offer.id, result.provider ? `Sent offer ${result.offer.offerNumber} from Applicant Tracking through ${result.provider}` : `Activated secure link for ${result.offer.offerNumber}; email delivery failed`);
        return result.offer;
    };

    const handleRequestOfferApproval = async (offer: Offer) => {
        const application = enrichedApplications.find(item => item.id === offer.applicationId);
        const candidate = application ? candidateForApplication(application) : null;
        if (!application || !candidate) return alert('The candidate or application record could not be found for this offer.');
        try {
            const allRatings = await fetchRatingRecordsForCandidate(candidate.id);
            setApprovalPackage({ offer: enrichOffer(offer, application, candidate), candidate, application, ratings: allRatings.filter(rating => rating.applicationId === application.id) });
        } catch (error: any) {
            alert(error?.message || 'Unable to load interview ratings for this candidate.');
        }
    };

    const handleSaveInterview = async (interviewToSave: Interview): Promise<InterviewScheduleResult> => {
        const application = applications.find((item) => item.id === interviewToSave.applicationId);
        const candidate = candidates.find((item) => item.id === application?.candidateId);
        if (!application || !candidate) throw new Error('The selected applicant could not be found. Refresh the page and try again.');
        const jobPost = jobPosts.find((item) => item.id === application.jobPostId);
        const panelUsers = users.filter((item) => interviewToSave.panelUserIds?.includes(item.id));
        const result = await saveInterviewSchedule(interviewToSave, {
            application,
            candidate,
            jobPost,
            businessUnitName: enrichedApplications.find((item) => item.id === application.id)?.businessUnitName,
            panelUsers,
            currentUser: user,
        });
        setApplications((previous) => previous.map((item) => item.id === application.id ? { ...item, stage: ApplicationStage.Interview, updatedAt: new Date() } : item));
        if (!result.warnings.length) {
            setIsSchedulerOpen(false);
            setPendingAppId(null);
            setPendingStage(null);
        }
        return result;
    };
    
    const handleRejectionComplete = async ({ subject, message }: { subject: string; message: string }) => {
        if (!pendingAppId) return;
        const rejectedAt = new Date().toISOString();
        const { error } = await supabase.from('job_applications').update({
            stage: ApplicationStage.Rejected,
            updated_at: rejectedAt,
            rejected_at: rejectedAt,
            rejected_by: user?.id || null,
            rejection_reason: message,
            rejection_email_sent_at: rejectedAt,
            rejection_email_subject: subject,
        }).eq('id', pendingAppId);
        if (error) throw new Error(`Rejection email sent, but the application status could not be updated: ${error.message}`);
        setApplications((previous) => previous.map((item) => item.id === pendingAppId ? { ...item, stage: ApplicationStage.Rejected, updatedAt: new Date() } : item));
        await logActivity(user, 'UPDATE', 'Application', pendingAppId, 'Rejected applicant and sent rejection email');
        setIsRejectionModalOpen(false);
        setPendingAppId(null);
        setPendingStage(null);
    };


    const handleSaveApplicant = async ({ candidateData, jobPostId, coverLetter, resumeFile, resumeLink }: { candidateData: Omit<Candidate, 'id'>, jobPostId: string, coverLetter: string, resumeFile?: File | null, resumeLink?: string }) => {
        let resumeUrl = resumeLink || '';
        try {
            // Upload file if provided
            if (resumeFile) {
                const path = `resumes/${Date.now()}-${resumeFile.name}`;
                const { error: uploadError } = await supabase.storage.from('recruitment-uploads').upload(path, resumeFile, { upsert: false });
                if (uploadError) throw uploadError;
                resumeUrl = path;
            }

            const { data: insertedCandidate, error: candErr } = await supabase.from('job_candidates').insert({
                first_name: candidateData.firstName,
                last_name: candidateData.lastName,
                email: candidateData.email,
                phone: candidateData.phone,
                source: candidateData.source,
                portfolio_url: resumeUrl || candidateData.portfolioUrl || null,
                tags: candidateData.tags || [],
                consent_at: candidateData.consentAt || new Date(),
            }).select().single();
            if (candErr) throw candErr;

            const jobPost = jobPosts.find(post => post.id === jobPostId);
            const { data: insertedApp, error: appErr } = await supabase.from('job_applications').insert({
                candidate_id: insertedCandidate.id,
                job_post_id: jobPostId,
                requisition_id: jobPost?.requisitionId || null,
                stage: ApplicationStage.New,
                cover_letter: coverLetter,
                resume_url: resumeUrl || null,
            }).select().single();
            if (appErr) throw appErr;

            // Update local state
            const newCand: Candidate = {
                id: insertedCandidate.id,
                firstName: insertedCandidate.first_name,
                lastName: insertedCandidate.last_name,
                email: insertedCandidate.email,
                phone: insertedCandidate.phone ?? '',
                source: insertedCandidate.source as CandidateSource,
                tags: insertedCandidate.tags || [],
                portfolioUrl: insertedCandidate.portfolio_url || '',
                consentAt: insertedCandidate.consent_at ? new Date(insertedCandidate.consent_at) : undefined,
            };
            const newApp: Application = {
                id: insertedApp.id,
                candidateId: insertedApp.candidate_id,
                jobPostId: insertedApp.job_post_id,
                requisitionId: insertedApp.requisition_id,
                stage: insertedApp.stage as ApplicationStage,
                notes: insertedApp.cover_letter || '',
                createdAt: insertedApp.created_at ? new Date(insertedApp.created_at) : new Date(),
                updatedAt: insertedApp.updated_at ? new Date(insertedApp.updated_at) : new Date(),
            };
            setCandidates(prev => [...prev, newCand]);
            setApplications(prev => [...prev, newApp]);
            logActivity(user, 'CREATE', 'Application', newApp.id, `Added new applicant: ${newCand.firstName} ${newCand.lastName}`);
            setIsAddModalOpen(false);
        } catch (err: any) {
            console.error('Failed to save applicant', err);
            alert(err?.message || 'Failed to save applicant.');
        }
    };

    const viewButtonClass = (buttonView: 'kanban' | 'list') => `flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors ${view === buttonView ? 'bg-indigo-100 text-indigo-700 dark:bg-slate-700 dark:text-indigo-300 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`;
    const selectClasses = "mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white";

    // Helper to get a partial interview object with just appId pre-filled for the modal
    const pendingInterviewStub = useMemo(() => {
        if (!pendingAppId) return null;
        return { applicationId: pendingAppId } as any;
    }, [pendingAppId]);

    const pendingApplication = useMemo(() => {
        if (!pendingAppId) return null;
        return applications.find(a => a.id === pendingAppId) || null;
    }, [pendingAppId, applications]);
    const pendingCandidate = useMemo(() => {
        if (!pendingApplication) return null;
        return candidates.find(c => c.id === pendingApplication.candidateId) || null;
    }, [pendingApplication, candidates]);
    const pendingJobTitle = useMemo(() => {
        if (!pendingApplication) return null;
        return jobPosts.find(p => p.id === pendingApplication.jobPostId)?.title || null;
    }, [pendingApplication, jobPosts]);
    const pendingBusinessUnitName = useMemo(() => {
        if (!pendingApplication) return null;
        return enrichedApplications.find((item) => item.id === pendingApplication.id)?.businessUnitName || null;
    }, [enrichedApplications, pendingApplication]);


    const canView = can('Applicants', Permission.View) || can('Applicants', Permission.Manage);
    const canManage = can('Applicants', Permission.Manage);
    const canManageInterviews = can('Interviews', Permission.Manage) || canManage;
    const canManageOffers = can('Offers', Permission.Manage);
    const canViewOffers = can('Offers', Permission.View) || canManageOffers;

    return (
        <div className="space-y-6">
            {!canView ? (
                <Card><div className="p-6 text-gray-600 dark:text-gray-300">You do not have permission to view applicants.</div></Card>
            ) : (
        <>
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Applicant Tracking System</h1>
                 <div className="flex items-center space-x-2">
                    {canViewOffers && <Link to="/recruitment/offers"><Button variant="secondary">View Job Offers</Button></Link>}
                    <Link to="/apply"><Button variant="secondary">View Applicant Page</Button></Link>
                    {canManage && <Button onClick={() => setIsAddModalOpen(true)}>New Applicant</Button>}
                </div>
            </div>
            
            {isEditingDesc ? (
                <div className="p-4 border rounded-lg bg-gray-50 dark:bg-slate-800/50 dark:border-slate-700 space-y-4">
                    <RichTextEditor label="Edit Description" value={editText} onChange={setEditText}/>
                    <div className="flex justify-end space-x-2"><Button variant="secondary" onClick={() => setIsEditingDesc(false)}>Cancel</Button><Button onClick={handleSaveDesc}>Save</Button></div>
                </div>
            ) : (
                <div className="relative group">
                    <div dangerouslySetInnerHTML={{ __html: description }} className="text-gray-600 dark:text-gray-400 mt-2"/>
                    {isAdmin && <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity"><Button size="sm" variant="secondary" onClick={handleEditDesc} title="Edit description"><EditIcon /></Button></div>}
                </div>
            )}

            <Card>
                <div className="p-4 grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                    <div>
                        <label htmlFor="bu-filter" className="block text-sm font-medium">Filter by Business Unit</label>
                        <select id="bu-filter" value={buFilter} onChange={e => { setBuFilter(e.target.value); setDepartmentFilter(''); }} className={selectClasses}>
                            <option value="">All Accessible</option>
                            {accessibleBus.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="dept-filter" className="block text-sm font-medium">Filter by Department</label>
                        <select id="dept-filter" value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)} className={selectClasses}>
                            <option value="">All Departments</option>
                            {departmentsForBU.map(dept => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="year-filter" className="block text-sm font-medium">Year</label>
                        <select id="year-filter" value={yearFilter} onChange={e => setYearFilter(e.target.value)} className={selectClasses}>
                            <option value="all">All Years</option>
                            {yearOptions.map(year => <option key={year} value={year}>{year}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="month-filter" className="block text-sm font-medium">Month</label>
                        <select id="month-filter" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className={selectClasses}>
                            {monthOptions.map(month => <option key={month.value} value={month.value}>{month.name}</option>)}
                        </select>
                    </div>
                    <div className="flex justify-end">
                        <div className="inline-flex space-x-1 p-1 bg-gray-200 dark:bg-slate-800 rounded-lg">
                            <button className={viewButtonClass('kanban')} onClick={() => setView('kanban')}><ViewColumnsIcon/>Kanban</button>
                            <button className={viewButtonClass('list')} onClick={() => setView('list')}><ListBulletIcon/>List</button>
                        </div>
                    </div>
                </div>
            </Card>

            {isLoading ? (
                <Card><div className="p-6 text-gray-500">Loading applicants...</div></Card>
            ) : view === 'kanban' ? (
                <ApplicantKanbanBoard applications={filteredApplications} onUpdateStage={handleUpdateStage} onCardClick={setSelectedApplication} canManage={canManage} />
            ) : (
                <ApplicantListTable applications={filteredApplications} offers={offers} onRowClick={setSelectedApplication} onViewProfile={setProfileApplication} onCreateRating={setRatingApplication} onScheduleInterview={openInterviewScheduler} onOfferAction={openOfferAction} onReject={openRejectionEmail} canManageApplicants={canManage} canManageInterviews={canManageInterviews} canViewOffers={canViewOffers} canManageOffers={canManageOffers}/>
            )}
            {selectedApplication && <ApplicantDetailModal isOpen={!!selectedApplication} onClose={() => setSelectedApplication(null)} application={selectedApplication} />}
            <React.Suspense fallback={null}>
                {profileApplication && candidateForApplication(profileApplication) && <CandidateProfileModal isOpen={true} onClose={() => setProfileApplication(null)} candidate={candidateForApplication(profileApplication)!} applications={applications} jobPosts={jobPosts} />}
                {ratingApplication && candidateForApplication(ratingApplication) && <CreateInterviewRatingModal isOpen={true} onClose={() => setRatingApplication(null)} candidate={candidateForApplication(ratingApplication)!} applications={applications} jobPosts={jobPosts} initialApplicationId={ratingApplication.id} onAssigned={() => setRatingApplication(null)} />}
                {offerApplication && canManageOffers && <OfferCreationDrawer isOpen={true} onClose={() => { setOfferApplication(null); setEditingOffer(null); }} onSave={handleSaveOffer} onSend={handleSendOffer} onRequestApproval={offer => void handleRequestOfferApproval(offer)} applications={applications} candidates={candidates} requisitions={jobRequisitions} businessUnits={businessUnits} departments={departments as Department[]} businessUnitLogos={businessUnitLogos} initialOffer={editingOffer} initialApplicationId={offerApplication.id} />}
                {approvalPackage && <OfferApprovalPackageModal isOpen={true} onClose={() => setApprovalPackage(null)} offer={approvalPackage.offer} candidate={approvalPackage.candidate} application={approvalPackage.application} ratings={approvalPackage.ratings} onSubmitted={requestId => { setOffers(current => current.map(item => item.id === approvalPackage.offer.id ? { ...item, approvalStatus: 'Pending Approval', approvalRequestId: requestId } : item)); setEditingOffer(current => current?.id === approvalPackage.offer.id ? { ...current, approvalStatus: 'Pending Approval', approvalRequestId: requestId } : current); setOfferApplication(null); setEditingOffer(null); setApprovalPackage(null); }} />}
            </React.Suspense>
            <AddApplicantModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onSave={handleSaveApplicant}
                businessUnits={businessUnits}
                jobPosts={jobPosts}
                jobRequisitions={jobRequisitions}
            />

            {/* Automation Modals */}
            {isSchedulerOpen && (
                <InterviewSchedulerModal
                    isOpen={isSchedulerOpen}
                    onClose={() => { setIsSchedulerOpen(false); setPendingAppId(null); setPendingStage(null); }}
                    interview={pendingInterviewStub}
                    onSave={handleSaveInterview}
                    candidateOptions={interviewCandidateOptions}
                    users={users}
                />
            )}

            {isRejectionModalOpen && (
                <RejectionEmailModal
                    isOpen={isRejectionModalOpen}
                    onClose={() => { setIsRejectionModalOpen(false); setPendingAppId(null); setPendingStage(null); }}
                    application={pendingApplication}
                    candidate={pendingCandidate}
                    jobTitle={pendingJobTitle}
                    businessUnitName={pendingBusinessUnitName}
                    onSend={handleRejectionComplete}
                />
            )}
        </>
        )}
        </div>
    );
};

export default Applicants;
