
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { useAuth } from '../../hooks/useAuth';
import { 
    EmployeeDraftStatus, 
    RoutingStepStatus, 
    EnvelopeStatus, 
    NTEStatus, 
    AnnouncementType, 
    ExceptionType,
    OnboardingChecklist,
    OnboardingTaskStatus,
    PANStatus,
    PANActionTaken,
    ResolutionStatus,
    IRStatus,
    NotificationType,
    ResignationStatus,
    Memo,
    TicketStatus,
    Notification,
    AssetRequest,
    AssetRequestStatus,
    OnboardingChecklistTemplate,
    COERequest,
    BenefitRequestStatus,
    PulseSurveyStatus,
    CoachingStatus,
    Envelope,
    NTE,
    LeaveRequestStatus,
    WFHRequestStatus,
    OTStatus,
    ManpowerRequestStatus
} from '../../types';
import { 
    mockEmployeeDrafts, 
    mockOnboardingChecklists, 
    mockOnboardingTemplates,
    mockEnvelopes,
    mockNTEs,
    mockIncidentReports,
    mockAnnouncements,
    mockAttendanceExceptions,
    mockPANs,
    mockResolutions,
    mockEvaluations,
    mockNotifications,
    mockResignations,
    mockMemos,
    mockEvaluationSubmissions,
    mockTickets,
    mockEmployeeAwards,
    mockAwards,
    mockAssetRequests,
    mockAssetAssignments,
    mockCOERequests,
    mockEvaluationTimelines,
    mockUsers,
    mockBenefitRequests,
    mockPulseSurveys,
    mockSurveyResponses,
    mockCoachingSessions
} from '../../services/mockData';
import ActionItemCard from './ActionItemCard';
import RecentMemosWidget from './RecentMemosWidget';
import MemoViewModal from '../feedback/MemoViewModal';
import Confetti from '../ui/Confetti';
import Toast from '../ui/Toast';
import QuickLinks from './QuickLinks';
import RequestCOEModal from '../employees/RequestCOEModal';
import { logActivity } from '../../services/auditService';
import { createCoeRequest, fetchCoeRequestById, fetchCoeRequests } from '../../services/coeService';
import { usePermissions } from '../../hooks/usePermissions';
import { supabase } from '../../services/supabaseClient';


// --- ICONS ---
const ClockIcon = ({ className }: { className?: string }) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>);
const UserCircleIcon = ({ className }: { className?: string }) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>);
const ClipboardCheckIcon = ({ className }: { className?: string }) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.125 2.25h-4.5c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125v-9M10.125 2.25h.375a9 9 0 0 1 9 9v.375M10.125 2.25A3.375 3.375 0 0 1 13.5 5.625v1.5c0 .621.504 1.125 1.125 1.125h1.5a3.375 3.375 0 0 1 3.375 3.375M9 15l2.25 2.25L15 12" /></svg>);
const PencilSquareIcon = ({ className }: { className?: string }) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>);
const DocumentTextIcon = ({ className }: { className?: string }) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>);
const MegaphoneIcon = ({ className }: { className?: string }) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 1 0 7.5 7.5h-7.5V6Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0 0 13.5 3v7.5Z" /></svg>);
const ShieldExclamationIcon = ({ className }: { className?: string }) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>);
const BanknotesIcon = ({ className }: { className?: string }) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" /></svg>);
const BriefcaseIcon = ({ className }: { className?: string }) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>);
const QuestionMarkCircleIcon = ({ className }: { className?: string }) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" /></svg>);
const AcademicCapIcon = ({ className }: { className?: string }) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 0 0-.491 6.347A48.627 48.627 0 0 1 12 20.904a48.627 48.627 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.57 50.57 0 0 0-2.658-.813A59.905 59.905 0 0 1 12 3.493a59.902 59.902 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" /></svg>);
const ArrowRightIcon = ({ className }: { className?: string }) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg>);
const CalendarDaysIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0h18" /></svg>);
const UserMinusIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M22 10.5h-6m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM4 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 10.5 21c-2.39 0-4.64-.666-6.5-1.765Z" /></svg>);
const TicketIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-12v.75m0 3v.75m0 3v.75m0 3V18m-3 .75h18A2.25 2.25 0 0021 16.5V7.5A2.25 2.25 0 0018.75 5.25H5.25A2.25 2.25 0 003 7.5v9A2.25 2.25 0 005.25 18.75h1.5M12 4.5v15" /></svg>);
const TrophyIcon = ({ className }: { className?: string }) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9a9 9 0 0 0 9 0Zm0 0a9 9 0 0 0-9 0m9 0h-9M9 11.25V7.5A3 3 0 0 1 12 4.5h0A3 3 0 0 1 15 7.5v3.75m-3 6.75h.01M12 12h.01M12 6h.01M12 18h.01M7.5 15h.01M16.5 15h.01M19.5 12h.01M4.5 12h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>);
const CakeIcon = ({ className }: { className?: string }) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 15.75a.75.75 0 0 1-.75.75H3.75a.75.75 0 0 1 0-1.5H4.5V11.25a.75.75 0 0 1 .75-.75h13.5a.75.75 0 0 1 .75.75v4.5Zm-1.5-4.5H5.25v3.75h14.25V11.25Zm-3.75-5.25a.75.75 0 0 1-.75-.75V3a.75.75 0 0 1 1.5 0v2.25a.75.75 0 0 1-.75.75Zm-3.75 0a.75.75 0 0 1-.75-.75V3a.75.75 0 0 1 1.5 0v2.25a.75.75 0 0 1-.75.75Zm-3.75 0a.75.75 0 0 1-.75-.75V3a.75.75 0 0 1 1.5 0v2.25a.75.75 0 0 1-.75.75Z" /></svg>);
const GavelIcon: React.FC<{className?: string}> = ({className}) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>;
const ArchiveBoxArrowDownIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>);
const TagIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" /></svg>);
const SunIcon = ({ className }: { className?: string }) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" /></svg>);
const GiftIcon = ({ className }: { className?: string }) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 00-2-2v-7" /></svg>);
const HeartIcon = ({ className }: { className?: string }) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>);
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

