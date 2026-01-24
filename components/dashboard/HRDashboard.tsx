
import React, { useMemo, useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import Card from '../ui/Card';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions'; // Import added
import { supabase } from '../../services/supabaseClient';
import { mockJobRequisitions, mockNotifications, mockResignations, mockEvaluations, mockEvaluationSubmissions, mockTickets, mockUserDocuments, mockUsers, mockOnboardingChecklists, mockChangeHistory, mockPANs, mockAssetAssignments, mockManpowerRequests, mockOnboardingTemplates, mockBenefitRequests, mockIncidentReports } from '../../services/mockData';
import { JobRequisitionStatus, JobRequisitionRole, JobRequisitionStepStatus, Role, NotificationType, ResignationStatus, Notification, TicketStatus, UserDocumentStatus, OnboardingTaskStatus, ChangeHistoryStatus, PANStatus, PANActionTaken, AssetAssignment, ManpowerRequest, ManpowerRequestStatus, OnboardingChecklist, OnboardingChecklistTemplate, COERequest, COERequestStatus, COETemplate, BenefitRequestStatus, IRStatus, IncidentReport, User } from '../../types';
import ActionItemCard from './ActionItemCard';
import QuickAnalyticsPreview from './QuickAnalyticsPreview';
import UpcomingEventsWidget from './UpcomingEventsWidget';
import UnassignedTicketsWidget from './UnassignedTicketsWidget';
import QuickLinks from './QuickLinks';
import ManpowerRequestModal from '../payroll/ManpowerRequestModal';
import RequestCOEModal from '../employees/RequestCOEModal';
import COEQueue from './COEQueue';
import PrintableCOE from '../admin/PrintableCOE';
import RejectReasonModal from '../feedback/RejectReasonModal';
import { logActivity } from '../../services/auditService';
import { approveCoeRequest, createCoeRequest, rejectCoeRequest, fetchCoeRequests, fetchActiveCoeTemplates } from '../../services/coeService';


const AcademicCapIcon: React.FC<{className?: string}> = ({className}) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 0 0-.491 6.347A48.627 48.627 0 0 1 12 20.904a48.627 48.627 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.57 50.57 0 0 0-2.658-.813A59.905 59.905 0 0 1 12 3.493a59.902 59.902 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" /></svg>;
const DocumentMagnifyingGlassIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m5.231 13.5h-8.021a1.125 1.125 0 0 1-1.125-1.125v-1.5A1.125 1.125 0 0 1 5.625 15h12.75a1.125 1.125 0 0 1 1.125 1.125v1.5a1.125 1.125 0 0 1-1.125 1.125H13.5m-3.031-1.125a3 3 0 1 0-5.962 0 3 3 0 0 0 5.962 0ZM15 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /></svg>);
const UserMinusIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M22 10.5h-6m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM4 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 10.5 21c-2.39 0-4.64-.666-6.5-1.765Z" /></svg>);
const DocumentTextIcon: React.FC<{ className?: string }> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>);
const TicketIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-12v.75m0 3v.75m0 3v.75m0 3V18m-3 .75h18A2.25 2.25 0 0021 16.5V7.5A2.25 2.25 0 0018.75 5.25H5.25A2.25 2.25 0 003 7.5v9A2.25 2.25 0 005.25 18.75h1.5M12 4.5v15" /></svg>);
const DocumentPlusIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m.75 12.375 3.375-3.375m0 0A2.25 2.25 0 0 1 12.75 12h3.375a2.25 2.25 0 0 1 2.25 2.25v3.375M12.75 12v3.375m0 0a2.25 2.25 0 0 0 2.25 2.25h3.375M12.75 12h-3.375a2.25 2.25 0 0 0-2.25 2.25v3.375m0 0a2.25 2.25 0 0 0 2.25 2.25h3.375M9 2.25h.375a9 9 0 0 1 9 9v.375M9 2.25A2.625 2.625 0 0 0 6.375 5.625v1.5c0 .621.504 1.125 1.125 1.125h1.5" /></svg>);
const ClipboardCheckIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.125 2.25h-4.5c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125v-9M10.125 2.25h.375a9 9 0 0 1 9 9v.375M10.125 2.25A3.375 3.375 0 0 1 13.5 5.625v1.5c0 .621.504 1.125 1.125 1.125h1.5a3.375 3.375 0 0 1 3.375 3.375M9 15l2.25 2.25L15 12" /></svg>);
const UserPlusIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" className={className || "h-6 w-6 text-white"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v6.75c0 .621-.504 1.125-1.125 1.125H9.75a1.125 1.125 0 0 1-1.125-1.125V9.75Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 14v-2" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12h-3" /></svg>);
const UserCircleIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" className={className || "h-6 w-6 text-white"} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>);
const TagIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" /></svg>);
const SunIcon = ({ className }: { className?: string }) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" /></svg>);
const GiftIcon = ({ className }: { className?: string }) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 00-2-2v-7" /></svg>);
const ScaleIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0 0 12 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52v16.5m-1.5-16.5v16.5m-3-16.5v16.5m-1.5-16.5v16.5m-3-16.5v16.5m-1.5-16.5v16.5m-3-16.5v16.5m-1.5-16.5v16.5m-3-16.5v16.5m-1.5-16.5v16.5" /></svg>);


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

