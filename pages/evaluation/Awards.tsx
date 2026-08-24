
import React from 'react';
import { useSearchParams } from 'react-router-dom';
import Button from '../../components/ui/Button';
import { Award, EmployeeAward, User, Permission, BadgeLevel, BusinessUnit, Role, ResolutionStatus, ApproverStep } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import AssignAwardModal from '../../components/evaluation/AssignAwardModal';
import AwardPresetBuilderPage from '../../components/evaluation/AwardPresetBuilderPage';
import AwardsStudioDashboard from '../../components/evaluation/AwardsStudioDashboard';
import Confetti from '../../components/ui/Confetti';
import Toast from '../../components/ui/Toast';
import Modal from '../../components/ui/Modal';
import RejectReasonModal from '../../components/feedback/RejectReasonModal';
import { fetchAwardTemplates, fetchEmployeeAwards, createEmployeeAward, processEmployeeAwardApproval, markEmployeeAwardIssued, saveAwardTemplate } from '../../services/awardService';
import { supabase } from '../../services/supabaseClient';
import { formatEmployeeName } from '../../services/formatEmployeeName';
import CertificateRenderer from '../../components/evaluation/CertificateRenderer';
import { createModernAwardDesign } from '../../components/evaluation/AwardVisualSystem';
import { captureCertificatePng, downloadCertificatePdf, printCertificateImage } from '../../services/awardCertificateExport';

