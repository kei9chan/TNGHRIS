export interface OfferApprovalProgress {
  stage: string;
  hrApproved: boolean;
  bodApproved: number;
  pendingNames: string[];
}

export const offerApprovalStageLabel = (progress?: OfferApprovalProgress) => {
  if (progress?.stage === 'HR_MANAGER') return 'Pending HR Manager Approval';
  if (progress?.stage === 'BOD_GM') return `Pending BOD Approval (${progress.bodApproved}/2)`;
  return 'Pending Approval';
};

export const offerApprovalProgressDescription = (progress?: OfferApprovalProgress) => {
  if (!progress) return 'Approval progress unavailable · Not sent to candidate';
  const pending = progress.pendingNames.length ? `Awaiting ${progress.pendingNames.join(', ')}` : 'Awaiting assigned approver';
  if (progress.stage === 'BOD_GM') return `${progress.hrApproved ? 'HR approved' : 'HR review not required'} · ${pending} · Not sent to candidate`;
  return `${pending} · Then two BOD approvals · Not sent to candidate`;
};
