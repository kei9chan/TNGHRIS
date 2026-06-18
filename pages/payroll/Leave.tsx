import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { LeaveRequest, LeaveRequestStatus, Role, Permission } from '../../types';
import { NotificationType } from '../../types';
import { supabase } from '../../services/supabaseClient';
import { createNotification } from '../../services/notificationService';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import LeaveBalanceCard from '../../components/payroll/LeaveBalanceCard';
import LeaveRequestTable from '../../components/payroll/LeaveRequestTable';
import LeaveRequestModal from '../../components/payroll/LeaveRequestModal';
import RejectReasonModal from '../../components/feedback/RejectReasonModal';
import Toast from '../../components/ui/Toast';
import LeaveCalendar from '../../components/payroll/LeaveCalendar';

type ActiveView = 'my_requests' | 'team_requests' | 'schedule';

const Leave: React.FC = () => {
  const { user } = useAuth();
  const { can, hasDirectReports, getDashboardRequestAccess } = usePermissions();
  const access = getDashboardRequestAccess();

  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<{ id: string; name: string }[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [requestToReject, setRequestToReject] = useState<LeaveRequest | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>('my_requests');
  const [toastInfo, setToastInfo] = useState<{ show: boolean; title: string; message: string; icon?: React.ReactNode }>({
    show: false,
    title: '',
    message: '',
  });
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);

  const roleCanApprove = access.canApprove;
  const canApprove = (can('Leave', Permission.Approve) || hasDirectReports() || roleCanApprove) ?? false;

  const loadLeaveTypes = async () => {
    const fallback = [
      { id: 'fallback-vac', name: 'Vacation Leave' },
      { id: 'fallback-sick', name: 'Sick Leave' },
    ];

    const { data, error } = await supabase.from('leave_types').select('id, name').order('name');
    if (!error && data && data.length > 0) {
      setLeaveTypes(data.map(d => ({ id: d.id, name: d.name })));
    } else {
      console.warn('leave_types load failed or empty; using fallback list', error);
      setLeaveTypes(fallback);
    }
  };

  const loadLeaveRequests = async () => {
    if (!user) return;
    let query = supabase.from('leave_requests').select('*').order('start_date', { ascending: false });

    if (access.scope === 'global') {
      // view all
    } else if (access.scope === 'bu') {
      if (user.businessUnitId) query = query.eq('business_unit_id', user.businessUnitId);
    } else if (access.scope === 'team') {
      if (user.departmentId) query = query.eq('department_id', user.departmentId);
      else query = query.eq('employee_id', user.id);
    } else if (access.scope === 'self') {
      query = query.eq('employee_id', user.id);
    } else {
      query = query.eq('id', null);
    }

    const { data, error } = await query;
    if (!error && data) {
      const normalizeStatus = (status: string | null | undefined): LeaveRequestStatus => {
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

      setLeaveRequests(
        data.map(r => ({
          id: r.id,
          employeeId: r.employee_id,
          employeeName: r.employee_name,
          leaveTypeId: r.leave_type_id,
          startDate: new Date(r.start_date),
          endDate: new Date(r.end_date),
          startTime: r.start_time || undefined,
          endTime: r.end_time || undefined,
          durationDays: Number(r.duration_days),
          reason: r.reason,
          status: normalizeStatus(r.status),
          approverChain: (r.approver_chain || []) as any,
          historyLog: (r.history_log || []) as any,
          attachmentUrl: r.attachment_url || undefined,
          approverId: r.approver_id || undefined,
          businessUnitId: r.business_unit_id || undefined,
          departmentId: r.department_id || undefined,
        }))
      );
    }
  };

  useEffect(() => {
    loadLeaveTypes();
  }, []);

  useEffect(() => {
    loadLeaveRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const myBalances = useMemo(() => {
    if (!user) return [];
    return leaveTypes.map(lt => ({
      employeeId: user.id,
      leaveTypeId: lt.id,
      opening: 0,
      accrued: 0,
      used: 0,
      adjusted: 0,
      available: 0,
      name: lt.name,
    }));
  }, [leaveTypes, user]);

  const myRequests = useMemo(() => {
    if (!user) return [];
    return leaveRequests.filter(r => r.employeeId === user.id);
  }, [leaveRequests, user]);

  const teamRequests = useMemo(() => {
    if (!user) return [];
    if (access.scope === 'global') return leaveRequests;
    if (access.scope === 'bu' && user.businessUnitId) {
      return leaveRequests.filter(r => r.businessUnitId === user.businessUnitId);
    }
    if (access.scope === 'team' && user.departmentId) {
      return leaveRequests.filter(r => r.departmentId === user.departmentId);
    }
    return [];
  }, [leaveRequests, user, access.scope]);

  const visibleRequests = useMemo(() => {
    if (!user) return [];
    if (access.scope === 'global') return leaveRequests;
    if (access.scope === 'bu' && user.businessUnitId) {
      return leaveRequests.filter(r => r.businessUnitId === user.businessUnitId);
    }
    if (access.scope === 'team' && user.departmentId) {
      return leaveRequests.filter(r => r.departmentId === user.departmentId);
    }
    return leaveRequests.filter(r => r.employeeId === user.id);
  }, [leaveRequests, user, access.scope]);

  const calendarLeaves = useMemo(() => {
    return visibleRequests.filter(r => r.status === LeaveRequestStatus.Approved);
  }, [visibleRequests]);

  const handleOpenModal = (request: LeaveRequest | null) => {
    setSelectedRequest(request);
    setIsModalOpen(true);
  };

  const handleSave = async (requestToSave: Partial<LeaveRequest>, status: LeaveRequestStatus) => {
    if (!user) return;

    let attachmentUrl: string | undefined = requestToSave.attachmentUrl;

    if (attachmentFile) {
      const path = `${user.id}/leave/${Date.now()}-${attachmentFile.name}`;
      const { data: uploaded, error: uploadError } = await supabase.storage
        .from('leave-request-attachments')
        .upload(path, attachmentFile, { upsert: true });
      if (!uploadError && uploaded?.path) {
        attachmentUrl = uploaded.path;
      } else {
        setToastInfo({ show: true, title: 'Upload failed', message: 'Could not upload attachment.' });
      }
    }

    const historyEntry = {
      userId: user.id,
      userName: user.name,
      timestamp: new Date().toISOString(),
      action: requestToSave.id ? 'Updated' : 'Created',
      details: `Request saved as ${status}`,
    };

    const payload = {
      employee_id: user.id,
      employee_name: user.name,
      leave_type_id: requestToSave.leaveTypeId,
      start_date: requestToSave.startDate,
      end_date: requestToSave.endDate,
      start_time: requestToSave.startTime,
      end_time: requestToSave.endTime,
      duration_days: requestToSave.durationDays || 1,
      reason: requestToSave.reason,
      status,
      approver_chain: requestToSave.approverChain || [],
      history_log: [...(requestToSave.historyLog || []), historyEntry],
      attachment_url: attachmentUrl,
      approver_id: user.managerId || null,
      business_unit_id: user.businessUnitId || null,
      department_id: user.departmentId || null,
    };

    if (requestToSave.id) {
      await supabase.from('leave_requests').update(payload).eq('id', requestToSave.id);
    } else {
      await supabase.from('leave_requests').insert(payload);
    }

    // Notify the approver (manager) when a leave request is submitted as Pending
    if (status === LeaveRequestStatus.Pending && user.managerId) {
      try {
        const leaveTypeName = leaveTypes.find(lt => lt.id === requestToSave.leaveTypeId)?.name || 'Leave';
        await createNotification({
          userId: user.managerId,
          title: '📋 Leave Request Pending Approval',
          message: `${user.name} submitted a ${leaveTypeName} request (${requestToSave.durationDays || 1} day${(requestToSave.durationDays || 1) !== 1 ? 's' : ''}) for your approval.`,
          type: NotificationType.LEAVE_REQUEST,
          link: '/payroll/leave',
        });
      } catch (e) {
        console.error('Failed to send leave submission notification', e);
      }
    }

    setIsModalOpen(false);
    setAttachmentFile(null);
    loadLeaveRequests();
  };

  const handleApproval = async (request: LeaveRequest, approved: boolean, notes: string) => {
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

    if (!error && request.employeeId) {
      if (approved) {
        // Deduct from leave quota
        const leaveType = leaveTypes.find(lt => lt.id === request.leaveTypeId);
        if (leaveType) {
          const isVacation = leaveType.name.toLowerCase().includes('vacation');
          const isSick = leaveType.name.toLowerCase().includes('sick');
          
          if (isVacation || isSick) {
            const { data: userData } = await supabase
              .from('hris_users')
              .select('leave_quota_vacation, leave_quota_sick')
              .eq('id', request.employeeId)
              .single();
              
            if (userData) {
              const fieldToUpdate = isVacation ? 'leave_quota_vacation' : 'leave_quota_sick';
              const currentQuota = userData[fieldToUpdate] || 0;
              const deduction = request.durationDays || 1;
              const newQuota = currentQuota - deduction; // Allow actual subtraction in case of negative balance
              
              await supabase
                .from('hris_users')
                .update({ [fieldToUpdate]: newQuota })
                .eq('id', request.employeeId);
            }
          }
        }
      }

      // Notify the requester
      createNotification({
        userId: request.employeeId,
        title: approved ? '✅ Leave Request Approved' : '❌ Leave Request Rejected',
        message: approved
          ? `Your leave request (${request.durationDays} day${request.durationDays !== 1 ? 's' : ''}) has been approved by ${user.name}.`
          : `Your leave request has been rejected by ${user.name}${notes ? `: "${notes}"` : '.'}`,
        type: NotificationType.LEAVE_DECISION,
        link: '/payroll/leave',
      }).catch(console.error);
    }

    setToastInfo({ show: true, title: 'Success', message: `Request ${approved ? 'approved' : 'rejected'}.` });
    setIsModalOpen(false);
    setSelectedRequest(null);
    setIsRejectModalOpen(false);
    setRequestToReject(null);
    loadLeaveRequests();
  };

  const handleQuickApprove = (request: LeaveRequest) => {
    handleApproval(request, true, 'Quick approval from list');
  };

  const handleQuickReject = (request: LeaveRequest) => {
    setRequestToReject(request);
    setIsRejectModalOpen(true);
  };

  const handleConfirmReject = (reason: string) => {
    if (requestToReject) {
      handleApproval(requestToReject, false, reason);
    }
  };

  const getTabClass = (viewName: ActiveView) =>
    `px-3 py-2 font-medium text-sm rounded-md cursor-pointer transition-colors ${
      activeView === viewName
        ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300'
        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
    }`;

  return (
    <div className="space-y-6">
      <Toast
        show={toastInfo.show}
        onClose={() => setToastInfo(prev => ({ ...prev, show: false }))}
        title={toastInfo.title}
        message={toastInfo.message}
        icon={toastInfo.icon}
      />

      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Leave Management</h1>
        <Button onClick={() => handleOpenModal(null)}>Request Leave</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {myBalances.map(balance => (
          <LeaveBalanceCard key={balance.leaveTypeId} balance={balance} />
        ))}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700 p-1 bg-white dark:bg-slate-800 rounded-lg shadow-sm w-fit">
        <button className={getTabClass('my_requests')} onClick={() => setActiveView('my_requests')}>
          My Requests
        </button>
        {canApprove && (
          <button className={getTabClass('team_requests')} onClick={() => setActiveView('team_requests')}>
            Team Requests ({teamRequests.length})
          </button>
        )}
        <button className={getTabClass('schedule')} onClick={() => setActiveView('schedule')}>
          Schedule & Calendar
        </button>
      </div>

      {activeView === 'my_requests' && (
        <Card>
          <div className="p-2">
            <LeaveRequestTable requests={myRequests} leaveTypes={leaveTypes} onSelectRequest={handleOpenModal} isManagerView={false} />
          </div>
        </Card>
      )}

      {activeView === 'team_requests' && (
        <Card>
          <div className="p-2">
            <LeaveRequestTable
              requests={teamRequests}
              leaveTypes={leaveTypes}
              onSelectRequest={handleOpenModal}
              isManagerView={true}
              onApprove={handleQuickApprove}
              onReject={handleQuickReject}
            />
          </div>
        </Card>
      )}

      {activeView === 'schedule' && user && (
        <div className="space-y-4">
          <LeaveCalendar leaves={calendarLeaves} currentUser={user} />
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
            {canApprove ? 'Showing approved leaves for you and your team.' : 'Showing your approved leaves.'}
          </p>
        </div>
      )}

      <LeaveRequestModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        request={selectedRequest}
        leaveTypes={leaveTypes}
        onSave={handleSave}
        onApprove={handleApproval}
        onFileSelect={setAttachmentFile}
      />

      <RejectReasonModal
        isOpen={isRejectModalOpen}
        onClose={() => setIsRejectModalOpen(false)}
        onSubmit={handleConfirmReject}
        title="Reject Leave Request"
        prompt="Please provide a reason for rejecting this leave request."
        submitText="Reject Request"
      />
    </div>
  );
};

export default Leave;
