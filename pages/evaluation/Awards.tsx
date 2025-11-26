
import React from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { Award, EmployeeAward, User, Permission, NotificationType, BadgeLevel, BusinessUnit, Role, ResolutionStatus, ApproverStatus, ApproverStep } from '../../types';
import { mockAwards, mockEmployeeAwards, mockUsers, mockNotifications, mockBusinessUnits } from '../../services/mockData';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import AwardTemplateModal from '../../components/evaluation/AwardTemplateModal';
import AssignAwardModal from '../../components/evaluation/AssignAwardModal';
import Confetti from '../../components/ui/Confetti';
import Toast from '../../components/ui/Toast';
import Modal from '../../components/ui/Modal';
import Textarea from '../../components/ui/Textarea';
import EmployeeMultiSelect from '../../components/feedback/EmployeeMultiSelect';
import RejectReasonModal from '../../components/feedback/RejectReasonModal';
import { logActivity } from '../../services/auditService';

type EnrichedEmployeeAward = EmployeeAward & { 
    employeeName: string, 
    awardTitle: string, 
    badgeIconUrl?: string, 
    createdByName: string, 
    businessUnitName: string 
};


const Awards: React.FC = () => {
  const { user } = useAuth();
  const { can } = usePermissions();
  const canManage = can('Evaluation', Permission.Manage);

  const [awards, setAwards] = React.useState<Award[]>(mockAwards);
  const [employeeAwards, setEmployeeAwards] = React.useState<EmployeeAward[]>(mockEmployeeAwards);
  
  const [isAssignModalOpen, setIsAssignModalOpen] = React.useState(false);
  
  const [isTemplateModalOpen, setIsTemplateModalOpen] = React.useState(false);
  const [selectedAward, setSelectedAward] = React.useState<Award | null>(null);

  const [showConfetti, setShowConfetti] = React.useState(false);
  const [toastInfo, setToastInfo] = React.useState<{ show: boolean, title: string, message: string, icon?: React.ReactNode }>({ show: false, title: '', message: '' });

  const [buFilter, setBuFilter] = React.useState('');
  const [monthFilter, setMonthFilter] = React.useState('');
  const [yearFilter, setYearFilter] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  
  const [reviewAward, setReviewAward] = React.useState<EnrichedEmployeeAward | null>(null);
  const [isRejectModalOpen, setIsRejectModalOpen] = React.useState(false);
  const [awardToReject, setAwardToReject] = React.useState<EnrichedEmployeeAward | null>(null);

  const approverPool = React.useMemo(() => 
    mockUsers.filter(u => [Role.GeneralManager, Role.BOD].includes(u.role)), []);

  const submitAwardForApproval = (
      employeeId: string, 
      awardId: string, 
      notes: string, 
      businessUnitId: string, 
      approvers: User[], 
      certificateUrl: string
  ) => {
    if (!user) return;

    const approverSteps: ApproverStep[] = approvers.map(approver => ({
        userId: approver.id,
        userName: approver.name,
        status: ApproverStatus.Pending
    }));

    const newEmployeeAward: EmployeeAward = {
      id: `emp-award-${Date.now()}`,
      employeeId,
      awardId,
      notes,
      dateAwarded: new Date(),
      createdByUserId: user.id,
      level: BadgeLevel.Bronze,
      businessUnitId,
      status: ResolutionStatus.PendingApproval,
      approverSteps,
      certificateSnapshotUrl: certificateUrl // Store the snapshot
    };

    mockEmployeeAwards.unshift(newEmployeeAward);
    setEmployeeAwards([...mockEmployeeAwards]);
    setIsAssignModalOpen(false);

    // Log the action
    const employee = mockUsers.find(u => u.id === employeeId);
    logActivity(user, 'CREATE', 'EmployeeAward', newEmployeeAward.id, `Nominated ${employee?.name} for award. Generated certificate snapshot.`);

    // Simulate Email Sending
    if (employee?.email) {
        console.log(`[EMAIL SIMULATION] To: ${employee.email}, Subject: Award Nomination, Attachment: Certificate.png (Base64 len: ${certificateUrl.length})`);
        setToastInfo({
            show: true,
            title: "Award Submitted",
            message: "Award nomination submitted and certificate draft emailed to system.",
        });
    }

    approvers.forEach(approver => {
        mockNotifications.unshift({
            id: `notif-award-req-${Date.now()}-${approver.id}`,
            userId: approver.id,
            type: NotificationType.AWARD_APPROVAL_REQUEST,
            message: `${user.name} submitted an award for your approval.`,
            link: '/evaluation/awards',
            isRead: false,
            createdAt: new Date(),
            relatedEntityId: newEmployeeAward.id,
        });
    });
  };

  const handleSaveAwardTemplate = (award: Award) => {
    if (award.id) {
        setAwards(prev => prev.map(a => a.id === award.id ? award : a));
    } else {
        const newAward = { ...award, id: `award-${Date.now()}` };
        setAwards(prev => [...prev, newAward]);
    }
    setIsTemplateModalOpen(false);
  };
  
  const enrichedEmployeeAwards = React.useMemo(() => {
    return employeeAwards.map(ea => {
      const employee = mockUsers.find(u => u.id === ea.employeeId);
      const award = awards.find(a => a.id === ea.awardId);
      const createdBy = mockUsers.find(u => u.id === ea.createdByUserId);
      const businessUnit = mockBusinessUnits.find(bu => bu.id === ea.businessUnitId);
      return {
        ...ea,
        employeeName: employee?.name || 'Unknown',
        awardTitle: award?.title || 'Unknown Award',
        badgeIconUrl: award?.badgeIconUrl,
        createdByName: createdBy?.name || 'System',
        businessUnitName: businessUnit?.name || 'N/A',
      };
    }).sort((a, b) => new Date(b.dateAwarded).getTime() - new Date(a.dateAwarded).getTime());
  }, [employeeAwards, awards]);

  const availableYears = React.useMemo(() => {
    const years = new Set(enrichedEmployeeAwards.map(ea => new Date(ea.dateAwarded).getFullYear()));
    return Array.from(years).sort((a: number, b: number) => b - a);
  }, [enrichedEmployeeAwards]);

  const filteredEmployeeAwards = React.useMemo(() => {
    return enrichedEmployeeAwards.filter(ea => {
        const awardDate = new Date(ea.dateAwarded);
        const buMatch = !buFilter || ea.businessUnitId === buFilter;
        const monthMatch = !monthFilter || (awardDate.getMonth() + 1).toString() === monthFilter;
        const yearMatch = !yearFilter || awardDate.getFullYear().toString() === yearFilter;
        const statusMatch = !statusFilter || ea.status === statusFilter;
        return buMatch && monthMatch && yearMatch && statusMatch;
    });
  }, [enrichedEmployeeAwards, buFilter, monthFilter, yearFilter, statusFilter]);

    const handleApproveAward = (award: EnrichedEmployeeAward) => {
        if (!user) return;

        const awardIndex = mockEmployeeAwards.findIndex(ea => ea.id === award.id);
        if (awardIndex === -1) return;

        const updatedAward = { ...mockEmployeeAwards[awardIndex] };
        
        const stepIndex = updatedAward.approverSteps.findIndex(s => s.userId === user.id && s.status === ApproverStatus.Pending);
        if (stepIndex > -1) {
            updatedAward.approverSteps[stepIndex].status = ApproverStatus.Approved;
            updatedAward.approverSteps[stepIndex].timestamp = new Date();
        }
        
        const allApproved = updatedAward.approverSteps.every(s => s.status === ApproverStatus.Approved);

        if (allApproved) {
            updatedAward.status = ResolutionStatus.Approved;
            updatedAward.dateAwarded = new Date(); // Update date on final approval
            updatedAward.isAcknowledgedByEmployee = false;
            
            const existingAwardsCount = mockEmployeeAwards.filter(
                ea => ea.employeeId === updatedAward.employeeId && ea.awardId === updatedAward.awardId && ea.status === ResolutionStatus.Approved
            ).length;
            
            let newLevel: BadgeLevel;
            if (existingAwardsCount === 0) newLevel = BadgeLevel.Bronze;
            else if (existingAwardsCount === 1) newLevel = BadgeLevel.Silver;
            else newLevel = BadgeLevel.Gold;
            updatedAward.level = newLevel;
            
            mockEmployeeAwards[awardIndex] = updatedAward;
            
            const awardDetails = awards.find(a => a.id === updatedAward.awardId);
            const employee = mockUsers.find(e => e.id === updatedAward.employeeId);
            
            if (awardDetails && employee) {
                setShowConfetti(true);
                setToastInfo({
                    show: true,
                    title: "Award Approved!",
                    message: `${employee.name} has officially received the ${awardDetails.title}! 🌟`,
                    icon: <img src={employee.profilePictureUrl || `https://i.pravatar.cc/150?u=${employee.id}`} alt={employee.name} className="h-10 w-10 rounded-full" />
                });
                setTimeout(() => setShowConfetti(false), 4000);
                
                mockNotifications.unshift({
                    id: `notif-award-${Date.now()}`,
                    userId: employee.id,
                    type: NotificationType.AWARD_RECEIVED,
                    message: `You've been awarded the '${award.awardTitle}'!`,
                    link: '/my-profile#achievements',
                    isRead: false,
                    createdAt: new Date(),
                    relatedEntityId: updatedAward.id,
                });
                
                // Email the final certificate
                console.log(`[EMAIL SIMULATION] To: ${employee.email}, Subject: Congratulations! You have received an award. Attachment: [Certificate Image]`);
            }
        } else {
            mockEmployeeAwards[awardIndex] = updatedAward;
        }
        
        setEmployeeAwards([...mockEmployeeAwards]);
        setReviewAward(null);
    };

    const handleRejectAward = (award: EnrichedEmployeeAward) => {
        setAwardToReject(award);
        setReviewAward(null);
        setIsRejectModalOpen(true);
    };
    
    const handleConfirmReject = (reason: string) => {
        if (!user || !awardToReject) return;
        
        const awardIndex = mockEmployeeAwards.findIndex(ea => ea.id === awardToReject.id);
        if (awardIndex === -1) return;
        
        const updatedAward = { ...mockEmployeeAwards[awardIndex] };
        updatedAward.status = ResolutionStatus.Rejected;
        updatedAward.rejectionReason = reason;

        const stepIndex = updatedAward.approverSteps.findIndex(s => s.userId === user.id);
        if (stepIndex > -1) {
            updatedAward.approverSteps[stepIndex].status = ApproverStatus.Rejected;
            updatedAward.approverSteps[stepIndex].timestamp = new Date();
            updatedAward.approverSteps[stepIndex].rejectionReason = reason;
        }
        
        mockEmployeeAwards[awardIndex] = updatedAward;
        setEmployeeAwards([...mockEmployeeAwards]);

        setAwardToReject(null);
        setIsRejectModalOpen(false);
    };

    const handleRowClick = (award: EnrichedEmployeeAward) => {
        if (!user) return;
        const isApprover = award.approverSteps.some(step => step.userId === user.id);
        if (isApprover && award.status === ResolutionStatus.PendingApproval) {
            setReviewAward(award);
        }
    };
    
    const getStatusColor = (status: ResolutionStatus) => {
        switch(status) {
            case ResolutionStatus.Approved: return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300';
            case ResolutionStatus.PendingApproval: return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300';
            case ResolutionStatus.Rejected: return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300';
            default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
        }
    };

    const renderReviewModal = () => {
        if (!reviewAward) return null;
        return (
            <Modal
                isOpen={!!reviewAward}
                onClose={() => setReviewAward(null)}
                title={`Review Award for ${reviewAward.employeeName}`}
                footer={
                    <div className="flex justify-end w-full space-x-2">
                        <Button variant="danger" onClick={() => handleRejectAward(reviewAward)}>Reject</Button>
                        <Button onClick={() => handleApproveAward(reviewAward)}>Approve</Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    {reviewAward.certificateSnapshotUrl && (
                         <div>
                            <p className="font-bold mb-2">Certificate Preview</p>
                            <div className="border p-2 bg-gray-100 rounded flex justify-center">
                                <img src={reviewAward.certificateSnapshotUrl} alt="Certificate Preview" className="max-w-full h-auto shadow-sm" />
                            </div>
                         </div>
                    )}
                    <p><strong>Award:</strong> {reviewAward.awardTitle}</p>
                    <p><strong>Business Unit:</strong> {reviewAward.businessUnitName}</p>
                    <p><strong>Reason:</strong> {reviewAward.notes}</p>
                    <p><strong>Submitted by:</strong> {reviewAward.createdByName}</p>
                </div>
            </Modal>
        )
    };

  return (
    <div className="space-y-6">
      {showConfetti && <Confetti />}
      <Toast 
        show={toastInfo.show} 
        onClose={() => setToastInfo(prev => ({ ...prev, show: false }))} 
        title={toastInfo.title}
        message={toastInfo.message}
        icon={toastInfo.icon}
      />
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Awards & Recognition</h1>
        {canManage && (
            <div className="flex space-x-2">
                <Button variant="secondary" onClick={() => { setSelectedAward(null); setIsTemplateModalOpen(true); }}>Create Award</Button>
                <Button onClick={() => setIsAssignModalOpen(true)}>Assign Award</Button>
            </div>
        )}
      </div>
      <p className="text-gray-600 dark:text-gray-400">
        Create and manage company awards, and recognize employees for their achievements.
      </p>

      <Card title="Award Templates">
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {awards.filter(a => a.isActive).map(award => (
                <div key={award.id} className="p-4 border rounded-lg dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex items-center space-x-4">
                    <img src={award.badgeIconUrl} alt={award.title} className="w-12 h-12" />
                    <div>
                        <h4 className="font-bold text-gray-900 dark:text-white">{award.title}</h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{award.description}</p>
                    </div>
                </div>
            ))}
         </div>
      </Card>
      
      <Card title="Recognition Wall">
        <div className="p-4 border-b dark:border-gray-700 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
                <label htmlFor="buFilter" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Unit</label>
                <select id="buFilter" value={buFilter} onChange={e => setBuFilter(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-md">
                    <option value="">All Business Units</option>
                    {mockBusinessUnits.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
                </select>
            </div>
            <div>
                <label htmlFor="monthFilter" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Month</label>
                <select id="monthFilter" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-md">
                    <option value="">All Months</option>
                    {Array.from({length: 12}, (_, i) => i + 1).map(month => (
                        <option key={month} value={month}>{new Date(0, month-1).toLocaleString('default', { month: 'long' })}</option>
                    ))}
                </select>
            </div>
            <div>
                <label htmlFor="yearFilter" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Year</label>
                <select id="yearFilter" value={yearFilter} onChange={e => setYearFilter(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-md">
                    <option value="">All Years</option>
                    {availableYears.map(year => <option key={year} value={year}>{year}</option>)}
                </select>
            </div>
            <div>
                <label htmlFor="statusFilter" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                <select id="statusFilter" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-md">
                    <option value="">All Statuses</option>
                    {Object.values(ResolutionStatus).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>
        </div>

        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase">Employee</th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase">Award</th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase">Date Awarded</th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase">Notes</th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase">Awarded By</th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase">Business Unit</th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase">Cert</th>
                    </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredEmployeeAwards.map(ea => (
                        <tr key={ea.id} onClick={() => handleRowClick(ea)} className={ea.status === ResolutionStatus.PendingApproval ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50" : ""}>
                            <td className="px-4 py-4 whitespace-nowrap font-medium text-gray-900 dark:text-white">{ea.employeeName}</td>
                            <td className="px-4 py-4 whitespace-nowrap flex items-center">
                                {ea.badgeIconUrl && <img src={ea.badgeIconUrl} alt={ea.awardTitle} className="w-6 h-6 mr-2" />}
                                {ea.awardTitle}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{ea.dateAwarded.toLocaleDateString()}</td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm"><span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(ea.status)}`}>{ea.status}</span></td>
                            <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate" title={ea.notes}>{ea.notes}</td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{ea.createdByName}</td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{ea.businessUnitName}</td>
                             <td className="px-4 py-4 whitespace-nowrap text-sm">
                                {ea.certificateSnapshotUrl ? (
                                    <a href={ea.certificateSnapshotUrl} download={`Certificate_${ea.employeeName}.png`} onClick={(e) => e.stopPropagation()} className="text-indigo-600 hover:underline">Download</a>
                                ) : (
                                    <span className="text-gray-400">-</span>
                                )}
                            </td>
                        </tr>
                    ))}
                     {filteredEmployeeAwards.length === 0 && (
                        <tr>
                            <td colSpan={8} className="text-center py-10 text-gray-500 dark:text-gray-400">
                                No awards found for the selected filters.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
      </Card>
      
      <AssignAwardModal 
        isOpen={isAssignModalOpen} 
        onClose={() => setIsAssignModalOpen(false)} 
        onAssign={submitAwardForApproval} 
      />
      
      {renderReviewModal()}
      
      <RejectReasonModal
        isOpen={isRejectModalOpen}
        onClose={() => setIsRejectModalOpen(false)}
        onSubmit={handleConfirmReject}
        title="Reason for Rejection"
        prompt="Please provide a reason for rejecting this award. This will be visible to the submitter."
      />

      <AwardTemplateModal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        onSave={handleSaveAwardTemplate}
        award={selectedAward}
      />
    </div>
  );
};

export default Awards;
