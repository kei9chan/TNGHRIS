import { supabase } from './supabaseClient';
import { dedupeRead } from './readCache';
export type ActionableApprovalTask = { request_type: string; request_id: string; type_label: string };
/** Same RLS-bound task projection used by the server morning digest. No role routing here. */
export const fetchActionableApprovalTasks = (userId: string): Promise<ActionableApprovalTask[]> => dedupeRead(`actionable-approvals:${userId}`, async () => {
  const { data, error } = await supabase.rpc('get_my_actionable_approval_tasks');
  if (error) throw error;
  return data || [];
}, 2000);
