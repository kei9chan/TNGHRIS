
import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Card from '../ui/Card';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { mockResolutions, mockPANs, mockJobRequisitions, mockEvaluations, mockNotifications, mockEvaluationSubmissions, mockIncidentReports, mockTickets, mockEmployeeAwards, mockUsers, mockOnboardingChecklists, mockNTEs, mockAssetAssignments, mockManpowerRequests, mockOnboardingTemplates, mockBenefitRequests, mockEnvelopes, mockWFHRequests } from '../../services/mockData';
import { ResolutionStatus, ApproverStatus, PANStatus, PANStepStatus, JobRequisitionStatus, JobRequisitionRole, JobRequisitionStepStatus, NotificationType, TicketStatus, OnboardingTaskStatus, PANActionTaken, NTEStatus, PAN, Resolution, NTE, JobRequisition, EmployeeAward, AssetAssignment, ManpowerRequest, ManpowerRequestStatus, OnboardingChecklist, OnboardingChecklistTemplate, COERequest, BenefitRequestStatus, Envelope, EnvelopeStatus, RoutingStepStatus, WFHRequest, WFHRequestStatus, COETemplate, User, Role } from '../../types';
import QuickAnalyticsPreview from './QuickAnalyticsPreview';
import ActionItemCard from './ActionItemCard';
import UpcomingEventsWidget from './UpcomingEventsWidget';
import QuickLinks from './QuickLinks';
import ManpowerReviewModal from '../payroll/ManpowerReviewModal';
import WFHReviewModal from '../payroll/WFHReviewModal';
import RequestCOEModal from '../employees/RequestCOEModal';
import { logActivity } from '../../services/auditService';
import { createCoeRequest, fetchCoeRequests, approveCoeRequest, rejectCoeRequest, fetchActiveCoeTemplates } from '../../services/coeService';
import COEQueue from './COEQueue';
import PrintableCOE from '../admin/PrintableCOE';
import { supabase } from '../../services/supabaseClient';

const GavelIcon: React.FC<{className?: string}> = ({className}) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>;
const DocumentTextIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m5.231 13.5h-8.021a1.125 1.125 0 0 1-1.125-1.125v-1.5A1.125 1.125 0 0 1 5.625 15h12.75a1.125 1.125 0 0 1 1.125 1.125v1.5a1.125 1.125 0 0 1-1.125 1.125H13.5m-3.031-1.125a3 3 0 1 0-5.962 0 3 3 0 0 0 5.962 0ZM15 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /></svg>);
const DocumentMagnifyingGlassIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m5.231 13.5h-8.021a1.125 1.125 0 0 1-1.125-1.125v-1.5A1.125 1.125 0 0 1 5.625 15h12.75a1.125 1.125 0 0 1 1.125 1.125v1.5a1.125 1.125 0 0 1-1.125 1.125H13.5m-3.031-1.125a3 3 0 1 0-5.962 0 3 3 0 0 0 5.962 0ZM15 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /></svg>);
const AcademicCapIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 0 0-.491 6.347A48.627 48.627 0 0 1 12 20.904a48.627 48.627 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.57 50.57 0 0 0-2.658-.813A59.905 59.905 0 0 1 12 3.493a59.902 59.902 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" /></svg>);
const CalendarDaysIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0h18" /></svg>);
const TicketIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-12v.75m0 3v.75m0 3v.75m0 3V18m-3 .75h18A2.25 2.25 0 0021 16.5V7.5A2.25 2.25 0 0018.75 5.25H5.25A2.25 2.25 0 003 7.5v9A2.25 2.25 0 005.25 18.75h1.5M12 4.5v15" /></svg>);
const TrophyIcon = ({ className }: { className?: string }) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9a9 9 0 0 0 9 0Zm0 0a9 9 0 0 0-9 0m9 0h-9M9 11.25V7.5A3 3 0 0 1 12 4.5h0A3 3 0 0 1 15 7.5v3.75m-3 6.75h.01M12 12h.01M12 6h.01M12 18h.01M7.5 15h.01M16.5 15h.01M19.5 12h.01M4.5 12h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>);
const ClipboardCheckIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.125 2.25h-4.5c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125v-9M10.125 2.25h.375a9 9 0 0 1 9 9v.375M10.125 2.25A3.375 3.375 0 0 1 13.5 5.625v1.5c0 .621.504 1.125 1.125 1.125h1.5a3.375 3.375 0 0 1 3.375 3.375M9 15l2.25 2.25L15 12" /></svg>);
const TagIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" /></svg>);
const SunIcon = ({ className }: { className?: string }) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" /></svg>);
const UserGroupIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.653-.122-1.28-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.653.122-1.28.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>;
const GiftIcon = ({ className }: { className?: string }) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 00-2-2v-7" /></svg>);
const PencilSquareIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>);
const HomeIcon = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>;

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


