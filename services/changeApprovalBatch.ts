import { supabase } from './supabaseClient';
import type { ChangeApprovalKind, ChangePreview } from '../utils/approvalChangeSummary';

export type ChangeBatchItem = { id: string; kind: ChangeApprovalKind; snapshot: string; reference: string; employee: string; preview: ChangePreview };
export type ChangeBatchResult = {
  requested: number; processed: number; succeeded: number; skipped: number; failed: number;
  successIds: string[]; skippedItems: { id: string; reason: string }[]; failures: { id: string; error: string }[];
};
export async function fetchApprovalChangePreviews(kind: ChangeApprovalKind, ids: string[]): Promise<ChangePreview[]> {
  const unique = [...new Set(ids)];
  const result: ChangePreview[] = [];
  // Bound each response without imposing a queue-size limit.
  for (let index = 0; index < unique.length; index += 250) {
    const { data, error } = await supabase.rpc('get_approval_change_previews', { p_kind: kind, p_ids: unique.slice(index, index + 250) });
    if (error) throw new Error(error.message || 'Approval summaries could not be loaded.');
    result.push(...(Array.isArray(data) ? data : []));
  }
  return result;
}
export async function approveChangeQueueItem(item: ChangeBatchItem): Promise<{ outcome: 'approved' | 'skipped'; reason?: string }> {
  const { data, error } = await supabase.rpc('approve_change_queue_item', { p_kind: item.kind, p_id: item.id, p_expected_snapshot: item.snapshot });
  if (error) throw new Error(error.message || 'The approval could not be confirmed. Refresh before retrying.');
  return data;
}
export async function approveChangeBatch(items: ChangeBatchItem[], progress: (result: ChangeBatchResult) => void, decide = approveChangeQueueItem) {
  const unique = [...new Map(items.map(item => [`${item.kind}:${item.id}`, item])).values()];
  if (!unique.length) throw new Error('Select at least one request.');
  const result: ChangeBatchResult = { requested: unique.length, processed: 0, succeeded: 0, skipped: 0, failed: 0, successIds: [], skippedItems: [], failures: [] };
  for (const item of unique) {
    try {
      if (!item.snapshot) throw new Error('Refresh this request to load its summary before approving.');
      const decision = await decide(item);
      if (decision?.outcome === 'approved') { result.succeeded++; result.successIds.push(item.id); }
      else if (decision?.outcome === 'skipped') { result.skipped++; result.skippedItems.push({ id: item.id, reason: `${item.reference} · ${item.employee}: ${decision.reason || 'No longer pending your approval.'}` }); }
      else throw new Error('The server did not confirm the approval. Refresh before retrying.');
    } catch (error) {
      result.failed++;
      result.failures.push({ id: item.id, error: `${item.reference} · ${item.employee}: ${error instanceof Error ? error.message : 'Approval could not be confirmed.'}` });
    }
    result.processed++;
    progress({ ...result, successIds: [...result.successIds], skippedItems: [...result.skippedItems], failures: [...result.failures] });
  }
  return result;
}
