import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ManpowerApprovalStage, ManpowerRequest, ManpowerRequestStatus, Role } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import ManpowerRequestModal from '../../components/payroll/ManpowerRequestModal';
import ManpowerReviewModal from '../../components/payroll/ManpowerReviewModal';
import { getApprovalRequestId } from '../../services/approvalDeepLinks';
import {
  approveManpowerRequest,
  fetchManpowerRequestById,
  fetchManpowerRequests,
  fetchMyPendingManpowerApprovalIds,
  rejectManpowerRequest,
} from '../../services/manpowerService';

const stageLabel = (request: ManpowerRequest) => {
  if (request.status === ManpowerRequestStatus.Approved || request.approvalStage === ManpowerApprovalStage.Completed) return 'Approved';
  if (request.status === ManpowerRequestStatus.Rejected || request.approvalStage === ManpowerApprovalStage.Rejected) return 'Rejected';
  return request.approvalStage === ManpowerApprovalStage.BodGm ? 'Pending BOD / GM Approval' : 'Pending Business Unit Manager';
};

const statusClasses = (status: string) => status === 'Approved'
  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
  : status === 'Rejected'
    ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
    : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200';

const ManpowerPlanning: React.FC = () => {
  const { user } = useAuth();
  const { getDashboardRequestAccess } = usePermissions();
  const location = useLocation();
  const access = getDashboardRequestAccess('Manpower');
  const roleSet = new Set([user?.role, ...(user?.roles || [])]);

  const [requests, setRequests] = useState<ManpowerRequest[]>([]);
  const [actionableIds, setActionableIds] = useState<Set<string>>(new Set());
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ManpowerRequest | null>(null);
  const [openedReviewId, setOpenedReviewId] = useState<string | null>(null);
  const [reviewLoadError, setReviewLoadError] = useState('');
  const [loadError, setLoadError] = useState('');

  const canCreate = Boolean(access.canRequest || roleSet.has(Role.Admin) || roleSet.has(Role.HRManager) || roleSet.has(Role.HRStaff));

  const loadRequests = useCallback(async () => {
    if (!user) return;
    try {
      const [visibleRequests, pendingIds] = await Promise.all([
        fetchManpowerRequests(),
        fetchMyPendingManpowerApprovalIds(),
      ]);
      setRequests(visibleRequests);
      setActionableIds(new Set(pendingIds));
      setLoadError('');
    } catch (error: any) {
      console.error('Failed to load manpower requests', error);
      setRequests([]);
      setActionableIds(new Set());
      setLoadError(error?.message || 'Manpower requests could not be loaded.');
    }
  }, [user?.id]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  useEffect(() => {
    const requestId = getApprovalRequestId(location.search);
    if (!requestId || !user?.id || requestId === openedReviewId) return;
    let cancelled = false;
    setReviewLoadError('');

    const openAssignedRequest = async () => {
      try {
        const request = await fetchManpowerRequestById(requestId);
        if (cancelled) return;
        if (!request) throw new Error('This on-call request is no longer available or is outside your authorized scope.');

        const isRequester = request.requestedBy === user.id;
        const pendingIds = isRequester ? [] : await fetchMyPendingManpowerApprovalIds();
        if (!isRequester && !pendingIds.includes(request.id)) {
          throw new Error('This on-call request is no longer assigned to you for approval.');
        }
        setActionableIds(previous => {
          const next = new Set(previous);
          if (!isRequester) next.add(request.id);
          return next;
        });
        setRequests(previous => [request, ...previous.filter(candidate => candidate.id !== request.id)]);
        setSelectedRequest(request);
        setIsReviewModalOpen(true);
        setOpenedReviewId(requestId);
      } catch (error: any) {
        if (cancelled) return;
        setOpenedReviewId(requestId);
        setReviewLoadError(error?.message || 'The assigned manpower request could not be loaded.');
      }
    };
    openAssignedRequest();
    return () => { cancelled = true; };
  }, [location.search, user?.id, openedReviewId]);

  const sortedRequests = useMemo(() => [...requests].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [requests]);

  const handleSaveRequest = (request: ManpowerRequest) => {
    setRequests(previous => [request, ...previous.filter(candidate => candidate.id !== request.id)]);
    setIsCreateModalOpen(false);
    void loadRequests();
  };

  const handleApprove = async (requestId: string, comments?: string) => {
    if (!user) return;
    try {
      await approveManpowerRequest(requestId, user.id, comments);
      setIsReviewModalOpen(false);
      setSelectedRequest(null);
      await loadRequests();
    } catch (error: any) {
      alert(error?.message || 'Error approving request.');
      throw error;
    }
  };

  const handleReject = async (requestId: string, reason: string) => {
    if (!user) return;
    try {
      await rejectManpowerRequest(requestId, user.id, reason);
      setIsReviewModalOpen(false);
      setSelectedRequest(null);
      await loadRequests();
    } catch (error: any) {
      alert(error?.message || 'Error rejecting request.');
      throw error;
    }
  };

  return (
    <div className="space-y-6">
      {reviewLoadError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"><strong>Unable to open on-call review.</strong> {reviewLoadError}</div>}
      {loadError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">{loadError}</div>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-3xl font-bold text-gray-900 dark:text-white">Manpower Planning</h1><p className="mt-1 text-gray-600 dark:text-gray-400">Manage daily on-call staffing requests and their staged approvals.</p></div>
        {canCreate && <Button onClick={() => setIsCreateModalOpen(true)}>+ Request On-Call</Button>}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800"><tr>
              {['Date Needed', 'Business Unit', 'On-call FTE', 'Requester', 'Approval status', 'Created At', ''].map(heading => <th key={heading} className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-300">{heading}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
              {sortedRequests.map(request => {
                const totalNeeded = request.items.reduce((sum, item) => sum + Number(item.onCallNeeded ?? item.requestedCount ?? 0), 0);
                const status = stageLabel(request);
                const canAct = actionableIds.has(request.id);
                return <tr key={request.id} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50" onClick={() => { setSelectedRequest(request); setIsReviewModalOpen(true); }}>
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{new Date(request.date).toLocaleDateString()}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{request.businessUnitName}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-orange-600 dark:text-orange-300">{totalNeeded}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{request.requesterName}</td>
                  <td className="px-6 py-4 text-sm"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusClasses(status)}`}>{status}</span>{request.approvalIssue && <span className="mt-1 block text-xs text-amber-700 dark:text-amber-300">{request.approvalIssue}</span>}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{new Date(request.createdAt).toLocaleDateString()}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium"><Button size="sm" variant="secondary" onClick={event => { event.stopPropagation(); setSelectedRequest(request); setIsReviewModalOpen(true); }}>{canAct ? 'Review' : 'View'}</Button></td>
                </tr>;
              })}
              {!sortedRequests.length && <tr><td colSpan={7} className="py-10 text-center text-gray-500 dark:text-gray-400">No requests found.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <ManpowerRequestModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} onSave={handleSaveRequest} />
      <ManpowerReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        request={selectedRequest}
        onApprove={handleApprove}
        onReject={handleReject}
        canApprove={Boolean(selectedRequest && actionableIds.has(selectedRequest.id))}
      />
    </div>
  );
};

export default ManpowerPlanning;
