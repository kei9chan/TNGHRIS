
import React from 'react';
import { useSearchParams } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { Award, EmployeeAward, User, Permission, BadgeLevel, BusinessUnit, Role, ResolutionStatus, ApproverStep } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import AwardTemplateModal from '../../components/evaluation/AwardTemplateModal';
import AssignAwardModal from '../../components/evaluation/AssignAwardModal';
import Confetti from '../../components/ui/Confetti';
import Toast from '../../components/ui/Toast';
import Modal from '../../components/ui/Modal';
import RejectReasonModal from '../../components/feedback/RejectReasonModal';
import { fetchAwardTemplates, fetchEmployeeAwards, createEmployeeAward, processEmployeeAwardApproval, markEmployeeAwardIssued, saveAwardTemplate } from '../../services/awardService';
import { supabase } from '../../services/supabaseClient';
import { formatEmployeeName } from '../../services/formatEmployeeName';
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
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { can, getAwardsAccess } = usePermissions();
  const canManage = can('Evaluation', Permission.Manage);
  const awardsAccess = getAwardsAccess();

  const [awards, setAwards] = React.useState<Award[]>([]);
  const [employeeAwards, setEmployeeAwards] = React.useState<EmployeeAward[]>([]);
  const [users, setUsers] = React.useState<User[]>([]);
  const [businessUnits, setBusinessUnits] = React.useState<BusinessUnit[]>([]);
  
  const [isAssignModalOpen, setIsAssignModalOpen] = React.useState(false);
  
  const [isTemplateModalOpen, setIsTemplateModalOpen] = React.useState(false);
  const [selectedAward, setSelectedAward] = React.useState<Award | null>(null);
  const [isDuplicatingTemplate, setIsDuplicatingTemplate] = React.useState(false);

  const [showConfetti, setShowConfetti] = React.useState(false);
  const [toastInfo, setToastInfo] = React.useState<{ show: boolean, title: string, message: string, icon?: React.ReactNode }>({ show: false, title: '', message: '' });

  const [buFilter, setBuFilter] = React.useState('');
  const [monthFilter, setMonthFilter] = React.useState('');
  const [yearFilter, setYearFilter] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  
  const [reviewAward, setReviewAward] = React.useState<EnrichedEmployeeAward | null>(null);
  const [isRejectModalOpen, setIsRejectModalOpen] = React.useState(false);
  const [awardToReject, setAwardToReject] = React.useState<EnrichedEmployeeAward | null>(null);
  const reviewCertificateRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const load = async () => {
      try {
        const tpl = await fetchAwardTemplates();
        setAwards(tpl);
      } catch {
        setAwards([]);
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
          departmentId: a.departmentId,
          status: a.status,
          approverSteps: a.approverSteps as ApproverStep[],
          rejectionReason: a.rejectionReason,
          certificateSnapshotUrl: a.certificateUrl,
          approverId: a.approverId,
          approverName: a.approverName,
          submittedAt: a.submittedAt,
          decidedAt: a.decidedAt,
          issuedAt: a.issuedAt,
        }));
        setEmployeeAwards(mapped);
      } catch {
        setEmployeeAwards([]);
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
            name: formatEmployeeName(u.full_name || u.email || 'Unknown'),
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
          setUsers([]);
        }
      } catch {
        setUsers([]);
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
          setBusinessUnits([]);
        }
      } catch {
        setBusinessUnits([]);
      }
    };
    load();
  }, []);

  const submitAwardForApproval = async (
      employeeId: string, 
      awardId: string, 
      notes: string, 
      businessUnitId: string, 
      departmentId: string,
      approvers: User[]
  ) => {
    if (!user) return;
    try {
      const created = await createEmployeeAward({
        employeeId,
        awardTemplateId: awardId,
        notes,
        businessUnitId,
        departmentId: departmentId || undefined,
        createdByUserId: user.id,
        approverIds: approvers.map(approver => approver.id),
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
        departmentId: departmentId || undefined,
        status: created.status,
        approverSteps: created.approverSteps as ApproverStep[],
        rejectionReason: created.rejectionReason,
        certificateSnapshotUrl: undefined,
        approverId: created.approverId,
        approverName: created.approverName,
        submittedAt: created.submittedAt,
      };
      setEmployeeAwards(prev => [mapped, ...prev]);
      setIsAssignModalOpen(false);
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
        businessUnitId: award.businessUnitId,
        category: award.category,
        awardValueLabel: award.awardValueLabel,
        isDefault: award.isDefault,
        isPreset: award.isPreset,
        presetKey: award.presetKey,
      });
        setAwards(prev => {
          const exists = prev.find(a => a.id === saved.id);
          return exists ? prev.map(a => a.id === saved.id ? saved : a) : [saved, ...prev];
        });
        setIsTemplateModalOpen(false);
        setIsDuplicatingTemplate(false);
      } catch (err: any) {
        alert(err?.message || 'Failed to save template.');
      }
  };

  const downloadIssuedCertificate = (award: EnrichedEmployeeAward) => {
    if (award.status !== ResolutionStatus.Issued || !award.certificateSnapshotUrl) {
      alert('The final certificate is available only after approval and issuance.');
      return;
    }
    const link = document.createElement('a');
    link.href = award.certificateSnapshotUrl;
    link.download = `Certificate_${award.employeeName || 'Employee'}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };
  
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
      if (awardsAccess.scope === 'global') return true;
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

  React.useEffect(() => {
    const requestedAwardId = searchParams.get('item');
    if (!requestedAwardId || !user) return;
    const requestedAward = enrichedEmployeeAwards.find(award => award.id === requestedAwardId);
    if (!requestedAward) return;
    const assignedToUser = requestedAward.approverId === user.id
      || requestedAward.approverSteps.some(step => step.userId === user.id);
    if (
      (requestedAward.status === ResolutionStatus.PendingApproval && assignedToUser)
      || (requestedAward.status === ResolutionStatus.Approved && (assignedToUser || canManage))
    ) {
      setReviewAward(requestedAward);
    }
  }, [searchParams, enrichedEmployeeAwards, user, canManage]);

    const captureFinalCertificate = async () => {
        const source = reviewCertificateRef.current;
        if (!source) throw new Error('Certificate preview is not ready. Please reopen the award and try again.');
        const clone = source.cloneNode(true) as HTMLElement;
        clone.style.position = 'absolute';
        clone.style.left = '-12000px';
        clone.style.top = '0';
        clone.style.width = '1000px';
        clone.style.height = '700px';
        clone.style.transform = 'none';
        document.body.appendChild(clone);
        try {
          const canvas = await html2canvas(clone, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
          return canvas.toDataURL('image/png');
        } finally {
          clone.remove();
        }
    };

    const issueApprovedAward = async (award: EnrichedEmployeeAward) => {
        const employee = users.find(candidate => candidate.id === award.employeeId);
        if (!employee?.email) throw new Error('The employee has no email address. Add one before issuing the award.');
        const certificateUrl = await captureFinalCertificate();
        const certificateBase64 = certificateUrl.split(',')[1] || '';
        const firstName = employee.name.includes(',')
          ? employee.name.split(',')[1]?.trim().split(' ')[0]
          : employee.name.split(' ')[0];
        const senderName = (import.meta as any).env?.VITE_SMTP_FROM_NAME || user?.name || 'HR Team';
        const response = await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: employee.email,
            subject: `Award Certificate - ${award.awardTitle}`,
            message: `Dear ${firstName},\n\nCongratulations on receiving the ${award.awardTitle} award. Your approved certificate is attached.\n\nBest regards,\n${senderName}`,
            html: `<p>Dear ${firstName},</p><p>Congratulations on receiving the <strong>${award.awardTitle}</strong> award. Your approved certificate is attached.</p>${award.notes ? `<p><strong>Citation:</strong> ${award.notes}</p>` : ''}<p>Best regards,<br />${senderName}</p>`,
            attachments: [{
              filename: `Award_Certificate_${employee.name.replace(/\s+/g, '_')}.png`,
              contentBase64: certificateBase64,
              contentType: 'image/png',
            }],
          }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body?.error || 'Approval was saved, but the award email could not be sent. Use Issue Certificate to retry.');
        }
        const issued = await markEmployeeAwardIssued(award.id, certificateUrl);
        setEmployeeAwards(previous => previous.map(item => item.id === award.id ? {
          ...item,
          status: ResolutionStatus.Issued,
          certificateSnapshotUrl: issued.certificateUrl,
          issuedAt: issued.issuedAt,
          dateAwarded: issued.issuedAt || issued.decidedAt || new Date(),
        } : item));
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 4000);
        setToastInfo({ show: true, title: 'Award issued', message: `${award.employeeName} was emailed the approved certificate.` });
    };

    const handleApproveAward = async (award: EnrichedEmployeeAward) => {
        if (!user) return;
        try {
            const updated = await processEmployeeAwardApproval(award.id, true);
            const nextStatus = updated.status;
            setEmployeeAwards(previous => previous.map(item => item.id === award.id ? {
              ...item,
              status: nextStatus,
              approverSteps: updated.approverSteps as ApproverStep[],
              approverId: updated.approverId,
              approverName: updated.approverName,
              decidedAt: updated.decidedAt,
              dateAwarded: updated.decidedAt || item.dateAwarded,
            } : item));
            if (nextStatus === ResolutionStatus.Approved) {
              await issueApprovedAward({ ...award, status: ResolutionStatus.Approved, approverSteps: updated.approverSteps as ApproverStep[] });
            } else {
              setToastInfo({ show: true, title: 'Approval recorded', message: 'The award remains pending until all required approvers approve it.' });
            }
        } catch (err: any) {
            alert(err?.message || 'Failed to approve or issue award.');
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
            const updated = await processEmployeeAwardApproval(awardToReject.id, false, reason);
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
        if (
          (isApprover && award.status === ResolutionStatus.PendingApproval)
          || (award.status === ResolutionStatus.Approved && (isApprover || canManage))
        ) {
            setReviewAward(award);
        }
    };
    
    const getStatusColor = (status: ResolutionStatus) => {
        switch(status) {
            case ResolutionStatus.Approved:
            case ResolutionStatus.Issued: return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300';
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
                        {reviewAward.status === ResolutionStatus.PendingApproval ? (
                          <>
                            <Button variant="danger" onClick={() => handleRejectAward(reviewAward)}>Reject</Button>
                            <Button onClick={() => handleApproveAward(reviewAward)}>Approve</Button>
                          </>
                        ) : (
                          <Button onClick={async () => {
                            try {
                              await issueApprovedAward(reviewAward);
                              setReviewAward(null);
                            } catch (error: any) {
                              alert(error?.message || 'Failed to issue certificate.');
                            }
                          }}>Issue Certificate & Email</Button>
                        )}
                    </div>
                }
            >
                <div className="space-y-4">
                    <div>
                        <p className="font-bold mb-2">Certificate Preview</p>
                        <div className="border p-2 bg-gray-100 rounded flex justify-center min-h-[320px] overflow-auto">
                            <div className="flex justify-center w-full">
                                <div
                                  ref={reviewCertificateRef}
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
                                        position: users.find(candidate => candidate.id === reviewAward.employeeId)?.position,
                                        department: users.find(candidate => candidate.id === reviewAward.employeeId)?.department,
                                        businessUnit: reviewAward.businessUnitName,
                                        issuerName: user?.name,
                                        issuerTitle: user?.role,
                                        awardValue: reviewTemplate?.awardValueLabel,
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
                    <div>
                      <strong>Required approvals:</strong>
                      <ul className="mt-1 list-disc pl-5 text-sm text-gray-600 dark:text-gray-300">
                        {reviewAward.approverSteps.map(step => <li key={step.userId}>{step.userName}: {step.status}</li>)}
                      </ul>
                    </div>
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
                  <Button variant="secondary" onClick={() => { setSelectedAward(null); setIsDuplicatingTemplate(false); setIsTemplateModalOpen(true); }}>Create Award</Button>
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
            {awards.filter(a => a.isActive).sort((a, b) => a.title.localeCompare(b.title)).map(award => (
                <div key={award.id} className="p-4 border rounded-lg dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex items-start space-x-4">
                    {award.badgeIconUrl ? <img src={award.badgeIconUrl} alt={award.title} className="w-12 h-12 object-contain" /> : <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-amber-100 text-2xl">🏆</div>}
                    <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-gray-900 dark:text-white">{award.title}</h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{award.description}</p>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          {award.isPreset && <span className="rounded bg-indigo-100 px-2 py-1 text-indigo-700">BU preset</span>}
                          {award.isDefault && <span className="rounded bg-emerald-100 px-2 py-1 text-emerald-700">Default</span>}
                          {award.category && <span className="rounded bg-gray-100 px-2 py-1 text-gray-700">{award.category}</span>}
                        </div>
                        {awardsAccess.canAssign && <div className="mt-3 flex gap-3 text-sm">
                          <button className="font-semibold text-indigo-600" onClick={() => { setSelectedAward(award); setIsDuplicatingTemplate(false); setIsTemplateModalOpen(true); }}>Edit</button>
                          <button className="font-semibold text-indigo-600" onClick={() => { setSelectedAward({ ...award, title: `${award.title} (Copy)`, isDefault: false }); setIsDuplicatingTemplate(true); setIsTemplateModalOpen(true); }}>Duplicate</button>
                        </div>}
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
                    {[...businessUnits].sort((a, b) => a.name.localeCompare(b.name)).map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
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
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase">Submitted / Awarded</th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase">Notes</th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase">Awarded By</th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase">Business Unit</th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase">Cert</th>
                    </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredEmployeeAwards.map(ea => (
                        <tr key={ea.id} onClick={() => handleRowClick(ea)} className={[ResolutionStatus.PendingApproval, ResolutionStatus.Approved].includes(ea.status) ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50" : ""}>
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
                                {ea.status === ResolutionStatus.Issued && ea.certificateSnapshotUrl ? (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); downloadIssuedCertificate(ea); }}
                                    className="text-indigo-600 hover:underline"
                                  >
                                    Download
                                  </button>
                                ) : ea.status === ResolutionStatus.Approved && (canManage || ea.approverId === user?.id) ? (
                                  <button onClick={(event) => { event.stopPropagation(); setReviewAward(ea); }} className="text-indigo-600 hover:underline">Issue</button>
                                ) : (
                                  <span className="text-gray-400">Awaiting approval</span>
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
        businessUnits={businessUnits}
        isDuplicate={isDuplicatingTemplate}
      />
    </div>
  );
};

export default Awards;