const HRDashboard: React.FC = () => {
    const { user } = useAuth();
    const { isUserEligibleEvaluator, getCoeAccess } = usePermissions(); // Added hook
    const isHR = user && [Role.Admin, Role.HRManager, Role.HRStaff].includes(user.role);
    
    const [assignments, setAssignments] = useState<AssetAssignment[]>(mockAssetAssignments);
    const [checklists, setChecklists] = useState<OnboardingChecklist[]>(mockOnboardingChecklists);
    const [templates, setTemplates] = useState<OnboardingChecklistTemplate[]>(mockOnboardingTemplates);
    const [coeRequests, setCoeRequests] = useState<COERequest[]>([]);
    const [coeTemplates, setCoeTemplates] = useState<COETemplate[]>([]);
    const [benefitRequests, setBenefitRequests] = useState(mockBenefitRequests);
    const [incidentReports, setIncidentReports] = useState<IncidentReport[]>(mockIncidentReports);
    const [evaluationSubmissions, setEvaluationSubmissions] = useState(mockEvaluationSubmissions);

    const location = useLocation();
    const navigate = useNavigate();
    const [isManpowerModalOpen, setIsManpowerModalOpen] = useState(false);
    const [isRequestCOEModalOpen, setIsRequestCOEModalOpen] = useState(false);
    
    // COE Processing State
    const [coeToPrint, setCoeToPrint] = useState<{ template: COETemplate, request: COERequest, employee: any } | null>(null);
    const [coeToReject, setCoeToReject] = useState<COERequest | null>(null);
    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
    const [isLoadingCoe, setIsLoadingCoe] = useState(false);

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
        const loadCoeData = async () => {
            setIsLoadingCoe(true);
            try {
                const [requests, templates] = await Promise.all([
                    fetchCoeRequests(),
                    fetchActiveCoeTemplates()
                ]);
                setCoeRequests(requests);
                setCoeTemplates(templates);
            } catch (error: any) {
                console.error('Failed to load COE data', error);
                alert(error?.message || 'Failed to load COE data.');
            } finally {
                setIsLoadingCoe(false);
            }
        };
        loadCoeData();
    }, []);

    useEffect(() => {
        const interval = setInterval(() => {
             setAssignments([...mockAssetAssignments]);
             setChecklists([...mockOnboardingChecklists]);
             setTemplates([...mockOnboardingTemplates]);
             setBenefitRequests([...mockBenefitRequests]);
             setIncidentReports([...mockIncidentReports]);
             setEvaluationSubmissions([...mockEvaluationSubmissions]);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const pendingHrRequisitions = useMemo(() => {
        return mockJobRequisitions.filter(req => 
            req.status === JobRequisitionStatus.PendingApproval &&
            req.routingSteps.some(step => step.role === JobRequisitionRole.HR && step.status === JobRequisitionStepStatus.Pending)
        );
    }, []);
    
    const pendingResignations = useMemo(() => {
        return mockResignations.filter(r => r.status === ResignationStatus.PendingHRReview);
    }, []);

    const pendingProfileChanges = useMemo(() => {
        const pending = mockChangeHistory.filter(c => c.status === ChangeHistoryStatus.Pending);
        const submissionIds = new Set(pending.map(c => c.submissionId));
        return Array.from(submissionIds);
    }, []);

    const pendingUserRegistrations = useMemo(() => {
        return mockUsers.filter(u => u.status === 'Inactive' && u.role === Role.Employee);
    }, []);
    
    const coeAccess = getCoeAccess();
    const scopedCOE = useMemo(() => coeAccess.filterRequests(coeRequests), [coeRequests, coeAccess]);
    const pendingCOE = useMemo(() => {
        return scopedCOE.filter(r => r.status === COERequestStatus.Pending);
    }, [scopedCOE]);

    const pendingBenefitRequests = useMemo(() => {
        return benefitRequests.filter(r => r.status === BenefitRequestStatus.PendingHR);
    }, [benefitRequests]);

    const handleSaveManpowerRequest = (request: ManpowerRequest) => {
        mockManpowerRequests.unshift(request);
        if (user) {
            logActivity(user, 'CREATE', 'ManpowerRequest', request.id, `Created On-Call Request for ${request.date}`);
        }
        alert("Request submitted for approval.");
        setIsManpowerModalOpen(false);
    };
    
    const handleSaveCOERequest = async (request: Partial<COERequest>) => {
        if (!user) {
            alert('You must be signed in to submit a request.');
            return;
        }
        try {
            const saved = await createCoeRequest(request, user);
            setCoeRequests(prev => [saved, ...prev]);
            logActivity(user, 'CREATE', 'COERequest', saved.id, `Requested COE for ${saved.purpose}`);
            alert("Certificate of Employment request submitted.");
        } catch (error: any) {
            alert(error?.message || 'Failed to submit COE request.');
        } finally {
            setIsRequestCOEModalOpen(false);
        }
    };

    // --- COE Approval Logic ---
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
            
            mockNotifications.unshift({
                id: `notif-coe-${Date.now()}`,
                userId: request.employeeId,
                type: NotificationType.COE_UPDATE,
                title: 'COE Request Approved',
                message: `Your COE request for ${request.purpose.replace(/_/g, ' ')} has been approved.`,
                link: `/employees/coe/requests?requestId=${request.id}`,
                isRead: false,
                createdAt: new Date(),
                relatedEntityId: request.id
            });
            
            // Trigger Print View immediately
            setCoeToPrint({ template, request: updated, employee });
        } catch (error: any) {
            alert(error?.message || 'Failed to approve COE request.');
        }
    };

    const handleRejectCOE = (request: COERequest) => {
        if (!coeAccess.canActOn(request)) {
            alert('You do not have permission to reject this request.');
            return;
        }
        setCoeToReject(request);
        setIsRejectModalOpen(true);
    };

    const confirmRejectCOE = async (reason: string) => {
        if (!user || !coeToReject) return;
        
        try {
            const updated = await rejectCoeRequest(coeToReject.id, user.id, reason);
            setCoeRequests(prev => prev.map(r => r.id === updated.id ? updated : r));

            logActivity(user, 'REJECT', 'COERequest', coeToReject.id, `Rejected COE request. Reason: ${reason}`);
             mockNotifications.unshift({
                id: `notif-coe-reject-${Date.now()}`,
                userId: coeToReject.employeeId,
                type: NotificationType.COE_UPDATE, 
                title: 'COE Request Rejected',
                message: `Your COE request was rejected. Reason: ${reason}`,
                link: `/employees/coe/requests?requestId=${coeToReject.id}`,
                isRead: false,
                createdAt: new Date(),
                relatedEntityId: coeToReject.id
            });
        } catch (error: any) {
            alert(error?.message || 'Failed to reject COE request.');
        }
        
        setIsRejectModalOpen(false);
        setCoeToReject(null);
    };


    const actionItems = useMemo(() => {
        if (!user) return [];

        const allItems: any[] = [];
        const iconProps = { className: "h-6 w-6 text-white" };

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

        // Pending Asset Acceptance for HR
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

        // Check for PANs needing acknowledgement (shows up regardless of role)
        const pendingPANsForAcknowledgement = mockPANs.filter(p => p.employeeId === user.id && p.status === PANStatus.PendingEmployee);
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
        
        // Disciplinary Cases assigned to me
        const myAssignedCases = incidentReports.filter(ir => 
            ir.assignedToId === user.id && 
            ir.status !== IRStatus.Closed && 
            ir.status !== IRStatus.NoAction && 
            ir.status !== IRStatus.Converted
        );
        
        myAssignedCases.forEach(ir => {
            let title = "Assigned Case Review";
            let colorClass = "bg-red-500";
            let subtitle = `${ir.category}: ${ir.involvedEmployeeNames.join(', ')}`;

            if (ir.pipelineStage === 'ir-review') {
                title = "New Incident Review";
                colorClass = "bg-red-500";
            } else if (ir.pipelineStage === 'nte-for-approval') {
                title = "NTE Review Required";
                colorClass = "bg-orange-500";
            } else if (ir.pipelineStage === 'hr-review-response') {
                title = "Review Employee Response";
                colorClass = "bg-purple-500";
            } else if (ir.pipelineStage === 'nte-sent') {
                title = "Awaiting NTE Response";
                colorClass = "bg-blue-500";
            }

             allItems.push({
                id: `case-action-${ir.id}`,
                icon: <ScaleIcon {...iconProps} />,
                title: title,
                subtitle: subtitle,
                date: new Date(ir.dateTime).toLocaleDateString(),
                link: '/feedback/cases', // Ideally link to specific case details
                colorClass: colorClass,
                priority: 0
            });
        });

        // HR Manager & Admin: Cases pending assignment
        if (user.role === Role.HRManager || user.role === Role.Admin) {
            const unassignedCases = incidentReports.filter(ir =>
                ir.status === IRStatus.Submitted &&
                ir.pipelineStage === 'ir-review' &&
                !ir.assignedToId 
            );

            unassignedCases.forEach(ir => {
                allItems.push({
                    id: `case-assign-${ir.id}`,
                    icon: <ScaleIcon {...iconProps} />,
                    title: "New Case - Needs Assignment",
                    subtitle: `${ir.category}: ${ir.involvedEmployeeNames.join(', ')}`,
                    date: new Date(ir.dateTime).toLocaleDateString(),
                    link: '/feedback/cases', 
                    colorClass: "bg-red-500",
                    priority: 0
                });
            });
        }

        const getNotificationDetails = (notification: Notification) => {
            switch(notification.type) {
                case NotificationType.ResignationSubmitted:
                    return {
                        icon: <UserMinusIcon {...iconProps} />,
                        title: "Resignation Submitted",
                        colorClass: "bg-orange-500"
                    };
                case NotificationType.TICKET_ASSIGNED_TO_YOU:
                    return {
                        icon: <TicketIcon {...iconProps} />,
                        title: "New Ticket Assigned",
                        colorClass: 'bg-cyan-500'
                    };
                case NotificationType.TICKET_UPDATE_REQUESTER:
                    return {
                        icon: <TicketIcon {...iconProps} />,
                        title: "Ticket Update",
                        colorClass: 'bg-cyan-500'
                    };
                case NotificationType.CASE_ASSIGNED:
                    return {
                        icon: <ScaleIcon {...iconProps} />,
                        title: "Case Assigned",
                        colorClass: 'bg-rose-500'
                    };
                case NotificationType.BENEFIT_REQUEST_SUBMITTED:
                    return {
                        icon: <GiftIcon {...iconProps} />,
                        title: "Benefit Approval Required",
                        colorClass: "bg-emerald-500"
                    };
                case NotificationType.ASSET_ASSIGNED:
                     // We handle this explicitly above as an Action Item, but we can also show it as a notification
                     if (allItems.some((i: any) => i.id === `asset-accept-${notification.relatedEntityId}`)) return null;
                    return { 
                        icon: <TagIcon {...iconProps} />, 
                        title: "Asset Assigned", 
                        colorClass: "bg-indigo-500" 
                    };
                case NotificationType.LEAVE_REQUEST:
                    return { 
                        icon: <SunIcon {...iconProps} />, 
                        title: "Leave Request", 
                        colorClass: "bg-yellow-500" 
                    };
                case NotificationType.LEAVE_DECISION:
                    return { 
                        icon: <SunIcon {...iconProps} />, 
                        title: "Leave Update", 
                        colorClass: "bg-blue-500" 
                    };
                case NotificationType.PAN_UPDATE:
                    return {
                        icon: <DocumentTextIcon {...iconProps} />,
                        title: "PAN Approved",
                        colorClass: "bg-green-500"
                    };
                default:
                     return {
                        icon: <DocumentTextIcon {...iconProps} />,
                        title: notification.type.replace(/_/g, ' '),
                        colorClass: "bg-gray-500"
                    };
            }
        }
        
        const notificationItems = mockNotifications
            .filter(n => n.userId === user.id && !n.isRead)
            .map(item => {
                const details = getNotificationDetails(item);
                if (!details) return null;
                return {
                    id: `notif-${item.id}`,
                    icon: details.icon,
                    title: details.title,
                    subtitle: item.message,
                    date: new Date(item.createdAt).toLocaleDateString(),
                    link: item.link,
                    colorClass: details.colorClass
                };
            }).filter(Boolean);
        
        allItems.push(...notificationItems);
        
        if (isHR) {
            pendingBenefitRequests.forEach(req => {
                allItems.push({
                    id: `ben-hr-${req.id}`,
                    icon: <GiftIcon {...iconProps} />,
                    title: "Benefit Review",
                    subtitle: `${req.employeeName} - ${req.benefitTypeName}`,
                    date: new Date(req.submissionDate).toLocaleDateString(),
                    link: '/employees/benefits?tab=approvals',
                    colorClass: 'bg-pink-500'
                });
            });

            pendingHrRequisitions.forEach(req => {
                allItems.push({
                    id: `req-hr-${req.id}`,
                    icon: <DocumentMagnifyingGlassIcon {...iconProps} />,
                    title: "Requisition for HR Approval",
                    subtitle: `${req.title} for ${req.headcount} position(s)`,
                    date: new Date(req.createdAt).toLocaleDateString(),
                    link: '/recruitment/requisitions',
                    colorClass: 'bg-purple-500'
                });
            });

            pendingResignations.forEach(res => {
                allItems.push({
                    id: `res-hr-${res.id}`,
                    icon: <UserMinusIcon {...iconProps} />,
                    title: "Resignation for Review",
                    subtitle: `From ${res.employeeName}, last day ${new Date(res.lastWorkingDay).toLocaleDateString()}`,
                    date: new Date(res.submissionDate).toLocaleDateString(),
                    link: '/employees/onboarding',
                    colorClass: 'bg-orange-500'
                });
            });

            const pendingDocs = mockUserDocuments.filter(doc => doc.status === UserDocumentStatus.Pending);
            pendingDocs.forEach(doc => {
                const employee = mockUsers.find(u => u.id === doc.employeeId);
                const docTitle = doc.documentType === 'Others' ? doc.customDocumentType : doc.documentType;
                allItems.push({
                    id: `doc-review-${doc.id}`,
                    icon: <DocumentPlusIcon {...iconProps} />,
                    title: "Document for Review",
                    subtitle: `${docTitle} from ${employee?.name || 'Unknown'}`,
                    date: new Date(doc.submittedAt).toLocaleDateString(),
                    link: '/employees/list?tab=review',
                    colorClass: 'bg-cyan-500'
                });
            });

            pendingProfileChanges.forEach(submissionId => {
                 const change = mockChangeHistory.find(c => c.submissionId === submissionId);
                 const employeeName = mockUsers.find(u => u.id === change?.employeeId)?.name || 'Unknown';
                 
                 allItems.push({
                    id: `profile-review-${submissionId}`,
                    icon: <UserCircleIcon {...iconProps} />,
                    title: "Profile Change Request",
                    subtitle: `Review changes submitted by ${employeeName}`,
                    date: new Date(change?.timestamp || Date.now()).toLocaleDateString(),
                    link: '/employees/list?tab=review',
                    colorClass: 'bg-blue-500'
                 });
            });
            
            pendingUserRegistrations.forEach(userReg => {
                 allItems.push({
                    id: `user-reg-${userReg.id}`,
                    icon: <UserPlusIcon {...iconProps} />,
                    title: "New User Registration",
                    subtitle: `Approve account for ${userReg.name}`,
                    date: new Date(userReg.dateHired).toLocaleDateString(),
                    link: '/employees/list?tab=review',
                    colorClass: 'bg-green-500'
                 });
            });
        }


        // UPDATED: Evaluation Logic using shared helper
        const mySubmissions = evaluationSubmissions.filter(sub => sub.raterId === user.id);
        const evaluationsToPerform = mockEvaluations.filter(e => e.status === 'InProgress');

        const evaluationItems = evaluationsToPerform.map(evaluation => {
            // Find who this user needs to evaluate for this evaluation cycle
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
                    colorClass: 'bg-purple-500'
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
        
        return allItems.sort((a,b) => (a.priority ?? 99) - (b.priority ?? 99) || new Date(b.date).getTime() - new Date(a.date).getTime());

    }, [user, isHR, pendingHrRequisitions, pendingResignations, pendingProfileChanges, pendingUserRegistrations, assignments, checklists, templates, pendingBenefitRequests, incidentReports, evaluationSubmissions, isUserEligibleEvaluator]);


    return (
        <div className="space-y-6">
            <QuickLinks />

            <UpcomingEventsWidget />

            {isHR && (
                <Card title="Pending COE Requests">
                    <COEQueue 
                        requests={pendingCOE}
                        onApprove={handleApproveCOE}
                        onReject={handleRejectCOE}
                        canAct={coeAccess.canApprove}
                        canActOn={coeAccess.canActOn}
                    />
                </Card>
            )}

            {actionItems.length > 0 ? (
                <Card title="Action Items">
                    <div className="space-y-4">
                        {actionItems.map(itemProps => (
                            <ActionItemCard
                                key={itemProps.id}
                                {...itemProps}
                                date={itemProps.date} // Already stringified
                            />
                        ))}
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {isHR && <UnassignedTicketsWidget />}
                {isHR && <QuickAnalyticsPreview />}
            </div>

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

            <RejectReasonModal
                isOpen={isRejectModalOpen}
                onClose={() => setIsRejectModalOpen(false)}
                onSubmit={confirmRejectCOE}
                title="Reject COE Request"
                prompt="Please provide a reason for rejecting this request."
            />
        </div>
    );
};
export default HRDashboard;
