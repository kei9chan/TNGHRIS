
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
import { fetchAwardTemplates, fetchEmployeeAwards, createEmployeeAward, updateEmployeeAwardStatus, saveAwardTemplate } from '../../services/awardService';
import { supabase } from '../../services/supabaseClient';
import CertificateRenderer from '../../components/evaluation/CertificateRenderer';
import html2canvas from 'html2canvas';

const FALLBACK_DESIGN = {
  backgroundColor: '#ffffff',
  backgroundImageUrl: '',
  borderWidth: 8,
  borderColor: '#1f2937',
  fontFamily: '"Times New Roman", serif',
  titleColor: '#1f2937',
  textColor: '#111827',
  headerText: 'CERTIFICATE OF ACHIEVEMENT',
  bodyText: 'This certificate is proudly presented to\n\n{{employee_name}}\n\nfor: {{citation}}\n\nAwarded on {{date}}.',
  signatories: [
    { name: 'HR Manager', title: 'HR Manager' },
    { name: 'CEO', title: 'Chief Executive Officer' },
  ],
  logoUrl: '',
};

type EnrichedEmployeeAward = EmployeeAward & { 
    employeeName: string, 
    awardTitle: string, 
    badgeIconUrl?: string, 
    createdByName: string, 
    businessUnitName: string 
};


