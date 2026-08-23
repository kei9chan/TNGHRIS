type ActionItemLike = {
  title?: string;
  link?: string;
};

/**
 * Dashboard action lists remain for acknowledgements, assigned work, and other
 * non-approval tasks. Approval records represented in the centralized Approval
 * Center are filtered out so users do not see a second approval queue.
 */
export const isCentralizedApprovalActionItem = (item: ActionItemLike) => {
  const title = String(item.title || '').toLowerCase();
  const link = String(item.link || '').toLowerCase();
  const isApproval = title.includes('approval') || title.includes('approve');

  if (title.includes('acknowledgement') || title.includes('acknowledgment')) return false;

  const centralizedLink = (
    link.startsWith('/approvals') ||
    link.includes('/payroll/leave') ||
    link.includes('/payroll/wfh') ||
    link.includes('/payroll/overtime') ||
    link.includes('/payroll/manpower') ||
    link.includes('/employees/pan') ||
    link.includes('/recruitment/requisitions') ||
    link.includes('/feedback/nte/')
  );
  return centralizedLink && (isApproval || title.includes('request') || title.includes('nte for') || title.includes('pan for'));
};
