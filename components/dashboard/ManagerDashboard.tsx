
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Card from '../ui/Card';
import { mockOtRequests, mockAttendanceExceptions, mockResolutions, mockPANs, mockJobRequisitions, mockEvaluations, mockEvaluationSubmissions, mockEvaluationTimelines, mockNotifications, mockTickets, mockEmployeeAwards, mockUsers, mockOnboardingChecklists, mockAssetRequests, mockIncidentReports, mockNTEs, mockAssetAssignments, mockManpowerRequests, mockOnboardingTemplates, mockEnvelopes, mockBenefitRequests, mockCoachingSessions, mockShiftAssignments, mockShiftTemplates, mockAttendanceRecords } from '../../services/mockData';
import { OTStatus, Role, ResolutionStatus, ApproverStatus, PANStatus, PANStepStatus, JobRequisitionStatus, JobRequisitionRole, JobRequisitionStepStatus, NotificationType, TicketStatus, OnboardingTaskStatus, PANActionTaken, AssetRequest, AssetRequestStatus, NTEStatus, PAN, Resolution, NTE, JobRequisition, OTRequest, AttendanceExceptionRecord, EmployeeAward, AssetAssignment, ManpowerRequest, ManpowerRequestStatus, OnboardingChecklist, OnboardingChecklistTemplate, COERequest, Envelope, EnvelopeStatus, RoutingStepStatus, BenefitRequest, BenefitRequestStatus, CoachingStatus, COETemplate, User, LeaveRequest, LeaveRequestStatus, WFHRequest, WFHRequestStatus, AttendanceRecord, ShiftAssignment, ShiftTemplate, Evaluation, EvaluatorType } from '../../types';
import { usePermissions } from '../../hooks/usePermissions';
import { useAuth } from '../../hooks/useAuth';
import ActionItemCard from './ActionItemCard';
import QuickAnalyticsPreview from './QuickAnalyticsPreview';
import UpcomingEventsWidget from './UpcomingEventsWidget';
import QuickLinks from './QuickLinks';
import Button from '../ui/Button';
import ManpowerRequestModal from '../payroll/ManpowerRequestModal';
import ManpowerReviewModal from '../payroll/ManpowerReviewModal';
import LeaveRequestModal from '../payroll/LeaveRequestModal';
import WFHReviewModal from '../payroll/WFHReviewModal';
import OTRequestModal from '../payroll/OTRequestModal';
import RequestCOEModal from '../employees/RequestCOEModal';
import PrintableCOE from '../admin/PrintableCOE';
import { logActivity } from '../../services/auditService';
import { approveCoeRequest, createCoeRequest, fetchCoeRequests, rejectCoeRequest, fetchActiveCoeTemplates } from '../../services/coeService';
import { supabase } from '../../services/supabaseClient';
import COEQueue from './COEQueue';
import { approveRejectOtRequest } from '../../services/otService';

const InboxIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>;
const ClipboardListIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>;
const UserGroupIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.653-.122-1.28-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.653.122-1.28.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>;
const DocumentMagnifyingGlassIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m5.231 13.5h-8.021a1.125 1.125 0 0 1-1.125-1.125v-1.5A1.125 1.125 0 0 1 5.625 15h12.75a1.125 1.125 0 0 1 1.125 1.125v1.5a1.125 1.125 0 0 1-1.125 1.125H13.5m-3.031-1.125a3 3 0 1 0-5.962 0 3 3 0 0 0 5.962 0ZM15 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /></svg>);
const BriefcaseIcon = ({ className }: { className?: string }) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>);
const ShieldExclamationIcon = ({ className }: { className?: string }) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>);
const DocumentTextIcon = ({ className }: { className?: string }) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>);
const AcademicCapIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 0 0-.491 6.347A48.627 48.627 0 0 1 12 20.904a48.627 48.627 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.57 50.57 0 0 0-2.658-.813A59.905 59.905 0 0 1 12 3.493a59.902 59.902 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" /></svg>);
const TicketIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-12v.75m0 3v.75m0 3v.75m0 3V18m-3 .75h18A2.25 2.25 0 0021 16.5V7.5A2.25 2.25 0 0018.75 5.25H5.25A2.25 2.25 0 003 7.5v9A2.25 2.25 0 005.25 18.75h1.5M12 4.5v15" /></svg>);
const TrophyIcon = ({ className }: { className?: string }) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9a9 9 0 0 0 9 0Zm0 0a9 9 0 0 0-9 0m9 0h-9M9 11.25V7.5A3 3 0 0 1 12 4.5h0A3 3 0 0 1 15 7.5v3.75m-3 6.75h.01M12 12h.01M12 6h.01M12 18h.01M7.5 15h.01M16.5 15h.01M19.5 12h.01M4.5 12h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>);
const ClipboardCheckIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.125 2.25h-4.5c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125v-9M10.125 2.25h.375a9 9 0 0 1 9 9v.375M10.125 2.25A3.375 3.375 0 0 1 13.5 5.625v1.5c0 .621.504 1.125 1.125 1.125h1.5a3.375 3.375 0 0 1 3.375 3.375M9 15l2.25 2.25L15 12" /></svg>);
const CalendarDaysIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0h18" /></svg>);
const GavelIcon: React.FC<{className?: string}> = ({className}) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>;
const ArchiveBoxArrowDownIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>);
const TagIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" /></svg>);
const SunIcon = ({ className }: { className?: string }) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" /></svg>);
const PencilSquareIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>);
const GiftIcon = ({ className }: { className?: string }) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 00-2-2v-7" /></svg>);
const SparklesIcon = ({ className }: { className?: string }) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" /></svg>);


const getActionType = (action: PANActionTaken) => {
    if (!action) return 'N/A';
    const actions = [];
    if (action.changeOfStatus) actions.push('Status Change');
    if (action.promotion) actions.push('Promotion');
    if (action.transfer) actions.push('Transfer');
    if (action.salaryIncrease) actions.push('Salary Increase');
    if (action.changeOfJobTitle) actions.push('Job Title Change');
    if (action.others) actions.push(action.others);
    return actions.join(', ') || 'Update';
};

const emptyActions: PANActionTaken = {
    changeOfStatus: false,
    promotion: false,
    transfer: false,
    salaryIncrease: false,
    changeOfJobTitle: false,
    others: ''
};

const mapPanRow = (p: any): PAN => ({
    id: p.id,
    employeeId: p.employee_id,
    employeeName: p.employee_name,
    effectiveDate: p.effective_date ? new Date(p.effective_date) : new Date(),
    status: p.status as PANStatus,
    actionTaken: p.action_taken || { ...emptyActions },
    particulars: p.particulars || { from: {}, to: {} },
    tenure: p.tenure || '',
    notes: p.notes || '',
    routingSteps: p.routing_steps || [],
    signedAt: p.signed_at ? new Date(p.signed_at) : undefined,
    signatureDataUrl: p.signature_data_url || undefined,
    signatureName: p.signature_name || undefined,
    logoUrl: p.logo_url || undefined,
    pdfHash: p.pdf_hash || undefined,
    preparerName: p.preparer_name || undefined,
    preparerSignatureUrl: p.preparer_signature_url || undefined,
});

