import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { mockNTEs, mockIncidentReports, mockUsers, mockCodeOfDiscipline, mockResolutions, mockNotifications } from '../../services/mockData';
import { NTE, IncidentReport, User, ChatMessage, NTEStatus, Permission, Resolution, ResolutionStatus, ApproverStatus, ApproverStep, NotificationType, HearingDetails } from '../../types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { useAuth } from '../../hooks/useAuth';
import NotFound from '../NotFound';
import Textarea from '../../components/ui/Textarea';
import Input from '../../components/ui/Input';
import SignaturePad, { SignaturePadRef } from '../../components/ui/SignaturePad';
import PrintableNTEResponse from '../../components/feedback/PrintableNTEResponse';
import ResolutionModal from '../../components/feedback/ResolutionModal';
import { usePermissions } from '../../hooks/usePermissions';
import RejectReasonModal from '../../components/feedback/RejectReasonModal';
import HearingSchedulerModal from '../../components/feedback/HearingSchedulerModal';
import { logActivity } from '../../services/auditService';

const PaperclipIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>;
const PaperAirplaneIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>;
const ArrowLeftIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>;
const CheckCircleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>;
const ClockIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>;
const XCircleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>;
const CalendarIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;

const ApproverStatusIcon: React.FC<{status: ApproverStatus}> = ({status}) => {
    switch (status) {
        case ApproverStatus.Approved: return <CheckCircleIcon />;
        case ApproverStatus.Pending: return <ClockIcon />;
        case ApproverStatus.Rejected: return <XCircleIcon />;
        default: return null;
    }
};