const Awards: React.FC = () => {
  const { user } = useAuth();
  const { can, getAwardsAccess } = usePermissions();
  const canManage = can('Evaluation', Permission.Manage);
  const awardsAccess = getAwardsAccess();

  const [awards, setAwards] = React.useState<Award[]>([]);
  const [employeeAwards, setEmployeeAwards] = React.useState<EmployeeAward[]>([]);
  const [users, setUsers] = React.useState<User[]>(mockUsers);
  const [businessUnits, setBusinessUnits] = React.useState<BusinessUnit[]>(mockBusinessUnits);
  
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
  const [downloadTarget, setDownloadTarget] = React.useState<EnrichedEmployeeAward | null>(null);
  const downloadRef = React.useRef<HTMLDivElement>(null);

  const approverPool = React.useMemo(() => 
    users.filter(u => [Role.GeneralManager, Role.BOD].includes(u.role)), [users]);

  React.useEffect(() => {
    const load = async () => {
      try {
        const tpl = await fetchAwardTemplates();
        setAwards(tpl);
      } catch {
        setAwards(mockAwards);
      }
      try {
        const ea = await fetchEmployeeAwards();
        const mapped: EmployeeAward[] = ea.map(a => ({
          id: a.id,
          employeeId: a.employeeId,
          awardId: a.awardTemplateId,
          notes: a.notes || '',
          dateAwarded: a.dateAwarded || new Date(),
          createdByUserId: a.createdByUserId || '',
          level: a.level || BadgeLevel.Bronze,
          businessUnitId: a.businessUnitId,
          status: a.status,
          approverSteps: [],
          rejectionReason: a.rejectionReason,
          certificateSnapshotUrl: a.certificateUrl,
          approverId: a.approverId,
          approverName: a.approverName,
        }));
        setEmployeeAwards(mapped);
      } catch {
        setEmployeeAwards(mockEmployeeAwards);
      }
      // load users & business units
      try {
        const { data: userRows } = await supabase
          .from('hris_users')
          .select('id, full_name, email, role, position, business_unit, business_unit_id, department, department_id, status');
        if (userRows) {
          setUsers(userRows.map((u: any) => ({
            id: u.id,
            authUserId: undefined,
            name: u.full_name || u.email,
            email: u.email,
            role: (u.role as Role) || Role.Employee,
            department: u.department || '',
            businessUnit: u.business_unit || '',
            departmentId: u.department_id || undefined,
            businessUnitId: u.business_unit_id || undefined,
            status: (u.status as 'Active' | 'Inactive') || 'Active',
            isPhotoEnrolled: false,
            dateHired: new Date(),
            position: u.position || '',
          })));
        } else {
          setUsers(mockUsers);
        }
      } catch {
        setUsers(mockUsers);
      }

      try {
        const { data: buRows } = await supabase.from('business_units').select('id, name, code, color');
        if (buRows) {
          setBusinessUnits(buRows.map((b: any) => ({
            id: b.id,
            name: b.name,
            code: b.code,
            color: b.color || '#4F46E5',
          })));
        } else {
          setBusinessUnits(mockBusinessUnits);
        }
      } catch {
        setBusinessUnits(mockBusinessUnits);
      }
    };
    load();
  }, []);

  const submitAwardForApproval = async (
      employeeId: string, 
      awardId: string, 
      notes: string, 
      businessUnitId: string, 
      approvers: User[], 
      certificateUrl: string
  ) => {
    if (!user) return;
    try {
      const created = await createEmployeeAward({
        employeeId,
        awardTemplateId: awardId,
        notes,
        businessUnitId,
        certificateUrl,
        createdByUserId: user.id,
        approverId: approvers[0]?.id,
      });
      const mapped: EmployeeAward = {
        id: created.id,
        employeeId,
        awardId,
        notes,
        dateAwarded: created.dateAwarded || new Date(),
        createdByUserId: user.id,
        level: created.level || BadgeLevel.Bronze,
        businessUnitId,
        status: created.status,
        approverSteps: [],
        rejectionReason: created.rejectionReason,
        certificateSnapshotUrl: created.certificateUrl,
      };
      setEmployeeAwards(prev => [mapped, ...prev]);
      setIsAssignModalOpen(false);
      const employee = users.find(u => u.id === employeeId);
      logActivity(user, 'CREATE', 'EmployeeAward', mapped.id, `Nominated ${employee?.name || employeeId} for award.`);
      setToastInfo({
        show: true,
        title: 'Award Submitted',
        message: 'Award nomination submitted.',
      });
    } catch (err: any) {
      alert(err?.message || 'Failed to submit award.');
    }
  };

  const handleSaveAwardTemplate = async (award: Award) => {
    try {
      const saved = await saveAwardTemplate({
        id: award.id,
        title: award.title,
        description: award.description,
        badgeIconUrl: award.badgeIconUrl,
        isActive: award.isActive,
        design: award.design,
        createdByUserId: user?.id,
      });
        setAwards(prev => {
          const exists = prev.find(a => a.id === saved.id);
          return exists ? prev.map(a => a.id === saved.id ? saved : a) : [saved, ...prev];
        });
        setIsTemplateModalOpen(false);
      } catch (err: any) {
        alert(err?.message || 'Failed to save template.');
      }
  };

  // Download a clean certificate image for a given award row
  React.useEffect(() => {
    const runDownload = async () => {
      if (!downloadTarget) return;
      const node = downloadRef.current;
      const tpl = awards.find(a => a.id === downloadTarget.awardId);
      if (!node || !tpl) {
        setDownloadTarget(null);
        return;
      }
      // Allow render cycle to paint hidden renderer
      await new Promise(requestAnimationFrame);
      try {
        const canvas = await html2canvas(node, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
        });
        const url = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = url;
        link.download = `Certificate_${downloadTarget.employeeName || 'Employee'}.png`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } catch (err) {
        console.error('Failed to download certificate', err);
        alert('Failed to download certificate.');
      } finally {
        setDownloadTarget(null);
      }
    };
    runDownload();
  }, [downloadTarget, awards]);
  
  const enrichedEmployeeAwards = React.useMemo(() => {
    const base = employeeAwards.map(ea => {
      const employee = users.find(u => u.id === ea.employeeId);
      const award = awards.find(a => a.id === ea.awardId);
      const createdBy = users.find(u => u.id === ea.createdByUserId);
      const businessUnit = businessUnits.find(bu => bu.id === ea.businessUnitId);
      const approverName = (ea as any).approverName || users.find(u => u.id === ea.approverId)?.name;
      return {
        ...ea,
        employeeName: (employee as any)?.name || (ea as any).employeeName || 'Unknown',
        awardTitle: award?.title || 'Unknown Award',
        badgeIconUrl: award?.badgeIconUrl,
        createdByName: approverName || createdBy?.name || 'System',
        businessUnitName: businessUnit?.name || 'N/A',
      };
    });

    const filteredByScope = base.filter(ea => {
      if (!awardsAccess.canView) return false;
      if (awardsAccess.scope === 'global' || awardsAccess.scope === 'logs') return true;
      if (awardsAccess.scope === 'self' && user) return ea.employeeId === user.id;
      return false;
    });

    return filteredByScope.sort((a, b) => new Date(b.dateAwarded).getTime() - new Date(a.dateAwarded).getTime());
  }, [employeeAwards, awards, users, businessUnits, awardsAccess, user]);

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

    const handleApproveAward = async (award: EnrichedEmployeeAward) => {
        if (!user) return;
        try {
            const updated = await updateEmployeeAwardStatus(award.id, ResolutionStatus.Approved);
            setEmployeeAwards(prev => prev.map(a => a.id === award.id ? { ...a, status: ResolutionStatus.Approved, dateAwarded: updated.dateAwarded || new Date() } : a));
            setShowConfetti(true);
            setToastInfo({
                show: true,
                title: "Award Approved!",
                message: `${award.employeeName || 'Employee'} has officially received the ${award.awardTitle || 'Award'}! 🌟`,
            });
            setTimeout(() => setShowConfetti(false), 4000);
        } catch (err: any) {
            alert(err?.message || 'Failed to approve award.');
        }
        setReviewAward(null);
    };

    const handleRejectAward = (award: EnrichedEmployeeAward) => {
        setAwardToReject(award);
        setReviewAward(null);
        setIsRejectModalOpen(true);
    };
    
    const handleConfirmReject = async (reason: string) => {
        if (!user || !awardToReject) return;
        try {
            const updated = await updateEmployeeAwardStatus(awardToReject.id, ResolutionStatus.Rejected, reason);
            setEmployeeAwards(prev =>
                prev.map(a =>
                    a.id === awardToReject.id
                        ? { ...a, status: ResolutionStatus.Rejected, rejectionReason: reason, dateAwarded: updated.dateAwarded || a.dateAwarded }
                        : a
                )
            );
            setToastInfo({
                show: true,
                title: 'Award Rejected',
                message: `${awardToReject.employeeName || 'Employee'} nomination was rejected.`,
            });
        } catch (err: any) {
            alert(err?.message || 'Failed to reject award.');
        }

        setAwardToReject(null);
        setIsRejectModalOpen(false);
    };

    const handleRowClick = (award: EnrichedEmployeeAward) => {
        if (!user) return;
        const isApprover =
          (award.approverId && award.approverId === user.id) ||
          award.approverSteps.some(step => step.userId === user.id);
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
        const reviewTemplate = awards.find(a => a.id === reviewAward.awardId);
        const previewDesign = {
          ...FALLBACK_DESIGN,
          ...(reviewTemplate?.design || {}),
        };
        const previewTitle = reviewTemplate?.title || reviewAward.awardTitle || 'Award';
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
                    <div>
                        <p className="font-bold mb-2">Certificate Preview</p>
                        <div className="border p-2 bg-gray-100 rounded flex justify-center min-h-[320px] overflow-auto">
                            <div className="flex justify-center w-full">
                                <div
                                  style={{
                                    width: '1000px',
                                    height: '700px',
                                    transform: 'scale(0.6)',
                                    transformOrigin: 'top center',
                                    border: '1px solid #e5e7eb',
                                    background: '#fff',
                                  }}
                                >
                                    <CertificateRenderer
                                      design={previewDesign as any}
                                      data={{
                                        employeeName: reviewAward.employeeName,
                                        date: reviewAward.dateAwarded || new Date(),
                                        awardTitle: previewTitle,
                                        citation: reviewAward.notes || '',
                                      }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                    <p><strong>Award:</strong> {reviewAward.awardTitle}</p>
                    <p><strong>Business Unit:</strong> {reviewAward.businessUnitName}</p>
                    <p><strong>Reason:</strong> {reviewAward.notes}</p>
                    <p><strong>Submitted by:</strong> {reviewAward.createdByName}</p>
                </div>
            </Modal>
        );
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
                {awardsAccess.canAssign && (
                  <Button variant="secondary" onClick={() => { setSelectedAward(null); setIsTemplateModalOpen(true); }}>Create Award</Button>
                )}
                {awardsAccess.canAssign && (
                  <Button onClick={() => setIsAssignModalOpen(true)}>Assign Award</Button>
                )}
            </div>
        )}
      </div>
      {!awardsAccess.canView ? (
        <p className="text-red-600 dark:text-red-400">You do not have permission to view awards.</p>
      ) : null}
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
      
      {awardsAccess.canView && (
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
                                {awardsAccess.canView ? (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setDownloadTarget(ea); }}
                                    className="text-indigo-600 hover:underline"
                                  >
                                    Download
                                  </button>
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
      )}
      
      {/* Hidden renderer for clean certificate download */}
      {downloadTarget && (
        <div
          style={{
            position: 'absolute',
            left: '-12000px',
            top: 0,
            width: '1000px',
            height: '700px',
            background: '#fff',
            pointerEvents: 'none',
          }}
          ref={downloadRef}
        >
          <CertificateRenderer
            design={(awards.find(a => a.id === downloadTarget.awardId)?.design as any) || FALLBACK_DESIGN}
            data={{
              employeeName: downloadTarget.employeeName,
              date: downloadTarget.dateAwarded || new Date(),
              awardTitle: awards.find(a => a.id === downloadTarget.awardId)?.title || downloadTarget.awardTitle,
              citation: downloadTarget.notes || '',
            }}
          />
        </div>
      )}
      
      <AssignAwardModal 
        isOpen={isAssignModalOpen} 
        onClose={() => setIsAssignModalOpen(false)} 
        onAssign={submitAwardForApproval} 
        employees={users}
        businessUnits={businessUnits}
        awardTemplates={awards}
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
