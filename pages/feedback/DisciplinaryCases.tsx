
import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { IncidentReport, ChatMessage, NTE, Resolution, IRStatus, Permission, NTEStatus, PipelineStage, Role, BusinessUnit, ResolutionType, ResolutionStatus, ApproverStep, ApproverStatus, Notification, NotificationType, CoachingSession, CoachingStatus, CoachingTrigger } from '../../types';
import { mockNTEs, mockResolutions, mockPipelineStages, mockUsers, mockBusinessUnits, mockNotifications, mockCoachingSessions } from '../../services/mockData';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import KanbanBoard from '../../components/feedback/KanbanBoard';
import Button from '../../components/ui/Button';
import IncidentReportModal from '../../components/feedback/IncidentReportModal';
import NTEModal from '../../components/feedback/NTEModal';
import ResolutionModal from '../../components/feedback/ResolutionModal';
import Card from '../../components/ui/Card';
import PrintableIncidentReport from '../../components/feedback/PrintableIncidentReport';
import CaseListTable from '../../components/feedback/CaseListTable';
import { logActivity } from '../../services/auditService';
import { fetchIncidentReports, saveIncidentReport, addIncidentReportMessage } from '../../services/incidentReportService';
import { saveNTEs, updateNTE } from '../../services/nteService';

const SearchIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
const ChevronDownIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>;
const ViewColumnsIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h5a2 2 0 00-2-2V7a2 2 0 00-2-2h-5a2 2 0 00-2 2m0 10V7m0 10h5" /></svg>;
const ListBulletIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>;


const DashboardStatCard: React.FC<{ title: string; value: string | number; color: string }> = ({ title, value, color }) => (
  <div className={`bg-white dark:bg-gray-800 shadow rounded-lg p-5 border-l-4 ${color}`}>
    <div className="flex items-center">
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">{title}</p>
        <p className="text-3xl font-bold text-gray-900 dark:text-white">{value}</p>
      </div>
    </div>
  </div>
);

const getDerivedPipelineStage = (nte: NTE, allResolutions: Resolution[]): string => {
    // Check for a specific resolution for this employee within the parent incident.
    const resolutionForEmployee = allResolutions.find(r => 
        r.incidentReportId === nte.incidentReportId && r.employeeId === nte.employeeId
    );

    if (resolutionForEmployee) {
        switch (resolutionForEmployee.status) {
            case ResolutionStatus.PendingApproval:
                return 'bod-gm-approval';
            case ResolutionStatus.PendingAcknowledgement:
                return 'resolution';
            case ResolutionStatus.Approved: // Legacy status
            case ResolutionStatus.Acknowledged:
                return 'closed';
            case ResolutionStatus.Rejected:
                return 'hr-review-response'; // Send it back to HR for correction
            default:
                return 'resolution';
        }
    }
    
    // Fallback to NTE status if no specific resolution is found
    switch (nte.status) {
        case NTEStatus.ResponseSubmitted:
        case NTEStatus.Waiver:
        case NTEStatus.HearingScheduled:
            return 'hr-review-response';
        case NTEStatus.Closed:
             // If NTE is closed, it implies it has moved to resolution phase
            return 'resolution';
        case NTEStatus.PendingApproval:
            return 'nte-for-approval';
        case NTEStatus.Issued:
        default:
            return 'nte-sent';
    }
};


