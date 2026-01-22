
import React, { useState, useMemo, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { WFHRequest, WFHRequestStatus, Role, Permission } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { supabase } from '../../services/supabaseClient';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import WFHRequestModal from '../../components/payroll/WFHRequestModal';
import WFHReviewModal from '../../components/payroll/WFHReviewModal';
import { logActivity } from '../../services/auditService';
import EditableDescription from '../../components/ui/EditableDescription';

const LinkIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>;

const getStatusColor = (status: WFHRequestStatus) => {
    switch (status) {
        case WFHRequestStatus.Approved: return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300';
        case WFHRequestStatus.Pending: return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300';
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
      const { data, error } = await supabase
        .from('hris_users')
        .select('id')
        .eq('reports_to', user.id);
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
      if (user.role === Role.Employee) {
        filtered = filtered.filter(r => r.employeeId === user.id);
      }
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

  const handleSave = async (data: Partial<WFHRequest>) => {
      if (!user) return;
      if (!canCreate && !canManage) {
        alert('You do not have permission to update WFH requests.');
        return;
      }

      if (data.id) {
          const { error } = await supabase
            .from('wfh_requests')
            .update({
              reason: data.reason,
              report_link: data.reportLink,
              status: data.status || selectedRequest?.status || WFHRequestStatus.Pending,
            })
            .eq('id', data.id);

          if (!error && data.reportLink) {
              logActivity(user, 'UPDATE', 'WFHRequest', data.id, 'Added accomplishment report link.');
          }
      } else {
          const payload = {
            employee_id: user.id,
            employee_name: user.name,
            date: data.date,
            reason: data.reason,
            report_link: data.reportLink,
            status: WFHRequestStatus.Pending,
            business_unit_id: user.businessUnitId || null,
            department_id: user.departmentId || null,
          };
          const { data: inserted, error } = await supabase.from('wfh_requests').insert(payload).select().single();
          if (!error && inserted) {
            logActivity(user, 'CREATE', 'WFHRequest', inserted.id, `Requested WFH for ${new Date(inserted.date).toLocaleDateString()}`);
          }
      }
      setIsModalOpen(false);
      loadRequests();
  };

  const handleApprove = async (requestId: string) => {
      if (!user) return;
      const { error } = await supabase
        .from('wfh_requests')
        .update({ status: WFHRequestStatus.Approved, approved_by: user.id, approved_at: new Date().toISOString() })
        .eq('id', requestId);
      if (error) {
        alert(error.message || 'Failed to approve WFH request.');
        return;
      }
      logActivity(user, 'APPROVE', 'WFHRequest', requestId, 'Approved WFH request.');
      setIsReviewModalOpen(false);
      setSelectedReviewRequest(null);
      loadRequests();
  };

  const handleReject = async (requestId: string, reason: string) => {
      if (!user) return;
      const { error } = await supabase
        .from('wfh_requests')
        .update({ status: WFHRequestStatus.Rejected, rejection_reason: reason })
        .eq('id', requestId);
      if (error) {
        alert(error.message || 'Failed to reject WFH request.');
        return;
      }
      logActivity(user, 'REJECT', 'WFHRequest', requestId, `Rejected WFH request. Reason: ${reason}`);
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
                        {Object.values(WFHRequestStatus).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Employee</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
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
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">
                                    {req.reason}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(req.status)}`}>
                                        {req.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    {req.reportLink ? (
                                        <a href={normalizeUrl(req.reportLink)} target="_blank" rel="noopener noreferrer" className="flex items-center text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300">
                                            <LinkIcon /> <span className="ml-1">View Report</span>
                                        </a>
                                    ) : req.status === WFHRequestStatus.Approved && req.employeeId === user?.id ? (
                                        <button onClick={() => handleOpenModal(req)} className="text-xs text-orange-600 hover:text-orange-800 font-medium">
                                            + Add Report
                                        </button>
                                    ) : (
                                        <span className="text-gray-400">-</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <div className="flex justify-end space-x-2">
                                        {canManage && req.status === WFHRequestStatus.Pending ? (
                                            <Button size="sm" variant="secondary" onClick={() => handleOpenReview(req)}>
                                                Review
                                            </Button>
                                        ) : (
                                            <Button size="sm" variant="secondary" onClick={() => handleOpenModal(req)} disabled={!canView}>
                                                {req.status === WFHRequestStatus.Pending ? 'Edit' : 'View'}
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
