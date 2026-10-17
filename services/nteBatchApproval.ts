import { supabase } from './supabaseClient';

export type NTEBatchItem = {
  id: string;
  approvalId: string;
  updatedAt: string;
  reference: string;
  employee: string;
  category?: string;
  details?: string;
};
type Decision = { outcome: 'approved' | 'skipped'; status?: string; reason?: string };
export type NTEBatchResult = {
  requested: number; processed: number; succeeded: number; skipped: number; failed: number;
  successIds: string[]; skippedItems: { id: string; reason: string }[]; failures: { id: string; error: string }[];
};

export async function approveNTEQueueItem(item: NTEBatchItem): Promise<Decision> {
  const { data, error } = await supabase.rpc('approve_nte_queue_item', {
    p_nte_id: item.id,
    p_approval_id: item.approvalId,
    p_expected_updated_at: item.updatedAt,
  });
  if (error) throw new Error(error.message || 'Could not confirm the approval. Refresh before retrying.');
  return data as Decision;
}

export async function approveNTEBatch(
  items: NTEBatchItem[],
  progress: (result: NTEBatchResult) => void,
  decide = approveNTEQueueItem,
): Promise<NTEBatchResult> {
  const unique = Array.from(new Map(items.map(item => [item.id, item])).values());
  if (!unique.length) throw new Error('Select at least one NTE.');
  const result: NTEBatchResult = { requested: unique.length, processed: 0, succeeded: 0, skipped: 0, failed: 0, successIds: [], skippedItems: [], failures: [] };
  // Each request is independently authorized and committed by the existing NTE
  // workflow. Never retry an uncertain response or stop the remaining batch.
  for (const item of unique) {
    try {
      if (!item.approvalId || !item.updatedAt) throw new Error('Refresh this NTE before approving it.');
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
