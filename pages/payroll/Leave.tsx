import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { LeaveRequest, LeaveRequestStatus, Role, Permission } from '../../types';
import { supabase } from '../../services/supabaseClient';
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
  const { can, hasDirectReports } = usePermissions();

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

  const roleCanApprove =
    user &&
    [
      Role.Admin,
      Role.HRManager,
      Role.HRStaff,
      Role.OperationsDirector,
      Role.Manager,
    ].includes(user.role as Role);
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
    const role = user.role as Role;
    let query = supabase.from('leave_requests').select('*').order('start_date', { ascending: false });

    switch (role) {
      case Role.Admin:
      case Role.HRManager:
      case Role.HRStaff:
        // full visibility
        break;
      case Role.BOD:
      case Role.GeneralManager:
        if (user.businessUnitId) query = query.eq('business_unit_id', user.businessUnitId);
        break;
      case Role.Auditor:
        // view all (logs)
        break;
      case Role.GeneralManager:
      case Role.OperationsDirector:
      case Role.BusinessUnitManager:
        if (user.businessUnitId) query = query.eq('business_unit_id', user.businessUnitId);
        break;
      case Role.Manager:
        if (user.departmentId) query = query.eq('department_id', user.departmentId);
        else query = query.eq('employee_id', user.id);
        break;
      case Role.Employee:
        query = query.eq('employee_id', user.id);
        break;
      case Role.FinanceStaff:
      case Role.Recruiter:
      case Role.IT:
      default:
        // no visibility per matrix; return empty set
        query = query.eq('id', null);
        break;
    }

    const { data, error } = await query;
    if (!error && data) {
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
          status: r.status as LeaveRequestStatus,
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
    const role = user.role as Role;
    if (role === Role.Manager && user.departmentId) {
      return leaveRequests.filter(r => r.departmentId === user.departmentId);
    }
    if ([Role.BusinessUnitManager, Role.OperationsDirector, Role.GeneralManager].includes(role) && user.businessUnitId) {
      return leaveRequests.filter(r => r.businessUnitId === user.businessUnitId);
    }
    if ([Role.HRManager, Role.HRStaff, Role.Admin, Role.BOD, Role.Auditor].includes(role)) {
      return leaveRequests;
    }
    return [];
  }, [leaveRequests, user]);

    const visibleRequests = useMemo(() => {
    if (!user) return [];
    const role = user.role as Role;
    if ([Role.Admin, Role.HRManager, Role.HRStaff, Role.BOD, Role.Auditor].includes(role)) return leaveRequests;
    if ([Role.GeneralManager, Role.BOD].includes(role) && user.businessUnitId) {
      return leaveRequests.filter(r => r.businessUnitId === user.businessUnitId);
    }
    if ([Role.BusinessUnitManager, Role.OperationsDirector].includes(role) && user.businessUnitId) {
      return leaveRequests.filter(r => r.businessUnitId === user.businessUnitId);
    }
    if (role === Role.Manager && user.departmentId) return leaveRequests.filter(r => r.departmentId === user.departmentId);
    return leaveRequests.filter(r => r.employeeId === user.id);
  }, [leaveRequests, user]);

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
    await supabase
      .from('leave_requests')
      .update({
        status: newStatus,
        approver_id: user.id,
        history_log: [...(request.historyLog || []), historyEntry],
      })
      .eq('id', request.id);

    setToastInfo({ show: true, title: 'Success', message: `Request ${approved ? 'approved' : 'rejected'}.` });
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
            <LeaveRequestTable requests={myRequests} onSelectRequest={handleOpenModal} isManagerView={false} />
          </div>
        </Card>
      )}

      {activeView === 'team_requests' && (
        <Card>
          <div className="p-2">
            <LeaveRequestTable
              requests={teamRequests}
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
