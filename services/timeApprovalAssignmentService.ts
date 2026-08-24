import { supabase } from './supabaseClient';

export type TimeApprovalRequestKind = 'leave' | 'wfh' | 'overtime';

/**
 * Checks the immutable approval assignment created for a time request.
 * This keeps old pending assignments reviewable even if the live approver
 * configuration changes after submission.
 */
export const hasPendingTimeApprovalAssignment = async (
  requestType: TimeApprovalRequestKind,
  requestId: string,
  approverUserId: string,
): Promise<boolean> => {
  const { count, error } = await supabase
    .from('time_request_approval_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('request_type', requestType)
    .eq('request_id', requestId)
    .eq('approver_user_id', approverUserId)
    .eq('status', 'Pending');

  if (error) throw new Error(error.message || 'Failed to verify the approval assignment');
  return Number(count || 0) > 0;
};
