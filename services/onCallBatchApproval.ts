import { supabase } from './supabaseClient';
import type { OnCallSummary } from '../utils/onCallApprovalSummary';

export type OnCallBatchItem = {
  id: string;
  snapshot: Record<string, unknown>;
  summary: OnCallSummary;
  reference: string;
  employee: string;
  businessUnit: string;
};
type Decision = { outcome: 'approved' | 'skipped'; status?: string; reason?: string };
export type OnCallBatchResult = {
  requested: number; processed: number; succeeded: number; skipped: number; failed: number;
  successIds: string[]; skippedItems: { id: string; reason: string }[]; failures: { id: string; error: string }[];
};

export async function approveOnCallQueueItem(item: OnCallBatchItem): Promise<Decision> {
  const { data, error } = await supabase.rpc('approve_oncall_queue_item', {
    p_request_id: item.id,
    p_expected_snapshot: item.snapshot,
  });
  if (error) throw new Error(error.message || 'Could not confirm the approval. Refresh before retrying.');
  return data as Decision;
}

export async function approveOnCallBatch(
  items: OnCallBatchItem[],
  progress: (result: OnCallBatchResult) => void,
  decide = approveOnCallQueueItem,
): Promise<OnCallBatchResult> {
  const unique = Array.from(new Map(items.map(item => [item.id, item])).values());
  if (!unique.length) throw new Error('Select at least one on-call request.');
  const result: OnCallBatchResult = { requested: unique.length, processed: 0, succeeded: 0, skipped: 0, failed: 0, successIds: [], skippedItems: [], failures: [] };
  // Each request is independently authorized and committed by the existing on-call
  // workflow. Never retry an uncertain response or stop the remaining batch.
  for (const item of unique) {
    try {
      if (!item.snapshot || !item.summary.complete) throw new Error('Refresh and review this on-call request before approving it.');
      const decision = await decide(item);
      if (decision?.outcome === 'approved') {
        result.succeeded++; result.successIds.push(item.id);
      } else if (decision?.outcome === 'skipped') {
        result.skipped++; result.skippedItems.push({ id: item.id, reason: `${item.reference} · ${item.employee}: ${decision.reason || 'No longer awaiting your approval.'}` });
      } else throw new Error('The server did not confirm this approval. Refresh before retrying.');
    } catch (error) {
      result.failed++;
      result.failures.push({ id: item.id, error: `${item.reference} · ${item.employee}: ${error instanceof Error ? error.message : 'Could not confirm the approval. Refresh before retrying.'}` });
    }
    result.processed++;
    progress({ ...result, successIds: [...result.successIds], skippedItems: [...result.skippedItems], failures: [...result.failures] });
  }
  return result;
}
