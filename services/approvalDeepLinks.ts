export type ApprovalRequestKind =
  | 'leave'
  | 'wfh'
  | 'overtime'
  | 'manpower'
  | 'nte'
  | 'pan'
  | 'requisition'
  | 'award'
  | 'offer';

const approvalPaths: Record<ApprovalRequestKind, string> = {
  leave: '/payroll/leave',
  wfh: '/payroll/wfh-requests',
  overtime: '/payroll/overtime-requests',
  manpower: '/payroll/manpower-planning',
  nte: '/feedback/nte',
  pan: '/employees/pan',
  requisition: '/recruitment/requisitions',
  award: '/evaluation/awards',
  offer: '/approvals',
};

/** Build a direct link to one request, never merely to a module landing page. */
export const getApprovalReviewUrl = (kind: ApprovalRequestKind, requestId: string): string => {
  const encodedId = encodeURIComponent(requestId);
  if (kind === 'nte') return `${approvalPaths.nte}/${encodedId}`;
  if (kind === 'leave' || kind === 'wfh' || kind === 'overtime') {
    return `/approvals?type=${kind}&item=${encodedId}`;
  }
  if (kind === 'manpower') return `/approvals?type=manpower&item=${encodedId}`;
  if (kind === 'offer') return `/approvals?type=offer&item=${encodedId}`;
  return `${approvalPaths[kind]}?review=${encodedId}`;
};

/** Read the canonical parameter while retaining historical notification links. */
export const getApprovalRequestId = (search: string | URLSearchParams): string | null => {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  return params.get('review') || params.get('item') || params.get('requestId');
};
