import {CaseQuestions} from '../../modules/caseQuestions';
import { decisionSaved } from '../../services/approvalNavigation';
import NTEWorkflowPanel from '../../modules/nte/NTEWorkflowPanel';
import { DisciplineEntry } from '../../types';
import { fetchUsers } from '../../services/userService';
import { fetchCodeOfDiscipline } from '../../services/disciplineService';
import { createNotification } from '../../services/notificationService';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { NTE, IncidentReport, User, ChatMessage, NTEStatus, Permission, Resolution, ResolutionStatus, ApproverStatus, ApproverStep, NotificationType, HearingDetails } from '../../types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { useAuth } from '../../hooks/useAuth';

import Textarea from '../../components/ui/Textarea';
import Input from '../../components/ui/Input';
import SignaturePad, { SignaturePadRef } from '../../components/ui/SignaturePad';
import PrintableNTEResponse from '../../components/feedback/PrintableNTEResponse';
import ResolutionModal from '../../components/feedback/ResolutionModal';
import { usePermissions } from '../../hooks/usePermissions';
import RejectReasonModal from '../../components/feedback/RejectReasonModal';
import HearingSchedulerModal from '../../components/feedback/HearingSchedulerModal';
import { logActivity } from '../../services/auditService';
import { fetchNTEById, processNTEApproval, updateNTE } from '../../services/nteService';
import { fetchNTEIncidentContext, addIncidentReportMessage, saveIncidentReport } from '../../services/incidentReportService';
import { fetchResolutionsByIncidentReportId, createResolution, updateResolution } from '../../services/resolutionService';
import { formatIRDisplayId, formatNTEDisplayId } from '../../utils/formatCaseId';
import { formatExternalUrl } from '../../utils/urlUtils';
import { supabase } from '../../services/supabaseClient';
import { NTE_SIGNATURE_CSS } from '../../components/feedback/NTEPreview';
import ResponsiveDocumentPreview from '../../components/ui/ResponsiveDocumentPreview';

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
        case ApproverStatus.ReturnedForRevision:
        case ApproverStatus.Rejected: return <XCircleIcon />;
        case ApproverStatus.Cancelled: return <span className="h-5 w-5 rounded-full bg-gray-300 dark:bg-gray-600" aria-label="Cancelled" />;
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
    const [approvalOutcome, setApprovalOutcome] = useState<'return' | 'reject' | null>(null);
    const [isHearingModalOpen, setIsHearingModalOpen] = useState(false);
    
    const [nte, setNte] = useState<NTE | null>(null);
    const [incidentReport, setIncidentReport] = useState<IncidentReport | null>(null);
    const [resolution, setResolution] = useState<Resolution | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [disciplineEntries, setDisciplineEntries] = useState<DisciplineEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError,setLoadError]=useState('');
    const [reload,setReload]=useState(0);
    const approvalLock=useRef(false);
    const [isApprovalActionBusy, setIsApprovalActionBusy] = useState(false);
    const [approvalActionMessage, setApprovalActionMessage] = useState<string | null>(null);

    const { recipient, nteIssuer } = useMemo(() => {
        if (!nte || !users.length) return { recipient: null, nteIssuer: null };
        const foundRecipient = users.find(u => u.id === nte.employeeId);
        const foundIssuer = users.find(u => u.id === nte.issuedByUserId);
        return { recipient: foundRecipient, nteIssuer: foundIssuer };
    }, [nte, users]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [incidentReport?.chatThread]);

    useEffect(() => {
        let active = true;
        const load = async () => {
            if (!nteId) { setIsLoading(false); return; }
            setIsLoading(true);
            setLoadError('');
            setNte(null);setIncidentReport(null);
            try {
                const nteData = await fetchNTEById(nteId);
                if (!active) return;
                if (!nteData) { throw new Error('This NTE is unavailable for your account. Return to approvals or ask HR to check the assignment.'); }
                setNte(nteData);
                const irData=await fetchNTEIncidentContext(nteData.id);
                if (!active) return;
                setIncidentReport(irData);
                const [resData, usersData, disciplineData] = await Promise.all([
                    fetchResolutionsByIncidentReportId(nteData.incidentReportId).catch(()=>[]),
                    fetchUsers().catch(()=>[]),
                    fetchCodeOfDiscipline().catch(()=>({entries:[]}))
                ]);
                if (!active) return;
                setIncidentReport(irData);
                const resForEmployee = resData.find(r => r.employeeId === nteData.employeeId) || null;
                setResolution(resForEmployee);
                setUsers(usersData);
                setDisciplineEntries(disciplineData.entries);
            } catch (err) {
                if (!active) return;
                setLoadError(err instanceof Error?err.message:'Unable to load this NTE. Please retry.');
            } finally {
                if (active) setIsLoading(false);
            }
        };
        load();
        return () => { active = false; };
    }, [nteId,reload,user?.id]);

    const currentUserStep = useMemo(() => {
        if (!user || !nte || nte.status !== NTEStatus.PendingApproval) return null;
        return nte.approverSteps?.find(step => step.userId === user.id && step.status === ApproverStatus.Pending);
    }, [nte, user]);
    const rejectionStep = useMemo(() => nte?.approverSteps?.find(step => step.status === ApproverStatus.Rejected) || null, [nte]);
    const isEmployeeAcknowledgeNeeded = false; // Receipt and ATD use the protected workflow panel.

    const handleApprove = async () => {
        if (!user || !nte || !currentUserStep) {
            setApprovalActionMessage('This approval is no longer assigned to you or has already been processed. Refresh the approval queue.');
            return;
        }
        if(approvalLock.current)return;
        approvalLock.current=true;
        setIsApprovalActionBusy(true);
        setApprovalActionMessage('Recording your approval…');
        try {
            const saved = await processNTEApproval(nte.id, 'approve');
            setNte(saved);
            setApprovalActionMessage(saved.status === NTEStatus.Issued ? 'Approved and issued to the employee.' : 'Your approval was recorded.');
            decisionSaved(saved.status === NTEStatus.Issued ? 'All required approvals are saved. The NTE is issued.' : 'Your approval was recorded. Other required approvals remain pending.');
        } catch (err: any) {
            const message = err?.message || 'Failed to approve NTE.';
            setApprovalActionMessage(message);
            alert(message);
        } finally {
            approvalLock.current=false;
            setIsApprovalActionBusy(false);
        }
    };

    const handleConfirmReject = async (reason: string) => {
        if (!user || !nte || !currentUserStep) return;
        if (!approvalOutcome || approvalLock.current) return;
        approvalLock.current=true;
        setIsApprovalActionBusy(true);
        try {
            const saved = await processNTEApproval(nte.id, approvalOutcome, reason);
            setNte(saved);
            setIsRejectModalOpen(false);
            setApprovalOutcome(null);
            decisionSaved(approvalOutcome === 'return' ? 'NTE returned for revision.' : 'NTE rejected.');
        } catch (err: any) {
            alert(err?.message || 'Failed to process the NTE decision.');
        } finally {
            approvalLock.current=false;
            setIsApprovalActionBusy(false);
        }
    };

    const handleAcknowledgeResolution = async (signatureDataUrl: string, _fullName: string) => {
        if (!resolution || !user || !nte) return;
        try {
            const updatedRes = await updateResolution(resolution.id, {
                status: ResolutionStatus.Acknowledged,
                employeeAcknowledgedAt: new Date(),
                employeeAcknowledgementSignatureUrl: signatureDataUrl,
            });
            setResolution(updatedRes);
            const updatedNte = await updateNTE({ ...nte, status: NTEStatus.Closed });
            setNte(updatedNte);
            logActivity(user, 'APPROVE', 'Resolution', resolution.id, 'Employee acknowledged resolution.');
            setResolutionModalOpen(false);
            alert('You have acknowledged the decision. This case is now closed.');
            navigate('/feedback/cases');
        } catch (err: any) {
            alert(err?.message || 'Failed to acknowledge resolution.');
        }
    };

    const handleSendMessage = async () => {
        if (!newMessage.trim() || !incidentReport || !user) return;
        const newChatMessage: ChatMessage = {
            id: `msg-${Date.now()}`,
            userId: user.id,
            userName: user.name,
            timestamp: new Date(),
            text: newMessage.trim(),
        };
        try {
            const saved = await addIncidentReportMessage(incidentReport, newChatMessage, user);
            setIncidentReport(saved);
            setNewMessage('');
        } catch (err: any) {
            alert(err?.message || 'Failed to send message.');
        }
    };

    const handleSubmitResponse = async () => {
        if (!responseText.trim() || signaturePadRef.current?.isEmpty()) {
            alert('Please provide your written explanation and a signature before submitting.');
            return;
        }
        const signatureDataUrl = signaturePadRef.current!.getSignatureDataUrl();
        if (!signatureDataUrl || !nte) return;
        try {
            const saved = await updateNTE({
                ...nte,
                employeeResponse: responseText,
                employeeResponseEvidenceUrl: responseEvidenceUrl,
                employeeResponseSignatureUrl: signatureDataUrl,
                status: NTEStatus.ResponseSubmitted,
                responseDate: new Date(),
            });
            setNte(saved);
            
            if (incidentReport?.assignedToId) {
                await createNotification({
                    userId: incidentReport.assignedToId,
                    type: NotificationType.NTE_RESPONSE_SUBMITTED,
                    message: `${user?.name || 'An employee'} has submitted their response to NTE for Case ${formatIRDisplayId(incidentReport.caseNumber) || nte.incidentReportId}.`,
                    link: `/feedback/nte/${nte.id}`,
                });
            }
            if (incidentReport && user) {
                await saveIncidentReport({ id: incidentReport.id, pipelineStage: 'hr-review-response' }, user);
                setIncidentReport(prev => prev ? { ...prev, pipelineStage: 'hr-review-response' } : null);
            }
        } catch (err: any) {
            alert(err?.message || 'Failed to submit response.');
        }
    };

    const handleSaveResolution = async (
        resolutionDetails: Partial<Resolution> & { decisionMakerSignatureUrl: string },
        approverIds: string[]
    ) => {
        if (!user || !incidentReport || !nte) return;
        const approverSteps: ApproverStep[] = approverIds.map(id => {
            const approver = users.find(u => u.id === id);
            return { userId: id, userName: approver?.name || id, status: ApproverStatus.Pending };
        });
        const newResolutionPayload: Partial<Resolution> = {
            ...resolutionDetails,
            incidentReportId: incidentReport.id,
            decisionDate: new Date(),
            closedByUserId: user.id,
            status: ResolutionStatus.PendingApproval,
            approverSteps,
            employeeId: nte.employeeId,
        };
        try {
            const created = await createResolution(newResolutionPayload);
            setResolution(created);
            await saveIncidentReport({ id: incidentReport.id, pipelineStage: 'bod-gm-approval' }, user);
            setIncidentReport(prev => prev ? { ...prev, pipelineStage: 'bod-gm-approval' } : null);
            
            // Notify each approver that their action is required
            const irDisplayId = formatIRDisplayId(incidentReport?.caseNumber) || incidentReport.id;
            const involvedName = nte.employeeName;
            approverIds.forEach(approverId => {
                createNotification({
                    userId: approverId,
                    type: NotificationType.GENERAL,
                    title: 'Resolution Approval Required',
                    message: `You have been requested to approve a resolution for case ${irDisplayId} involving ${involvedName}.`,
                    link: `/feedback/cases?action=approve_resolution&caseId=${created.incidentReportId}&employeeId=${created.employeeId}`,
                    relatedEntityId: created.id,
                }).catch(err => console.error('Failed to send resolution approval notification:', err));
            });

            setResolutionModalOpen(false);
            alert('Case has been sent for approval.');
            navigate('/feedback/cases');
        } catch (err: any) {
            alert(err?.message || 'Failed to save resolution.');
        }
    };

    const handleSaveHearing = async (details: HearingDetails) => {
        if (!nte || !user) return;
        try {
            const saved = await updateNTE({ ...nte, hearingDetails: details, status: NTEStatus.HearingScheduled });
            setNte(saved);
            
            const caseIdDisplay = formatIRDisplayId(incidentReport?.caseNumber) || nte.incidentReportId;
            
            // Add to calendar
            const endDate = new Date(details.date);
            endDate.setHours(endDate.getHours() + 1); // Default to 1 hour duration
            
            await supabase.from('helpdesk_calendar_events').insert({
                title: `Admin Hearing: ${nte.employeeName} (${caseIdDisplay})`,
                start: new Date(details.date).toISOString(),
                end: endDate.toISOString(),
                color: 'red',
            });

            await createNotification({
                userId: nte.employeeId,
                type: NotificationType.NTE_ISSUED,
                message: `An administrative hearing has been scheduled for Case ${caseIdDisplay}.`,
                link: `/feedback/nte/${nte.id}`,
            });
            await Promise.all(details.panelIds.map(panelistId => 
                createNotification({
                    userId: panelistId,
                    type: NotificationType.NTE_ISSUED,
                    message: `You have been added to the hearing panel for Case ${caseIdDisplay}.`,
                    link: `/feedback/nte/${nte.id}`,
                })
            ));
            setIsHearingModalOpen(false);
            logActivity(user, 'CREATE', 'Hearing', nte.id, `Scheduled hearing for ${nte.employeeName} on ${new Date(details.date).toLocaleDateString()}`);
            alert('Administrative hearing scheduled successfully.');
        } catch (err: any) {
            alert(err?.message || 'Failed to schedule hearing.');
        }
    };

    const handleAcknowledgeHearing = async () => {
        if (!nte || !user || !nte.hearingDetails) return;
        const isEmployee = user.id === nte.employeeId;
        const isPanel = nte.hearingDetails.panelIds.includes(user.id);
        if (!isEmployee && !isPanel) return;
        const currentAcknowledgments = nte.hearingDetails.acknowledgments || [];
        if (currentAcknowledgments.some(ack => ack.userId === user.id)) return;
        const acknowledgment = { userId: user.id, userName: user.name, role: isEmployee ? 'Employee' : 'Panel', date: new Date() } as const;
        const updatedDetails: HearingDetails = { ...nte.hearingDetails, acknowledgments: [...currentAcknowledgments, acknowledgment] };
        try {
            const saved = await updateNTE({ ...nte, hearingDetails: updatedDetails });
            setNte(saved);
            logActivity(user, 'APPROVE', 'Hearing', nte.id, 'Acknowledged hearing schedule.');
        } catch (err: any) {
            alert(err?.message || 'Failed to acknowledge hearing.');
        }
    };

    if (isLoading) {
        return <div className="flex justify-center items-center p-16"><p className="text-gray-500 dark:text-gray-400">Loading...</p></div>;
    }

    if (!nte || !incidentReport) {
        return <div className="p-6 space-y-4" role="alert"><h1 className="text-xl font-bold">NTE review unavailable</h1><p>{loadError||'The linked NTE or incident report could not be loaded.'}</p><button className="min-h-12 rounded bg-violet-600 px-5 text-white" onClick={()=>setReload(x=>x+1)}>Retry</button><Link className="block underline" to="/approvals">Return to pending approvals</Link></div>;
    }

    const references = nte.disciplineCodeIds.map(id => disciplineEntries.find(e => e.id === id)).filter(Boolean);

    const isAwaitingEmployeeResponse = false; // The protected receipt-based panel owns submissions.
    const hasEmployeeResponded = false;
    const canResolve = false; // Decisions use the protected server workflow below.

    // Can schedule hearing if response submitted or issued (but not closed), and user is admin/HR
    const canScheduleHearing = can('Feedback', Permission.Edit) && user?.id !== nte.employeeId && nte.status !== NTEStatus.Closed && nte.status !== NTEStatus.Draft && nte.status !== NTEStatus.PendingApproval && nte.status !== NTEStatus.Rejected;

    const userHasAcknowledgedHearing = nte.hearingDetails?.acknowledgments?.some(ack => ack.userId === user?.id);
    const isHearingParticipant = user && (user.id === nte.employeeId || nte.hearingDetails?.panelIds.includes(user.id));

    const formatPHT = (value?: Date | string) => value
        ? new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) + ' PHT'
        : '—';
    const pendingApprover = nte.approverSteps?.find(step => step.status === ApproverStatus.Pending);
    const pendingApproverRole = pendingApprover?.roleSnapshot || pendingApprover?.role || 'Approver';
    const approvalStatusLabel = nte.status === NTEStatus.PendingApproval
        ? `Pending ${pendingApproverRole.replace(/\s*approver\s*$/i, '')} Approval`
        : nte.status === NTEStatus.Issued
            ? 'Issued to employee'
            : nte.status === NTEStatus.Closed
                ? 'Case closed'
                : nte.responseStage || nte.status;
    const approvalStatusClass = nte.status === NTEStatus.Rejected
        ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
        : nte.status === NTEStatus.Issued || nte.status === NTEStatus.Approved
            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
            : nte.status === NTEStatus.PendingApproval
                ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200'
                : 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-100';

    const printNteDocument = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;
        printWindow.document.write(`
            <html>
                <head>
                    <title>Print NTE Document</title>
                    <style>${NTE_SIGNATURE_CSS}@media print { @page { size: A4; margin: 20mm; } }</style>
                </head>
                <body onload="setTimeout(() => { window.print(); window.close(); }, 300);">
                    <div class="nte-document">${nte.body}</div>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    const downloadNteDocument = () => {
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>${formatNTEDisplayId(nte.nteNumber) || 'NTE Document'}</title><style>${NTE_SIGNATURE_CSS}</style></head><body><div class="nte-document">${nte.body}</div></body></html>`;
        const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${formatNTEDisplayId(nte.nteNumber) || 'NTE'}-${nte.employeeName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}.html`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    };


    return (
        <div className="space-y-6">
            <div>
                <Link to="/feedback/cases" className="mb-2 flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                    <ArrowLeftIcon />
                    Back to Disciplinary Cases
                </Link>
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <p className="text-sm font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">NTE approval review</p>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{formatNTEDisplayId(nte.nteNumber) || nte.id}</h1>
                        <p className="mt-1 text-gray-600 dark:text-gray-400">Review the notice, approval route, and supporting case information below.</p>
                    </div>
                    <span className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm font-bold ${approvalStatusClass}`}>{approvalStatusLabel}</span>
                </div>
            </div>

            {/* 1. Approval status and NTE document */}
            <section aria-labelledby="nte-status-heading" className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                <Card className="h-full border border-slate-200 dark:border-slate-700">
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-700">
                        <div>
                            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Approval status</p>
                            <h2 id="nte-status-heading" className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">{recipient?.name || nte.employeeName}</h2>
                            <p className="mt-1 font-mono text-sm text-slate-600 dark:text-slate-300">NTE {formatNTEDisplayId(nte.nteNumber) || nte.id}</p>
                        </div>
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${approvalStatusClass}`}>{approvalStatusLabel}</span>
                    </div>
                    <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Date issued</dt><dd className="mt-1 font-semibold text-slate-900 dark:text-white">{formatPHT(nte.issuedDate)}</dd></div>
                        <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Linked incident</dt><dd className="mt-1 font-mono font-semibold text-slate-900 dark:text-white">{formatIRDisplayId(incidentReport.caseNumber) || nte.incidentReportId}</dd></div>
                        <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Department</dt><dd className="mt-1 font-semibold text-slate-900 dark:text-white">{recipient?.department || '—'}</dd></div>
                        <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Position</dt><dd className="mt-1 font-semibold text-slate-900 dark:text-white">{recipient?.position || '—'}</dd></div>
                    </dl>
                    <div className="mt-5 rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
                        <span className="font-semibold text-slate-900 dark:text-white">What you are reviewing:</span> the Notice to Explain issued to {recipient?.name || nte.employeeName} for {incidentReport.category || 'the linked incident report'}.
                    </div>
                    <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-700" aria-labelledby="original-case-summary-heading">
                        <p id="original-case-summary-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Original case summary</p>
                        <div className="mt-4 space-y-4">
                            {user?.id !== nte.employeeId && <div><h3 className="font-semibold text-gray-800 dark:text-gray-200">Detailed context</h3><p className="mt-1 whitespace-pre-wrap text-gray-600 dark:text-gray-400">{incidentReport.description}</p></div>}
                            <div><h3 className="font-semibold text-gray-800 dark:text-gray-200">Allegations</h3><p className="mt-1 whitespace-pre-wrap text-gray-600 dark:text-gray-400">{nte.details}</p></div>
                            {references.length > 0 && <div><h3 className="font-semibold text-gray-800 dark:text-gray-200">Reference(s)</h3><ul className="mt-1 space-y-1">{references.map(ref => <li key={ref.id} className="text-sm text-gray-600 dark:text-gray-400"><span className="rounded-sm bg-red-100 px-1 font-mono text-red-800 dark:bg-red-900/50 dark:text-red-300">{ref.code}</span>: {ref.description}</li>)}</ul></div>}
                            {nte.evidenceUrl && <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50"><h3 className="font-semibold text-gray-800 dark:text-gray-200">Supporting evidence</h3><a href={formatExternalUrl(nte.evidenceUrl)} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-indigo-600 hover:underline dark:text-indigo-400">{nte.evidenceUrl}</a></div>}
                        </div>
                    </div>
                </Card>

                <Card className="border border-slate-200 dark:border-slate-700">
                    <div className="mb-4 flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700">
                        <div>
                            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Document viewer</p>
                            <h2 className="text-xl font-bold text-slate-950 dark:text-white">Notice to Explain Document</h2>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button variant="secondary" size="sm" onClick={downloadNteDocument}>Download</Button>
                            <Button variant="secondary" size="sm" onClick={printNteDocument}>Print</Button>
                        </div>
                    </div>
                    <style>{NTE_SIGNATURE_CSS}</style>
                    <div className="max-h-[min(72vh,900px)] overflow-y-auto overflow-x-hidden rounded-lg border border-gray-300 bg-gray-100 p-1 dark:border-gray-700 dark:bg-gray-900 sm:p-2">
                        <ResponsiveDocumentPreview ariaLabel="Published Notice to Explain preview">
                            <div className="nte-document" dangerouslySetInnerHTML={{ __html: nte.body }} />
                        </ResponsiveDocumentPreview>
                    </div>
                </Card>
            </section>

            {/* 2. Approval */}
            <section aria-labelledby="approval-heading" className="space-y-6">
                {approvalActionMessage && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">{approvalActionMessage}</p>}
                {currentUserStep ? (
                    <Card title="Approval action required" className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                                <h2 id="approval-heading" className="text-xl font-bold text-amber-950 dark:text-amber-100">Your NTE approval is required</h2>
                                <p className="mt-1 text-sm text-amber-900 dark:text-amber-200">Review the document above, then record your decision. Approval comments are optional.</p>
                            </div>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                <Button className="w-full" disabled={isApprovalActionBusy} variant="secondary" onClick={() => { setApprovalOutcome('return'); setIsRejectModalOpen(true); }}>Return for Revision</Button>
                                <Button className="w-full" disabled={isApprovalActionBusy} variant="danger" onClick={() => { setApprovalOutcome('reject'); setIsRejectModalOpen(true); }}>Reject</Button>
                                <Button className="w-full" isLoading={isApprovalActionBusy} onClick={handleApprove}>Approve NTE</Button>
                            </div>
                        </div>
                    </Card>
                ) : nte.status === NTEStatus.PendingApproval ? (
                    <Card title="Approval action" className="border-slate-200 dark:border-slate-700">
                        <p className="text-sm text-slate-600 dark:text-slate-300">This NTE is awaiting {pendingApprover?.userName || 'the assigned approver'}. No action is assigned to your account at this time.</p>
                    </Card>
                ) : null}

                {nte.approverSteps && nte.approverSteps.length > 0 && (
                    <Card title="Approval progress" className="border border-slate-200 dark:border-slate-700">
                        <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">See who has approved, who is pending, and any optional comments before making your decision.</p>
                        <div className="mb-5 grid gap-3 md:grid-cols-3">
                            {nte.approverSteps.map((step, index) => {
                                const isApproved = step.status === ApproverStatus.Approved;
                                const isPending = step.status === ApproverStatus.Pending;
                                const badge = isApproved ? 'Approved' : isPending ? 'Pending' : step.status;
                                const badgeClass = isApproved
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                                    : isPending
                                        ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200'
                                        : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200';
                                return <div key={step.approvalId || step.userId} className="relative rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                                    {index < nte.approverSteps!.length - 1 && <span aria-hidden="true" className="absolute -right-3 top-1/2 hidden h-px w-3 bg-slate-300 md:block dark:bg-slate-600" />}
                                    <div className="flex items-start justify-between gap-2"><div className="flex items-center gap-2"><ApproverStatusIcon status={step.status} /><span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Step {index + 1}</span></div><span className={`rounded-full px-2 py-1 text-xs font-bold ${badgeClass}`}>{badge}</span></div>
                                    <p className="mt-3 font-semibold text-slate-900 dark:text-white">{step.userName}</p>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">{step.roleSnapshot || step.role || 'Selected approver'}{step.isBod ? ' · Required BOD approver' : ''}</p>
                                    {step.timestamp && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{isApproved ? 'Approved' : step.status} {formatPHT(step.timestamp)}</p>}
                                    {(step.comments || step.rejectionReason) && <p className="mt-2 rounded-md bg-slate-50 p-2 text-sm italic text-slate-700 dark:bg-slate-900/60 dark:text-slate-300">“{step.comments || step.rejectionReason}”</p>}
                                </div>;
                            })}
                        </div>
                        <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-300"><span className="font-semibold">Current approval status:</span> {approvalStatusLabel}</div>
                    </Card>
                )}
            </section>

            {/* 3. Supporting case workflow details */}
            <section aria-label="Supporting case workflow details" className="space-y-6">
                {nte.status === NTEStatus.Rejected && rejectionStep && (
                    <Card title="NTE rejected" className="border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30">
                        <p className="text-sm text-red-900 dark:text-red-100"><strong>Rejected by:</strong> {rejectionStep.userName}</p>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-red-800 dark:text-red-200"><strong>Reason:</strong> {rejectionStep.comments || rejectionStep.rejectionReason || 'No reason recorded.'}</p>
                        {rejectionStep.timestamp && <p className="mt-2 text-xs text-red-700 dark:text-red-300">Rejected on {formatPHT(rejectionStep.timestamp)}</p>}
                    </Card>
                )}

                {nte.status === NTEStatus.Draft && nte.revisionNote && (
                    <Card title="Revision required" className="border-amber-400 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/30">
                        <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-200">{nte.revisionNote}</p>
                        {nte.revisionRequestedAt && <p className="mt-2 text-xs text-gray-500">Returned on {formatPHT(nte.revisionRequestedAt)}</p>}
                    </Card>
                )}

                {nte.status === NTEStatus.Closed && nte.closureReason && (
                    <Card title="Closure decision" className="border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
                        <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-200">{nte.closureReason}</p>
                        {nte.closedAt && <p className="mt-2 text-xs text-gray-500">Closed on {formatPHT(nte.closedAt)}</p>}
                    </Card>
                )}

                <NTEWorkflowPanel key={`workflow-${nte.id}`} nte={nte} onChanged={() => setReload(x => x + 1)} />

                {canScheduleHearing && <div><Button variant="secondary" onClick={() => setIsHearingModalOpen(true)}><CalendarIcon /> Schedule administrative hearing</Button></div>}

                {nte.hearingDetails && <Card title="Hearing scheduled" className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/40">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2"><div><p className="text-sm font-medium text-gray-500">Date &amp; time</p><p className="text-lg font-bold text-gray-900 dark:text-white">{formatPHT(nte.hearingDetails.date)}</p></div><div><p className="text-sm font-medium text-gray-500">Location / link</p><p className="font-semibold text-gray-900 dark:text-white">{nte.hearingDetails.type === 'Virtual' ? <a href={nte.hearingDetails.location} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Join meeting</a> : nte.hearingDetails.location}</p></div><div className="md:col-span-2"><p className="text-sm font-medium text-gray-500">Panelists</p><p className="text-gray-900 dark:text-white">{nte.hearingDetails.panelIds.map(id => users.find(u => u.id === id)?.name).join(', ')}</p></div></div>
                    <div className="mt-5 border-t border-orange-200 pt-4 dark:border-orange-800"><h3 className="mb-2 text-sm font-bold">Participant status</h3><div className="space-y-2 text-sm"><div className="flex items-center justify-between rounded border border-orange-100 bg-white p-2 dark:border-orange-900 dark:bg-slate-800"><span>{nte.employeeName} (Employee)</span>{nte.hearingDetails.acknowledgments?.some(a => a.userId === nte.employeeId) ? <span className="flex items-center font-bold text-green-600"><CheckCircleIcon /> Confirmed</span> : <span className="italic text-orange-600">Pending acknowledgement</span>}</div>{nte.hearingDetails.panelIds.map(pid => { const panelistName = users.find(u => u.id === pid)?.name; const hasAck = nte.hearingDetails!.acknowledgments?.some(a => a.userId === pid); return <div key={pid} className="flex items-center justify-between rounded border border-orange-100 bg-white p-2 dark:border-orange-900 dark:bg-slate-800"><span>{panelistName} (Panel)</span>{hasAck ? <span className="flex items-center font-bold text-green-600"><CheckCircleIcon /> Confirmed</span> : <span className="italic text-orange-600">Pending acknowledgement</span>}</div>; })}</div></div>
                    <div className="mt-5 flex justify-between">{isHearingParticipant && !userHasAcknowledgedHearing && <Button onClick={handleAcknowledgeHearing}>Acknowledge schedule</Button>}{isHearingParticipant && userHasAcknowledgedHearing && <span className="text-sm font-medium text-green-600">You have acknowledged this schedule.</span>}</div>
                </Card>}

                {user && user.id !== nte.employeeId && user.id !== incidentReport.reportedBy && <div className="flex flex-col rounded-lg bg-white shadow-md dark:bg-slate-800"><div className="flex-grow space-y-4 overflow-y-auto p-4"><div className="my-2 text-center"><span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">Internal case discussion</span></div><div className="flex items-start space-x-3"><div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-indigo-500 text-xs font-bold text-white">{nteIssuer?.name.substring(0, 2) || 'HR'}</div><div><div className="rounded-lg rounded-tl-none bg-gray-100 p-3 dark:bg-slate-700"><p className="text-sm text-gray-800 dark:text-gray-200">Only authorized reviewers can view this thread.</p></div><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{nteIssuer ? `${nteIssuer.name} (${nteIssuer.role})` : 'System message'}</p></div></div>{incidentReport.chatThread.map(msg => <div key={msg.id} className={`flex items-start space-x-3 ${msg.userId === user?.id ? 'flex-row-reverse space-x-reverse' : ''}`}><div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-300 text-xs font-bold dark:bg-gray-600">{msg.userName.substring(0, 2)}</div><div><div className={`rounded-lg p-3 ${msg.userId === user?.id ? 'rounded-br-none bg-indigo-600 text-white' : 'rounded-bl-none bg-gray-100 dark:bg-slate-700'}`}><p className="text-sm">{msg.text}</p></div><p className={`mt-1 text-xs text-gray-500 dark:text-gray-400 ${msg.userId === user?.id ? 'text-right' : ''}`}>{msg.userName} at {new Date(msg.timestamp).toLocaleTimeString()}</p></div></div>)}<div ref={messagesEndRef} /></div><div className="border-t border-gray-200 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-800/50"><div className="relative"><textarea value={newMessage} onChange={e => { setNewMessage(e.target.value); }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }} placeholder="Type an internal message..." className="w-full rounded-md border p-2 pr-20 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white" rows={2} /><div className="absolute bottom-2 right-2 flex space-x-1"><Button size="sm" variant="secondary" className="!p-2"><PaperclipIcon /></Button><Button size="sm" className="!p-2" onClick={handleSendMessage}><PaperAirplaneIcon /></Button></div></div></div></div>}
            </section>

            {/* 4. Case questions and replies stay at the bottom */}
            <section aria-labelledby="case-details-heading" className="space-y-6">
                <div>
                    <p className="text-sm font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">Case communication</p>
                    <h2 id="case-details-heading" className="text-2xl font-bold text-slate-950 dark:text-white">Case Questions and Replies</h2>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Employee questions, responses, internal notes, and the audit timeline are kept here after the approval review.</p>
                </div>
                <CaseQuestions key={nte.id} caseId={incidentReport.id} nteId={nte.id} showOriginalIncidentReport={false} />
            </section>
            {/* Dialogs belong to the active review layout. */}
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
                onClose={() => { setIsRejectModalOpen(false); setApprovalOutcome(null); }}
                onSubmit={handleConfirmReject}
                title={approvalOutcome === 'return' ? 'Return NTE for Revision' : 'Reject NTE'}
                prompt={approvalOutcome === 'return'
                    ? 'Enter the required revision note. This will be shown to the NTE issuer and case handler.'
                    : 'Please provide a reason for rejecting this employee-specific NTE. This will be visible to the issuer.'}
                submitText={approvalOutcome === 'return' ? 'Return for Revision' : 'Confirm Rejection'}
                submitVariant={approvalOutcome === 'return' ? 'primary' : 'danger'}
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
