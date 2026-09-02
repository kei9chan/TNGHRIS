import { supabase } from './supabaseClient';
import { dedupeRead } from './readCache';

export type PendingTimeApprovalAssignment = {
  request_type: 'leave' | 'wfh' | 'overtime';
  request_id: string;
};

const ASSIGNMENT_CACHE_MS = 2_000;

export const fetchMyPendingTimeApprovalAssignments = (
  userId: string,
  force = false,
): Promise<PendingTimeApprovalAssignment[]> => dedupeRead(
  `pending-time-approvals:${userId}`,
  async () => {
    const { data, error } = await supabase.rpc('get_my_pending_time_approval_ids');
    if (error) throw error;
    return (data || []).filter((row: any) => row.request_id) as PendingTimeApprovalAssignment[];
  },
  ASSIGNMENT_CACHE_MS,
  force,
);

