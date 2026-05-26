
import React, { useState, useMemo, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { WFHRequest, WFHRequestStatus, Role, Permission } from '../../types';
import { NotificationType } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { supabase } from '../../services/supabaseClient';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import WFHRequestModal from '../../components/payroll/WFHRequestModal';
import WFHReviewModal from '../../components/payroll/WFHReviewModal';
import { logActivity } from '../../services/auditService';
import { createNotification } from '../../services/notificationService';
import EditableDescription from '../../components/ui/EditableDescription';
import { 
  createWfhRequest, 
  updateWfhRequestDetails, 
  submitWfhRequest, 
  deptHeadApproveWfhRequest, 
  bodApproveWfhRequest, 
  rejectWfhRequest 
} from '../../services/wfhService';


const WFH_STATUS_LABELS: Record<WFHRequestStatus, string> = {
    [WFHRequestStatus.PendingSubmission]: 'Pending Submission',
    [WFHRequestStatus.PendingDeptHead]: 'Pending Dept Head Approval',
    [WFHRequestStatus.PendingGM]: 'Pending GM Approval',
    [WFHRequestStatus.PendingBOD]: 'Pending BOD Approval',
    [WFHRequestStatus.ForTimekeeping]: 'For Timekeeping',
    [WFHRequestStatus.Approved]: 'Approved',
    [WFHRequestStatus.Rejected]: 'Rejected',
};

const LinkIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>;

const getStatusColor = (status: WFHRequestStatus) => {
    switch (status) {
        case WFHRequestStatus.Approved: return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300';
        case WFHRequestStatus.ForTimekeeping: return 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300';
        case WFHRequestStatus.PendingSubmission:
        case WFHRequestStatus.PendingDeptHead:
        case WFHRequestStatus.PendingGM:
        case WFHRequestStatus.PendingBOD: return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300';
        case WFHRequestStatus.Rejected: return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300';
        default: return 'bg-gray-100 text-gray-800';
    }
};

const normalizeUrl = (url: string) => {
    if (!url) return '';
    const trimmed = url.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
};

const WFHRequests: React.FC = () => {
  const { user } = useAuth();
  const { can } = usePermissions();
  const canView = can('WFH', Permission.View);
  const canCreate = can('WFH', Permission.Create) || can('WFH', Permission.Manage);
  const [reporteeIds, setReporteeIds] = useState<string[]>([]);
  const [reporteeIdsLoaded, setReporteeIdsLoaded] = useState(false);
  const canManage = can('WFH', Permission.Manage) || can('WFH', Permission.Approve) || reporteeIds.length > 0;
  const navigate = useNavigate();
  const location = useLocation();

  const [requests, setRequests] = useState<WFHRequest[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<WFHRequest | null>(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [selectedReviewRequest, setSelectedReviewRequest] = useState<WFHRequest | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const loadRequests = async () => {
    if (!user || !canView) return;
    // Guard: skip while auth context is still hydrating.
    // During hydration, user.id is temporarily the Supabase auth UUID (same as authUserId).
    // Once hydration completes, user.id becomes the hris_users UUID. Running queries with
    // the auth UUID as employee_id would return empty results and wipe the visible list.
    if (user.authUserId && user.id === user.authUserId) return;

    const role = user.role as Role;
    let query = supabase.from('wfh_requests').select('*').order('date', { ascending: false });

    switch (role) {
      case Role.Admin:
      case Role.HRManager:
      case Role.HRStaff:
        // full visibility
        break;
      case Role.BOD:
        // view all
        break;
      case Role.GeneralManager:
        if (user.businessUnitId) query = query.eq('business_unit_id', user.businessUnitId);
        break;
      case Role.OperationsDirector:
        if (user.businessUnitId) query = query.eq('business_unit_id', user.businessUnitId);
        break;
      case Role.BusinessUnitManager:
        if (user.businessUnitId) query = query.eq('business_unit_id', user.businessUnitId);
        break;
      case Role.Manager:
        if (!reporteeIdsLoaded) return;
        if (reporteeIds.length > 0) {
          query = query.in('employee_id', reporteeIds);
        } else {
          // Managers only review direct reports via reports_to.
          setRequests([]);
          return;
        }
        break;
      case Role.Employee:
        query = query.eq('employee_id', user.id);
        break;
      case Role.Auditor:
        // logs: allow view all
        break;
      case Role.FinanceStaff:
      case Role.Recruiter:
      case Role.IT:
      default:
        // none or not allowed -> show only own (or nothing if you prefer strict)
        query = query.eq('employee_id', user.id);
        break;
    }

    const { data, error } = await query;
    if (!error && data) {
      setRequests(
        data.map(r => ({
          id: r.id,
          employeeId: r.employee_id,
          employeeName: r.employee_name,
          date: new Date(r.date),
          reason: r.reason,
          status: r.status as WFHRequestStatus,
          reportLink: r.report_link || undefined,
          approvedBy: r.approved_by || undefined,
          approvedAt: r.approved_at ? new Date(r.approved_at) : undefined,
          rejectionReason: r.rejection_reason || undefined,
          createdAt: r.created_at ? new Date(r.created_at) : new Date(),
        }))
      );
    }
  };

  useEffect(() => {
    if (!user?.id) {
      setReporteeIds([]);
      setReporteeIdsLoaded(false);
      return;
    }
    const loadReportees = async () => {
      // reports_to is a TEXT column storing the hris_users UUID as a string
      const { data, error } = await supabase
        .from('hris_users')
        .select('id')
        .eq('reports_to', String(user.id));
      if (error || !data) {
        setReporteeIds([]);
        setReporteeIdsLoaded(true);
        return;
      }
      setReporteeIds(data.map((row: any) => row.id).filter(Boolean));
      setReporteeIdsLoaded(true);
    };
    loadReportees();
  }, [user?.id]);

  useEffect(() => {
    loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, canView, reporteeIds, reporteeIdsLoaded]);

  useEffect(() => {
    if (location.state?.openNewModal) {
        handleOpenModal(null);
        navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate]);

  const myRequests = useMemo(() => {
      if (!user) return [];
      let filtered = requests;
      // NOTE: Do NOT add a secondary employee_id filter here — the DB query + RLS already
      // handles per-employee filtering. A second filter here against user.id (which may
      // briefly be the auth UUID during hydration) would wipe out all results.
      if (statusFilter !== 'all') {
          filtered = filtered.filter(r => r.status === statusFilter);
      }
      return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [requests, user, statusFilter]);

  const handleOpenModal = (request: WFHRequest | null) => {
      if (!canView) return;
      if (request && request.employeeId !== user?.id) return;
      if (request && !canManage && !canCreate) return;
      setSelectedRequest(request);
      setIsModalOpen(true);
  };

  const handleOpenReview = (request: WFHRequest) => {
      if (!canManage) return;
      setSelectedReviewRequest(request);
      setIsReviewModalOpen(true);
  };

  // Roles that skip Dept Head review and go directly to BOD approval
  const managerRoles: Role[] = [
    Role.Manager, Role.BusinessUnitManager, Role.GeneralManager,
    Role.OperationsDirector, Role.HRManager, Role.BOD,
  ];
  const requesterIsManager = user ? managerRoles.includes(user.role as Role) : false;

  const handleSave = async (data: Partial<WFHRequest>, isDraft: boolean) => {
      if (!user) return;
      if (!canCreate && !canManage) {
        alert('You do not have permission to update WFH requests.');
        return;
      }

      try {
          if (data.id) {
              if (selectedRequest?.status === WFHRequestStatus.PendingSubmission && !isDraft) {
                  await updateWfhRequestDetails(data.id, data);
                  await submitWfhRequest(data.id, user);
              } else {
                  await updateWfhRequestDetails(data.id, data);
              }

              if (data.reportLink) {
                  logActivity(user, 'UPDATE', 'WFHRequest', data.id, 'Added accomplishment report link.');
              }
          } else {
              const inserted = await createWfhRequest(data, user, isDraft);
              logActivity(user, 'CREATE', 'WFHRequest', inserted.id, `Requested WFH for ${new Date(inserted.date).toLocaleDateString()}`);

              if (!isDraft) {
                if (requesterIsManager) {
                  // Manager-level requests skip Dept Head and go directly to BOD.
                  // Fetch all BOD users and notify them.
                  supabase
                    .from('hris_users')
                    .select('id')
                    .eq('role', Role.BOD)
                    .then(({ data: bodUsers }) => {
                      if (bodUsers) {
                        bodUsers.forEach(bod => {
                          createNotification({
                            userId: bod.id,
                            title: '📋 WFH Request Pending BOD Approval',
                            message: `${user.name} (Manager) submitted a Work From Home request for ${new Date(inserted.date).toLocaleDateString()} and requires your approval.`,
                            type: NotificationType.WFH_SUBMITTED,
                            link: '/payroll/wfh-requests',
                          }).catch(e => console.error('Failed to send WFH BOD notification', e));
                        });
                      }
                    });
                } else if (user.managerId) {
                  // Rank-and-file employees notify their department head.
                  createNotification({
                    userId: user.managerId,
                    title: '📋 WFH Request Pending Approval',
                    message: `${user.name} submitted a Work From Home request for ${new Date(inserted.date).toLocaleDateString()} for your approval.`,
                    type: NotificationType.WFH_SUBMITTED,
                    link: '/payroll/wfh-requests',
                  }).catch(e => console.error('Failed to send WFH submission notification', e));
                }
              }
          }
      } catch (error: any) {
          alert(error.message || 'Failed to save WFH request.');
      }
      setIsModalOpen(false);
      loadRequests();
  };

  const handleApprove = async (requestId: string) => {
      if (!user) return;
      const req = requests.find(r => r.id === requestId);
      if (!req) return;

      try {
        if (req.status === WFHRequestStatus.PendingDeptHead) {
            await deptHeadApproveWfhRequest(requestId, user.id);
            logActivity(user, 'APPROVE', 'WFHRequest', requestId, 'Approved WFH request as Department Head.');

            // Notify the requester that their request moved forward (not yet final)
            if (req.employeeId) {
              createNotification({
                userId: req.employeeId,
                title: '🔄 WFH Request Forwarded',
                message: `Your WFH request for ${new Date(req.date).toLocaleDateString()} has been approved by your department head and is now pending BOD approval.`,
                type: NotificationType.WFH_SUBMITTED,
                link: '/payroll/wfh-requests',
              }).catch(console.error);
            }

            // Notify all BOD users that a request needs their approval
            supabase
              .from('hris_users')
              .select('id')
              .eq('role', Role.BOD)
              .then(({ data: bodUsers }) => {
                if (bodUsers) {
                  bodUsers.forEach(bod => {
                    createNotification({
                      userId: bod.id,
                      title: '📋 WFH Request Pending BOD Approval',
                      message: `${req.employeeName}'s WFH request for ${new Date(req.date).toLocaleDateString()} has been approved by the department head and requires your final approval.`,
                      type: NotificationType.WFH_SUBMITTED,
                      link: '/payroll/wfh-requests',
                    }).catch(e => console.error('Failed to send WFH BOD notification', e));
                  });
                }
              });

        } else if (req.status === WFHRequestStatus.PendingBOD) {
            await bodApproveWfhRequest(requestId, user.id);
            logActivity(user, 'APPROVE', 'WFHRequest', requestId, 'Approved WFH request as BOD.');

            // Notify the requester of final approval
            if (req.employeeId) {
              createNotification({
                userId: req.employeeId,
                title: '✅ WFH Request Approved',
                message: `Your WFH request for ${new Date(req.date).toLocaleDateString()} has been fully approved by BOD.`,
                type: NotificationType.WFH_APPROVED,
                link: '/payroll/wfh-requests',
              }).catch(console.error);
            }
        }
      } catch (error: any) {
        alert(error.message || 'Failed to approve WFH request.');
      }

      setIsReviewModalOpen(false);
      setSelectedReviewRequest(null);
      loadRequests();
  };

  const handleReject = async (requestId: string, reason: string) => {
      if (!user) return;
      const req = requests.find(r => r.id === requestId);
      if (!req) return;

      try {
        await rejectWfhRequest(requestId, user.id, reason);
        logActivity(user, 'REJECT', 'WFHRequest', requestId, `Rejected WFH request. Reason: ${reason}`);

        // Notify the requester
        if (req?.employeeId) {
          createNotification({
            userId: req.employeeId,
            title: '❌ WFH Request Rejected',
            message: `Your WFH request for ${new Date(req.date).toLocaleDateString()} has been rejected by ${user.name}${reason ? `: "${reason}"` : '.'}`,
            type: NotificationType.WFH_REJECTED,
            link: '/payroll/wfh-requests',
          }).catch(console.error);
        }
      } catch (error: any) {
        alert(error.message || 'Failed to reject WFH request.');
      }

      setIsReviewModalOpen(false);
      setSelectedReviewRequest(null);
      loadRequests();
  };

  return (
    <div className="space-y-6">
        <div className="flex justify-between items-center">
            <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Work From Home Requests</h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1">Submit requests and track your WFH status.</p>
            </div>
            {canCreate && <Button onClick={() => handleOpenModal(null)}>New Request</Button>}
        </div>

        <EditableDescription descriptionKey="wfhDesc" />

        {!canView && (
            <div className="p-4 rounded-md bg-yellow-50 text-sm text-yellow-800">
                You do not have permission to view WFH requests.
            </div>
        )}
        {canView && (
        <>
        <Card>
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-end">
                <div className="w-48">
                    <select 
                        value={statusFilter} 
                        onChange={e => setStatusFilter(e.target.value)}
                        className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    >
                        <option value="all">All Statuses</option>
                        {Object.values(WFHRequestStatus).map(s => <option key={s} value={s}>{WFH_STATUS_LABELS[s] ?? s}</option>)}
                    </select>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Employee</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date Range</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Reason</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Report</th>
                            <th className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
        {myRequests.map(req => (
                            <tr key={req.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                    {req.employeeName}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                    {new Date(req.date).toLocaleDateString()}
                                    {req.endDate && new Date(req.endDate).toLocaleDateString() !== new Date(req.date).toLocaleDateString() && (
                                        <span className="text-gray-400"> → {new Date(req.endDate).toLocaleDateString()}</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">
                                    {req.reason}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(req.status)}`}>
                                        {WFH_STATUS_LABELS[req.status] ?? req.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    {req.reportLink ? (
                                        <a href={normalizeUrl(req.reportLink)} target="_blank" rel="noopener noreferrer" className="flex items-center text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300">
                                            <LinkIcon /> <span className="ml-1">View Report</span>
                                        </a>
                                    ) : req.status === WFHRequestStatus.ForTimekeeping && req.employeeId === user?.id ? (
                                        <button onClick={() => handleOpenModal(req)} className="text-xs text-orange-600 hover:text-orange-800 font-medium">
                                            + Add Report
                                        </button>
                                    ) : (
                                        <span className="text-gray-400">-</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <div className="flex justify-end space-x-2">
                                        {/* Show Review only when the viewer is a manager/approver AND is not the one who filed the request */}
                                        {canManage && req.employeeId !== user?.id && (req.status === WFHRequestStatus.PendingDeptHead || req.status === WFHRequestStatus.PendingBOD) ? (
                                            <Button size="sm" variant="secondary" onClick={() => handleOpenReview(req)}>
                                                Review
                                            </Button>
                                        ) : (
                                            <Button size="sm" variant="secondary" onClick={() => handleOpenModal(req)} disabled={!canView}>
                                                {(req.status === WFHRequestStatus.PendingSubmission) ? 'Edit' : 'View'}
                                            </Button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {myRequests.length === 0 && (
                            <tr>
                                <td colSpan={6} className="text-center py-10 text-gray-500 dark:text-gray-400">
                                    No requests found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </Card>

        <WFHRequestModal 
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            request={selectedRequest}
            onSave={handleSave}
        />
        <WFHReviewModal
            isOpen={isReviewModalOpen}
            onClose={() => {
                setIsReviewModalOpen(false);
                setSelectedReviewRequest(null);
            }}
            request={selectedReviewRequest}
            onApprove={handleApprove}
            onReject={handleReject}
        />
        </>
        )}
    </div>
  );
};

export default WFHRequests;
