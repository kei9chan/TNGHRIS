/** Only the canonical internal destination is used; external return URLs are never consumed. */
export const APPROVAL_CENTER = '/approvals';
export const approvalViewKey = (userId: string) => `approval-view-v1:${userId}`;
export function readApprovalView(userId: string) {
  try {
    const value = JSON.parse(sessionStorage.getItem(approvalViewKey(userId)) || 'null');
    return value && Date.now() - value.savedAt < 86400000 ? value : null;
  } catch { return null; }
}
export function decisionSaved(message: string) {
  window.dispatchEvent(new CustomEvent('approval-decision-saved', { detail: { message } }));
}