const NTEDetail: React.FC = () => {
    const { nteId } = useParams<{ nteId: string }>();
    const { user } = useAuth();
    const { can } = usePermissions();
    const navigate = useNavigate();

    const [newMessage, setNewMessage] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    
    // Response Form State
    const [responseText, setResponseText] = useState('');
    const [responseEvidenceUrl, setResponseEvidenceUrl] = useState('');
    const signaturePadRef = useRef<SignaturePadRef>(null);
    const [responseToPrint, setResponseToPrint] = useState<NTE | null>(null);
    const [isResolutionModalOpen, setResolutionModalOpen] = useState(false);
    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
    const [isHearingModalOpen, setIsHearingModalOpen] = useState(false);
    
    const [nte, setNte] = useState<NTE | null>(() => mockNTEs.find(n => n.id === nteId) || null);
    const [incidentReport, setIncidentReport] = useState<IncidentReport | null>(() => mockIncidentReports.find(ir => ir.id === nte?.incidentReportId) || null);
    
    const [resolution, setResolution] = useState<Resolution | null>(() => 
        mockResolutions.find(r => r.incidentReportId === nte?.incidentReportId && r.employeeId === nte?.employeeId) || null
    );

    const { recipient, nteIssuer } = useMemo(() => {
        if (!nte) return { recipient: null, nteIssuer: null };
        const foundRecipient = mockUsers.find(u => u.id === nte.employeeId);
        const foundIssuer = mockUsers.find(u => u.id === nte.issuedByUserId);
        return { recipient: foundRecipient, nteIssuer: foundIssuer };
    }, [nte]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [incidentReport?.chatThread]);

    const currentUserStep = useMemo(() => {
        if (!user || !nte || nte.status !== NTEStatus.PendingApproval) return null;
        return nte.approverSteps?.find(step => step.userId === user.id && step.status === ApproverStatus.Pending);
    }, [nte, user]);

    const isEmployeeAcknowledgeNeeded = user?.id === nte?.employeeId && resolution?.status === ResolutionStatus.PendingAcknowledgement;

    const handleApprove = () => {
        if (!user || !nte || !currentUserStep) return;

        const nteIndex = mockNTEs.findIndex(n => n.id === nte.id);
        if (nteIndex === -1) return;

        const updatedNte = JSON.parse(JSON.stringify(mockNTEs[nteIndex]));

        const stepIndex = updatedNte.approverSteps.findIndex((s: ApproverStep) => s.userId === user.id);
        if (stepIndex > -1) {
            updatedNte.approverSteps[stepIndex].status = ApproverStatus.Approved;
            updatedNte.approverSteps[stepIndex].timestamp = new Date();
        }

        const allApproved = updatedNte.approverSteps.every((s: ApproverStep) => s.status === ApproverStatus.Approved);

        if (allApproved) {
            updatedNte.status = NTEStatus.Issued;
            updatedNte.issuedDate = new Date(); 

            mockNotifications.unshift({
                id: `notif-nte-issued-${updatedNte.id}`,
                userId: updatedNte.employeeId,
                type: NotificationType.NTE_ISSUED,
                message: `You have been issued a Notice to Explain (NTE) regarding case ${updatedNte.incidentReportId}.`,
                link: `/feedback/nte/${updatedNte.id}`,
                isRead: false,
                createdAt: new Date(),
                relatedEntityId: updatedNte.id,
            });
        }

        mockNTEs[nteIndex] = updatedNte;
        setNte(updatedNte);
        logActivity(user, 'APPROVE', 'NTE', nte.id, `Approved NTE for ${nte.employeeName}.`);
        alert('NTE step approved.');
    };

    const handleConfirmReject = (reason: string) => {
        if (!user || !nte || !currentUserStep) return;

        const nteIndex = mockNTEs.findIndex(n => n.id === nte.id);
        if (nteIndex === -1) return;

        const updatedNte = JSON.parse(JSON.stringify(mockNTEs[nteIndex]));

        const stepIndex = updatedNte.approverSteps.findIndex((s: ApproverStep) => s.userId === user.id);
        if (stepIndex > -1) {
            updatedNte.approverSteps[stepIndex].status = ApproverStatus.Rejected;
            updatedNte.approverSteps[stepIndex].timestamp = new Date();
            updatedNte.approverSteps[stepIndex].rejectionReason = reason;
        }

        updatedNte.status = NTEStatus.Rejected;

        mockNTEs[nteIndex] = updatedNte;
        setNte(updatedNte);
        logActivity(user, 'REJECT', 'NTE', nte.id, `Rejected NTE for ${nte.employeeName}. Reason: ${reason}`);

        mockNotifications.unshift({
            id: `notif-nte-rejected-${updatedNte.id}`,
            userId: updatedNte.issuedByUserId,
            type: NotificationType.RESOLUTION_ISSUED, 
            message: `NTE ${updatedNte.id} for ${updatedNte.employeeName} was rejected by ${user.name}.`,
            link: `/feedback/nte/${updatedNte.id}`,
            isRead: false,
            createdAt: new Date(),
            relatedEntityId: updatedNte.id,
        });

        setIsRejectModalOpen(false);
        alert('NTE rejected.');
    };

    const handleAcknowledgeResolution = (signatureDataUrl: string, fullName: string) => {
        if (!resolution || !user) return;
        
        const resIndex = mockResolutions.findIndex(r => r.id === resolution.id);
        if (resIndex > -1) {
            const updatedResolution = {
                ...mockResolutions[resIndex],
                status: ResolutionStatus.Acknowledged,
                employeeAcknowledgedAt: new Date(),
                employeeAcknowledgementSignatureUrl: signatureDataUrl
            };
            mockResolutions[resIndex] = updatedResolution;
            setResolution(updatedResolution);
        }
        
        // Update NTE Status to Closed as well to reflect end of process
        const nteIndex = mockNTEs.findIndex(n => n.id === nte!.id);
        if (nteIndex > -1) {
            mockNTEs[nteIndex] = { ...mockNTEs[nteIndex], status: NTEStatus.Closed };
            setNte(mockNTEs[nteIndex]);
        }
        
        logActivity(user, 'APPROVE', 'Resolution', resolution.id, `Employee acknowledged resolution.`);
        setResolutionModalOpen(false);
        alert("You have acknowledged the decision. This case is now closed.");
        navigate('/feedback/cases');
    };


    const handleSendMessage = () => {
        if (!newMessage.trim() || !incidentReport || !user) return;

        const newChatMessage: ChatMessage = {
            id: `msg-${Date.now()}`,
            userId: user.id,
            userName: user.name,
            timestamp: new Date(),
            text: newMessage.trim(),
        };

        const updatedChatThread = [...incidentReport.chatThread, newChatMessage];

        const irIndex = mockIncidentReports.findIndex(ir => ir.id === incidentReport.id);
        if (irIndex !== -1) {
            mockIncidentReports[irIndex].chatThread = updatedChatThread;
        }

        setIncidentReport(prev => prev ? { ...prev, chatThread: updatedChatThread } : null);
        setNewMessage('');
    };

    const handleSubmitResponse = () => {
        if (!responseText.trim() || signaturePadRef.current?.isEmpty()) {
            alert('Please provide your written explanation and a signature before submitting.');
            return;
        }

        const signatureDataUrl = signaturePadRef.current.getSignatureDataUrl();
        if (!signatureDataUrl) return;

        const nteIndex = mockNTEs.findIndex(n => n.id === nte!.id);
        if (nteIndex === -1) return;

        const updatedNte: NTE = {
            ...nte!,
            employeeResponse: responseText,
            employeeResponseEvidenceUrl: responseEvidenceUrl,
            employeeResponseSignatureUrl: signatureDataUrl,
            status: NTEStatus.ResponseSubmitted,
            responseDate: new Date(),
        };

        mockNTEs[nteIndex] = updatedNte;
        setNte(updatedNte);
    };

    const handleSaveResolution = (
        resolutionDetails: Partial<Resolution> & { decisionMakerSignatureUrl: string },
        approverIds: string[]
    ) => {
        if (!user || !incidentReport || !nte) return;

        const approverSteps: ApproverStep[] = approverIds.map(id => {
            const approver = mockUsers.find(u => u.id === id)!;
            return {
                userId: id,
                userName: approver.name,
                status: ApproverStatus.Pending,
            };
        });

        const newResolution: Resolution = {
            ...resolutionDetails,
            id: `RES-${Date.now()}`,
            incidentReportId: incidentReport.id,
            decisionDate: new Date(),
            closedByUserId: user.id,
            status: ResolutionStatus.PendingApproval,
            approverSteps: approverSteps,
            ...({ employeeId: nte.employeeId } as any)
        } as Resolution;

        mockResolutions.push(newResolution);
        setResolution(newResolution);

        // NOTE: We update the parent stage for convenience, but individual virtual cards derive 
        // their stage from their specific resolution status.
        const irIndex = mockIncidentReports.findIndex(ir => ir.id === incidentReport.id);
        if (irIndex > -1) {
            mockIncidentReports[irIndex].pipelineStage = 'bod-gm-approval';
        }

        setIncidentReport(prev => prev ? {...prev, pipelineStage: 'bod-gm-approval'} : null);

        setResolutionModalOpen(false);
        alert('Case has been sent for approval.');
        navigate('/feedback/cases');
    };
    
    const handleSaveHearing = (details: HearingDetails) => {
        if (!nte || !user) return;
        
        const nteIndex = mockNTEs.findIndex(n => n.id === nte.id);
        if (nteIndex === -1) return;

        const updatedNte = {
            ...nte,
            hearingDetails: details,
            status: NTEStatus.HearingScheduled
        };
        
        mockNTEs[nteIndex] = updatedNte;
        setNte(updatedNte);

        // Create notification for employee
        mockNotifications.unshift({
            id: `notif-hearing-${Date.now()}`,
            userId: nte.employeeId,
            type: NotificationType.NTE_ISSUED, // Using NTE_ISSUED type as generic high priority
            message: `An administrative hearing has been scheduled for Case ${nte.incidentReportId}.`,
            link: `/feedback/nte/${nte.id}`,
            isRead: false,
            createdAt: new Date(),
            relatedEntityId: nte.id,
        });
        
        // Create notification for panel members
        details.panelIds.forEach(panelistId => {
             mockNotifications.unshift({
                id: `notif-hearing-panel-${Date.now()}-${panelistId}`,
                userId: panelistId,
                type: NotificationType.NTE_ISSUED,
                message: `You have been added to the hearing panel for Case ${nte.incidentReportId}.`,
                link: `/feedback/nte/${nte.id}`,
                isRead: false,
                createdAt: new Date(),
                relatedEntityId: nte.id,
            });
        });

        setIsHearingModalOpen(false);
        logActivity(user, 'CREATE', 'Hearing', nte.id, `Scheduled hearing for ${nte.employeeName} on ${details.date.toLocaleDateString()}`);
        alert('Administrative hearing scheduled successfully.');
    };

    const handleAcknowledgeHearing = () => {
        if (!nte || !user || !nte.hearingDetails) return;

        const isEmployee = user.id === nte.employeeId;
        const isPanel = nte.hearingDetails.panelIds.includes(user.id);

        if (!isEmployee && !isPanel) return;

        const nteIndex = mockNTEs.findIndex(n => n.id === nte.id);
        if (nteIndex === -1) return;

        const acknowledgment = {
            userId: user.id,
            userName: user.name,
            role: isEmployee ? 'Employee' : 'Panel',
            date: new Date()
        } as const;

        // Ensure acknowledgments array exists
        const currentAcknowledgments = nte.hearingDetails.acknowledgments || [];
        
        // Check if already acknowledged
        if (currentAcknowledgments.some(ack => ack.userId === user.id)) {
            return;
        }

        const updatedDetails: HearingDetails = {
            ...nte.hearingDetails,
            acknowledgments: [...currentAcknowledgments, acknowledgment]
        };

        const updatedNte = {
            ...nte,
            hearingDetails: updatedDetails
        };

        mockNTEs[nteIndex] = updatedNte;
        setNte(updatedNte);
        logActivity(user, 'APPROVE', 'Hearing', nte.id, `Acknowledged hearing schedule.`);
    };

    if (!nte || !incidentReport || !recipient) {
        return <NotFound />;
    }

    const references = nte.disciplineCodeIds.map(id => mockCodeOfDiscipline.entries.find(e => e.id === id)).filter(Boolean);

    const isAwaitingEmployeeResponse = user?.id === nte.employeeId && nte.status === NTEStatus.Issued;
    const hasEmployeeResponded = nte.status !== NTEStatus.Draft && nte.status !== NTEStatus.Issued && nte.status !== NTEStatus.PendingApproval && nte.status !== NTEStatus.Rejected;
    const canResolve = can('Feedback', Permission.Edit);

    // Can schedule hearing if response submitted or issued (but not closed), and user is admin/HR
    const canScheduleHearing = canResolve && nte.status !== NTEStatus.Closed && nte.status !== NTEStatus.Draft && nte.status !== NTEStatus.PendingApproval && nte.status !== NTEStatus.Rejected;

    const userHasAcknowledgedHearing = nte.hearingDetails?.acknowledgments?.some(ack => ack.userId === user?.id);
    const isHearingParticipant = user && (user.id === nte.employeeId || nte.hearingDetails?.panelIds.includes(user.id));


    return (
        <div className="space-y-6">
            <div>
                <Link to="/feedback/cases" className="flex items-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-2">
                    <ArrowLeftIcon />
                    Back to Disciplinary Cases
                </Link>
                <div className="flex justify-between items-start">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">NTE: {nte.id}</h1>
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${nte.status === NTEStatus.Issued ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {nte.status}
                    </span>
                </div>
                <p className="text-lg text-gray-600 dark:text-gray-400">{incidentReport.category}</p>

                <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2 text-sm">
                    <div>
                        <dt className="font-medium text-gray-500 dark:text-gray-400">Recipient(s)</dt>
                        <dd className="mt-1 text-gray-900 dark:text-white font-semibold">{recipient.name}</dd>
                    </div>
                     <div>
                        <dt className="font-medium text-gray-500 dark:text-gray-400">Linked IR</dt>
                        <dd className="mt-1 text-gray-900 dark:text-white font-mono">{nte.incidentReportId}</dd>
                    </div>
                    <div className="sm:col-span-2">
                        <dt className="font-medium text-gray-500 dark:text-gray-400">Response Deadline</dt>
                        <dd className="mt-1 text-gray-900 dark:text-white font-semibold">{new Date(nte.deadline).toLocaleString()}</dd>
                    </div>
                </dl>
            </div>

            {isEmployeeAcknowledgeNeeded && (
                <Card title="Notice of Decision Issued" className="bg-indigo-50 border border-indigo-200 dark:bg-indigo-900/40 dark:border-indigo-800">
                    <p className="mb-4 text-indigo-900 dark:text-indigo-100">A decision has been reached regarding this case. Please review and acknowledge the resolution to close this case.</p>
                    <Button onClick={() => setResolutionModalOpen(true)}>View Decision</Button>
                </Card>
            )}
            
            {nte.hearingDetails && (
                 <Card title="Hearing Scheduled" className="bg-orange-50 border border-orange-200 dark:bg-orange-900/40 dark:border-orange-800">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Date & Time</p>
                            <p className="font-bold text-lg text-gray-900 dark:text-white">
                                {new Date(nte.hearingDetails.date).toLocaleString()}
                            </p>
                         </div>
                         <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Location / Link</p>
                             <p className="font-semibold text-gray-900 dark:text-white">
                                {nte.hearingDetails.type === 'Virtual' ? (
                                    <a href={nte.hearingDetails.location} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Join Meeting</a>
                                ) : (
                                    nte.hearingDetails.location
                                )}
                            </p>
                         </div>
                         <div className="md:col-span-2">
                            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Panelists</p>
                            <p className="text-gray-900 dark:text-white">
                                {nte.hearingDetails.panelIds.map(id => mockUsers.find(u => u.id === id)?.name).join(', ')}
                            </p>
                         </div>
                         {nte.hearingDetails.notes && (
                            <div className="md:col-span-2">
                                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Notes</p>
                                <p className="text-gray-700 dark:text-gray-300 italic">{nte.hearingDetails.notes}</p>
                            </div>
                         )}
                    </div>

                    <div className="mt-6 border-t border-orange-200 dark:border-orange-800 pt-4">
                         <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-2">Participant Status</h4>
                         <div className="space-y-2 text-sm">
                            {/* Employee Status */}
                            <div className="flex justify-between items-center bg-white dark:bg-slate-800 p-2 rounded border border-orange-100 dark:border-orange-900">
                                <span>{nte.employeeName} (Employee)</span>
                                {nte.hearingDetails.acknowledgments?.some(a => a.userId === nte.employeeId) ? (
                                    <span className="text-green-600 font-bold flex items-center"><CheckCircleIcon /> Confirmed</span>
                                ) : (
                                    <span className="text-orange-600 italic">Pending Acknowledgement</span>
                                )}
                            </div>
                            {/* Panel Status */}
                            {nte.hearingDetails.panelIds.map(pid => {
                                const panelistName = mockUsers.find(u => u.id === pid)?.name;
                                const hasAck = nte.hearingDetails!.acknowledgments?.some(a => a.userId === pid);
                                return (
                                    <div key={pid} className="flex justify-between items-center bg-white dark:bg-slate-800 p-2 rounded border border-orange-100 dark:border-orange-900">
                                        <span>{panelistName} (Panel)</span>
                                        {hasAck ? (
                                            <span className="text-green-600 font-bold flex items-center"><CheckCircleIcon /> Confirmed</span>
                                        ) : (
                                            <span className="text-orange-600 italic">Pending Acknowledgement</span>
                                        )}
                                    </div>
                                );
                            })}
                         </div>
                    </div>

                    <div className="mt-6 flex justify-between items-center">
                        {isHearingParticipant && !userHasAcknowledgedHearing && (
                            <Button onClick={handleAcknowledgeHearing}>
                                Acknowledge Schedule
                            </Button>
                        )}
                        {isHearingParticipant && userHasAcknowledgedHearing && (
                            <span className="text-sm text-green-600 font-medium">
                                You have acknowledged this schedule.
                            </span>
                        )}

                        {canResolve && (
                             <Button variant="secondary" size="sm" onClick={() => setIsHearingModalOpen(true)}>Edit Schedule</Button>
                        )}
                    </div>
                </Card>
            )}

            {nte.approverSteps && nte.approverSteps.length > 0 && (
                <Card title="Approval Status">
                    <ul className="space-y-4">
                        {nte.approverSteps.map(step => (
                            <li key={step.userId} className="flex items-start space-x-3">
                                <div className="mt-1"><ApproverStatusIcon status={step.status} /></div>
                                <div>
                                    <p className="font-medium text-gray-900 dark:text-white">{step.userName}</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                        Status: {step.status}
                                        {step.timestamp && ` on ${new Date(step.timestamp).toLocaleDateString()}`}
                                    </p>
                                    {step.rejectionReason && <p className="text-sm text-red-600 italic">Reason: "{step.rejectionReason}"</p>}
                                </div>
                            </li>
                        ))}
                    </ul>
                </Card>
            )}
            
            {currentUserStep && (
                <Card title="Your Action Required" className="bg-yellow-50 dark:bg-yellow-900/40 border-yellow-400">
                    <p className="text-sm mb-4">This Notice to Explain requires your approval before it is issued to the employee.</p>
                    <div className="flex justify-end space-x-2">
                        <Button variant="danger" onClick={() => setIsRejectModalOpen(true)}>Reject</Button>
                        <Button onClick={handleApprove}>Approve</Button>
                    </div>
                </Card>
            )}

            <Card>
                <h2 className="text-xl font-bold mb-4">Issue Summary</h2>
                <div className="space-y-4">
                    <div>
                        <h3 className="font-semibold text-gray-800 dark:text-gray-200">Detailed Context</h3>
                        <p className="mt-1 text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{incidentReport.description}</p>
                    </div>
                    <div>
                        <h3 className="font-semibold text-gray-800 dark:text-gray-200">Allegations</h3>
                         <p className="mt-1 text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{nte.details}</p>
                    </div>
                     {references.length > 0 && (
                        <div>
                            <h3 className="font-semibold text-gray-800 dark:text-gray-200">Reference(s)</h3>
                            <ul className="mt-1 space-y-1">
                                {references.map(ref => (
                                    <li key={ref.id} className="text-sm text-gray-600 dark:text-gray-400">
                                        <span className="font-mono bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300 px-1 rounded-sm">{ref.code}</span>: {ref.description}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {nte.evidenceUrl && (
                        <div>
                            <h3 className="font-semibold text-gray-800 dark:text-gray-200">Supporting Documents</h3>
                            <a href={nte.evidenceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 text-indigo-600 dark:text-indigo-400 hover:underline break-all">{nte.evidenceUrl}</a>
                        </div>
                    )}
                </div>
            </Card>

            {isAwaitingEmployeeResponse && (
                <Card title="Respond to this Notice">
                    <div className="space-y-4">
                        <Textarea label="Your Written Explanation" value={responseText} onChange={e => setResponseText(e.target.value)} rows={8} required />
                        <Input label="Link to Additional Evidence/Documentation (Optional)" value={responseEvidenceUrl} onChange={e => setResponseEvidenceUrl(e.target.value)} placeholder="https://example.com/document.pdf" />
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Signature</label>
                            <SignaturePad ref={signaturePadRef} />
                        </div>
                        <div className="flex justify-end pt-4 border-t dark:border-gray-700">
                            <Button onClick={handleSubmitResponse}>Submit Response</Button>
                        </div>
                    </div>
                </Card>
            )}

            {hasEmployeeResponded && (
                 <Card title="Your Submitted Response">
                     <div className="space-y-4">
                        <div>
                            <h3 className="font-semibold text-gray-800 dark:text-gray-200">Date Submitted</h3>
                            <p className="mt-1 text-gray-600 dark:text-gray-400">{nte.responseDate ? new Date(nte.responseDate).toLocaleString() : 'N/A'}</p>
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-800 dark:text-gray-200">Explanation</h3>
                            <p className="mt-1 text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{nte.employeeResponse}</p>
                        </div>
                        {nte.employeeResponseEvidenceUrl && (
                            <div>
                                <h3 className="font-semibold text-gray-800 dark:text-gray-200">Supporting Evidence</h3>
                                <a href={nte.employeeResponseEvidenceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 text-indigo-600 dark:text-indigo-400 hover:underline break-all">{nte.employeeResponseEvidenceUrl}</a>
                            </div>
                        )}
                         {nte.employeeResponseSignatureUrl && (
                            <div>
                                <h3 className="font-semibold text-gray-800 dark:text-gray-200">Your Signature</h3>
                                <img src={nte.employeeResponseSignatureUrl} alt="Your Signature" className="mt-2 border rounded-md p-2 bg-gray-100 dark:bg-gray-700 max-h-24"/>
                            </div>
                        )}
                        <div className="flex justify-end pt-4 border-t dark:border-gray-700">
                            <Button variant="secondary" onClick={() => setResponseToPrint(nte)}>Download My Response as PDF</Button>
                        </div>
                    </div>
                    {/* Post-Response Actions for HR */}
                    {canResolve && nte.status !== NTEStatus.Closed && (!resolution || resolution.status === ResolutionStatus.Rejected || resolution.status === ResolutionStatus.Draft) && (
                        <div className="flex flex-wrap justify-center gap-4 p-4 border-t dark:border-gray-700">
                            {canScheduleHearing && (
                                <Button variant="secondary" onClick={() => setIsHearingModalOpen(true)}>
                                    <CalendarIcon /> Schedule Hearing
                                </Button>
                            )}
                            <Button onClick={() => setResolutionModalOpen(true)}>
                                {resolution && resolution.status === ResolutionStatus.Rejected ? "Resubmit Resolution" : "Convert Case for Resolution"}
                            </Button>
                        </div>
                    )}
                    
                    {/* Show Hearing Proceedings section if hearing scheduled */}
                    {nte.hearingDetails && (
                        <div className="mt-6 pt-6 border-t dark:border-gray-700">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Hearing Proceedings</h3>
                            <div className="p-4 bg-gray-50 dark:bg-slate-800/50 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-center">
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Upload Minutes of Meeting or Hearing Summary here.</p>
                                <Button variant="secondary" size="sm" onClick={() => alert('File upload for Minutes of Meeting coming soon.')}>Upload Minutes</Button>
                            </div>
                        </div>
                    )}

                 </Card>
            )}

            <div className="bg-white dark:bg-slate-800 shadow-md rounded-lg flex flex-col">
                <div className="flex-grow p-4 space-y-4 overflow-y-auto">
                    <div className="text-center my-2">
                        <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded-full px-3 py-1">
                            This is the beginning of your conversation
                        </span>
                    </div>
                    <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0 h-8 w-8 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold text-xs">{nteIssuer?.name.substring(0, 2) || 'HR'}</div>
                        <div>
                            <div className="p-3 bg-gray-100 dark:bg-slate-700 rounded-lg rounded-tl-none">
                                <p className="text-sm text-gray-800 dark:text-gray-200">This Notice to Explain has been issued. Please provide your response by the deadline. You can use this chat for any questions.</p>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{nteIssuer ? `${nteIssuer.name} (${nteIssuer.role})` : 'System Message'}</p>
                        </div>
                    </div>
                    {incidentReport.chatThread.map(msg => (
                        <div key={msg.id} className={`flex items-start space-x-3 ${msg.userId === user?.id ? 'flex-row-reverse space-x-reverse' : ''}`}>
                            <div className="flex-shrink-0 h-8 w-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center font-bold text-xs">{msg.userName.substring(0, 2)}</div>
                            <div>
                                <div className={`p-3 rounded-lg ${msg.userId === user?.id ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-gray-100 dark:bg-slate-700 rounded-bl-none'}`}>
                                    <p className="text-sm">{msg.text}</p>
                                </div>
                                <p className={`text-xs text-gray-500 dark:text-gray-400 mt-1 ${msg.userId === user?.id ? 'text-right' : ''}`}>{msg.userName} at {new Date(msg.timestamp).toLocaleTimeString()}</p>
                            </div>
                        </div>
                    ))}
                     <div ref={messagesEndRef} />
                </div>
                <div className="p-4 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                    <div className="relative">
                         <textarea
                            value={newMessage}
                            onChange={e => setNewMessage(e.target.value)}
                            onKeyDown={e => {if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }}}
                            placeholder="Type your message..."
                            className="w-full p-2 pr-20 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                            rows={2}
                        />
                        <div className="absolute bottom-2 right-2 flex space-x-1">
                            <Button size="sm" variant="secondary" className="!p-2"><PaperclipIcon /></Button>
                            <Button size="sm" className="!p-2" onClick={handleSendMessage}><PaperAirplaneIcon /></Button>
                        </div>
                    </div>
                </div>
            </div>
             {isResolutionModalOpen && (
                <ResolutionModal
                    isOpen={isResolutionModalOpen}
                    onClose={() => setResolutionModalOpen(false)}
                    incidentReport={incidentReport}
                    resolution={resolution || undefined}
                    onSave={handleSaveResolution}
                    isEmployeeAcknowledgeView={isEmployeeAcknowledgeNeeded}
                    onAcknowledge={handleAcknowledgeResolution}
                />
            )}
            {responseToPrint && createPortal(
                <PrintableNTEResponse nte={responseToPrint} onClose={() => setResponseToPrint(null)} />,
                document.body
            )}

            <RejectReasonModal
                isOpen={isRejectModalOpen}
                onClose={() => setIsRejectModalOpen(false)}
                onSubmit={handleConfirmReject}
                title="Reason for NTE Rejection"
                prompt="Please provide a reason for rejecting this NTE. This will be visible to the issuer."
                submitText="Confirm Rejection"
            />

            <HearingSchedulerModal
                isOpen={isHearingModalOpen}
                onClose={() => setIsHearingModalOpen(false)}
                hearingDetails={nte.hearingDetails}
                onSave={handleSaveHearing}
            />
        </div>
    );
};

export default NTEDetail;