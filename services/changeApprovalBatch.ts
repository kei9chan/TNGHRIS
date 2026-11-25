import { supabase } from './supabaseClient';
import type { ChangeApprovalKind, ChangePreview } from '../utils/approvalChangeSummary';

export type ChangeBatchItem = { id: string; kind: ChangeApprovalKind; snapshot: string; reference: string; employee: string; preview: ChangePreview };
export type ChangeBatchResult = {
  requested: number; processed: number; succeeded: number; skipped: number; failed: number;
  successIds: string[]; skippedItems: { id: string; reason: string }[]; failures: { id: string; error: string }[];
  unconfirmedItems: { id: string; reason: string }[]; notStarted: number; paused: boolean;
};
export class ApprovalResponseUnknownError extends Error {
  readonly code = 'approval_response_unconfirmed';
  constructor() { super('No confirmation arrived within 20 seconds. This request may have been saved. Refresh before retrying.'); }
}

/** Bounds auth/session wait, transport and response body parsing. A timeout is
 * uncertain, never a confirmed failure and never automatically retried. */
export async function waitForApprovalResponse<T>(operation: PromiseLike<T>, controller: AbortController, timeoutMs = 20_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new ApprovalResponseUnknownError()); }, timeoutMs); }),
    ]);
  } finally { clearTimeout(timer!); }
}
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
  const controller = new AbortController();
  const { data, error } = await waitForApprovalResponse(supabase.rpc('approve_change_queue_item', { p_kind: item.kind, p_id: item.id, p_expected_snapshot: item.snapshot }).abortSignal(controller.signal), controller);
  if (error) {
    if (!error.code || /^(08|53|57)/.test(error.code) || Number((error as any).status) >= 500) throw new ApprovalResponseUnknownError();
    throw new Error(error.message || 'The approval could not be confirmed. Refresh before retrying.');
  }
  return data;
}
export async function approveChangeBatch(items: ChangeBatchItem[], progress: (result: ChangeBatchResult) => void, decide = approveChangeQueueItem, shouldStop = () => false) {
  const unique = [...new Map(items.map(item => [`${item.kind}:${item.id}`, item])).values()];
  if (!unique.length) throw new Error('Select at least one request.');
  const result: ChangeBatchResult = { requested: unique.length, processed: 0, succeeded: 0, skipped: 0, failed: 0, successIds: [], skippedItems: [], failures: [], unconfirmedItems: [], notStarted: 0, paused: false };
  const publish = () => progress({ ...result, successIds: [...result.successIds], skippedItems: [...result.skippedItems], failures: [...result.failures], unconfirmedItems: [...result.unconfirmedItems] });
  for (const item of unique) {
    if (shouldStop()) { result.paused = true; result.notStarted = unique.length - result.processed; publish(); break; }
    try {
      if (!item.snapshot) throw new Error('Refresh this request to load its summary before approving.');
      const decision = await decide(item);
      if (decision?.outcome === 'approved') { result.succeeded++; result.successIds.push(item.id); }
      else if (decision?.outcome === 'skipped') { result.skipped++; result.skippedItems.push({ id: item.id, reason: `${item.reference} · ${item.employee}: ${decision.reason || 'No longer pending your approval.'}` }); }
      else throw new Error('The server did not confirm the approval. Refresh before retrying.');
    } catch (error) {
      if ((error as any)?.code === 'approval_response_unconfirmed') {
        result.unconfirmedItems.push({ id: item.id, reason: `${item.reference} · ${item.employee}: ${error instanceof Error ? error.message : 'Confirmation unavailable. Refresh before retrying.'}` });
        result.paused = true;
      } else {
        result.failed++;
        result.failures.push({ id: item.id, error: `${item.reference} · ${item.employee}: ${error instanceof Error ? error.message : 'Approval could not be confirmed.'}` });
      }
    }
    result.processed++;
    if (result.paused) result.notStarted = unique.length - result.processed;
    publish();
    if (result.paused) break;
  }
  return result;
}