const BODDashboard: React.FC = () => {
    const { user } = useAuth();
    const { isUserEligibleEvaluator, getCoeAccess } = usePermissions(); // Hook to check if user should evaluate
    const location = useLocation();
    const navigate = useNavigate();
    
    const [pans, setPans] = useState<PAN[]>(mockPANs);
    const [panApproverId, setPanApproverId] = useState<string | null>(null);
    const [resolutions, setResolutions] = useState<Resolution[]>(mockResolutions);
    const [ntes, setNTEs] = useState<NTE[]>(mockNTEs);
    const [requisitions, setRequisitions] = useState<JobRequisition[]>(mockJobRequisitions);
    const [awards, setAwards] = useState<EmployeeAward[]>(mockEmployeeAwards);
    const [assignments, setAssignments] = useState<AssetAssignment[]>(mockAssetAssignments);
    const [manpowerRequests, setManpowerRequests] = useState<ManpowerRequest[]>(mockManpowerRequests);
    const [wfhRequests, setWfhRequests] = useState<WFHRequest[]>(mockWFHRequests);
    const [checklists, setChecklists] = useState<OnboardingChecklist[]>(mockOnboardingChecklists);
    const [templates, setTemplates] = useState<OnboardingChecklistTemplate[]>(mockOnboardingTemplates);
    const [benefitRequests, setBenefitRequests] = useState(mockBenefitRequests);
    const [envelopes, setEnvelopes] = useState<Envelope[]>(mockEnvelopes);
    const [evaluationSubmissions, setEvaluationSubmissions] = useState(mockEvaluationSubmissions);
    const [coeRequests, setCoeRequests] = useState<COERequest[]>([]);
    const [coeTemplates, setCoeTemplates] = useState<COETemplate[]>([]);
    const [coeToPrint, setCoeToPrint] = useState<{ template: COETemplate, request: COERequest, employee: User } | null>(null);
    const [isLoadingCoe, setIsLoadingCoe] = useState(false);
    const [coeRequests, setCoeRequests] = useState<COERequest[]>([]);
    const [isLoadingCoe, setIsLoadingCoe] = useState(false);

    const [isManpowerReviewModalOpen, setIsManpowerReviewModalOpen] = useState(false);
    const [selectedManpowerRequest, setSelectedManpowerRequest] = useState<ManpowerRequest | null>(null);
    
    const [isWFHReviewModalOpen, setIsWFHReviewModalOpen] = useState(false);
    const [selectedWFHRequest, setSelectedWFHRequest] = useState<WFHRequest | null>(null);

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

    useEffect(() => {
        if (location.state?.openRequestCOE) {
            setIsRequestCOEModalOpen(true);
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.state, navigate]);

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

    // Sync with mock data to ensure approvals are reflected immediately when navigating back
    useEffect(() => {
        const interval = setInterval(() => {
             setPans([...mockPANs]);
             setResolutions([...mockResolutions]);
             setNTEs([...mockNTEs]);
             setRequisitions([...mockJobRequisitions]);
             setAwards([...mockEmployeeAwards]);
             setAssignments([...mockAssetAssignments]);
             setManpowerRequests([...mockManpowerRequests]);
             setWfhRequests([...mockWFHRequests]);
             setChecklists([...mockOnboardingChecklists]);
             setTemplates([...mockOnboardingTemplates]);
             setBenefitRequests([...mockBenefitRequests]);
             setEnvelopes([...mockEnvelopes]);
             setEvaluationSubmissions([...mockEvaluationSubmissions]);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const handleApproveManpower = (requestId: string) => {
        const index = mockManpowerRequests.findIndex(r => r.id === requestId);
        if (index > -1) {
            mockManpowerRequests[index].status = ManpowerRequestStatus.Approved;
            mockManpowerRequests[index].approvedBy = user?.id;
            mockManpowerRequests[index].approvedAt = new Date();
            setManpowerRequests([...mockManpowerRequests]);
            setIsManpowerReviewModalOpen(false);
            alert("Manpower Request Approved.");
        } else {
             alert("Error: Request not found.");
        }
    };

    const handleRejectManpower = (requestId: string, reason: string) => {
        const index = mockManpowerRequests.findIndex(r => r.id === requestId);
        if (index > -1) {
            mockManpowerRequests[index].status = ManpowerRequestStatus.Rejected;
            mockManpowerRequests[index].rejectionReason = reason;
            setManpowerRequests([...mockManpowerRequests]);
            setIsManpowerReviewModalOpen(false);
            alert("Manpower Request Rejected.");
        } else {
             alert("Error: Request not found.");
        }
    };

    const openReviewModal = (req: ManpowerRequest) => {
        setSelectedManpowerRequest(req);
        setIsManpowerReviewModalOpen(true);
    };

    // WFH Handlers
    const handleApproveWFH = (requestId: string) => {
        const index = mockWFHRequests.findIndex(r => r.id === requestId);
        if (index > -1) {
            mockWFHRequests[index].status = WFHRequestStatus.Approved;
            mockWFHRequests[index].approvedBy = user?.id;
            mockWFHRequests[index].approvedAt = new Date();
            setWfhRequests([...mockWFHRequests]);
            setIsWFHReviewModalOpen(false);
            if (user) {
                logActivity(user, 'APPROVE', 'WFHRequest', requestId, `Approved WFH request.`);
            }
            alert("WFH Request Approved.");
        }
    };

    const handleRejectWFH = (requestId: string, reason: string) => {
        const index = mockWFHRequests.findIndex(r => r.id === requestId);
        if (index > -1) {
            mockWFHRequests[index].status = WFHRequestStatus.Rejected;
            mockWFHRequests[index].rejectionReason = reason;
            setWfhRequests([...mockWFHRequests]);
            setIsWFHReviewModalOpen(false);
            if (user) {
                logActivity(user, 'REJECT', 'WFHRequest', requestId, `Rejected WFH request. Reason: ${reason}`);
            }
            alert("WFH Request Rejected.");
        }
    };

    const openWFHReviewModal = (req: WFHRequest) => {
        setSelectedWFHRequest(req);
        setIsWFHReviewModalOpen(true);
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

    const pendingBenefitRequests = useMemo(() => {
        return benefitRequests.filter(r => r.status === BenefitRequestStatus.PendingBOD);
    }, [benefitRequests]);


    const actionItems = useMemo(() => {
        if (!user) return [];
        const allItems: any[] = [];
        const iconProps = { className: "h-6 w-6 text-white" };
        const notificationUserIds = new Set([user.id, user.authUserId, panApproverId, legacyUserId].filter(Boolean));

        // Retrieve ALL active checklists (Onboarding/Offboarding) assigned to the user
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
                allItems.push({
                    id: `checklist-task-${nextTask.id}`,
                    icon: <ClipboardCheckIcon {...iconProps} />,
                    title: `${taskLabel}: ${template?.name || 'Checklist'}`,
                    subtitle: `Pending Task: "${nextTask.name}"`,
                    date: new Date(nextTask.dueDate).toLocaleDateString(),
                    link: `/employees/onboarding/task/${nextTask.id}`,
                    colorClass: templateType === 'Offboarding' ? 'bg-orange-500' : 'bg-cyan-500',
                    priority: 1
                });
            }
        });
        
        pendingBenefitRequests.forEach(req => {
             allItems.push({
                id: `ben-bod-${req.id}`,
                icon: <GiftIcon {...iconProps} />,
                title: "Benefit Approval Required",
                subtitle: `${req.employeeName} - ${req.benefitTypeName}`,
                date: new Date(req.dateNeeded).toLocaleDateString(),
                link: '/employees/benefits?tab=approvals',
                colorClass: 'bg-orange-500',
                priority: 0
            });
        });

        // Pending Asset Acceptance for BOD
        const pendingAssetAcceptance = assignments.filter(a => a.employeeId === user.id && !a.isAcknowledged && !a.dateReturned);
        pendingAssetAcceptance.forEach(assignment => {
            allItems.push({
                id: `asset-accept-${assignment.id}`,
                icon: <TagIcon {...iconProps} />,
                title: 'Pending Asset Acceptance',
                subtitle: `You have been assigned an asset that requires your acknowledgment.`,
                date: new Date(assignment.dateAssigned).toLocaleDateString(),
                link: '/my-profile', 
                colorClass: 'bg-indigo-500',
                priority: 0 // High priority
            });
        });
        
        // Manpower Requests
        const pendingManpower = manpowerRequests.filter(r => r.status === ManpowerRequestStatus.Pending);
        pendingManpower.forEach(req => {
            allItems.push({
                id: `manpower-${req.id}`,
                icon: <UserGroupIcon />,
                title: "On-Call Staff Request",
                subtitle: `For ${req.businessUnitName} on ${new Date(req.date).toLocaleDateString()}`,
                date: new Date(req.createdAt).toLocaleDateString(),
                onClick: () => openReviewModal(req),
                link: '#', // Handled by onClick
                colorClass: 'bg-pink-500',
                priority: 0
            });
        });

        // WFH Requests
        const pendingWFH = wfhRequests.filter(r => r.status === WFHRequestStatus.Pending);
        pendingWFH.forEach(req => {
             allItems.push({
                id: `wfh-${req.id}`,
                icon: <HomeIcon {...iconProps} />,
                title: "WFH Request Approval",
                subtitle: `${req.employeeName} for ${new Date(req.date).toLocaleDateString()}`,
                date: new Date(req.createdAt).toLocaleDateString(),
                onClick: () => openWFHReviewModal(req),
                link: '#',
                colorClass: 'bg-teal-500',
                priority: 0
            });
        });
        
        const pendingPANsForAcknowledgement = pans.filter(p => p.employeeId === user.id && p.status === PANStatus.PendingEmployee);
        pendingPANsForAcknowledgement.forEach(pan => {
            allItems.push({
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

        const pendingFinalRequisitions = requisitions.filter(req => 
            req.status === JobRequisitionStatus.PendingApproval &&
            req.routingSteps.some(step => 
                step.role === JobRequisitionRole.Final &&
                step.status === JobRequisitionStepStatus.Pending &&
                step.userId === user.id
            )
        );

        const approverIds = new Set([user.id, panApproverId].filter(Boolean));
        const pendingPansForMe = pans.filter(pan =>
            [PANStatus.PendingApproval, PANStatus.PendingEndorser, PANStatus.PendingRecommender].includes(pan.status) &&
            pan.routingSteps.some(step => approverIds.has(step.userId) && step.status === PANStepStatus.Pending)
        );

        const pendingResolutionsForMe = resolutions.filter(res =>
            res.status === ResolutionStatus.PendingApproval &&
            res.approverSteps.some(step => step.userId === user.id && step.status === ApproverStatus.Pending)
        );

        const pendingNTEsForMe = ntes.filter(nte =>
            nte.status === NTEStatus.PendingApproval &&
            nte.approverSteps?.some(step => step.userId === user.id && step.status === ApproverStatus.Pending)
        );

        pendingNTEsForMe.forEach(nte => {
            allItems.push({
                id: `nte-approve-${nte.id}`,
                icon: <DocumentTextIcon {...iconProps} />,
                title: "NTE for Approval",
                subtitle: `For ${nte.employeeName} regarding Case ${nte.incidentReportId}`,
                date: new Date(nte.issuedDate).toLocaleDateString(),
                link: `/feedback/nte/${nte.id}`,
                colorClass: 'bg-orange-500',
                priority: 1
            });
        });

        pendingFinalRequisitions.forEach(req => {
            allItems.push({
                id: `req-final-${req.id}`,
                icon: <DocumentMagnifyingGlassIcon {...iconProps} />,
                title: "Requisition for Final Approval",
                subtitle: `${req.title} for ${req.headcount} position(s)`,
                date: new Date(req.createdAt).toLocaleDateString(),
                link: '/recruitment/requisitions',
                colorClass: 'bg-blue-500'
            });
        });

        pendingPansForMe.forEach(pan => {
            allItems.push({
                id: `pan-approve-${pan.id}`,
                icon: <DocumentTextIcon {...iconProps} />,
                title: "PAN for Approval",
                subtitle: `For ${pan.employeeName}`,
                date: new Date(pan.effectiveDate).toLocaleDateString(),
                link: '/employees/pan',
                colorClass: 'bg-purple-500'
            });
        });

        pendingResolutionsForMe.forEach(res => {
            const ir = mockIncidentReports.find(ir => ir.id === res.incidentReportId);
            allItems.push({
                id: `res-approve-${res.id}`,
                icon: <GavelIcon {...iconProps} />,
                title: "Resolution for Approval",
                subtitle: `For Case: ${res.incidentReportId} (${ir?.category})`,
                date: new Date(res.decisionDate).toLocaleDateString(),
                link: '/feedback/cases?filter=pending_my_approval',
                colorClass: 'bg-orange-500'
            });
        });

        const awardsForApproval = awards.filter(award => 
            award.status === ResolutionStatus.PendingApproval &&
            award.approverSteps.some(step => step.userId === user.id && step.status === ApproverStatus.Pending)
        );
    
        awardsForApproval.forEach(award => {
            const employeeName = mockUsers.find(u => u.id === award.employeeId)?.name || 'Unknown';
            allItems.push({
                id: `award-approve-${award.id}`,
                icon: <TrophyIcon {...iconProps} />,
                title: "Award for Approval",
                subtitle: `For ${employeeName}`,
                date: new Date(award.dateAwarded).toLocaleDateString(),
                link: '/evaluation/awards',
                colorClass: 'bg-yellow-500',
                priority: 0
            });
        });
        
        const pendingEnvelopes = envelopes.filter(env => 
            (env.status === EnvelopeStatus.PendingApproval || env.status === EnvelopeStatus.OutForSignature) &&
            env.routingSteps.some(step => step.userId === user.id && step.status === RoutingStepStatus.Pending)
        );

        pendingEnvelopes.forEach(env => {
            const myStep = env.routingSteps.find(s => s.userId === user.id && s.status === RoutingStepStatus.Pending);
            const actionLabel = myStep?.role === 'Approver' ? 'Approval Required' : 'Signature Required';
            
            allItems.push({
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


        const interviewInvites = mockNotifications
            .filter(n => notificationUserIds.has(n.userId) && !n.isRead && n.type === NotificationType.InterviewInvite)
            .map(item => ({
                id: `notif-${item.id}`,
                icon: <CalendarDaysIcon {...iconProps} />,
                title: "New Interview Invitation",
                subtitle: item.message,
                date: new Date(item.createdAt).toLocaleDateString(),
                link: item.link,
                colorClass: "bg-blue-500"
            }));
        allItems.push(...interviewInvites);
        
        const ticketNotifications = mockNotifications
            .filter(n => notificationUserIds.has(n.userId) && !n.isRead && (n.type === NotificationType.TICKET_ASSIGNED_TO_YOU || n.type === NotificationType.TICKET_UPDATE_REQUESTER))
            .map(item => ({
                id: `notif-${item.id}`,
                icon: <TicketIcon {...iconProps} />,
                title: item.type === NotificationType.TICKET_ASSIGNED_TO_YOU ? "New Ticket Assigned" : "Ticket Update",
                subtitle: item.message,
                date: new Date(item.createdAt).toLocaleDateString(),
                link: item.link,
                colorClass: "bg-cyan-500"
            }));
        allItems.push(...ticketNotifications);
        
        const caseNotifications = mockNotifications
            .filter(n => notificationUserIds.has(n.userId) && !n.isRead && n.type === NotificationType.CASE_ASSIGNED)
            .map(item => ({
                id: `notif-${item.id}`,
                icon: <GavelIcon {...iconProps} />,
                title: "Case Assigned",
                subtitle: item.message,
                date: new Date(item.createdAt).toLocaleDateString(),
                link: item.link,
                colorClass: "bg-rose-500"
            }));
        allItems.push(...caseNotifications);

        const benefitNotifications = mockNotifications
            .filter(n => notificationUserIds.has(n.userId) && !n.isRead && n.type === NotificationType.BENEFIT_REQUEST_SUBMITTED)
            .map(item => ({
                id: `notif-${item.id}`,
                icon: <GiftIcon {...iconProps} />,
                title: "Benefit Approval Required",
                subtitle: item.message,
                date: new Date(item.createdAt).toLocaleDateString(),
                link: item.link,
                colorClass: "bg-emerald-500"
            }));
        allItems.push(...benefitNotifications);

        const panApprovalNotifications = mockNotifications
            .filter(n => notificationUserIds.has(n.userId) && !n.isRead && n.type === NotificationType.PAN_APPROVAL_REQUEST)
            .map(item => ({
                id: `notif-${item.id}`,
                icon: <DocumentTextIcon {...iconProps} />,
                title: "PAN Approval Required",
                subtitle: item.message,
                date: new Date(item.createdAt).toLocaleDateString(),
                link: item.link,
                colorClass: "bg-amber-500"
            }));
        allItems.push(...panApprovalNotifications);

        const onboardingNotifications = mockNotifications
            .filter(n => notificationUserIds.has(n.userId) && !n.isRead && (n.type === NotificationType.ONBOARDING_ASSIGNED || n.type === NotificationType.OFFBOARDING_ASSIGNED))
            .map(item => ({
                id: `notif-${item.id}`,
                icon: <ClipboardCheckIcon {...iconProps} />,
                title: item.type === NotificationType.OFFBOARDING_ASSIGNED ? "Offboarding Assigned" : "Onboarding Assigned",
                subtitle: item.message,
                date: new Date(item.createdAt).toLocaleDateString(),
                link: item.link,
                colorClass: item.type === NotificationType.OFFBOARDING_ASSIGNED ? "bg-orange-500" : "bg-cyan-500"
            }));
        allItems.push(...onboardingNotifications);

        const assetNotifications = mockNotifications
            .filter(n => notificationUserIds.has(n.userId) && !n.isRead && n.type === NotificationType.ASSET_ASSIGNED)
            .map(item => {
                 if (allItems.some((i: any) => i.id === `asset-accept-${item.relatedEntityId}`)) return null;
                 return {
                    id: `notif-${item.id}`,
                    icon: <TagIcon {...iconProps} />,
                    title: "Asset Assigned",
                    subtitle: item.message,
                    date: new Date(item.createdAt).toLocaleDateString(),
                    link: item.link,
                    colorClass: "bg-indigo-500"
                }
            }).filter(Boolean);
        allItems.push(...assetNotifications);

        const leaveRequestNotifications = mockNotifications
            .filter(n => notificationUserIds.has(n.userId) && !n.isRead && n.type === NotificationType.LEAVE_REQUEST)
            .map(item => ({
                id: `notif-${item.id}`,
                icon: <SunIcon {...iconProps} />,
                title: "Leave Request",
                subtitle: item.message,
                date: new Date(item.createdAt).toLocaleDateString(),
                link: item.link,
                colorClass: "bg-yellow-500",
                priority: 1
            }));
        allItems.push(...leaveRequestNotifications);

        // UPDATED: Robust Evaluation Logic
        const mySubmissions = evaluationSubmissions.filter(sub => sub.raterId === user.id);
        const evaluationsToPerform = mockEvaluations.filter(e => e.status === 'InProgress');

        const evaluationItems = evaluationsToPerform.map(evaluation => {
            // Find who this user needs to evaluate for this evaluation cycle using the robust helper
            const eligibleTargets = evaluation.targetEmployeeIds.filter(targetId => 
                isUserEligibleEvaluator(user, evaluation, targetId)
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
        allItems.push(...evaluationItems);

        const myTickets = mockTickets.filter(t => 
            t.assignedToId === user.id && 
            ![TicketStatus.Resolved, TicketStatus.Closed].includes(t.status)
        );

        myTickets.forEach(ticket => {
            allItems.push({
                id: `ticket-${ticket.id}`,
                icon: <TicketIcon {...iconProps} />,
                title: `Ticket Assigned: ${ticket.id}`,
                subtitle: `From ${ticket.requesterName}: ${ticket.description}`,
                date: new Date(ticket.createdAt).toLocaleDateString(),
                link: '/helpdesk/tickets',
                colorClass: 'bg-cyan-500'
            });
        });

        // Ensure sort always works by converting date string to Date object if needed, or using a timestamp field
        return allItems.sort((a,b) => {
             const priorityDiff = (a.priority ?? 99) - (b.priority ?? 99);
             if (priorityDiff !== 0) return priorityDiff;
             // Parse the date string back to a timestamp for correct sorting
             return new Date(b.date).getTime() - new Date(a.date).getTime();
        });
    }, [user, pans, resolutions, ntes, requisitions, awards, assignments, manpowerRequests, wfhRequests, checklists, templates, isManpowerReviewModalOpen, pendingBenefitRequests, envelopes, evaluationSubmissions, isUserEligibleEvaluator, panApproverId]); 

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
            
            <WFHReviewModal 
                isOpen={isWFHReviewModalOpen}
                onClose={() => setIsWFHReviewModalOpen(false)}
                request={selectedWFHRequest}
                onApprove={handleApproveWFH}
                onReject={handleRejectWFH}
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
export default BODDashboard;