const FALLBACK_DESIGN = createModernAwardDesign('TNG HRIS', 'Certificate of Recognition');

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
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  
  const [isAssignModalOpen, setIsAssignModalOpen] = React.useState(false);
  const [initialAwardId, setInitialAwardId] = React.useState<string>();
  
  const [isTemplateModalOpen, setIsTemplateModalOpen] = React.useState(false);
  const [selectedAward, setSelectedAward] = React.useState<Award | null>(null);
  const [isDuplicatingTemplate, setIsDuplicatingTemplate] = React.useState(false);

  const [showConfetti, setShowConfetti] = React.useState(false);
  const [toastInfo, setToastInfo] = React.useState<{ show: boolean, title: string, message: string, icon?: React.ReactNode }>({ show: false, title: '', message: '' });

  const [reviewAward, setReviewAward] = React.useState<EnrichedEmployeeAward | null>(null);
  const [isRejectModalOpen, setIsRejectModalOpen] = React.useState(false);
  const [awardToReject, setAwardToReject] = React.useState<EnrichedEmployeeAward | null>(null);
  const reviewCertificateRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setLoadError('');
      try {
        const tpl = await fetchAwardTemplates();
        setAwards(tpl);
      } catch (error: any) {
        setAwards([]);
        setLoadError(error?.message || 'Awards Studio could not be loaded.');
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
      setIsLoading(false);
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
      const previousDefault = awards.find(item => item.businessUnitId === award.businessUnitId && item.isDefault && item.id !== award.id);
      if (award.isDefault && previousDefault && !window.confirm(`Replace “${previousDefault.title}” as the default preset for this business unit? Existing awards will not change.`)) return;
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
        badgeKey: award.badgeKey,
        status: award.status,
        sortOrder: award.sortOrder,
        isSystem: award.isSystem,
      });
        setAwards(prev => {
          const exists = prev.find(a => a.id === saved.id);
          return exists ? prev.map(a => a.id === saved.id ? saved : a) : [saved, ...prev];
        });
        setIsTemplateModalOpen(false);
        setIsDuplicatingTemplate(false);
        setToastInfo({ show: true, title: award.status === 'published' ? 'Preset published' : 'Draft saved', message: `${saved.title} is ready in the preset library.` });
      } catch (err: any) {
        alert(err?.message || 'Failed to save template.');
      }
  };

  const downloadIssuedCertificate = (award: EnrichedEmployeeAward) => {
    if (award.status !== ResolutionStatus.Issued || !award.certificateSnapshotUrl) {
      alert('The final certificate is available only after approval and issuance.');
      return;
    }
    const template = awards.find(item => item.id === award.awardId);
    downloadCertificatePdf(award.certificateSnapshotUrl, `Certificate_${award.employeeName || 'Employee'}`, template?.design?.orientation || 'portrait');
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
        return captureCertificatePng(source);
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
                    <div className="flex flex-wrap justify-end w-full gap-2">
                        <Button variant="secondary" onClick={async () => {
                          try {
                            const image = await captureFinalCertificate();
                            downloadCertificatePdf(image, `Certificate_${reviewAward.employeeName}`, (previewDesign.orientation || 'portrait') as 'portrait' | 'landscape');
                          } catch (error: any) { alert(error?.message || 'Could not download the certificate.'); }
                        }}>Download PDF</Button>
                        <Button variant="secondary" onClick={async () => {
                          try {
                            const image = await captureFinalCertificate();
                            printCertificateImage(image, (previewDesign.orientation || 'portrait') as 'portrait' | 'landscape');
                          } catch (error: any) { alert(error?.message || 'Could not print the certificate.'); }
                        }}>Print</Button>
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
                                <div ref={reviewCertificateRef} className="origin-top scale-[.5] sm:scale-[.6]">
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

  if (isTemplateModalOpen) {
    return <AwardPresetBuilderPage
      award={selectedAward}
      businessUnits={businessUnits}
      currentUserId={user?.id}
      isDuplicate={isDuplicatingTemplate}
      onBack={() => { setIsTemplateModalOpen(false); setIsDuplicatingTemplate(false); }}
      onSave={handleSaveAwardTemplate}
    />;
  }

  if (isLoading) return <div className="grid min-h-[420px] place-items-center"><div className="text-center"><div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" /><p className="mt-4 text-sm text-gray-500">Loading Awards Studio…</p></div></div>;

  return (
    <div className="space-y-6">
      {showConfetti && <Confetti />}
      <Toast show={toastInfo.show} onClose={() => setToastInfo(previous => ({ ...previous, show: false }))} title={toastInfo.title} message={toastInfo.message} icon={toastInfo.icon} />
      {loadError && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" role="alert">{loadError} Some award data may be unavailable. Refresh to try again.</div>}
      {!awardsAccess.canView ? <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">You do not have permission to view awards.</div> : <AwardsStudioDashboard
        awards={awards}
        employeeAwards={enrichedEmployeeAwards}
        businessUnits={businessUnits}
        canManage={canManage}
        canAssign={awardsAccess.canAssign}
        onNewPreset={() => { setSelectedAward(null); setIsDuplicatingTemplate(false); setIsTemplateModalOpen(true); }}
        onEditPreset={award => { setSelectedAward(award); setIsDuplicatingTemplate(false); setIsTemplateModalOpen(true); }}
        onDuplicatePreset={award => { setSelectedAward(award); setIsDuplicatingTemplate(true); setIsTemplateModalOpen(true); }}
        onArchivePreset={async award => {
          if (!window.confirm(`Archive “${award.title}”? Historical awards and certificates will remain unchanged.`)) return;
          await handleSaveAwardTemplate({ ...award, status: 'archived', isActive: false, isDefault: false });
        }}
        onUseAward={award => { setInitialAwardId(award.id); setIsAssignModalOpen(true); }}
        onReviewAward={handleRowClick}
        onDownloadCertificate={downloadIssuedCertificate}
      />}
      <AssignAwardModal isOpen={isAssignModalOpen} onClose={() => { setIsAssignModalOpen(false); setInitialAwardId(undefined); }} onAssign={submitAwardForApproval} employees={users} businessUnits={businessUnits} awardTemplates={awards} initialAwardId={initialAwardId} />
      {renderReviewModal()}
      <RejectReasonModal isOpen={isRejectModalOpen} onClose={() => setIsRejectModalOpen(false)} onSubmit={handleConfirmReject} title="Reason for Rejection" prompt="Please provide a reason for rejecting this award. This will be visible to the submitter." />
    </div>
  );

};

export default Awards;