const DisciplinaryCases: React.FC = () => {
  const { user } = useAuth();
  const { can, getIrAccess, getAccessibleBusinessUnits } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const specialFilter = queryParams.get('filter');
  
  const [allReports, setAllReports] = useState<IncidentReport[]>([]);
  const [stages] = useState<PipelineStage[]>(mockPipelineStages);
  const [ntes, setNTEs] = useState<NTE[]>(mockNTEs);
  const [resolutions, setResolutions] = useState<Resolution[]>(mockResolutions);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [buFilter, setBuFilter] = useState('');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('');
  const [quarterFilter, setQuarterFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [handlerFilter, setHandlerFilter] = useState<string>(''); // New state for handler filter

  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  
  const [isReportModalOpen, setReportModalOpen] = useState(false);
  const [isNTEModalOpen, setNTEModalOpen] = useState(false);
  const [isResolutionModalOpen, setResolutionModalOpen] = useState(false);

  const [selectedReport, setSelectedReport] = useState<IncidentReport | null>(null);
  const [reportToPrint, setReportToPrint] = useState<IncidentReport | null>(null);
  
  const accessibleBus = useMemo(() => getAccessibleBusinessUnits(mockBusinessUnits), [getAccessibleBusinessUnits]);
  const irAccess = useMemo(() => getIrAccess(), [getIrAccess]);

  const filterByIrAccess = useMemo(() => {
    const userRef = user;
    return (reports: IncidentReport[]) => {
      if (!userRef) return [];
      if (!irAccess.canView) return [];
      if (irAccess.scope === 'global') return reports;
      if (irAccess.scope === 'self') {
        return reports.filter(r => r.reportedBy === userRef.id);
      }
      if (irAccess.scope === 'bu') {
        return reports.filter(r => {
          const matchesId = r.businessUnitId && userRef.businessUnitId && r.businessUnitId === userRef.businessUnitId;
          const matchesName = r.businessUnitName && userRef.businessUnit && r.businessUnitName === userRef.businessUnit;
          return matchesId || matchesName;
        });
      }
      return [];
    };
  }, [irAccess, user]);

  useEffect(() => {
    const loadReports = async () => {
      try {
        const data = await fetchIncidentReports();
        setAllReports(filterByIrAccess(data));
      } catch (err) {
        console.error('Failed to load incident reports', err);
        setAllReports([]);
      }
    };
    loadReports();
  }, [filterByIrAccess]);

  const handleOpenNewReportModal = () => {
    if (!irAccess.canCreate) {
        alert('You do not have permission to file a new incident report.');
        return;
    }
    setSelectedReport(null);
    setReportModalOpen(true);
  };

  useEffect(() => {
    if (location.state?.openNewIrModal) {
      handleOpenNewReportModal();
      // Clean up state to prevent re-opening on refresh
      navigate(location.pathname, { replace: true, state: {} });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const yearOptions = useMemo(() => {
    const years = new Set(allReports.map(r => new Date(r.dateTime).getFullYear()));
    const currentYear = new Date().getFullYear();
    years.add(currentYear);
    return Array.from(years).sort((a: number, b: number) => b - a);
  }, [allReports]);
  
  const monthOptions = [
    { value: '1', name: 'January' }, { value: '2', name: 'February' }, { value: '3', name: 'March' },
    { value: '4', name: 'April' }, { value: '5', name: 'May' }, { value: '6', name: 'June' },
    { value: '7', name: 'July' }, { value: '8', name: 'August' }, { value: '9', name: 'September' },
    { value: '10', name: 'October' }, { value: '11', name: 'November' }, { value: '12', name: 'December' }
  ];

  const quarterOptions = [
    { value: '1', name: 'Q1 (Jan-Mar)' },
    { value: '2', name: 'Q2 (Apr-Jun)' },
    { value: '3', name: 'Q3 (Jul-Sep)' },
    { value: '4', name: 'Q4 (Oct-Dec)' },
  ];
  
  const potentialHandlers = useMemo(() => {
    const relevantRoles = [Role.HRManager, Role.HRStaff, Role.Admin, Role.Manager, Role.BusinessUnitManager];
    return mockUsers.filter(u => relevantRoles.includes(u.role)).sort((a,b) => a.name.localeCompare(b.name));
  }, []);

  const statusOptions = ['New', 'Awaiting Response', 'HR Review', 'Rejected'];

  const getStatusText = (report: IncidentReport): string => {
    if (report.pipelineStage === 'nte-sent') return 'Awaiting Response';
    if (report.pipelineStage === 'hr-review-response') return 'HR Review';
    if (report.status === IRStatus.HRReview) return 'HR Review';
    if (report.status === IRStatus.Submitted) return 'New';
    return report.status;
  };

  const reports = useMemo(() => {
    let baseReports = filterByIrAccess(allReports);

    if (specialFilter === 'pending_my_approval' && user) {
        const myPendingIRIds = new Set<string>();

        const myPendingResolutions = resolutions
            .filter(res => 
                res.status === ResolutionStatus.PendingApproval &&
                res.approverSteps.some(step => step.userId === user.id && step.status === ApproverStatus.Pending)
            );
        myPendingResolutions.forEach(res => myPendingIRIds.add(res.incidentReportId));

        const myPendingNTEs = ntes.filter(nte =>
            nte.status === NTEStatus.PendingApproval &&
            nte.approverSteps?.some(step => step.userId === user.id && step.status === ApproverStatus.Pending)
        );
        myPendingNTEs.forEach(nte => myPendingIRIds.add(nte.incidentReportId));
        
        baseReports = allReports.filter(r => myPendingIRIds.has(r.id));
    }

    const activeReports = baseReports; // Do not filter closed if we want to show them in 'closed' column
    
    const expandedReports: IncidentReport[] = [];
    activeReports.forEach(report => {
        if (report.nteIds.length > 0) {
            // This is an incident that has progressed to the NTE stage.
            if (report.involvedEmployeeIds.length > 1) {
                // Multi-person case: Split into virtual cards for each employee with an NTE.
                report.nteIds.forEach(nteId => {
                    const nte = ntes.find(n => n.id === nteId);
                    if (nte) {
                        const stageForThisNte = getDerivedPipelineStage(nte, resolutions);
                        expandedReports.push({
                            ...report,
                            id: `${report.id}_VIRTUAL_${nteId}`,
                            pipelineStage: stageForThisNte,
                            involvedEmployeeIds: [nte.employeeId],
                            involvedEmployeeNames: [nte.employeeName],
                            nteIds: [nteId],
                        });
                    }
                });
            } else {
                // Single-person case: Don't split, just derive the stage from its NTE.
                const nte = ntes.find(n => n.id === report.nteIds[0]);
                if (nte) {
                    const stageForThisNte = getDerivedPipelineStage(nte, resolutions);
                    expandedReports.push({
                        ...report,
                        pipelineStage: stageForThisNte,
                    });
                } else {
                    // Fallback if NTE is somehow missing
                    expandedReports.push(report);
                }
            }
        } else {
            // No NTEs yet, so the report's own stage is the source of truth.
            expandedReports.push(report);
        }
    });

    const buFilteredReports = buFilter
        ? expandedReports.filter(report => {
            const employeeId = report.involvedEmployeeIds[0];
            const employee = mockUsers.find(u => u.id === employeeId);
            return employee?.businessUnit === buFilter;
        })
        : expandedReports;

    const dateAndStatusFilteredReports = buFilteredReports.filter(report => {
        const reportDate = new Date(report.dateTime);
        const yearMatch = !yearFilter || yearFilter === 'all' || reportDate.getFullYear().toString() === yearFilter;
        const monthMatch = !monthFilter || (reportDate.getMonth() + 1).toString() === monthFilter;
        
        let quarterMatch = true;
        if (quarterFilter) {
            const month = reportDate.getMonth() + 1;
            switch(quarterFilter) {
                case '1': quarterMatch = [1,2,3].includes(month); break;
                case '2': quarterMatch = [4,5,6].includes(month); break;
                case '3': quarterMatch = [7,8,9].includes(month); break;
                case '4': quarterMatch = [10,11,12].includes(month); break;
                default: quarterMatch = true;
            }
        }

        const getReportDisplayStatus = (r: IncidentReport): string => {
            const resolution = resolutions.find(res => res.incidentReportId === r.id.split('_VIRTUAL_')[0]);
            if (resolution?.status === ResolutionStatus.Rejected) {
                return 'Rejected';
            }
            return getStatusText(r);
        };

        const statusMatch = !statusFilter || getReportDisplayStatus(report) === statusFilter;
        
        const handlerMatch = !handlerFilter || (handlerFilter === 'Unassigned' ? !report.assignedToId : report.assignedToId === handlerFilter);

        return yearMatch && monthMatch && quarterMatch && statusMatch && handlerMatch;
    });

    if (!searchTerm) return dateAndStatusFilteredReports;

    const lowerSearch = searchTerm.toLowerCase();
    return dateAndStatusFilteredReports.filter(r => {
        const originalId = r.id.split('_VIRTUAL_')[0];
        return originalId.toLowerCase().includes(lowerSearch) ||
            r.nteIds.some(nteId => nteId.toLowerCase().includes(lowerSearch)) ||
            r.category.toLowerCase().includes(lowerSearch) ||
            r.involvedEmployeeNames.some(name => name.toLowerCase().includes(lowerSearch));
    });
  }, [allReports, searchTerm, ntes, buFilter, yearFilter, monthFilter, quarterFilter, statusFilter, handlerFilter, specialFilter, user, resolutions, filterByIrAccess]);

  const stats = useMemo(() => {
    const activeCases = reports.length;
    const newIRs = reports.filter(r => r.pipelineStage === 'ir-review').length;
    const overdueNTEs = ntes.filter(nte => nte.status === NTEStatus.Issued && new Date(nte.deadline) < new Date()).length;
    const forResolution = reports.filter(r => r.pipelineStage === 'resolution').length;
    return { activeCases, newIRs, overdueNTEs, forResolution };
  }, [reports, ntes]);


  const selectedNTE = useMemo(() => {
    if (!selectedReport) return undefined;
    
    const openNteForIr = ntes.find(n => n.incidentReportId === selectedReport.id && [NTEStatus.Issued, NTEStatus.ResponseSubmitted].includes(n.status));
    if (openNteForIr) return openNteForIr;
    
    if (selectedReport.nteIds.length === 0) return undefined;
    return ntes.find(n => n.id === selectedReport.nteIds[0]);
  }, [selectedReport, ntes]);

  const selectedResolution = useMemo(() => {
    if (!selectedReport) return undefined;
    const originalReportId = selectedReport.id.split('_VIRTUAL_')[0];
    const employeeId = selectedReport.involvedEmployeeIds[0];
    // Find the specific resolution for this employee
    return resolutions.find(r => r.incidentReportId === originalReportId && r.employeeId === employeeId);
  }, [selectedReport, resolutions]);

  // Logic to determine if the current user is a pending approver for the selected resolution
  const isCurrentUserPendingApprover = useMemo(() => {
    if (!user || !selectedResolution) return false;
    return selectedResolution.approverSteps.some(step => step.userId === user.id && step.status === ApproverStatus.Pending);
  }, [user, selectedResolution]);


  const handleUpdateStage = (reportId: string, newStage: string) => {
    const originalReportId = reportId.split('_VIRTUAL_')[0];
    setAllReports(prev => prev.map(r => r.id === originalReportId ? { ...r, pipelineStage: newStage } : r));
  };

  const handleCardClick = (report: IncidentReport) => {
    const originalReportId = report.id.split('_VIRTUAL_')[0];
    const originalReport = allReports.find(r => r.id === originalReportId);
    
    // Create a temporary, modified report for the modal to ensure it only shows the clicked employee
    const reportForModal = {
        ...(originalReport || report),
        involvedEmployeeIds: report.involvedEmployeeIds,
        involvedEmployeeNames: report.involvedEmployeeNames,
    };

    setSelectedReport(reportForModal);

    const resolutionForReport = resolutions.find(r => r.incidentReportId === reportForModal.id);

    if (report.pipelineStage === 'hr-review-response' && resolutionForReport?.status === ResolutionStatus.Rejected) {
        setResolutionModalOpen(true);
    } else if (report.pipelineStage === 'ir-review' || report.pipelineStage === 'hr-review-response' || report.pipelineStage === 'nte-for-approval') {
      const nteForThisEmployee = ntes.find(n => n.incidentReportId === originalReportId && n.employeeId === report.involvedEmployeeIds[0]);
      if (nteForThisEmployee) {
        navigate(`/feedback/nte/${nteForThisEmployee.id}`);
      } else {
        setReportModalOpen(true);
      }
    } else if (report.pipelineStage === 'nte-sent') {
      const nteId = report.nteIds[0];
      if (nteId) {
        navigate(`/feedback/nte/${nteId}`);
      } else {
        setNTEModalOpen(true);
      }
    } else if (report.pipelineStage === 'resolution' || report.pipelineStage === 'bod-gm-approval') {
      setResolutionModalOpen(true);
    } else if (report.pipelineStage === 'converted-coaching' || report.pipelineStage === 'closed') {
        setReportModalOpen(true);
    }
  };

  const handleCloseModals = () => {
    setReportModalOpen(false);
    setNTEModalOpen(false);
    setResolutionModalOpen(false);
    setSelectedReport(null);
  };

  const handleSaveReport = async (reportToSave: Partial<IncidentReport>) => {
    if (!user) return;
    if (!reportToSave.id && !irAccess.canCreate) {
        alert('You do not have permission to file a new incident report.');
        return;
    }
    if (reportToSave.id && !(irAccess.canCreate || reportToSave.reportedBy === user.id)) {
        alert('You do not have permission to update this report.');
        return;
    }

    const current = reportToSave.id ? allReports.find(r => r.id === reportToSave.id) : null;
    const currentStage = current?.pipelineStage || reportToSave.pipelineStage || 'ir-review';
    const hasHandler = !!reportToSave.assignedToId;
    const handlerChanged = hasHandler && (!current || current.assignedToId !== reportToSave.assignedToId);
    if (hasHandler && (currentStage === 'ir-review' || currentStage === 'hr-review-response')) {
      reportToSave.pipelineStage = 'nte-for-approval';
      reportToSave.status = IRStatus.Converted;
    } else if (handlerChanged && currentStage === 'nte-for-approval') {
      // keep it in approval if already there
      reportToSave.pipelineStage = 'nte-for-approval';
    }

    try {
      const saved = await saveIncidentReport(reportToSave, user);
      if (handlerChanged && saved.assignedToId) {
        const createdAt = new Date();
        mockNotifications.unshift({
          id: `notif-ir-${saved.id}-${saved.assignedToId}-${createdAt.getTime()}`,
          userId: saved.assignedToId,
          type: NotificationType.CASE_ASSIGNED,
          title: 'New Case Assigned',
          message: `You have been assigned as case handler for Incident Report ${saved.id}.`,
          link: '/feedback/cases',
          isRead: false,
          createdAt,
          relatedEntityId: saved.id,
        });
      }
      setAllReports(prev => {
        const rest = prev.filter(r => r.id !== saved.id);
        return filterByIrAccess([saved, ...rest]);
      });
    } catch (err: any) {
      alert(err?.message || 'Failed to save incident report');
    }
    handleCloseModals();
  };
  
  const handleSaveNTE = async (data: NTE | NTE[]) => {
      if (!user) return;
      try {
        if (Array.isArray(data)) {
            const saved = await saveNTEs(data, user);
            setNTEs(prev => [...saved, ...prev]);
            const incidentReportId = saved[0]?.incidentReportId;
            if (incidentReportId) {
                // Move IR to NTE sent once NTE is issued
                const irUpdate: Partial<IncidentReport> = { id: incidentReportId, pipelineStage: 'nte-sent', status: IRStatus.Converted };
                await saveIncidentReport(irUpdate, user);
                setAllReports(prev => prev.map(r => r.id === incidentReportId ? { ...r, pipelineStage: 'nte-sent', status: IRStatus.Converted } : r));
            }
            alert(`${saved.length} NTE(s) submitted for approval.`);
        } else {
            const saved = await updateNTE(data);
            setNTEs(prev => prev.map(n => n.id === saved.id ? saved : n));
        }
      } catch (err: any) {
        alert(err?.message || 'Failed to save NTE.');
      }
      handleCloseNteModal(false);
  };
  
  const handleSaveResolution = (
    resolutionDetails: Partial<Resolution> & { decisionMakerSignatureUrl: string },
    approverIds: string[]
  ) => {
    if (!user || !selectedReport) return;
    const originalReportId = selectedReport.id.split('_VIRTUAL_')[0];
    const employeeId = selectedReport.involvedEmployeeIds[0];

    const approverSteps: ApproverStep[] = approverIds.map(id => {
      const approver = mockUsers.find(u => u.id === id)!;
      return { userId: id, userName: approver.name, status: ApproverStatus.Pending };
    });

    const commonResolutionData = {
        ...resolutionDetails,
        incidentReportId: originalReportId,
        decisionDate: new Date(),
        closedByUserId: user.id,
        status: ResolutionStatus.PendingApproval,
        approverSteps,
        employeeId: employeeId
    };

    // Handle resubmission vs new
    if (resolutionDetails.id) {
        const resIndex = mockResolutions.findIndex(r => r.id === resolutionDetails.id);
        if (resIndex > -1) {
            mockResolutions[resIndex] = {
                ...mockResolutions[resIndex],
                ...commonResolutionData,
            } as Resolution;
            setResolutions([...mockResolutions]);
        }
    } else {
        const newResolution: Resolution = {
            ...commonResolutionData,
            id: `RES-${Date.now()}`,
        } as Resolution;
        mockResolutions.push(newResolution);
        setResolutions([...mockResolutions]);
    }
    
    setResolutionModalOpen(false);
    alert('Case has been sent for approval.');
    navigate('/feedback/cases');
  };

  const handleApproveResolution = () => {
    if (!user || !selectedResolution) return;

    const updatedResolution = { ...selectedResolution };
    const stepIndex = updatedResolution.approverSteps.findIndex(s => s.userId === user.id);
    if(stepIndex > -1) {
      updatedResolution.approverSteps[stepIndex] = {
        ...updatedResolution.approverSteps[stepIndex],
        status: ApproverStatus.Approved,
        timestamp: new Date(),
      };
    }

    const allApproved = updatedResolution.approverSteps.every(s => s.status === ApproverStatus.Approved);
    if(allApproved) {
      updatedResolution.status = ResolutionStatus.PendingAcknowledgement;

      const ir = allReports.find(ir => ir.id === updatedResolution.incidentReportId);
      const nte = mockNTEs.find(n => n.incidentReportId === ir?.id && n.employeeId === updatedResolution.employeeId);

      if (nte) {
        mockNotifications.unshift({
            id: `notif-res-${updatedResolution.id}`,
            userId: updatedResolution.employeeId,
            type: NotificationType.RESOLUTION_ISSUED,
            message: `A decision has been made on case ${ir?.id}. Please review and acknowledge.`,
            link: `/feedback/nte/${nte.id}`,
            isRead: false,
            createdAt: new Date(),
            relatedEntityId: updatedResolution.id
        });
      }
    }

    setResolutions(prev => prev.map(r => r.id === updatedResolution.id ? (updatedResolution as Resolution) : r));
    const mockResIndex = mockResolutions.findIndex(r => r.id === updatedResolution.id);
    if (mockResIndex > -1) mockResolutions[mockResIndex] = updatedResolution as Resolution;

    logActivity(user, 'APPROVE', 'Resolution', updatedResolution.id, `Approved resolution for IR ${updatedResolution.incidentReportId}`);
    handleCloseModals();
  };

  const handleRejectResolution = (reason: string) => {
    if (!user || !selectedResolution) return;
    const resIndex = mockResolutions.findIndex(r => r.id === selectedResolution.id);
    if (resIndex === -1) return;

    const updatedResolution = { ...mockResolutions[resIndex] };
    const stepIndex = updatedResolution.approverSteps.findIndex(s => s.userId === user.id);
     if(stepIndex > -1) {
      updatedResolution.approverSteps[stepIndex] = {
        ...updatedResolution.approverSteps[stepIndex],
        status: ApproverStatus.Rejected,
        timestamp: new Date(),
        rejectionReason: reason,
      };
    }
    updatedResolution.status = ResolutionStatus.Rejected;
    mockResolutions[resIndex] = updatedResolution;
    setResolutions(prev => prev.map(r => r.id === updatedResolution.id ? updatedResolution : r));

    // Find the parent incident report and move its pipeline stage back to HR review.
    // This is crucial for single-employee cases that don't use the derived stage logic.
    setAllReports(prev => prev.map(r => r.id === updatedResolution.incidentReportId ? { ...r, pipelineStage: 'hr-review-response' } : r));

    logActivity(user, 'REJECT', 'Resolution', updatedResolution.id, `Rejected resolution for IR ${updatedResolution.incidentReportId}. Reason: ${reason}`);
    handleCloseModals();
  };
  
  const handleAcknowledgeResolution = () => {
    if (!user || !selectedReport) return;
    const originalReportId = selectedReport.id.split('_VIRTUAL_')[0];
    const nte = ntes.find(n => n.incidentReportId === originalReportId && n.employeeId === user.id);
    if (nte) {
        const nteIndex = mockNTEs.findIndex(n => n.id === nte.id);
        if (nteIndex > -1) mockNTEs[nteIndex].status = NTEStatus.Closed;
        setNTEs(prev => prev.map(n => n.id === nte!.id ? { ...n, status: NTEStatus.Closed } : n));
    }
    logActivity(user, 'APPROVE', 'Resolution', selectedResolution!.id, `Employee acknowledged Notice of Decision.`);
    handleCloseModals();
  };

  const handleSendMessage = async (reportId: string, text: string) => {
    if (!user) return;
    const target = allReports.find(r => r.id === reportId);
    if (!target) return;
    const newMessage: ChatMessage = {
      id: `chat-${Date.now()}`,
      userId: user.id,
      userName: user.name,
      timestamp: new Date(),
      text,
    };
    try {
      const saved = await addIncidentReportMessage(target, newMessage, user);
      setAllReports(prev => {
        const rest = prev.filter(r => r.id !== saved.id);
        return filterByIrAccess([saved, ...rest]);
      });
      if (selectedReport?.id === reportId) {
        setSelectedReport(saved);
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to post message');
    }
  };

  const handleMarkNoAction = async (reportId: string) => {
    if (!user) return;
    const target = allReports.find(r => r.id === reportId);
    if (!target) return;
    try {
      const saved = await saveIncidentReport({ ...target, status: IRStatus.NoAction, pipelineStage: 'closed' }, user);
      setAllReports(prev => {
        const rest = prev.filter(r => r.id !== saved.id);
        return filterByIrAccess([saved, ...rest]);
      });
    } catch (err: any) {
      alert(err?.message || 'Failed to update incident report');
    }
    handleCloseModals();
  };

  const handleCloseNteModal = () => {
    setNTEModalOpen(false);
    setSelectedReport(null);
  };

  const handleGenerateNTE = (report: IncidentReport) => {
    if (!user) return;
    if (!report.assignedToId) {
      alert('Assign a case handler before moving to NTE approval.');
      return;
    }

    const needsUpdate = report.pipelineStage !== 'nte-for-approval';
    const doUpdate = needsUpdate
      ? saveIncidentReport({ ...report, pipelineStage: 'nte-for-approval', status: IRStatus.Converted }, user)
      : Promise.resolve(report);

    doUpdate
      .then(saved => {
        if (needsUpdate) {
          setAllReports(prev => {
            const rest = prev.filter(r => r.id !== saved.id);
            return filterByIrAccess([saved, ...rest]);
          });
        }
        setSelectedReport(saved);
        setReportModalOpen(false);
        setNTEModalOpen(true);
      })
      .catch(err => {
        alert(err?.message || 'Failed to move IR to NTE approval stage.');
      });
  };

  const handleConvertToCoaching = (report: IncidentReport) => {
      if (!report || !user) return;
      
      const originalReportId = report.id.split('_VIRTUAL_')[0];
      const originalReport = allReports.find(r => r.id === originalReportId) || report;

      const updated: Partial<IncidentReport> = {
        ...originalReport,
        status: IRStatus.Converted,
        pipelineStage: 'converted-coaching',
      };

      saveIncidentReport(updated, user)
        .then(saved => {
          setAllReports(prev => {
            const rest = prev.filter(r => r.id !== saved.id);
            return filterByIrAccess([saved, ...rest]);
          });
          
          // Create coaching sessions for ALL involved employees (local placeholder)
          const newSessions: CoachingSession[] = [];
          
          saved.involvedEmployeeIds.forEach((empId, index) => {
              const empName = saved.involvedEmployeeNames[index];
              
              let trigger = CoachingTrigger.Behavior; // Default fallback
              if (saved.category === 'Attendance') trigger = CoachingTrigger.Attendance;
              else if (saved.category === 'Performance') trigger = CoachingTrigger.Performance;
              
              const newSession: CoachingSession = {
                  id: `CS-${saved.id}-${empId}-${Date.now()}`,
                  employeeId: empId,
                  employeeName: empName,
                  coachId: user.id,
                  coachName: user.name,
                  trigger: trigger,
                  context: `[From IR-${saved.id}]: ${saved.description}`,
                  date: new Date(),
                  status: CoachingStatus.Draft 
              };
              
              newSessions.push(newSession);
              mockCoachingSessions.unshift(newSession);
          });

          logActivity(user, 'UPDATE', 'IncidentReport', saved.id, `Converted IR to ${newSessions.length} Coaching Session(s).`);
          alert(`Converted to ${newSessions.length} coaching draft(s).`);
        })
        .catch(err => alert(err?.message || 'Failed to convert to coaching'));
  };

  const viewButtonClass = (buttonView: typeof view) => `flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors ${view === buttonView ? 'bg-indigo-100 text-indigo-700 dark:bg-slate-700 dark:text-indigo-300 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`;

  const selectClasses = "appearance-none w-full px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 pr-8";

    if (user?.role === Role.Employee) {
        const myReports = allReports.filter(r => r.reportedBy === user?.id);
        
        return (
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">My Incident Reports</h1>
                    <Button onClick={handleOpenNewReportModal}>+ File New IR</Button>
                </div>
                <p className="text-gray-600 dark:text-gray-400">
                    File a new incident report or view the status of your previous submissions.
                </p>
                <Card>
                    <CaseListTable reports={myReports} onRowClick={handleCardClick} />
                </Card>

                {isReportModalOpen && (
                    <IncidentReportModal
                        isOpen={isReportModalOpen}
                        onClose={handleCloseModals}
                        report={selectedReport}
                        onSave={handleSaveReport}
                        onSendMessage={handleSendMessage}
                        onGenerateNTE={handleGenerateNTE}
                        onMarkNoAction={handleMarkNoAction}
                        onDownloadPdf={setReportToPrint}
                        isEmployeeView={true}
                    />
                )}

                 {reportToPrint && createPortal(
                    <PrintableIncidentReport report={reportToPrint} onClose={() => setReportToPrint(null)} />,
                    document.body
                )}
            </div>
        );
    }

    const isEmployeeToAcknowledge = 
        selectedReport?.pipelineStage === 'resolution' &&
        user && 
        selectedReport.involvedEmployeeIds.includes(user.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Case Dashboard</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Overview of all active and pending cases for your role.</p>
        </div>
        {can('Feedback', Permission.Create) && (
            <Button onClick={handleOpenNewReportModal}>+ File New IR</Button>
        )}
      </div>

      {specialFilter === 'pending_my_approval' && (
          <div className="p-4 rounded-md bg-blue-50 dark:bg-blue-900/40 border border-blue-400 dark:border-blue-800 flex justify-between items-center">
              <p className="text-sm text-blue-700 dark:text-blue-200">
                  Showing cases pending your approval. <Link to="/feedback/cases" className="font-bold underline">Clear filter</Link>
              </p>
          </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <DashboardStatCard title="Total Visible Active Cases" value={stats.activeCases} color="border-red-500" />
        <DashboardStatCard title="Visible New IRs" value={stats.newIRs} color="border-yellow-500" />
        <DashboardStatCard title="Visible Overdue Responses" value={stats.overdueNTEs} color="border-red-500" />
        <DashboardStatCard title="Visible Cases for Resolution" value={stats.forResolution} color="border-green-500" />
      </div>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end">
            <div className="relative w-full sm:col-span-2">
                <label htmlFor="search-filter" className="sr-only">Search</label>
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <SearchIcon />
                </div>
                <input 
                    id="search-filter"
                    type="text" 
                    placeholder="Search by ID, title, or name..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
            </div>
            <div className="relative">
                <label htmlFor="bu-filter" className="sr-only">Business Unit</label>
                <select id="bu-filter" value={buFilter} onChange={e => setBuFilter(e.target.value)} className={selectClasses}>
                    <option value="">All Accessible BUs</option>
                    {accessibleBus.map((bu: BusinessUnit) => <option key={bu.id} value={bu.name}>{bu.name}</option>)}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400"><ChevronDownIcon /></div>
            </div>
             <div className="relative">
                <label htmlFor="handler-filter" className="sr-only">Handler</label>
                <select id="handler-filter" value={handlerFilter} onChange={e => setHandlerFilter(e.target.value)} className={selectClasses}>
                    <option value="">All Handlers</option>
                    <option value="Unassigned">Unassigned</option>
                    {potentialHandlers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400"><ChevronDownIcon /></div>
            </div>
             <div className="relative">
                <label htmlFor="status-filter" className="sr-only">Status</label>
                <select id="status-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={selectClasses}>
                    <option value="">All Statuses</option>
                    {statusOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400"><ChevronDownIcon /></div>
            </div>
            <div className="relative">
                <label htmlFor="year-filter" className="sr-only">Year</label>
                <select id="year-filter" value={yearFilter} onChange={e => setYearFilter(e.target.value)} className={selectClasses}>
                    <option value="all">All Years</option>
                    {yearOptions.map(year => <option key={year} value={year}>{year}</option>)}
                </select>
                 <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400"><ChevronDownIcon /></div>
            </div>
            <div className="relative">
                <label htmlFor="quarter-filter" className="sr-only">Quarter</label>
                 <select id="quarter-filter" value={quarterFilter} onChange={e => setQuarterFilter(e.target.value)} className={selectClasses}>
                    <option value="">All Quarters</option>
                    {quarterOptions.map(q => <option key={q.value} value={q.value}>{q.name}</option>)}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400"><ChevronDownIcon /></div>
            </div>
            <div className="relative">
                <label htmlFor="month-filter" className="sr-only">Month</label>
                 <select id="month-filter" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className={selectClasses}>
                    <option value="">All Months</option>
                    {monthOptions.map(month => <option key={month.value} value={month.value}>{month.name}</option>)}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400"><ChevronDownIcon /></div>
            </div>
        </div>
      </div>

      <div className="flex justify-end">
        <div className="inline-flex space-x-1 p-1 bg-gray-200 dark:bg-slate-800 rounded-lg">
            <button className={viewButtonClass('kanban')} onClick={() => setView('kanban')}><ViewColumnsIcon/>Kanban</button>
            <button className={viewButtonClass('list')} onClick={() => setView('list')}><ListBulletIcon/>List</button>
        </div>
      </div>


      {view === 'kanban' ? (
        <KanbanBoard reports={reports} stages={stages} onUpdateStage={handleUpdateStage} onCardClick={handleCardClick} />
      ) : (
        <CaseListTable reports={reports} onRowClick={handleCardClick} />
      )}
      
      {isReportModalOpen && (
        <IncidentReportModal
          isOpen={isReportModalOpen}
          onClose={handleCloseModals}
          report={selectedReport}
          onSave={handleSaveReport}
          onSendMessage={handleSendMessage}
          onMarkNoAction={handleMarkNoAction}
          onGenerateNTE={handleGenerateNTE}
          onConvertToCoaching={handleConvertToCoaching}
          onDownloadPdf={setReportToPrint}
        />
      )}
      
      {isNTEModalOpen && selectedReport && (
         <NTEModal
            isOpen={isNTEModalOpen}
            onClose={handleCloseNteModal}
            incidentReport={selectedReport}
            nte={selectedNTE}
            onSave={handleSaveNTE}
         />
      )}

      {isResolutionModalOpen && selectedReport && (
          <ResolutionModal 
            isOpen={isResolutionModalOpen}
            onClose={handleCloseModals}
            incidentReport={selectedReport}
            resolution={selectedResolution}
            onSave={handleSaveResolution}
            isApproverView={isCurrentUserPendingApprover}
            onApprove={handleApproveResolution}
            onReject={handleRejectResolution}
            isEmployeeAcknowledgeView={isEmployeeToAcknowledge}
            onAcknowledge={handleAcknowledgeResolution}
          />
      )}

      {reportToPrint && createPortal(
        <PrintableIncidentReport report={reportToPrint} onClose={() => setReportToPrint(null)} />,
        document.body
      )}
    </div>
  );
};

export default DisciplinaryCases;