const ManagerDashboard: React.FC = () => {
    const { user } = useAuth();
    const { getVisibleEmployeeIds, isUserEligibleEvaluator, getCoeAccess } = usePermissions();
    const location = useLocation();
    const navigate = useNavigate();
    
    // Local state to track updates from mock data
    const [requests, setRequests] = useState<AssetRequest[]>(mockAssetRequests);
    const [pans, setPans] = useState<PAN[]>(mockPANs);
    const [otRequests, setOtRequests] = useState<OTRequest[]>(mockOtRequests);
    const [exceptions, setExceptions] = useState<AttendanceExceptionRecord[]>(mockAttendanceExceptions);
    const [requisitions, setRequisitions] = useState<JobRequisition[]>(mockJobRequisitions);
    const [resolutions, setResolutions] = useState<Resolution[]>(mockResolutions);
    const [ntes, setNTEs] = useState<NTE[]>(mockNTEs);
    const [awards, setAwards] = useState<EmployeeAward[]>(mockEmployeeAwards);
    const [assignments, setAssignments] = useState<AssetAssignment[]>(mockAssetAssignments);
    const [useSupabaseAssignments, setUseSupabaseAssignments] = useState(false);
    const [manpowerRequests, setManpowerRequests] = useState<ManpowerRequest[]>(mockManpowerRequests);
    const [checklists, setChecklists] = useState<OnboardingChecklist[]>(mockOnboardingChecklists);
    const [templates, setTemplates] = useState<OnboardingChecklistTemplate[]>(mockOnboardingTemplates);
    const [envelopes, setEnvelopes] = useState<Envelope[]>(mockEnvelopes);
    const [benefitRequests, setBenefitRequests] = useState<BenefitRequest[]>(mockBenefitRequests);
    const [coachingSessions, setCoachingSessions] = useState(mockCoachingSessions);
    const [evaluationSubmissions, setEvaluationSubmissions] = useState(mockEvaluationSubmissions);
    const [evaluations, setEvaluations] = useState<Evaluation[]>(mockEvaluations);
    const [evaluationTimelines, setEvaluationTimelines] = useState(mockEvaluationTimelines);
    const [useSupabaseEvaluations, setUseSupabaseEvaluations] = useState(false);
    const [useSupabaseEvaluationSubmissions, setUseSupabaseEvaluationSubmissions] = useState(false);
    const [coeRequests, setCoeRequests] = useState<COERequest[]>([]);
    const [coeTemplates, setCoeTemplates] = useState<COETemplate[]>([]);
    const [coeToPrint, setCoeToPrint] = useState<{ template: COETemplate, request: COERequest, employee: User } | null>(null);
    const [isLoadingCoe, setIsLoadingCoe] = useState(false);
    const [reporteeIds, setReporteeIds] = useState<string[]>([]);
    const [leaveTypes, setLeaveTypes] = useState<{ id: string; name: string }[]>([]);
    const [pendingLeaveApprovals, setPendingLeaveApprovals] = useState<LeaveRequest[]>([]);
    const [pendingWfhApprovals, setPendingWfhApprovals] = useState<WFHRequest[]>([]);
    const [pendingOtApprovals, setPendingOtApprovals] = useState<OTRequest[]>([]);
    const [pendingManpowerApprovals, setPendingManpowerApprovals] = useState<ManpowerRequest[]>([]);
    const [panApproverId, setPanApproverId] = useState<string | null>(null);


    const [isManpowerModalOpen, setIsManpowerModalOpen] = useState(false);
    const [isManpowerReviewModalOpen, setIsManpowerReviewModalOpen] = useState(false);
    const [selectedManpowerRequest, setSelectedManpowerRequest] = useState<ManpowerRequest | null>(null);
    const [isLeaveReviewModalOpen, setIsLeaveReviewModalOpen] = useState(false);
    const [selectedLeaveRequest, setSelectedLeaveRequest] = useState<LeaveRequest | null>(null);
    const [isWFHReviewModalOpen, setIsWFHReviewModalOpen] = useState(false);
    const [selectedWFHRequest, setSelectedWFHRequest] = useState<WFHRequest | null>(null);
    const [isOTReviewModalOpen, setIsOTReviewModalOpen] = useState(false);
    const [selectedOTRequest, setSelectedOTRequest] = useState<OTRequest | null>(null);

    const [isRequestCOEModalOpen, setIsRequestCOEModalOpen] = useState(false);
    const coeAccess = getCoeAccess();
    const scopedCOE = useMemo(() => coeAccess.filterRequests(coeRequests), [coeRequests, coeAccess]);
    const pendingCOE = useMemo(() => scopedCOE.filter(r => r.status === 'Pending'), [scopedCOE]);
    const legacyUserId = useMemo(() => {
        if (!user) return null;
        const byEmail = user.email
            ? mockUsers.find(u => u.email?.toLowerCase() === user.email.toLowerCase())
            : null;
        if (byEmail?.id) return byEmail.id;
        const byName = user.name
            ? mockUsers.find(u => u.name?.toLowerCase() === user.name.toLowerCase())
            : null;
        return byName?.id ?? null;
    }, [user?.email, user?.name]);
    const notificationUserIdsRef = useRef<Set<string>>(new Set());
    const [useSupabaseOnboarding, setUseSupabaseOnboarding] = useState(false);
    const employeeProfileId = useMemo(() => panApproverId || user?.id || null, [panApproverId, user?.id]);

    useEffect(() => {
        if (location.state?.openManpowerModal) {
            setIsManpowerModalOpen(true);
            navigate(location.pathname, { replace: true, state: {} });
        }
        if (location.state?.openRequestCOE) {
            setIsRequestCOEModalOpen(true);
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.state, navigate]);

    useEffect(() => {
        let active = true;
        const loadPanApproverId = async () => {
            if (!user) {
                if (active) setPanApproverId(null);
                return;
            }
            let resolvedId: string | null = null;
            if (user.authUserId) {
                const { data } = await supabase
                    .from('hris_users')
                    .select('id')
                    .eq('auth_user_id', user.authUserId)
                    .maybeSingle();
                resolvedId = data?.id ?? null;
            }
            if (!resolvedId && user.email) {
                const { data } = await supabase
                    .from('hris_users')
                    .select('id')
                    .eq('email', user.email)
                    .maybeSingle();
                resolvedId = data?.id ?? null;
            }
            if (active) setPanApproverId(resolvedId || user.id || null);
        };
        loadPanApproverId();
        return () => {
            active = false;
        };
    }, [user]);

    useEffect(() => {
        if (!employeeProfileId) return;
        let active = true;
        const loadAssignments = async () => {
            try {
                const { data, error } = await supabase
                    .from('asset_assignments')
                    .select('id, asset_id, employee_id, condition_on_assign, is_acknowledged, date_assigned, date_returned, acknowledged_at, signed_document_url')
                    .eq('employee_id', employeeProfileId)
                    .order('date_assigned', { ascending: false });
                if (error) throw error;
                if (!active) return;
                const mapped =
                    (data || []).map((row: any) => ({
                        id: row.id,
                        assetId: row.asset_id,
                        employeeId: row.employee_id,
                        conditionOnAssign: row.condition_on_assign || '',
                        isAcknowledged: !!row.is_acknowledged,
                        dateAssigned: row.date_assigned ? new Date(row.date_assigned) : new Date(),
                        dateReturned: row.date_returned ? new Date(row.date_returned) : undefined,
                        acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at) : undefined,
                        signedDocumentUrl: row.signed_document_url || undefined,
                    })) || [];
                setAssignments(mapped);
                setUseSupabaseAssignments(true);
            } catch (err) {
                console.error('Failed to load asset assignments for manager dashboard', err);
            }
        };
        loadAssignments();
        return () => {
            active = false;
        };
    }, [employeeProfileId]);

    useEffect(() => {
        if (!employeeProfileId) return;
        let active = true;
        const loadOnboardingData = async () => {
            try {
                const [{ data: checklistRows, error: checklistError }, { data: templateRows, error: templateError }] =
                    await Promise.all([
                        supabase
                            .from('onboarding_checklists')
                            .select('id, employee_id, template_id, status, created_at, start_date')
                            .eq('employee_id', employeeProfileId),
                        supabase
                            .from('onboarding_checklist_templates')
                            .select('id, name, target_role, template_type, tasks'),
                    ]);
                if (checklistError) throw checklistError;
                if (templateError) throw templateError;
                if (!active) return;

                if (templateRows) {
                    const mappedTemplates: OnboardingChecklistTemplate[] = templateRows.map((t: any) => ({
                        id: t.id,
                        name: t.name,
                        targetRole: (t.target_role as Role) || Role.Employee,
                        templateType: t.template_type || 'Onboarding',
                        tasks: Array.isArray(t.tasks) ? t.tasks : [],
                    }));
                    setTemplates(mappedTemplates);
                }

                if (checklistRows) {
                    const mappedChecklists: OnboardingChecklist[] = checklistRows.map((c: any) => ({
                        id: c.id,
                        employeeId: c.employee_id,
                        templateId: c.template_id,
                        createdAt: c.created_at ? new Date(c.created_at) : new Date(),
                        status: (c.status as any) || 'InProgress',
                        tasks: [],
                        signedAt: undefined,
                    }));
                    setChecklists(mappedChecklists);
                }

                setUseSupabaseOnboarding(true);
            } catch (err) {
                console.error('Failed to load onboarding data for manager dashboard', err);
            }
        };
        loadOnboardingData();
        return () => {
            active = false;
        };
    }, [employeeProfileId]);

    const notificationUserIds = useMemo(() => {
        const ids = notificationUserIdsRef.current;
        [user?.id, user?.authUserId, panApproverId, legacyUserId]
            .filter(Boolean)
            .forEach(id => ids.add(id as string));
        return ids;
    }, [user?.id, user?.authUserId, panApproverId, legacyUserId]);

    useEffect(() => {
        const loadPans = async () => {
            try {
                const { data, error } = await supabase
                    .from('pans')
                    .select('*')
                    .order('updated_at', { ascending: false });
                if (error) throw error;
                setPans((data || []).map(mapPanRow));
            } catch (err) {
                console.error('Failed to load PANs', err);
                setPans([...mockPANs]);
            }
        };
        loadPans();
    }, []);

    useEffect(() => {
        const loadCoe = async () => {
            setIsLoadingCoe(true);
            try {
                const [requests, templates] = await Promise.all([
                    fetchCoeRequests(),
                    fetchActiveCoeTemplates()
                ]);
                setCoeRequests(requests);
                setCoeTemplates(templates);
            } catch (error: any) {
                console.error('Failed to load COE requests', error);
            } finally {
                setIsLoadingCoe(false);
            }
        };
        loadCoe();
    }, []);

    useEffect(() => {
        let active = true;
        const loadEvaluations = async () => {
            try {
                const [{ data: evalRows, error: evalErr }, { data: evalers, error: evalerErr }, { data: timelines, error: timelineErr }] =
                    await Promise.all([
                        supabase.from('evaluations').select('*').order('created_at', { ascending: false }),
                        supabase.from('evaluation_evaluators').select('*'),
                        supabase.from('evaluation_timelines').select('*'),
                    ]);
                if (evalErr) throw evalErr;
                if (evalerErr) throw evalerErr;
                if (timelineErr) throw timelineErr;

                const evalerMap = new Map<string, any[]>();
                (evalers || []).forEach((row: any) => {
                    if (!evalerMap.has(row.evaluation_id)) evalerMap.set(row.evaluation_id, []);
                    evalerMap.get(row.evaluation_id)!.push(row);
                });

                const mappedEvaluations: Evaluation[] =
                    (evalRows || []).map((e: any) => {
                        const rows = evalerMap.get(e.id) || [];
                        const evaluators = rows.map((row: any, index: number) => {
                            const normalizedType = String(row.type || '').toLowerCase();
                            return {
                                id: row.id || `${e.id}-${row.user_id || 'group'}-${index}`,
                                type: normalizedType === 'group' ? EvaluatorType.Group : EvaluatorType.Individual,
                                weight: row.weight || 0,
                                userId: row.user_id || undefined,
                                groupFilter: row.business_unit_id || row.department_id ? {
                                    businessUnitId: row.business_unit_id || undefined,
                                    departmentId: row.department_id || undefined,
                                } : undefined,
                                isAnonymous: !!row.is_anonymous,
                                excludeSubject: row.exclude_subject ?? true,
                            };
                        });
                        return {
                            id: e.id,
                            name: e.name,
                            timelineId: e.timeline_id || '',
                            targetBusinessUnitIds: e.target_business_unit_ids || [],
                            targetEmployeeIds: e.target_employee_ids || [],
                            questionSetIds: e.question_set_ids || [],
                            evaluators,
                            status: e.status || 'InProgress',
                            createdAt: e.created_at ? new Date(e.created_at) : new Date(),
                            dueDate: e.due_date ? new Date(e.due_date) : undefined,
                            isEmployeeVisible: !!e.is_employee_visible,
                            acknowledgedBy: e.acknowledged_by || [],
                        } as Evaluation;
                    }) || [];

                const mappedTimelines =
                    (timelines || []).map((t: any) => ({
                        id: t.id,
                        endDate: t.end_date ? new Date(t.end_date) : new Date(),
                    })) || [];

                if (!active) return;
                setEvaluations(mappedEvaluations);
                setEvaluationTimelines(mappedTimelines);
                setUseSupabaseEvaluations(true);
            } catch (err) {
                console.error('Failed to load evaluations for manager dashboard', err);
            }
        };
        loadEvaluations();
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        if (!employeeProfileId) return;
        let active = true;
        const loadSubmissions = async () => {
            try {
                const { data, error } = await supabase
                    .from('evaluation_submissions')
                    .select('*')
                    .eq('rater_id', employeeProfileId);
                if (error) throw error;
                if (!active) return;
                const mapped =
                    (data || []).map((row: any) => ({
                        id: row.id,
                        evaluationId: row.evaluation_id,
                        subjectEmployeeId: row.subject_employee_id,
                        raterId: row.rater_id,
                        raterGroup: row.rater_group,
                        scores: row.scores || [],
                        submittedAt: row.submitted_at ? new Date(row.submitted_at) : new Date(),
                    })) || [];
                setEvaluationSubmissions(mapped);
                setUseSupabaseEvaluationSubmissions(true);
            } catch (err) {
                console.error('Failed to load evaluation submissions for manager dashboard', err);
            }
        };
        loadSubmissions();
        return () => {
            active = false;
        };
    }, [employeeProfileId]);

    useEffect(() => {
        const loadReportees = async () => {
            if (!user?.id) {
                setReporteeIds([]);
                return;
            }
            const { data, error } = await supabase
                .from('hris_users')
                .select('id')
                .eq('reports_to', user.id);
            if (error || !data) {
                setReporteeIds([]);
                return;
            }
            setReporteeIds(data.map((row: any) => row.id).filter(Boolean));
        };
        loadReportees();
    }, [user?.id]);

    useEffect(() => {
        const loadLeaveTypes = async () => {
            const { data, error } = await supabase
                .from('leave_types')
                .select('id, name')
                .order('name');
            if (!error && data) {
                setLeaveTypes(data.map((row: any) => ({ id: row.id, name: row.name })));
            } else {
                setLeaveTypes([]);
            }
        };
        loadLeaveTypes();
    }, []);

    useEffect(() => {
        const normalizeLeaveStatus = (status: string | null | undefined): LeaveRequestStatus => {
            const key = (status || '').toString().trim().toLowerCase();
            switch (key) {
                case 'approved':
                    return LeaveRequestStatus.Approved;
                case 'rejected':
                    return LeaveRequestStatus.Rejected;
                case 'cancelled':
                case 'canceled':
                    return LeaveRequestStatus.Cancelled;
                case 'draft':
                    return LeaveRequestStatus.Draft;
                case 'pending':
                default:
                    return LeaveRequestStatus.Pending;
            }
        };

        const loadPendingApprovals = async () => {
            if (!user?.id || reporteeIds.length === 0) {
                setPendingLeaveApprovals([]);
                setPendingWfhApprovals([]);
                setPendingOtApprovals([]);
                setPendingManpowerApprovals([]);
                return;
            }

            const [leaveRes, wfhRes, otRes, manpowerRes] = await Promise.all([
                supabase
                    .from('leave_requests')
                    .select('id, employee_id, employee_name, leave_type_id, start_date, end_date, start_time, end_time, duration_days, reason, status, history_log, attachment_url, approver_id, business_unit_id, department_id')
                    .in('employee_id', reporteeIds),
                supabase
                    .from('wfh_requests')
                    .select('id, employee_id, employee_name, date, reason, status, report_link, approved_by, approved_at, rejection_reason, created_at')
                    .in('employee_id', reporteeIds),
                supabase
                    .from('ot_requests')
                    .select('id, employee_id, employee_name, date, start_time, end_time, reason, status, submitted_at, approved_hours, manager_note, history_log, attachment_url')
                    .in('employee_id', reporteeIds)
                    .eq('status', OTStatus.Submitted),
                supabase
                    .from('manpower_requests')
                    .select('id, business_unit_id, business_unit_name, department_id, requester_id, requester_name, date_needed, forecasted_pax, general_note, items, grand_total, status, created_at, approved_by, approved_at, rejection_reason')
                    .in('requester_id', reporteeIds)
                    .eq('status', ManpowerRequestStatus.Pending),
            ]);

            if (!leaveRes.error && leaveRes.data) {
                const mapped = leaveRes.data.map((row: any) => ({
                        id: row.id,
                        employeeId: row.employee_id,
                        employeeName: row.employee_name,
                        leaveTypeId: row.leave_type_id,
                        startDate: new Date(row.start_date),
                        endDate: new Date(row.end_date),
                        startTime: row.start_time || undefined,
                        endTime: row.end_time || undefined,
                        durationDays: Number(row.duration_days),
                        reason: row.reason,
                        status: normalizeLeaveStatus(row.status),
                        historyLog: row.history_log || [],
                        attachmentUrl: row.attachment_url || undefined,
                        approverId: row.approver_id || undefined,
                        businessUnitId: row.business_unit_id || undefined,
                        departmentId: row.department_id || undefined,
                    }));
                setPendingLeaveApprovals(mapped.filter(r => r.status === LeaveRequestStatus.Pending));
            } else {
                setPendingLeaveApprovals([]);
            }

            if (!wfhRes.error && wfhRes.data) {
                const mapped = wfhRes.data.map((row: any) => ({
                        id: row.id,
                        employeeId: row.employee_id,
                        employeeName: row.employee_name,
                        date: row.date ? new Date(row.date) : new Date(),
                        reason: row.reason,
                        status: row.status as WFHRequestStatus,
                        reportLink: row.report_link || undefined,
                        approvedBy: row.approved_by || undefined,
                        approvedAt: row.approved_at ? new Date(row.approved_at) : undefined,
                        rejectionReason: row.rejection_reason || undefined,
                        createdAt: row.created_at ? new Date(row.created_at) : new Date(),
                    }));
                setPendingWfhApprovals(mapped.filter(r => r.status === WFHRequestStatus.Pending));
            } else {
                setPendingWfhApprovals([]);
            }

            if (!otRes.error && otRes.data) {
                setPendingOtApprovals(
                    otRes.data.map((row: any) => ({
                        id: row.id,
                        employeeId: row.employee_id,
                        employeeName: row.employee_name,
                        date: row.date ? new Date(row.date) : new Date(),
                        startTime: row.start_time,
                        endTime: row.end_time,
                        reason: row.reason,
                        status: row.status as OTStatus,
                        submittedAt: row.submitted_at ? new Date(row.submitted_at) : undefined,
                        approvedHours: row.approved_hours ?? undefined,
                        managerNote: row.manager_note ?? undefined,
                        historyLog: row.history_log || [],
                        attachmentUrl: row.attachment_url ?? undefined,
                    }))
                );
            } else {
                setPendingOtApprovals([]);
            }

            if (!manpowerRes.error && manpowerRes.data) {
                setPendingManpowerApprovals(
                    manpowerRes.data.map((row: any) => ({
                        id: row.id,
                        businessUnitId: row.business_unit_id || '',
                        departmentId: row.department_id || undefined,
                        businessUnitName: row.business_unit_name || 'Unknown BU',
                        requestedBy: row.requester_id,
                        requesterName: row.requester_name,
                        date: row.date_needed ? new Date(row.date_needed) : new Date(),
                        forecastedPax: row.forecasted_pax || 0,
                        generalNote: row.general_note || '',
                        items: Array.isArray(row.items) ? row.items : (row.items ? JSON.parse(row.items) : []),
                        grandTotal: row.grand_total || 0,
                        status: row.status as ManpowerRequestStatus,
                        createdAt: row.created_at ? new Date(row.created_at) : new Date(),
                        approvedBy: row.approved_by || undefined,
                        approvedAt: row.approved_at ? new Date(row.approved_at) : undefined,
                        rejectionReason: row.rejection_reason || undefined,
                    }))
                );
            } else {
                setPendingManpowerApprovals([]);
            }
        };

        loadPendingApprovals();
    }, [user?.id, reporteeIds]);

    // Robust polling interval to sync local state with global mock data
    useEffect(() => {
        const interval = setInterval(() => {
            setRequests([...mockAssetRequests]);
            setPans([...mockPANs]);
            setOtRequests([...mockOtRequests]);
            setExceptions([...mockAttendanceExceptions]);
            setRequisitions([...mockJobRequisitions]);
            setResolutions([...mockResolutions]);
            setNTEs([...mockNTEs]);
            setAwards([...mockEmployeeAwards]);
            if (!useSupabaseAssignments) {
                setAssignments([...mockAssetAssignments]);
            }
            setManpowerRequests([...mockManpowerRequests]);
            if (!useSupabaseOnboarding) {
                setChecklists([...mockOnboardingChecklists]);
                setTemplates([...mockOnboardingTemplates]);
            }
            setEnvelopes([...mockEnvelopes]);
            setBenefitRequests([...mockBenefitRequests]);
            setCoachingSessions([...mockCoachingSessions]);
            if (!useSupabaseEvaluationSubmissions) {
                setEvaluationSubmissions([...mockEvaluationSubmissions]);
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [useSupabaseOnboarding, useSupabaseAssignments, useSupabaseEvaluationSubmissions]);

    // Updated to include all visible employees (BU or subordinates)
    const visibleEmployeeIds = useMemo(() => {
         if (!user) return [];
         return getVisibleEmployeeIds();
    }, [user, getVisibleEmployeeIds]);

    // Filter direct subordinates for specific approvals (like OT/Exceptions where direct management applies)
    const subordinateIds = useMemo(() => {
        if (!user) return [];
        return visibleEmployeeIds.filter(id => id !== user.id);
    }, [user, visibleEmployeeIds]);
    
    const isApprover = user && (user.role === Role.GeneralManager || user.role === Role.OperationsDirector || user.role === Role.BOD);
    // Check if Business Unit Manager to allow broader approvals
    const isBusinessUnitManager = user && user.role === Role.BusinessUnitManager;

    const handleSaveManpowerRequest = (request: ManpowerRequest) => {
        mockManpowerRequests.unshift(request);
        setManpowerRequests([...mockManpowerRequests]);
        
        if (user) {
            logActivity(user, 'CREATE', 'ManpowerRequest', request.id, `Created On-Call Request for ${request.date}`);
        }
        alert("Request submitted for approval.");
        setIsManpowerModalOpen(false); 
    };

    const handleSaveCOERequest = async (request: Partial<COERequest>) => {
        if (!coeAccess.canRequest) {
            alert('You do not have permission to request a COE.');
            return;
        }
        if (!user) {
            alert('You must be signed in to submit a request.');
            return;
        }
        try {
            const saved = await createCoeRequest(request, user);
            mockCOERequests.unshift(saved);
            logActivity(user, 'CREATE', 'COERequest', saved.id, `Requested COE for ${saved.purpose}`);
            alert("Certificate of Employment request submitted.");
        } catch (error: any) {
            alert(error?.message || 'Failed to submit COE request.');
        } finally {
            setIsRequestCOEModalOpen(false);
        }
    };

    const handleApproveCOE = async (request: COERequest) => {
        if (!user) return;
        if (!coeAccess.canActOn(request)) {
            alert('You do not have permission to approve this request.');
            return;
        }
        const { data: employeeRow, error: employeeError } = await supabase
            .from('hris_users')
            .select('id,full_name,first_name,last_name,email,position,role,business_unit,business_unit_id,department,department_id,date_hired')
            .eq('id', request.employeeId)
            .single();
        if (employeeError || !employeeRow) {
            alert("Employee record not found.");
            return;
        }

        const employee: User = {
            id: employeeRow.id,
            name: employeeRow.full_name || `${employeeRow.first_name || ''} ${employeeRow.last_name || ''}`.trim() || 'Employee',
            email: employeeRow.email,
            role: employeeRow.role || Role.Employee,
            department: employeeRow.department || '',
            businessUnit: employeeRow.business_unit || '',
            departmentId: employeeRow.department_id || undefined,
            businessUnitId: employeeRow.business_unit_id || undefined,
            status: 'Active',
            employmentStatus: undefined,
            isPhotoEnrolled: false,
            dateHired: employeeRow.date_hired ? new Date(employeeRow.date_hired) : new Date(),
            position: employeeRow.role || employeeRow.position || '',
            monthlySalary: undefined
        };

        const buId = request.businessUnitId || employee.businessUnitId || '';
        const template = coeTemplates.find(t => t.businessUnitId === buId && t.isActive) || coeTemplates[0];
        if (!template) {
            alert("No active COE template found for this Business Unit. Please create one in Admin > COE Templates.");
            return;
        }

        const generatedUrl = `generated_coe_${request.id}.pdf`;

        try {
            const updated = await approveCoeRequest(request.id, user.id, generatedUrl);
            setCoeRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
            logActivity(user, 'APPROVE', 'COERequest', request.id, `Approved COE request for ${request.employeeName}`);
            setCoeToPrint({ template, request: updated, employee });
        } catch (error: any) {
            alert(error?.message || 'Failed to approve COE request.');
        }
    };

    const handleRejectCOE = async (request: COERequest) => {
        if (!user) return;
        if (!coeAccess.canActOn(request)) {
            alert('You do not have permission to reject this request.');
            return;
        }
        const reason = prompt('Enter rejection reason:') || '';
        if (!reason.trim()) return;
        try {
            const updated = await rejectCoeRequest(request.id, user.id, reason.trim());
            setCoeRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
            logActivity(user, 'REJECT', 'COERequest', request.id, `Rejected COE request. Reason: ${reason}`);
        } catch (error: any) {
            alert(error?.message || 'Failed to reject COE request.');
        }
    };

    const handleApproveManpower = async (requestId: string) => {
        if (!user) return;
        const { error } = await supabase
            .from('manpower_requests')
            .update({ status: ManpowerRequestStatus.Approved, approved_by: user.id, approved_at: new Date().toISOString() })
            .eq('id', requestId);

        if (error) {
            alert("Error approving request.");
            return;
        }

        const index = mockManpowerRequests.findIndex(r => r.id === requestId);
        if (index > -1) {
            mockManpowerRequests[index].status = ManpowerRequestStatus.Approved;
            mockManpowerRequests[index].approvedBy = user.id;
            mockManpowerRequests[index].approvedAt = new Date();
            setManpowerRequests([...mockManpowerRequests]);
        }
        setPendingManpowerApprovals(prev => prev.filter(r => r.id !== requestId));
        setIsManpowerReviewModalOpen(false);
        alert("Manpower Request Approved.");
    };
    
    const handleRejectManpower = async (requestId: string, reason: string) => {
        if (!user) return;
        const { error } = await supabase
            .from('manpower_requests')
            .update({ status: ManpowerRequestStatus.Rejected, rejection_reason: reason })
            .eq('id', requestId);

        if (error) {
            alert("Error rejecting request.");
            return;
        }

        const index = mockManpowerRequests.findIndex(r => r.id === requestId);
        if (index > -1) {
            mockManpowerRequests[index].status = ManpowerRequestStatus.Rejected;
            mockManpowerRequests[index].rejectionReason = reason;
            setManpowerRequests([...mockManpowerRequests]);
        }
        setPendingManpowerApprovals(prev => prev.filter(r => r.id !== requestId));
        setIsManpowerReviewModalOpen(false);
        alert("Manpower Request Rejected.");
    };

    const openReviewModal = (req: ManpowerRequest) => {
        setSelectedManpowerRequest(req);
        setIsManpowerReviewModalOpen(true);
    };

    const openLeaveReviewModal = (req: LeaveRequest) => {
        setSelectedLeaveRequest(req);
        setIsLeaveReviewModalOpen(true);
    };

    const openWFHReviewModal = (req: WFHRequest) => {
        setSelectedWFHRequest(req);
        setIsWFHReviewModalOpen(true);
    };

    const openOTReviewModal = (req: OTRequest) => {
        setSelectedOTRequest(req);
        setIsOTReviewModalOpen(true);
    };

    const handleLeaveApproval = async (request: LeaveRequest, approved: boolean, notes: string) => {
        if (!user) return;
        const historyEntry = {
            userId: user.id,
            userName: user.name,
            timestamp: new Date().toISOString(),
            action: approved ? 'Approved' : 'Rejected',
            details: notes ? `Manager notes: ${notes}` : undefined,
        };
        const newStatus = approved ? LeaveRequestStatus.Approved : LeaveRequestStatus.Rejected;

        const { error } = await supabase
            .from('leave_requests')
            .update({
                status: newStatus,
                approver_id: user.id,
                history_log: [...(request.historyLog || []), historyEntry],
            })
            .eq('id', request.id);

        if (error) {
            alert(error.message || 'Failed to update leave request.');
            return;
        }

        setPendingLeaveApprovals(prev => prev.filter(r => r.id !== request.id));
        setIsLeaveReviewModalOpen(false);
        setSelectedLeaveRequest(null);
    };

    const handleApproveWFH = async (requestId: string) => {
        if (!user) return;
        const { error } = await supabase
            .from('wfh_requests')
            .update({ status: WFHRequestStatus.Approved, approved_by: user.id, approved_at: new Date().toISOString() })
            .eq('id', requestId);

        if (error) {
            alert(error.message || 'Failed to approve WFH request.');
            return;
        }

        setPendingWfhApprovals(prev => prev.filter(r => r.id !== requestId));
        setIsWFHReviewModalOpen(false);
        setSelectedWFHRequest(null);
    };

    const handleRejectWFH = async (requestId: string, reason: string) => {
        if (!user) return;
        const { error } = await supabase
            .from('wfh_requests')
            .update({ status: WFHRequestStatus.Rejected, rejection_reason: reason })
            .eq('id', requestId);

        if (error) {
            alert(error.message || 'Failed to reject WFH request.');
            return;
        }

        setPendingWfhApprovals(prev => prev.filter(r => r.id !== requestId));
        setIsWFHReviewModalOpen(false);
        setSelectedWFHRequest(null);
    };

    const handleApproveRejectOT = async (
        request: Partial<OTRequest>,
        newStatus: OTStatus.Approved | OTStatus.Rejected,
        details: { approvedHours?: number; managerNote?: string }
    ) => {
        if (!request.id) return;
        try {
            await approveRejectOtRequest(request.id, newStatus, details);
            setPendingOtApprovals(prev => prev.filter(r => r.id !== request.id));
            setIsOTReviewModalOpen(false);
            setSelectedOTRequest(null);
        } catch (error: any) {
            alert(error?.message || 'Failed to update OT request.');
        }
    };

    const approvalIconProps = { className: "h-6 w-6 text-white" };

    const actionItems = useMemo(() => {
        if (!user) return [];
        const items: any[] = [];
        const iconProps = { className: "h-6 w-6 text-white" };
        const notificationIds = notificationUserIds;
        
        // Helper for countdown logic
        const getCountdownString = (deadline: Date) => {
            const now = new Date();
            const diff = new Date(deadline).getTime() - now.getTime();
            if (diff < 0) return "Overdue";
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            return `${days}d ${hours}h remaining`;
        };

        // 0. NTE Responses for ME (Manager as Employee)
        const myPendingNTEs = ntes.filter(n => n.employeeId === user.id && n.status === NTEStatus.Issued);
        myPendingNTEs.forEach(nte => {
            const isOverdue = new Date(nte.deadline) < new Date();
            items.push({
                id: `nte-response-${nte.id}`,
                icon: <DocumentTextIcon {...iconProps} />,
                title: "Response Required: Notice to Explain",
                subtitle: isOverdue ? `OVERDUE! Deadline passed.` : `Deadline: ${getCountdownString(new Date(nte.deadline))}`,
                date: new Date(nte.issuedDate).toLocaleDateString(),
                link: `/feedback/nte/${nte.id}`,
                colorClass: isOverdue ? 'bg-red-600 animate-pulse' : 'bg-red-500',
                priority: 0
            });
        });

        // 0.1 Scheduled Coaching Sessions where I am the Coach
        const myCoachingSessions = coachingSessions.filter(s => s.coachId === user.id && s.status === CoachingStatus.Scheduled);
        myCoachingSessions.forEach(session => {
             items.push({
                id: `coaching-conduct-${session.id}`,
                icon: <SparklesIcon {...iconProps} />,
                title: "Conduct Coaching Session",
                subtitle: `With ${session.employeeName} on ${new Date(session.date).toLocaleDateString()}.`,
                date: new Date(session.date).toLocaleDateString(),
                link: '/feedback/coaching',
                colorClass: 'bg-blue-500',
                priority: 0
            });
        });

        // 1. Employee Lifecycle Checklists (Onboarding / Offboarding)
        const myChecklists = checklists.filter(c => c.employeeId === (employeeProfileId || user.id) && c.status === 'InProgress');
        
        myChecklists.forEach(checklist => {
            const template = templates.find(t => t.id === checklist.templateId);
            const templateType = template?.templateType || 'Onboarding';
            const taskLabel = templateType === 'Offboarding' ? 'Offboarding Task' : 'Onboarding Task';
            
            const pendingTasks = checklist.tasks
                .filter(t => t.status === OnboardingTaskStatus.Pending)
                .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

            if (pendingTasks.length > 0) {
                const nextTask = pendingTasks[0];
                items.push({
                    id: `checklist-task-${nextTask.id}`,
                    icon: <ClipboardCheckIcon {...iconProps} />,
                    title: `${taskLabel}: ${template?.name || 'Checklist'}`,
                    subtitle: `Pending Task: "${nextTask.name}"`,
                    date: new Date(nextTask.dueDate).toLocaleDateString(),
                    link: `/employees/onboarding/task/${nextTask.id}`,
                    colorClass: templateType === 'Offboarding' ? 'bg-orange-500' : 'bg-cyan-500',
                    priority: 1
                });
            } else if (checklist.tasks.length === 0) {
                items.push({
                    id: `checklist-assigned-${checklist.id}`,
                    icon: <ClipboardCheckIcon {...iconProps} />,
                    title: `${templateType} Assigned`,
                    subtitle: `Your ${templateType.toLowerCase()} checklist is ready.`,
                    date: new Date(checklist.createdAt).toLocaleDateString(),
                    link: '/employees/onboarding',
                    colorClass: templateType === 'Offboarding' ? 'bg-orange-500' : 'bg-cyan-500',
                    priority: 1
                });
            } else if (checklist.tasks.length > 0 && checklist.tasks.every(t => t.status === OnboardingTaskStatus.Completed)) {
                 // If ALL tasks are completed but checklist is still InProgress (meaning pending sign-off)
                 items.push({
                    id: `checklist-sign-${checklist.id}`,
                    icon: <ClipboardCheckIcon {...iconProps} />,
                    title: `Finalize ${templateType} Checklist`,
                    subtitle: `All tasks completed. Please review and sign.`,
                    date: new Date().toLocaleDateString(),
                    link: `/employees/onboarding/sign/${checklist.id}`,
                    colorClass: 'bg-green-500',
                    priority: 0
                });
            }
        });

        // 2. Pending Asset Acceptance (Manager as Employee)
        const pendingAssetAcceptance = assignments.filter(a => a.employeeId === (employeeProfileId || user.id) && !a.isAcknowledged && !a.dateReturned);
        pendingAssetAcceptance.forEach(assignment => {
            items.push({
                id: `asset-accept-${assignment.id}`,
                icon: <TagIcon {...iconProps} />,
                title: 'Pending Asset Acceptance',
                subtitle: `You have been assigned an asset that requires your acknowledgment.`,
                date: new Date(assignment.dateAssigned).toLocaleDateString(),
                link: `/my-profile?acceptAssetAssignmentId=${assignment.id}`, 
                colorClass: 'bg-indigo-500',
                priority: 0 
            });
        });
        
        // 3. Pending Asset Returns (Manager as Employee)
        const pendingAssetReturns = requests.filter(req =>
            req.employeeId === user.id &&
            req.requestType === 'Return' &&
            req.status === AssetRequestStatus.Pending
        );

        if (pendingAssetReturns.length > 0) {
            items.push({
                id: `asset-return-${pendingAssetReturns[0].id}`,
                icon: <ArchiveBoxArrowDownIcon {...iconProps} />,
                title: 'Asset Return Requested',
                subtitle: `HR has requested the return of: ${pendingAssetReturns[0].assetDescription}`,
                date: new Date(pendingAssetReturns[0].requestedAt).toLocaleDateString(),
                link: '/employees/asset-management/asset-requests',
                colorClass: 'bg-orange-500',
                priority: 0
            });
        }

        const ticketNotifications = mockNotifications
            .filter(n => notificationIds.has(n.userId) && !n.isRead && (n.type === NotificationType.TICKET_ASSIGNED_TO_YOU || n.type === NotificationType.TICKET_UPDATE_REQUESTER))
            .map(item => ({
                id: `ticket-notif-${item.id}`,
                icon: <TicketIcon {...iconProps} />,
                title: item.type === NotificationType.TICKET_ASSIGNED_TO_YOU ? 'New Ticket Assigned' : 'Ticket Update',
                subtitle: item.message,
                date: new Date(item.createdAt).toLocaleDateString(),
                link: item.link,
                colorClass: 'bg-cyan-500',
                priority: 1
            }));
        items.push(...ticketNotifications);

        const caseNotifications = mockNotifications
            .filter(n => notificationIds.has(n.userId) && !n.isRead && n.type === NotificationType.CASE_ASSIGNED)
            .map(item => ({
                id: `case-notif-${item.id}`,
                icon: <GavelIcon {...iconProps} />,
                title: 'Case Assigned',
                subtitle: item.message,
                date: new Date(item.createdAt).toLocaleDateString(),
                link: item.link,
                colorClass: 'bg-rose-500',
                priority: 1
            }));
        items.push(...caseNotifications);

        const benefitNotifications = mockNotifications
            .filter(n => notificationIds.has(n.userId) && !n.isRead && n.type === NotificationType.BENEFIT_REQUEST_SUBMITTED)
            .map(item => ({
                id: `benefit-notif-${item.id}`,
                icon: <GiftIcon {...iconProps} />,
                title: 'Benefit Approval Required',
                subtitle: item.message,
                date: new Date(item.createdAt).toLocaleDateString(),
                link: item.link,
                colorClass: 'bg-emerald-500',
                priority: 1
            }));
        items.push(...benefitNotifications);

        const panApprovalNotifications = mockNotifications
            .filter(n => notificationIds.has(n.userId) && !n.isRead && n.type === NotificationType.PAN_APPROVAL_REQUEST)
            .map(item => ({
                id: `pan-approve-${item.id}`,
                icon: <DocumentTextIcon {...iconProps} />,
                title: 'PAN Approval Required',
                subtitle: item.message,
                date: new Date(item.createdAt).toLocaleDateString(),
                link: item.link,
                colorClass: 'bg-amber-500',
                priority: 1
            }));
        items.push(...panApprovalNotifications);

        const onboardingNotifications = mockNotifications
            .filter(n => notificationIds.has(n.userId) && !n.isRead && (n.type === NotificationType.ONBOARDING_ASSIGNED || n.type === NotificationType.OFFBOARDING_ASSIGNED))
            .map(item => ({
                id: `onboard-notif-${item.id}`,
                icon: <ClipboardCheckIcon {...iconProps} />,
                title: item.type === NotificationType.OFFBOARDING_ASSIGNED ? 'Offboarding Assigned' : 'Onboarding Assigned',
                subtitle: item.message,
                date: new Date(item.createdAt).toLocaleDateString(),
                link: item.link,
                colorClass: item.type === NotificationType.OFFBOARDING_ASSIGNED ? 'bg-orange-500' : 'bg-cyan-500',
                priority: 1
            }));
        items.push(...onboardingNotifications);

        const evaluationNotifications = mockNotifications
            .filter(n => notificationIds.has(n.userId) && !n.isRead && n.type === NotificationType.EVALUATION_ASSIGNED)
            .map(item => ({
                id: `eval-notif-${item.id}`,
                icon: <AcademicCapIcon {...iconProps} />,
                title: item.title || 'Evaluation Assigned',
                subtitle: item.message,
                date: new Date(item.createdAt).toLocaleDateString(),
                link: item.link,
                colorClass: 'bg-teal-500',
                priority: 1
            }));
        items.push(...evaluationNotifications);
        
        // 4. Manpower Request Approvals (For Approvers)
        if (isApprover || isBusinessUnitManager) {
            // IMPORTANT: Filter by scope. Only show requests from employees I can see (subordinates or BU members)
            // OR if I am the one who needs to approve it.
            const pendingManpower = manpowerRequests.filter(r => 
                r.status === ManpowerRequestStatus.Pending && 
                visibleEmployeeIds.includes(r.requestedBy)
            );
            
            pendingManpower.forEach(req => {
                items.push({
                    id: `manpower-${req.id}`,
                    icon: <UserGroupIcon />,
                    title: "On-Call Staff Request",
                    subtitle: `For ${req.businessUnitName} on ${new Date(req.date).toLocaleDateString()}`,
                    date: new Date(req.createdAt).toLocaleDateString(),
                    onClick: () => openReviewModal(req),
                    link: '#',
                    colorClass: 'bg-pink-500',
                    priority: 0
                });
            });
        }

        // 5. PAN Acknowledgement (Manager as Employee)
        const pendingPANsForAcknowledgement = pans.filter(p => p.employeeId === user.id && p.status === PANStatus.PendingEmployee);
        pendingPANsForAcknowledgement.forEach(pan => {
            items.push({
                id: `pan-ack-${pan.id}`,
                icon: <DocumentTextIcon {...iconProps} />,
                title: 'PAN for Acknowledgement',
                subtitle: `Action: ${getActionType(pan.actionTaken)}`,
                date: new Date(pan.effectiveDate).toLocaleDateString(),
                link: '/employees/pan',
                colorClass: 'bg-purple-500',
                priority: 1
            });
        });

        // 6. OT Approval (Manager Approving)
        const otForApproval = otRequests.filter(r => subordinateIds.includes(r.employeeId) && r.status === OTStatus.Submitted);
        otForApproval.forEach(req => {
            items.push({
                id: req.id,
                icon: <BriefcaseIcon {...iconProps} />,
                title: "Overtime Request",
                subtitle: `From ${req.employeeName} for ${new Date(req.date).toLocaleDateString()}`,
                date: new Date(req.submittedAt!).toLocaleDateString(),
                link: '/payroll/overtime-requests',
                colorClass: "bg-blue-500",
            });
        });
        
        // 7. Attendance Exceptions (Manager Reviewing)
        const exceptionsForApproval = exceptions.filter(e => subordinateIds.includes(e.employeeId) && e.status === 'Pending');
        exceptionsForApproval.forEach(ex => {
            items.push({
                id: ex.id,
                icon: <ShieldExclamationIcon {...iconProps} />,
                title: `Attendance Exception: ${ex.type}`,
                subtitle: `For ${ex.employeeName} on ${new Date(ex.date).toLocaleDateString()}`,
                date: new Date(ex.date).toLocaleDateString(),
                link: '/payroll/exceptions',
                colorClass: "bg-yellow-500",
            });
        });
        
        // 8. PAN Approval (Manager Approving)
        const approverIds = new Set([user.id, panApproverId].filter(Boolean));
        const pendingPans = pans.filter(pan =>
            [PANStatus.PendingApproval, PANStatus.PendingEndorser, PANStatus.PendingRecommender].includes(pan.status) &&
            pan.routingSteps.some(s => approverIds.has(s.userId) && s.status === PANStepStatus.Pending)
        );
        pendingPans.forEach(pan => {
             items.push({
                id: pan.id,
                icon: <DocumentTextIcon {...iconProps} />,
                title: `PAN for Approval`,
                subtitle: `For ${pan.employeeName}, effective ${new Date(pan.effectiveDate).toLocaleDateString()}`,
                date: new Date(pan.effectiveDate).toLocaleDateString(),
                link: '/employees/pan',
                colorClass: "bg-purple-500",
            });
        });

        // 9. Job Requisition Final Approval
        const pendingFinalRequisitions = requisitions.filter(req => 
            req.status === JobRequisitionStatus.PendingApproval &&
            req.routingSteps.some(step => 
                step.role === JobRequisitionRole.Final &&
                step.status === JobRequisitionStepStatus.Pending &&
                step.userId === user.id
            )
        );
         pendingFinalRequisitions.forEach(req => {
            items.push({
                id: `req-final-${req.id}`,
                icon: <DocumentMagnifyingGlassIcon {...iconProps} />,
                title: "Requisition for Final Approval",
                subtitle: `${req.title} for ${req.headcount} position(s)`,
                date: new Date(req.createdAt).toLocaleDateString(),
                link: '/recruitment/requisitions',
                colorClass: 'bg-blue-500'
            });
        });

        // 10. Resolution Approval
        const pendingResolutionsForMe = resolutions.filter(res =>
            res.status === ResolutionStatus.PendingApproval &&
            res.approverSteps.some(step => step.userId === user.id && step.status === ApproverStatus.Pending)
        );
        pendingResolutionsForMe.forEach(res => {
            const ir = mockIncidentReports.find(ir => ir.id === res.incidentReportId);
            items.push({
                id: `res-approve-${res.id}`,
                icon: <GavelIcon className="h-6 w-6 text-white" />, 
                title: "Resolution for Approval",
                subtitle: `For Case: ${res.incidentReportId} (${ir?.category || 'Unknown'})`,
                date: new Date(res.decisionDate).toLocaleDateString(),
                link: '/feedback/cases?filter=pending_my_approval',
                colorClass: 'bg-orange-500',
                priority: 0
            });
        });

        // 11. NTE Approval
        const pendingNTEs = ntes.filter(nte =>
            nte.status === NTEStatus.PendingApproval &&
            nte.approverSteps?.some(step => step.userId === user.id && step.status === ApproverStatus.Pending)
        );

        pendingNTEs.forEach(nte => {
            items.push({
                id: `nte-approve-${nte.id}`,
                icon: <DocumentTextIcon {...iconProps} />,
                title: "NTE for Approval",
                subtitle: `For ${nte.employeeName}`,
                date: new Date(nte.issuedDate).toLocaleDateString(),
                link: `/feedback/nte/${nte.id}`,
                colorClass: 'bg-orange-500',
                priority: 0
            });
        });
        
        // 12. Contract/Envelope Approval
        const pendingEnvelopes = envelopes.filter(env => 
            (env.status === EnvelopeStatus.PendingApproval || env.status === EnvelopeStatus.OutForSignature) &&
            env.routingSteps.some(step => step.userId === user.id && step.status === RoutingStepStatus.Pending)
        );

        pendingEnvelopes.forEach(env => {
            const myStep = env.routingSteps.find(s => s.userId === user.id && s.status === RoutingStepStatus.Pending);
            const actionLabel = myStep?.role === 'Approver' ? 'Approval Required' : 'Signature Required';
            
            items.push({
                id: `env-${env.id}`,
                icon: <PencilSquareIcon {...iconProps} />,
                title: `Contract ${actionLabel}`,
                subtitle: `${env.title} for ${env.employeeName}`,
                date: new Date(env.createdAt).toLocaleDateString(),
                link: `/employees/contracts/${env.id}`,
                colorClass: 'bg-pink-500',
                priority: 0
            });
        });

        // 13. Benefit Approval (BOD/GM only)
        const isBOD = user?.role === Role.BOD || user?.role === Role.GeneralManager;
        if (isBOD) {
            const pendingBenefits = benefitRequests.filter(r => r.status === BenefitRequestStatus.PendingBOD);
            pendingBenefits.forEach(req => {
               items.push({
                   id: `ben-bod-${req.id}`,
                   icon: <GiftIcon className="h-6 w-6 text-white" />,
                   title: "Benefit Approval Required",
                   subtitle: `${req.employeeName} - ${req.benefitTypeName}`,
                   date: new Date(req.dateNeeded).toLocaleDateString(),
                   link: '/employees/benefits?tab=approvals',
                   colorClass: 'bg-orange-500',
                   priority: 0
               });
           });
       }

       // 14. UPDATED: Evaluation Pending (Manager/GM as Evaluator)
        const evaluatorUser = { ...user, id: employeeProfileId || user.id };
        const mySubmissions = evaluationSubmissions.filter(sub => sub.raterId === (employeeProfileId || user.id));
        const evaluationsToPerform = (useSupabaseEvaluations ? evaluations : mockEvaluations).filter(e => e.status === 'InProgress');

        const evaluationItems = evaluationsToPerform.map(evaluation => {
            // Find who this user needs to evaluate for this evaluation cycle using the robust helper
            const eligibleTargets = evaluation.targetEmployeeIds.filter(targetId => 
                isUserEligibleEvaluator(evaluatorUser, evaluation, targetId)
            );

            // Count how many of these have already been submitted
            const submittedTargets = mySubmissions
                .filter(s => s.evaluationId === evaluation.id && eligibleTargets.includes(s.subjectEmployeeId))
                .map(s => s.subjectEmployeeId);
            
            const remainingCount = eligibleTargets.length - submittedTargets.length;

            if (remainingCount > 0) {
                return {
                    id: `eval-perform-${evaluation.id}`,
                    icon: <AcademicCapIcon {...iconProps} />,
                    title: "Evaluation Pending",
                    subtitle: `You have ${remainingCount} submission(s) to complete for "${evaluation.name}".`,
                    date: new Date(evaluation.createdAt).toLocaleDateString(),
                    link: `/evaluation/perform/${evaluation.id}`,
                    colorClass: 'bg-teal-500'
                };
            }
            return null;
        }).filter(Boolean);
        items.push(...evaluationItems);

        return items.sort((a,b) => (a.priority ?? 99) - (b.priority ?? 99) || new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [user, notificationUserIds, employeeProfileId, requests, assignments, checklists, templates, pans, otRequests, exceptions, requisitions, resolutions, ntes, awards, manpowerRequests, isApprover, isBusinessUnitManager, subordinateIds, envelopes, benefitRequests, coachingSessions, evaluationSubmissions, evaluations, useSupabaseEvaluations, isUserEligibleEvaluator, visibleEmployeeIds, panApproverId]);

    const teamApprovalItems = useMemo(() => {
        const items: Array<{
            id: string;
            icon: React.ReactNode;
            title: string;
            subtitle: string;
            date: string;
            colorClass: string;
            onClick: () => void;
        }> = [];

        pendingLeaveApprovals.forEach(req => {
            items.push({
                id: `leave-${req.id}`,
                icon: <SunIcon {...approvalIconProps} />,
                title: 'Leave Request Approval',
                subtitle: `${req.employeeName} • ${new Date(req.startDate).toLocaleDateString()} - ${new Date(req.endDate).toLocaleDateString()}`,
                date: new Date(req.startDate).toLocaleDateString(),
                colorClass: 'bg-yellow-500',
                onClick: () => openLeaveReviewModal(req),
            });
        });

        pendingWfhApprovals.forEach(req => {
            items.push({
                id: `wfh-${req.id}`,
                icon: <CalendarDaysIcon {...approvalIconProps} />,
                title: 'WFH Request Approval',
                subtitle: `${req.employeeName} • ${new Date(req.date).toLocaleDateString()}`,
                date: new Date(req.date).toLocaleDateString(),
                colorClass: 'bg-blue-500',
                onClick: () => openWFHReviewModal(req),
            });
        });

        pendingOtApprovals.forEach(req => {
            items.push({
                id: `ot-${req.id}`,
                icon: <ClipboardListIcon />,
                title: 'Overtime Request Approval',
                subtitle: `${req.employeeName} • ${new Date(req.date).toLocaleDateString()}`,
                date: new Date(req.date).toLocaleDateString(),
                colorClass: 'bg-indigo-500',
                onClick: () => openOTReviewModal(req),
            });
        });

        pendingManpowerApprovals.forEach(req => {
            items.push({
                id: `oncall-${req.id}`,
                icon: <UserGroupIcon />,
                title: 'On-Call Request Approval',
                subtitle: `${req.requesterName} • ${new Date(req.date).toLocaleDateString()}`,
                date: new Date(req.date).toLocaleDateString(),
                colorClass: 'bg-teal-500',
                onClick: () => openReviewModal(req),
            });
        });

        return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [pendingLeaveApprovals, pendingWfhApprovals, pendingOtApprovals, pendingManpowerApprovals]);

    return (
        <div className="space-y-6">
            <QuickLinks />
            <UpcomingEventsWidget />
            
            <Card title="COE Requests">
                <COEQueue 
                    requests={pendingCOE}
                    onApprove={handleApproveCOE}
                    onReject={handleRejectCOE}
                    canAct={coeAccess.canApprove}
                    canActOn={coeAccess.canActOn}
                />
            </Card>

            <Card title="Team Requests">
                {teamApprovalItems.length > 0 ? (
                    <div className="space-y-4">
                        {teamApprovalItems.map(item => (
                            <div key={item.id} onClick={item.onClick} className="cursor-pointer">
                                <div className="bg-white dark:bg-slate-800 shadow-md rounded-lg overflow-hidden transition-all hover:shadow-lg hover:ring-2 hover:ring-indigo-500">
                                    <div className="flex items-center p-4">
                                        <div className={`flex-shrink-0 p-3 rounded-full ${item.colorClass}`}>
                                            {item.icon}
                                        </div>
                                        <div className="flex-grow ml-4 min-w-0">
                                            <h3 className="font-semibold text-gray-800 dark:text-gray-200 truncate">{item.title}</h3>
                                            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{item.subtitle}</p>
                                        </div>
                                        <div className="flex-shrink-0 ml-4 flex flex-col items-end">
                                            <span className="text-xs text-gray-500 dark:text-gray-400">{item.date}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-6 text-sm text-gray-500 dark:text-gray-400">
                        No pending requests from your direct reports.
                    </div>
                )}
            </Card>

            {actionItems.length > 0 ? (
                 <Card title="Action Items">
                    <div className="space-y-4">
                        {actionItems.map(item => {
                            if (item.onClick) {
                                 return (
                                    <div key={item.id} onClick={item.onClick} className="cursor-pointer">
                                        <div className="bg-white dark:bg-slate-800 shadow-md rounded-lg overflow-hidden transition-all hover:shadow-lg hover:ring-2 hover:ring-indigo-500">
                                            <div className="flex items-center p-4">
                                                <div className={`flex-shrink-0 p-3 rounded-full ${item.colorClass}`}>
                                                    {item.icon}
                                                </div>
                                                <div className="flex-grow ml-4 min-w-0">
                                                    <h3 className="font-semibold text-gray-800 dark:text-gray-200 truncate">{item.title}</h3>
                                                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{item.subtitle}</p>
                                                </div>
                                                <div className="flex-shrink-0 ml-4 flex flex-col items-end">
                                                    <span className="text-xs text-gray-500 dark:text-gray-400">{item.date}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            }
                            return (
                                <ActionItemCard
                                    key={item.id}
                                    icon={item.icon}
                                    title={item.title}
                                    subtitle={item.subtitle}
                                    date={item.date}
                                    link={item.link}
                                    colorClass={item.colorClass}
                                />
                            )
                        })}
                    </div>
                </Card>
            ) : (
                <Card>
                    <div className="text-center py-8">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">You're all caught up!</h3>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">There are no pending actions for you.</p>
                    </div>
                </Card>
            )}
            
            <QuickAnalyticsPreview />
            
             <ManpowerReviewModal
                isOpen={isManpowerReviewModalOpen}
                onClose={() => setIsManpowerReviewModalOpen(false)}
                request={selectedManpowerRequest}
                onApprove={handleApproveManpower}
                onReject={handleRejectManpower}
                canApprove={true}
            />

            <LeaveRequestModal
                isOpen={isLeaveReviewModalOpen}
                onClose={() => {
                    setIsLeaveReviewModalOpen(false);
                    setSelectedLeaveRequest(null);
                }}
                request={selectedLeaveRequest}
                leaveTypes={leaveTypes}
                onSave={() => {}}
                onApprove={handleLeaveApproval}
            />

            <WFHReviewModal
                isOpen={isWFHReviewModalOpen}
                onClose={() => {
                    setIsWFHReviewModalOpen(false);
                    setSelectedWFHRequest(null);
                }}
                request={selectedWFHRequest}
                onApprove={handleApproveWFH}
                onReject={handleRejectWFH}
            />

            <OTRequestModal
                isOpen={isOTReviewModalOpen}
                onClose={() => {
                    setIsOTReviewModalOpen(false);
                    setSelectedOTRequest(null);
                }}
                onSave={() => {}}
                onApproveOrReject={handleApproveRejectOT}
                requestToEdit={selectedOTRequest}
                attendanceRecords={mockAttendanceRecords}
                shiftAssignments={mockShiftAssignments}
                shiftTemplates={mockShiftTemplates}
            />
            
            <ManpowerRequestModal
                isOpen={isManpowerModalOpen}
                onClose={() => setIsManpowerModalOpen(false)}
                onSave={handleSaveManpowerRequest}
            />

            <RequestCOEModal
                isOpen={isRequestCOEModalOpen}
                onClose={() => setIsRequestCOEModalOpen(false)}
                onSave={handleSaveCOERequest}
            />
            {coeToPrint && createPortal(
                <PrintableCOE 
                    template={coeToPrint.template}
                    request={coeToPrint.request}
                    employee={coeToPrint.employee}
                    onClose={() => setCoeToPrint(null)}
                />,
                document.body
            )}
        </div>
    );
};

export default ManagerDashboard;