const AnniversaryBanner: React.FC = () => {
    const { user } = useAuth();
    
    const isAnniversary = useMemo(() => {
        if (!user || !user.dateHired) return false;
        
        const today = new Date();
        const hireDate = new Date(user.dateHired);

        const isSameDay = today.getMonth() === hireDate.getMonth() && today.getDate() === hireDate.getDate();
        const isNotFirstDay = today.getFullYear() > hireDate.getFullYear();
        
        return isSameDay && isNotFirstDay;
    }, [user]);
    
    const yearsOfService = useMemo(() => {
        if (!user || !user.dateHired) return 0;
        const today = new Date();
        const hireDate = new Date(user.dateHired);
        return today.getFullYear() - hireDate.getFullYear();
    }, [user]);

    if (!isAnniversary) {
        return null;
    }
    
    const yearSuffix = (y: number) => {
        if (y % 100 >= 11 && y % 100 <= 13) return 'th';
        switch (y % 10) {
            case 1: return 'st';
            case 2: return 'nd';
            case 3: return 'rd';
            default: return 'th';
        }
    };

    return (
        <Card className="!p-0 overflow-hidden bg-gradient-to-r from-yellow-300 via-amber-300 to-orange-400 text-gray-900 shadow-lg mb-6">
            <div className="p-6 relative">
                 <div className="absolute top-4 right-4 text-5xl opacity-20">🎉</div>
                <h2 className="text-2xl font-bold">Happy Work Anniversary, {user?.name.split(' ')[0]}!</h2>
                <p className="mt-2 text-lg">
                    Congratulations on your <strong>{yearsOfService}{yearSuffix(yearsOfService)} year</strong> with the team! We appreciate your dedication and hard work.
                </p>
            </div>
        </Card>
    );
};


const EmployeeDashboard: React.FC = () => {
    const { user } = useAuth();
    const { isUserEligibleEvaluator, getCoeAccess } = usePermissions();
    const location = useLocation();
    const navigate = useNavigate();
    const [refreshKey, setRefreshKey] = useState(0); 
    
    // --- Memo Modal State ---
    const [isMemoViewOpen, setIsMemoViewOpen] = useState(false);
    const [selectedMemo, setSelectedMemo] = useState<Memo | null>(null);
    const [memoUpdateKey, setMemoUpdateKey] = useState(0);
    
    // --- COE Request State ---
    const [isRequestCOEModalOpen, setIsRequestCOEModalOpen] = useState(false);

    // --- Award Celebration State ---
    const [showConfetti, setShowConfetti] = useState(false);
    
    const [toastInfo, setToastInfo] = useState<{ show: boolean, title: string, message: string, icon?: React.ReactNode }>({ show: false, title: '', message: '' });
    const [requests, setRequests] = useState<AssetRequest[]>(mockAssetRequests);
    // New state for asset polling
    const [assignments, setAssignments] = useState(mockAssetAssignments);
    // NEW: State for checklists to ensure reactivity
    const [checklists, setChecklists] = useState<OnboardingChecklist[]>(mockOnboardingChecklists);
    // NEW: State for templates
    const [templates, setTemplates] = useState<OnboardingChecklistTemplate[]>(mockOnboardingTemplates);
    // NEW: State for Benefit Requests
    const [benefitRequests, setBenefitRequests] = useState(mockBenefitRequests);
    // NEW: State for Pulse Surveys
    const [pulseSurveys, setPulseSurveys] = useState(mockPulseSurveys);
    const [surveyResponses, setSurveyResponses] = useState(mockSurveyResponses);
    // NEW: State for Coaching
    const [coachingSessions, setCoachingSessions] = useState(mockCoachingSessions);
    const [envelopes, setEnvelopes] = useState<Envelope[]>(mockEnvelopes);
    const [ntes, setNTEs] = useState<NTE[]>(mockNTEs);
    const [evaluationSubmissions, setEvaluationSubmissions] = useState(mockEvaluationSubmissions);
    const [coeDecisions, setCoeDecisions] = useState<Array<{ id: string; status: COERequest['status']; date: Date }>>([]);
    const [approvedLeaveRequests, setApprovedLeaveRequests] = useState<Array<{ id: string; startDate: Date; endDate: Date }>>([]);
    const [approvedWfhRequests, setApprovedWfhRequests] = useState<Array<{ id: string; date: Date }>>([]);
    const [approvedOtRequests, setApprovedOtRequests] = useState<Array<{ id: string; date: Date }>>([]);
    const [approvedManpowerRequests, setApprovedManpowerRequests] = useState<Array<{ id: string; date: Date }>>([]);
    const [rejectedLeaveRequests, setRejectedLeaveRequests] = useState<Array<{ id: string; startDate: Date; endDate: Date; reason: string }>>([]);
    const [rejectedWfhRequests, setRejectedWfhRequests] = useState<Array<{ id: string; date: Date; reason: string }>>([]);
    const [rejectedOtRequests, setRejectedOtRequests] = useState<Array<{ id: string; date: Date; reason: string }>>([]);
    const [rejectedManpowerRequests, setRejectedManpowerRequests] = useState<Array<{ id: string; date: Date; reason: string }>>([]);

    useEffect(() => {
        if (location.state?.openRequestCOE) {
            setIsRequestCOEModalOpen(true);
            // Clear state to prevent re-opening on refresh
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.state, navigate]);

    useEffect(() => {
        if (!user) return;

        const unacknowledgedAwards = mockEmployeeAwards.filter(award => 
            award.employeeId === user.id &&
            award.status === ResolutionStatus.Approved &&
            !award.isAcknowledgedByEmployee
        );

        if (unacknowledgedAwards.length > 0) {
            setShowConfetti(true);
            const confettiTimer = setTimeout(() => setShowConfetti(false), 6000);

            unacknowledgedAwards.forEach(newAward => {
                 const awardDetails = mockAwards.find(a => a.id === newAward.awardId);
                 mockNotifications.unshift({
                    id: `notif-award-${Date.now()}`,
                    userId: user.id,
                    type: NotificationType.AWARD_RECEIVED,
                    message: `You've been awarded the '${awardDetails?.title}'!`,
                    link: '/my-profile#achievements',
                    isRead: false,
                    createdAt: new Date(),
                    relatedEntityId: newAward.id,
                });
            });

            unacknowledgedAwards.forEach(awardToAck => {
                const awardIndex = mockEmployeeAwards.findIndex(ea => ea.id === awardToAck.id);
                if (awardIndex > -1) {
                    mockEmployeeAwards[awardIndex].isAcknowledgedByEmployee = true;
                }
            });
            
            return () => clearTimeout(confettiTimer);
        }
    }, [user]);

    useEffect(() => {
        const interval = setInterval(() => {
            // Simply sync with global mock data every second for robustness in this prototype
            setRequests([...mockAssetRequests]);
            setAssignments([...mockAssetAssignments]);
            setChecklists([...mockOnboardingChecklists]);
            setTemplates([...mockOnboardingTemplates]);
            setBenefitRequests([...mockBenefitRequests]);
            setPulseSurveys([...mockPulseSurveys]);
            setSurveyResponses([...mockSurveyResponses]);
            setCoachingSessions([...mockCoachingSessions]);
            setEnvelopes([...mockEnvelopes]);
            setNTEs([...mockNTEs]);
            setEvaluationSubmissions([...mockEvaluationSubmissions]);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!user?.id) return;

        let isMounted = true;
        const loadApproved = async () => {
            const [leaveRes, wfhRes, otRes, manpowerRes] = await Promise.all([
                supabase
                    .from('leave_requests')
                    .select('id, start_date, end_date, status, history_log')
                    .eq('employee_id', user.id)
                    .in('status', [LeaveRequestStatus.Approved, LeaveRequestStatus.Rejected])
                    .order('start_date', { ascending: false }),
                supabase
                    .from('wfh_requests')
                    .select('id, date, status, rejection_reason')
                    .eq('employee_id', user.id)
                    .in('status', [WFHRequestStatus.Approved, WFHRequestStatus.Rejected])
                    .order('date', { ascending: false }),
                supabase
                    .from('ot_requests')
                    .select('id, date, status, manager_note')
                    .eq('employee_id', user.id)
                    .in('status', [OTStatus.Approved, OTStatus.Rejected])
                    .order('date', { ascending: false }),
                supabase
                    .from('manpower_requests')
                    .select('id, date_needed, status, rejection_reason')
                    .eq('requester_id', user.id)
                    .in('status', [ManpowerRequestStatus.Approved, ManpowerRequestStatus.Rejected])
                    .order('date_needed', { ascending: false }),
            ]);

            if (!isMounted) return;

            setApprovedLeaveRequests(
                !leaveRes.error && leaveRes.data
                    ? leaveRes.data
                        .filter((row: any) => row.status === LeaveRequestStatus.Approved)
                        .map((row: any) => ({
                        id: row.id,
                        startDate: new Date(row.start_date),
                        endDate: new Date(row.end_date),
                    }))
                    : []
            );
            setRejectedLeaveRequests(
                !leaveRes.error && leaveRes.data
                    ? leaveRes.data
                        .filter((row: any) => row.status === LeaveRequestStatus.Rejected)
                        .map((row: any) => ({
                            id: row.id,
                            startDate: new Date(row.start_date),
                            endDate: new Date(row.end_date),
                            reason: (() => {
                                const history = Array.isArray(row.history_log) ? row.history_log : [];
                                const rejected = history.filter((h: any) => h.action === 'Rejected');
                                const latest = rejected.length > 0 ? rejected[rejected.length - 1] : history[history.length - 1];
                                return latest?.details || 'Rejected';
                            })(),
                        }))
                    : []
            );
            setApprovedWfhRequests(
                !wfhRes.error && wfhRes.data
                    ? wfhRes.data
                        .filter((row: any) => row.status === WFHRequestStatus.Approved)
                        .map((row: any) => ({
                        id: row.id,
                        date: new Date(row.date),
                    }))
                    : []
            );
            setRejectedWfhRequests(
                !wfhRes.error && wfhRes.data
                    ? wfhRes.data
                        .filter((row: any) => row.status === WFHRequestStatus.Rejected)
                        .map((row: any) => ({
                            id: row.id,
                            date: new Date(row.date),
                            reason: row.rejection_reason || 'Rejected',
                        }))
                    : []
            );
            setApprovedOtRequests(
                !otRes.error && otRes.data
                    ? otRes.data
                        .filter((row: any) => row.status === OTStatus.Approved)
                        .map((row: any) => ({
                        id: row.id,
                        date: new Date(row.date),
                    }))
                    : []
            );
            setRejectedOtRequests(
                !otRes.error && otRes.data
                    ? otRes.data
                        .filter((row: any) => row.status === OTStatus.Rejected)
                        .map((row: any) => ({
                            id: row.id,
                            date: new Date(row.date),
                            reason: row.manager_note || 'Rejected',
                        }))
                    : []
            );
            setApprovedManpowerRequests(
                !manpowerRes.error && manpowerRes.data
                    ? manpowerRes.data
                        .filter((row: any) => row.status === ManpowerRequestStatus.Approved)
                        .map((row: any) => ({
                        id: row.id,
                        date: row.date_needed ? new Date(row.date_needed) : new Date(),
                    }))
                    : []
            );
            setRejectedManpowerRequests(
                !manpowerRes.error && manpowerRes.data
                    ? manpowerRes.data
                        .filter((row: any) => row.status === ManpowerRequestStatus.Rejected)
                        .map((row: any) => ({
                            id: row.id,
                            date: row.date_needed ? new Date(row.date_needed) : new Date(),
                            reason: row.rejection_reason || 'Rejected',
                        }))
                    : []
            );
        };

        loadApproved();
        const interval = setInterval(loadApproved, 15000);
        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [user?.id]);

    useEffect(() => {
        if (!user?.id) return;
        let isMounted = true;

        const loadCoeDecisions = async () => {
            try {
                const requests = await fetchCoeRequests();
                if (!isMounted) return;
                const myDecisions = requests
                    .filter(r => r.employeeId === user.id && (r.status === 'Approved' || r.status === 'Rejected'))
                    .map(r => ({
                        id: r.id,
                        status: r.status,
                        date: r.approvedAt || r.dateRequested,
                    }));
                setCoeDecisions(myDecisions);
            } catch {
                setCoeDecisions([]);
            }
        };

        loadCoeDecisions();
        const interval = setInterval(loadCoeDecisions, 15000);
        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [user?.id]);


    const handleViewMemo = (memo: Memo) => {
        setSelectedMemo(memo);
        setIsMemoViewOpen(true);
    };

    const handleAcknowledge = (memoId: string) => {
        if (!user) return;
        const memoIndex = mockMemos.findIndex(m => m.id === memoId);
        if (memoIndex > -1) {
            const memo = mockMemos[memoIndex];
            if (!memo.acknowledgementTracker.includes(user.id)) {
                memo.acknowledgementTracker.push(user.id);
                setSelectedMemo(prev => prev ? { ...prev, acknowledgementTracker: [...prev.acknowledgementTracker, user.id] } : null);
                setMemoUpdateKey(prev => prev + 1);
            }
        }
    };
    
    const coeAccess = getCoeAccess();

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

    // --- Actionable Tasks ---
    const actionItems = useMemo(() => {
        if (!user) return [];
        const items: any[] = [];
        const iconProps = { className: "h-6 w-6 text-white" };
        
        // Helper for countdown logic
        const getCountdownString = (deadline: Date) => {
            const now = new Date();
            const diff = new Date(deadline).getTime() - now.getTime();
            if (diff < 0) return "Overdue";
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            return `${days}d ${hours}h remaining`;
        };

        // 0. NTE Responses
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
                priority: 0 // Top priority
            });
        });
        
        // Scheduled Coaching Sessions where I am the Employee (The Coachee)
        const myScheduledSessions = coachingSessions.filter(s => s.employeeId === user.id && s.status === CoachingStatus.Scheduled);
        myScheduledSessions.forEach(session => {
             items.push({
                id: `coaching-attend-${session.id}`,
                icon: <SparklesIcon {...iconProps} />,
                title: "Coaching Session Invitation",
                subtitle: `with ${session.coachName} on ${new Date(session.date).toLocaleDateString()}`,
                date: new Date(session.date).toLocaleDateString(),
                link: '/feedback/coaching',
                colorClass: 'bg-purple-500',
                priority: 0
            });
        });

        // Pending Coaching Acknowledgment
        const pendingCoaching = coachingSessions.filter(s => s.employeeId === user.id && s.status === CoachingStatus.Completed);
        pendingCoaching.forEach(session => {
             items.push({
                id: `coaching-ack-${session.id}`,
                icon: <SparklesIcon {...iconProps} />,
                title: "Coaching Session Completed",
                subtitle: `Please review and acknowledge your session from ${new Date(session.date).toLocaleDateString()}.`,
                date: new Date().toLocaleDateString(),
                // Deep link state handled via react-router state
                link: '/feedback/coaching',
                state: { openSessionId: session.id },
                colorClass: 'bg-purple-500',
                priority: 0 // Top priority
            });
        });

        approvedLeaveRequests.forEach(req => {
            items.push({
                id: `leave-approved-${req.id}`,
                icon: <SunIcon {...iconProps} />,
                title: "Leave Approved",
                subtitle: `${new Date(req.startDate).toLocaleDateString()} - ${new Date(req.endDate).toLocaleDateString()}`,
                date: new Date(req.startDate).toLocaleDateString(),
                link: '/payroll/leave',
                colorClass: 'bg-green-500',
                priority: 3
            });
        });

        approvedWfhRequests.forEach(req => {
            items.push({
                id: `wfh-approved-${req.id}`,
                icon: <CalendarDaysIcon {...iconProps} />,
                title: "WFH Approved",
                subtitle: new Date(req.date).toLocaleDateString(),
                date: new Date(req.date).toLocaleDateString(),
                link: '/payroll/wfh-requests',
                colorClass: 'bg-green-500',
                priority: 3
            });
        });

        approvedOtRequests.forEach(req => {
            items.push({
                id: `ot-approved-${req.id}`,
                icon: <ClipboardCheckIcon {...iconProps} />,
                title: "Overtime Approved",
                subtitle: new Date(req.date).toLocaleDateString(),
                date: new Date(req.date).toLocaleDateString(),
                link: '/payroll/overtime-requests',
                colorClass: 'bg-green-500',
                priority: 3
            });
        });

        approvedManpowerRequests.forEach(req => {
            items.push({
                id: `oncall-approved-${req.id}`,
                icon: <UserCircleIcon {...iconProps} />,
                title: "On-Call Approved",
                subtitle: new Date(req.date).toLocaleDateString(),
                date: new Date(req.date).toLocaleDateString(),
                link: '/payroll/manpower-planning',
                colorClass: 'bg-green-500',
                priority: 3
            });
        });

        coeDecisions.forEach(req => {
            const approved = req.status === 'Approved';
            items.push({
                id: `coe-${approved ? 'approved' : 'rejected'}-${req.id}`,
                icon: <DocumentTextIcon {...iconProps} />,
                title: `COE ${approved ? 'Approved' : 'Rejected'}`,
                subtitle: `Request ${req.id}`,
                date: new Date(req.date).toLocaleDateString(),
                link: `/employees/coe/requests?requestId=${req.id}`,
                colorClass: approved ? 'bg-green-500' : 'bg-red-500',
                priority: approved ? 3 : 2
            });
        });

        rejectedLeaveRequests.forEach(req => {
            items.push({
                id: `leave-rejected-${req.id}`,
                icon: <SunIcon {...iconProps} />,
                title: "Leave Rejected",
                subtitle: `${new Date(req.startDate).toLocaleDateString()} - ${new Date(req.endDate).toLocaleDateString()} • ${req.reason}`,
                date: new Date(req.startDate).toLocaleDateString(),
                link: '/payroll/leave',
                colorClass: 'bg-red-500',
                priority: 2
            });
        });

        rejectedWfhRequests.forEach(req => {
            items.push({
                id: `wfh-rejected-${req.id}`,
                icon: <CalendarDaysIcon {...iconProps} />,
                title: "WFH Rejected",
                subtitle: `${new Date(req.date).toLocaleDateString()} • ${req.reason}`,
                date: new Date(req.date).toLocaleDateString(),
                link: '/payroll/wfh-requests',
                colorClass: 'bg-red-500',
                priority: 2
            });
        });

        rejectedOtRequests.forEach(req => {
            items.push({
                id: `ot-rejected-${req.id}`,
                icon: <ClipboardCheckIcon {...iconProps} />,
                title: "Overtime Rejected",
                subtitle: `${new Date(req.date).toLocaleDateString()} • ${req.reason}`,
                date: new Date(req.date).toLocaleDateString(),
                link: '/payroll/overtime-requests',
                colorClass: 'bg-red-500',
                priority: 2
            });
        });

        rejectedManpowerRequests.forEach(req => {
            items.push({
                id: `oncall-rejected-${req.id}`,
                icon: <UserCircleIcon {...iconProps} />,
                title: "On-Call Rejected",
                subtitle: `${new Date(req.date).toLocaleDateString()} • ${req.reason}`,
                date: new Date(req.date).toLocaleDateString(),
                link: '/payroll/manpower-planning',
                colorClass: 'bg-red-500',
                priority: 2
            });
        });

        // Pulse Surveys
        const pendingSurveys = pulseSurveys.filter(survey => {
             if (survey.status !== PulseSurveyStatus.Active) return false;
             // Check if user has already responded
             const hasResponded = surveyResponses.some(r => r.surveyId === survey.id && r.respondentId === user.id);
             return !hasResponded;
        });

        pendingSurveys.forEach(survey => {
             items.push({
                id: `pulse-${survey.id}`,
                icon: <HeartIcon {...iconProps} />,
                title: "Pulse Check",
                subtitle: survey.title,
                date: `Due: ${survey.endDate ? new Date(survey.endDate).toLocaleDateString() : 'Soon'}`,
                link: `/evaluation/pulse/take/${survey.id}`,
                colorClass: 'bg-pink-500',
                priority: 0 // Top priority
            });
        });

        // Retrieve ALL active checklists (Onboarding/Offboarding) assigned to the user
        // Use state variable 'checklists' instead of mock directly for reactivity
        const myChecklists = checklists.filter(c => c.employeeId === user.id && c.status === 'InProgress');
        
        myChecklists.forEach(checklist => {
            const template = templates.find(t => t.id === checklist.templateId);
            const templateType = template?.templateType || 'Onboarding';
            const taskLabel = templateType === 'Offboarding' ? 'Offboarding Task' : 'Onboarding Task';
            
            // Find the first pending task to show as the "Next Step"
            const pendingTasks = checklist.tasks
                .filter(t => t.status === OnboardingTaskStatus.Pending)
                .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()); // Sort by due date

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
        
        // Benefit Updates
        // Show Fulfilled (Ready) and Rejected (Alert)
        // Limit to recent ones to avoid clutter
        const recentBenefitUpdates = benefitRequests.filter(r => 
            r.employeeId === user.id && 
            (r.status === BenefitRequestStatus.Fulfilled || r.status === BenefitRequestStatus.Rejected)
        ).sort((a,b) => {
            const dateA = a.fulfilledAt || a.submissionDate;
            const dateB = b.fulfilledAt || b.submissionDate;
            return new Date(dateB).getTime() - new Date(dateA).getTime();
        }).slice(0, 2);

        recentBenefitUpdates.forEach(req => {
             if (req.status === BenefitRequestStatus.Fulfilled) {
                 items.push({
                    id: `ben-ready-${req.id}`,
                    icon: <GiftIcon {...iconProps} />,
                    title: "Benefit Released",
                    subtitle: `Your ${req.benefitTypeName} is ready. Click to view details.`,
                    date: new Date(req.fulfilledAt || req.submissionDate).toLocaleDateString(),
                    link: '/employees/benefits',
                    colorClass: 'bg-blue-500',
                    priority: 0
                });
             } else if (req.status === BenefitRequestStatus.Rejected) {
                  items.push({
                    id: `ben-reject-${req.id}`,
                    icon: <GiftIcon {...iconProps} />,
                    title: "Benefit Request Rejected",
                    subtitle: `Request for ${req.benefitTypeName} was rejected.`,
                    date: new Date(req.submissionDate).toLocaleDateString(),
                    link: '/employees/benefits',
                    colorClass: 'bg-red-500',
                    priority: 1
                });
             }
        });

        
        const pendingAssetAcceptance = assignments.filter(a => a.employeeId === user.id && !a.isAcknowledged && !a.dateReturned);
        pendingAssetAcceptance.forEach(assignment => {
            items.push({
                id: `asset-accept-${assignment.id}`,
                icon: <TagIcon {...iconProps} />,
                title: 'Pending Asset Acceptance',
                subtitle: `You have been assigned an asset that requires your acknowledgment.`,
                date: new Date(assignment.dateAssigned).toLocaleDateString(),
                link: '/my-profile', // Direct to profile where the card is
                colorClass: 'bg-indigo-500',
                priority: 0 // High priority
            });
        });

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
                link: `/employees/asset-management/asset-requests`,
                colorClass: 'bg-orange-500',
                priority: 0
            });
        }
        
        const pendingProfileDraft = mockEmployeeDrafts.find(d => d.employeeId === user.id && d.status === EmployeeDraftStatus.Submitted);
        if (pendingProfileDraft) {
            items.push({
                id: 'draft-1',
                icon: <UserCircleIcon {...iconProps} />,
                title: 'Profile Update Submitted',
                subtitle: 'Your changes are pending HR approval.',
                date: new Date(pendingProfileDraft.createdAt).toLocaleDateString(),
                link: '/my-profile',
                colorClass: "bg-gray-500",
                priority: 3
            });
        }
        
        // UPDATED: Pending Signatures/Approvals logic
        const pendingEnvelopes = envelopes.filter(e => 
            (e.status === EnvelopeStatus.PendingApproval || e.status === EnvelopeStatus.OutForSignature) &&
            e.routingSteps.some(s => s.userId === user.id && s.status === RoutingStepStatus.Pending)
        );
        
        pendingEnvelopes.forEach(env => {
            const myStep = env.routingSteps.find(s => s.userId === user.id && s.status === RoutingStepStatus.Pending);
            const actionLabel = myStep?.role === 'Approver' ? 'Contract Approval Required' : 'Contract Signature Required';
            
            items.push({
                id: `env-${env.id}`,
                icon: <PencilSquareIcon {...iconProps} />,
                title: actionLabel,
                subtitle: `${env.title} for ${env.employeeName}`,
                date: new Date(env.createdAt).toLocaleDateString(),
                link: `/employees/contracts/${env.id}`,
                colorClass: myStep?.role === 'Approver' ? "bg-pink-500" : "bg-orange-500",
                priority: 1
            });
        });

        const unreadAnnouncements = mockAnnouncements.filter(a => (a.targetGroup === 'All' || a.targetGroup === user.department) && a.type === AnnouncementType.Policy && !a.acknowledgementIds.includes(user.id));
        unreadAnnouncements.forEach(an => {
            items.push({
                id: `an-${an.id}`,
                icon: <MegaphoneIcon {...iconProps} />,
                title: 'New Policy to Acknowledge',
                subtitle: an.title,
                date: new Date(an.createdAt).toLocaleDateString(),
                link: '/helpdesk/announcements',
                colorClass: 'bg-blue-500',
                priority: 1
            });
        });

        const pendingExceptions = mockAttendanceExceptions.filter(ex => ex.employeeId === user.id && ex.status === 'Pending');
        if(pendingExceptions.length > 0) {
            items.push({
                id: 'ex-group',
                icon: <ShieldExclamationIcon {...iconProps} />,
                title: 'Attendance Exceptions',
                subtitle: `You have ${pendingExceptions.length} pending exception(s) to review.`,
                date: new Date(pendingExceptions[0].date).toLocaleDateString(),
                link: '/payroll/exceptions',
                colorClass: 'bg-yellow-500',
                priority: 2
            });
        }
        
        const pendingPANs = mockPANs.filter(p => p.employeeId === user.id && p.status === PANStatus.PendingEmployee);
        pendingPANs.forEach(pan => {
            items.push({
                id: `pan-${pan.id}`,
                icon: <DocumentTextIcon {...iconProps} />,
                title: 'PAN for Acknowledgement',
                subtitle: `Action: ${getActionType(pan.actionTaken)}`,
                date: new Date(pan.effectiveDate).toLocaleDateString(),
                link: '/employees/pan',
                colorClass: 'bg-purple-500',
                priority: 1
            });
        });
        
        // --- EVALUATION LOGIC UPDATE ---
        const mySubmissions = evaluationSubmissions.filter(sub => sub.raterId === user.id);
        const evaluationsToPerform = mockEvaluations.filter(e => e.status === 'InProgress');

        evaluationsToPerform.forEach(evaluation => {
            // Find who the user needs to evaluate for this evaluation cycle using robust helper
            const eligibleTargets = evaluation.targetEmployeeIds.filter(targetId => 
                isUserEligibleEvaluator(user, evaluation, targetId)
            );

            // Count how many of these have already been submitted
            const submittedTargets = mySubmissions
                .filter(s => s.evaluationId === evaluation.id && eligibleTargets.includes(s.subjectEmployeeId))
                .map(s => s.subjectEmployeeId);
            
            const remainingCount = eligibleTargets.length - submittedTargets.length;
            
            // Get deadline
            // Check if evaluation has specific due date, otherwise fallback to timeline or default
            const deadline = evaluation.dueDate 
                ? evaluation.dueDate 
                : (mockEvaluationTimelines.find(t => t.id === evaluation.timelineId)?.endDate || new Date(evaluation.createdAt.getTime() + 14*24*60*60*1000));
            
            const deadlineStr = new Date(deadline).toLocaleDateString();
            const isOverdue = new Date() > new Date(deadline);

            if (remainingCount > 0) {
                items.push({
                    id: `eval-perform-${evaluation.id}`,
                    icon: <AcademicCapIcon {...iconProps} />, // Make sure to import icon or reuse existing
                    title: "Evaluation Pending",
                    subtitle: `${isOverdue ? '⚠️ OVERDUE: ' : ''}You have ${remainingCount} pending review(s).`,
                    date: `Due: ${deadlineStr}`,
                    link: `/evaluation/perform/${evaluation.id}`,
                    colorClass: isOverdue ? 'bg-red-500' : 'bg-teal-500',
                    priority: isOverdue ? 0 : 2
                });
            }
        });
        
        const myResignation = mockResignations.find(r => r.employeeId === user.id && r.status === ResignationStatus.ReturnedForEdits);
        if (myResignation) {
            items.push({
                id: `resig-${myResignation.id}`,
                icon: <UserMinusIcon {...iconProps} />,
                title: "Resignation Returned",
                subtitle: "Your submission was returned by HR. Please revise.",
                date: new Date(myResignation.submissionDate).toLocaleDateString(),
                link: '/submit-resignation',
                colorClass: 'bg-orange-500',
                priority: 0
            });
        }
        
        const myTickets = mockTickets.filter(t => t.requesterId === user.id && t.status === TicketStatus.PendingResolution);
        myTickets.forEach(ticket => {
            items.push({
                id: `ticket-res-${ticket.id}`,
                icon: <QuestionMarkCircleIcon {...iconProps} />,
                title: "Ticket Resolution Pending",
                subtitle: `Please confirm the resolution for ticket #${ticket.id}`,
                date: new Date(ticket.resolvedAt || ticket.createdAt).toLocaleDateString(),
                link: `/helpdesk/tickets?ticketId=${ticket.id}`,
                colorClass: 'bg-cyan-500',
                priority: 1
            });
        });
        
        // Pending Acknowledgement for Resolutions - Manual check in addition to notifications
        const pendingResolutions = mockResolutions.filter(r => 
            r.employeeId === user.id && 
            r.status === ResolutionStatus.PendingAcknowledgement
        );

        pendingResolutions.forEach(res => {
            const ir = mockIncidentReports.find(i => i.id === res.incidentReportId);
            // Find the NTE for linking
            const nte = mockNTEs.find(n => n.incidentReportId === ir?.id && n.employeeId === user.id);
            
            if (nte) {
                items.push({
                    id: `res-ack-${res.id}`,
                    icon: <GavelIcon {...iconProps} />,
                    title: "Decision for Your Review",
                    subtitle: `A decision has been made on case ${ir?.id || 'Unknown'}. Please review and acknowledge.`,
                    date: new Date(res.decisionDate).toLocaleDateString(),
                    link: `/feedback/nte/${nte.id}`,
                    colorClass: 'bg-orange-500',
                    priority: 0
                });
            }
        });
        
        // Pending Hearing Acknowledgement
        const pendingHearings = mockNTEs.filter(nte => 
            nte.employeeId === user.id && 
            nte.hearingDetails && 
            !nte.hearingDetails.acknowledgments?.some(ack => ack.userId === user.id)
        );
        
        pendingHearings.forEach(nte => {
             items.push({
                id: `hearing-ack-${nte.id}`,
                icon: <GavelIcon {...iconProps} />,
                title: "Hearing Scheduled",
                subtitle: `An administrative hearing has been scheduled for Case ${nte.incidentReportId}.`,
                date: new Date(nte.hearingDetails!.date).toLocaleDateString(),
                link: `/feedback/nte/${nte.id}`,
                colorClass: 'bg-red-500',
                priority: 0
            });
        });


        const myNotifications = mockNotifications
            .filter(n => n.userId === user.id && !n.isRead)
            .map(item => {
                let details;
                switch (item.type) {
                    case NotificationType.SCHEDULE_PUBLISHED:
                        details = { icon: <CalendarDaysIcon {...iconProps} />, title: "New Schedule Published", colorClass: "bg-blue-500" };
                        break;
                    case NotificationType.BIRTHDAY:
                        details = { icon: <CakeIcon {...iconProps} />, title: item.title || "Happy Birthday!", colorClass: 'bg-pink-500', priority: 2 };
                        break;
                    case NotificationType.AWARD_RECEIVED:
                        details = { icon: <TrophyIcon {...iconProps} />, title: "You've Received an Award!", colorClass: 'bg-yellow-500', priority: 0 };
                        break;
                    case NotificationType.NTE_ISSUED:
                         // This is often covered by specific action items above, but good as a fallback
                         // We should deduplicate if possible.
                         if (items.some((i: any) => i.id === `hearing-ack-${item.relatedEntityId}`) || items.some((i: any) => i.id === `nte-response-${item.relatedEntityId}`)) return null;
                        details = { icon: <DocumentTextIcon {...iconProps} />, title: "NTE for Your Response", colorClass: "bg-red-500", priority: 0 };
                        break;
                    case NotificationType.RESOLUTION_ISSUED:
                        // We handle this explicitly above via pendingResolutions check to be robust
                         if (items.some((i: any) => i.id === `res-ack-${item.relatedEntityId}`)) return null;
                        details = { icon: <GavelIcon {...iconProps} />, title: "Decision for Your Review", colorClass: "bg-orange-500", priority: 0 };
                        break;
                    case NotificationType.AssetRequestUpdate:
                        details = { icon: <ArchiveBoxArrowDownIcon {...iconProps} />, title: item.title || "Asset Update", colorClass: "bg-orange-500", priority: 1 };
                        break;
                    case NotificationType.COE_UPDATE:
                         details = { 
                            icon: <DocumentTextIcon {...iconProps} />, 
                            title: item.title || "COE Update", 
                            colorClass: "bg-blue-500", 
                            priority: 1,
                            link: item.relatedEntityId ? `/employees/coe/requests?requestId=${item.relatedEntityId}` : (item.link || '/employees/coe/requests')
                         };
                         break;
                    case NotificationType.ASSET_ASSIGNED:
                         // We handle this explicitly above, checking for dups
                         if (items.some((i: any) => i.id === `asset-accept-${item.relatedEntityId}`)) return null;
                        details = { icon: <TagIcon {...iconProps} />, title: "Asset Assigned", colorClass: "bg-indigo-500", priority: 0 };
                        break;
                    case NotificationType.LEAVE_REQUEST:
                        // For managers who are also employees
                        details = { icon: <SunIcon {...iconProps} />, title: "Leave Request", colorClass: "bg-yellow-500", priority: 1 };
                        break;
                    case NotificationType.LEAVE_DECISION:
                        details = { icon: <SunIcon {...iconProps} />, title: "Leave Update", colorClass: "bg-blue-500", priority: 2 };
                        break;
                    case NotificationType.COACHING_INVITE:
                        details = { icon: <SparklesIcon {...iconProps} />, title: item.title || " Let's Connect! 🚀", colorClass: "bg-purple-500", priority: 0 };
                        break;
                    default:
                        return null;
                }
                return { ...item, ...details };
            }).filter(Boolean);

        myNotifications.forEach(notif => {
            if (notif) {
                items.push({
                    id: `notif-${notif.id}`,
                    icon: notif.icon,
                    title: notif.title,
                    subtitle: notif.message,
                    date: new Date(notif.createdAt).toLocaleDateString(),
                    link: notif.link,
                    state: notif.relatedEntityId ? { openSessionId: notif.relatedEntityId } : undefined, // Pass related ID if relevant (generic)
                    colorClass: notif.colorClass,
                    priority: notif.priority,
                });
            }
        });


        return items.sort((a,b) => (a.priority ?? 99) - (b.priority ?? 99) || new Date(b.date).getTime() - new Date(a.date).getTime());

    }, [user, refreshKey, memoUpdateKey, requests, assignments, checklists, templates, isUserEligibleEvaluator, benefitRequests, pulseSurveys, surveyResponses, coachingSessions, envelopes, ntes, evaluationSubmissions, approvedLeaveRequests, approvedWfhRequests, approvedOtRequests, approvedManpowerRequests, rejectedLeaveRequests, rejectedWfhRequests, rejectedOtRequests, rejectedManpowerRequests, coeDecisions]);

    // Add AcademicCapIcon definition if missing since we used it for evaluation items
    const AcademicCapIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 0 0-.491 6.347A48.627 48.627 0 0 1 12 20.904a48.627 48.627 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.57 50.57 0 0 0-2.658-.813A59.905 59.905 0 0 1 12 3.493a59.902 59.902 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" /></svg>);

    return (
        <div className="space-y-6">
            {showConfetti && <Confetti />}
            <Toast 
                show={toastInfo.show} 
                onClose={() => setToastInfo(prev => ({ ...prev, show: false }))} 
                title={toastInfo.title}
                message={toastInfo.message}
                icon={toastInfo.icon}
            />
            <QuickLinks />
            <AnniversaryBanner />
           
            <Card title="My Action Items">
                <div className="space-y-4">
                    {actionItems.length > 0 ? (
                        actionItems.map(itemProps => (
                            <ActionItemCard
                                key={itemProps.id}
                                {...itemProps}
                                // Date is already stringified in useMemo above
                                date={itemProps.date}
                            />
                        ))
                    ) : (
                        <p className="text-gray-500 dark:text-gray-400 text-center py-4">You're all caught up!</p>
                    )}
                </div>
            </Card>
            
            <RecentMemosWidget onViewMemo={handleViewMemo} />

            <MemoViewModal
                isOpen={isMemoViewOpen}
                onClose={() => setIsMemoViewOpen(false)}
                memo={selectedMemo}
                onAcknowledge={handleAcknowledge}
                user={user}
            />
            
             <RequestCOEModal
                isOpen={isRequestCOEModalOpen}
                onClose={() => setIsRequestCOEModalOpen(false)}
                onSave={handleSaveCOERequest}
            />
        </div>
    );
};

export default EmployeeDashboard;
